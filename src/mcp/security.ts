import { ScreenpoolMcpError } from './errors.js';

export interface SecurityPolicyConfig {
  allowPrivateNetwork?: boolean;
  allowedDomains?: string[];
  deniedDomains?: string[];
}

/**
 * Validates a target URL against protocol, SSRF / private network, and domain policies.
 */
export function validateTargetUrl(urlStr: string, security: SecurityPolicyConfig = {}): void {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlStr);
  } catch {
    throw new ScreenpoolMcpError('INVALID_URL', `Invalid URL provided: "${urlStr}"`);
  }

  const protocol = parsedUrl.protocol.toLowerCase();
  if (protocol !== 'http:' && protocol !== 'https:') {
    throw new ScreenpoolMcpError(
      'INVALID_URL',
      `Protocol "${protocol}" is not allowed. Only "http:" and "https:" are supported.`,
    );
  }

  const hostname = parsedUrl.hostname.toLowerCase();

  // Domain policy check
  if (security.deniedDomains && security.deniedDomains.length > 0) {
    if (matchesDomainPatterns(hostname, security.deniedDomains)) {
      throw new ScreenpoolMcpError(
        'DOMAIN_NOT_ALLOWED',
        `Domain "${hostname}" is explicitly denied by security policy.`,
      );
    }
  }

  if (security.allowedDomains && security.allowedDomains.length > 0) {
    if (!matchesDomainPatterns(hostname, security.allowedDomains)) {
      throw new ScreenpoolMcpError(
        'DOMAIN_NOT_ALLOWED',
        `Domain "${hostname}" is not in the allowed domains policy list.`,
      );
    }
  }

  // Private network / SSRF check
  if (!security.allowPrivateNetwork) {
    if (isPrivateOrLocalHost(hostname)) {
      throw new ScreenpoolMcpError(
        'PRIVATE_NETWORK_BLOCKED',
        `Access to private network or loopback address "${hostname}" is blocked. Use --allow-private-network to override.`,
      );
    }
  }
}

function matchesDomainPatterns(hostname: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    const cleanPattern = pattern.trim().toLowerCase();
    if (cleanPattern === '*') return true;
    if (cleanPattern.startsWith('*.')) {
      const suffix = cleanPattern.slice(2);
      return hostname === suffix || hostname.endsWith(`.${suffix}`);
    }
    return hostname === cleanPattern;
  });
}

function isPrivateOrLocalHost(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, ''); // strip IPv6 brackets if any

  if (host === 'localhost' || host === '0.0.0.0' || host === '::1' || host === '127.0.0.1') {
    return true;
  }

  // IPv4 regexes
  if (
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || // 127.0.0.0/8
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) || // 10.0.0.0/8
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) || // 172.16.0.0/12
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) || // 192.168.0.0/16
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host) // 169.254.0.0/16 (link-local & metadata)
  ) {
    return true;
  }

  // Special IPv6 checks
  if (
    host === 'fe80::' || host.startsWith('fe80:') ||
    host === 'fc00::' || host.startsWith('fc00:') ||
    host.startsWith('fd')
  ) {
    return true;
  }

  return false;
}
