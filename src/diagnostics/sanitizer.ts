import type { DiagnosticsRedactConfig } from './types.js';

const DEFAULT_SENSITIVE_HEADERS = new Set([
  'authorization',
  'proxy-authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
]);

const DEFAULT_SENSITIVE_QUERY_PARAMS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
  'passwd',
  'session',
  'sessionid',
  'code',
  'signature',
  'sig',
]);

const DEFAULT_SENSITIVE_JSON_KEYS = new Set([
  'password',
  'passwd',
  'secret',
  'token',
  'accesstoken',
  'refreshtoken',
  'apikey',
  'authorization',
  'cookie',
  'session',
  'creditcard',
  'cardnumber',
  'cvv',
]);

export class Sanitizer {
  private sensitiveHeaders: Set<string>;
  private sensitiveQueryParams: Set<string>;
  private sensitiveJsonKeys: Set<string>;

  constructor(config?: DiagnosticsRedactConfig) {
    this.sensitiveHeaders = new Set(DEFAULT_SENSITIVE_HEADERS);
    this.sensitiveQueryParams = new Set(DEFAULT_SENSITIVE_QUERY_PARAMS);
    this.sensitiveJsonKeys = new Set(DEFAULT_SENSITIVE_JSON_KEYS);

    if (config?.headers) {
      for (const h of config.headers) {
        this.sensitiveHeaders.add(h.toLowerCase());
      }
    }
    if (config?.queryParams) {
      for (const q of config.queryParams) {
        this.sensitiveQueryParams.add(q.toLowerCase());
      }
    }
    if (config?.jsonKeys) {
      for (const k of config.jsonKeys) {
        this.sensitiveJsonKeys.add(k.toLowerCase());
      }
    }
  }

  /** Mask sensitive values in HTTP headers */
  sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
    if (!headers) return undefined;
    const sanitized: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (this.sensitiveHeaders.has(key.toLowerCase())) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }
    return sanitized;
  }

  /** Mask sensitive query parameters and user credentials in URLs */
  sanitizeUrl(urlString?: string): string {
    if (!urlString) return '';
    try {
      const url = new URL(urlString);

      // Redact user info
      if (url.password) {
        url.password = '[REDACTED]';
      }

      // Redact query params
      for (const paramKey of Array.from(url.searchParams.keys())) {
        if (this.sensitiveQueryParams.has(paramKey.toLowerCase())) {
          url.searchParams.set(paramKey, '[REDACTED]');
        }
      }

      return url.toString().replace(/%5BREDACTED%5D/gi, '[REDACTED]');
    } catch {
      // Fallback for relative or malformed URLs: regex pattern replace
      return urlString.replace(
        /([?&])([a-zA-Z0-9_-]+)=([^&]*)/g,
        (match, prefix, key, value) => {
          if (this.sensitiveQueryParams.has(key.toLowerCase())) {
            return `${prefix}${key}=[REDACTED]`;
          }
          return match;
        },
      );
    }
  }

  /** Sanitize text content (URLs inside text, authorization tokens, etc.) */
  sanitizeText(text?: string): string {
    if (!text) return '';
    let result = text;

    // Mask URLs embedded in text
    result = result.replace(/https?:\/\/[^\s"']+/g, (match) => this.sanitizeUrl(match));

    // Mask common authorization header values like Bearer eyJ...
    result = result.replace(/(Bearer\s+)[A-Za-z0-9-_=.]+/gi, '$1[REDACTED]');

    return result;
  }

  /** Recursively sanitize JS objects (handling JSON payloads and arguments) */
  sanitizeValue<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'string') {
      return this.sanitizeText(value) as unknown as T;
    }

    if (typeof value === 'object') {
      if (Array.isArray(value)) {
        return value.map((item) => this.sanitizeValue(item)) as unknown as T;
      }

      const copy: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (this.sensitiveJsonKeys.has(k.toLowerCase())) {
          copy[k] = '[REDACTED]';
        } else {
          copy[k] = this.sanitizeValue(v);
        }
      }
      return copy as unknown as T;
    }

    return value;
  }
}
