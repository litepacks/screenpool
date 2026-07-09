import type { ResolvedScreenPoolConfig, ScreenshotOptions, PdfOptions, ExtractOptions } from '../types.js';
import { InvalidRenderInputError, SecurityBlockedUrlError } from '../errors.js';

type RenderInput = Pick<ScreenshotOptions | PdfOptions, 'url' | 'html'>;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  '0.0.0.0',
  '127.0.0.1',
  '::1',
  '[::1]',
  'metadata.google.internal',
  'metadata',
]);

const METADATA_IP = '169.254.169.254';

/** Validate render input has url or html (not both). */
export function validateRenderInput(options: RenderInput): void {
  const hasUrl = Boolean(options.url);
  const hasHtml = Boolean(options.html);

  if (hasUrl && hasHtml) {
    throw new InvalidRenderInputError('Provide either url or html, not both.');
  }

  if (!hasUrl && !hasHtml) {
    throw new InvalidRenderInputError('Either url or html is required.');
  }
}

/** Validate a navigation URL against SSRF rules. */
export function validateUrl(url: string, config: ResolvedScreenPoolConfig): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new InvalidRenderInputError(`Invalid URL: ${url}`);
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'file:') {
    if (!config.allowFileProtocol) {
      throw new SecurityBlockedUrlError(url, 'file:// URLs are blocked by default.');
    }
    return;
  }

  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new SecurityBlockedUrlError(url, `Protocol not allowed: ${protocol}`);
  }

  const hostname = parsed.hostname.toLowerCase();

  if (isBlockedHostname(hostname, config)) {
    throw new SecurityBlockedUrlError(url);
  }

  if (isPrivateOrLinkLocal(hostname, parsed, config)) {
    throw new SecurityBlockedUrlError(url);
  }
}

function isBlockedHostname(hostname: string, config: ResolvedScreenPoolConfig): boolean {
  if (config.allowLocalhost) {
    return hostname === METADATA_IP;
  }

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return true;
  }

  if (hostname.endsWith('.localhost')) {
    return true;
  }

  return hostname === METADATA_IP;
}

function isPrivateOrLinkLocal(
  hostname: string,
  parsed: URL,
  config: ResolvedScreenPoolConfig,
): boolean {
  if (config.allowPrivateNetworks) {
    return false;
  }

  // IPv6
  if (hostname.includes(':') || hostname.startsWith('[')) {
    const normalized = hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (normalized.startsWith('fe80:') || normalized.startsWith('fc') || normalized.startsWith('fd')) {
      return true;
    }
    if (normalized === '::1') {
      return !config.allowLocalhost;
    }
    return false;
  }

  // IPv4
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4Match) {
    return false;
  }

  const octets = ipv4Match.slice(1).map(Number) as [number, number, number, number];
  if (octets.some((o) => o > 255)) {
    return true;
  }

  const [a, b] = octets;

  // 10.0.0.0/8
  if (a === 10) return true;
  // 172.16.0.0/12
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16
  if (a === 192 && b === 168) return true;
  // 169.254.0.0/16 link-local
  if (a === 169 && b === 254) return true;
  // 127.0.0.0/8
  if (a === 127) return !config.allowLocalhost;
  // 0.0.0.0
  if (a === 0) return true;

  void parsed;
  return false;
}

/** Validate screenshot/pdf options including URL security. */
export function validateScreenshotOptions(
  options: ScreenshotOptions,
  config: ResolvedScreenPoolConfig,
): void {
  validateRenderInput(options);
  if (options.url) {
    validateUrl(options.url, config);
  }
}

/** Validate PDF options including URL security. */
export function validatePdfOptions(options: PdfOptions, config: ResolvedScreenPoolConfig): void {
  validateRenderInput(options);
  if (options.url) {
    validateUrl(options.url, config);
  }
}

/** Validate extraction options. */
export function validateExtractOptions(
  options: ExtractOptions,
  config: ResolvedScreenPoolConfig,
): void {
  if (!options.rules) {
    throw new InvalidRenderInputError('rules is required for extraction.');
  }
  validateRenderInput(options);
  if (options.url) {
    validateUrl(options.url, config);
  }
}
