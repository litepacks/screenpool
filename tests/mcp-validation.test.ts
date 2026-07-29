import { describe, it, expect } from 'vitest';
import { validateTargetUrl } from '../src/mcp/security.js';
import { ScreenshotInputSchema, PdfInputSchema, HtmlInputSchema } from '../src/mcp/schemas.js';
import { maskSensitiveData, McpLogger } from '../src/mcp/logger.js';
import { toMcpError, formatErrorResponse } from '../src/mcp/errors.js';
import { RenderTimeoutError, NavigationError } from '../src/errors.js';

describe('MCP Validation & Security Unit Tests', () => {
  it('validates correct HTTP and HTTPS URLs', () => {
    expect(() => validateTargetUrl('https://example.com', { allowPrivateNetwork: false })).not.toThrow();
    expect(() => validateTargetUrl('http://example.com/page?foo=bar', { allowPrivateNetwork: false })).not.toThrow();
  });

  it('rejects non-web schemes like file://, data:, javascript:', () => {
    expect(() => validateTargetUrl('file:///etc/passwd', { allowPrivateNetwork: true })).toThrow(/Protocol "file:" is not allowed/);
    expect(() => validateTargetUrl('javascript:alert(1)', { allowPrivateNetwork: true })).toThrow(/Protocol "javascript:" is not allowed/);
    expect(() => validateTargetUrl('data:text/html,hi', { allowPrivateNetwork: true })).toThrow(/Protocol "data:" is not allowed/);
  });

  it('blocks private networks and loopback IPs by default (SSRF prevention)', () => {
    expect(() => validateTargetUrl('http://127.0.0.1:8080')).toThrow(/blocked/);
    expect(() => validateTargetUrl('http://localhost:3000')).toThrow(/blocked/);
    expect(() => validateTargetUrl('http://10.0.0.1')).toThrow(/blocked/);
    expect(() => validateTargetUrl('http://192.168.1.50')).toThrow(/blocked/);
    expect(() => validateTargetUrl('http://169.254.169.254/latest/meta-data')).toThrow(/blocked/);
  });

  it('allows private network addresses when allowPrivateNetwork is true', () => {
    expect(() => validateTargetUrl('http://127.0.0.1:8080', { allowPrivateNetwork: true })).not.toThrow();
    expect(() => validateTargetUrl('http://localhost:3000', { allowPrivateNetwork: true })).not.toThrow();
  });

  it('enforces allowed domains whitelist', () => {
    const policy = {
      allowPrivateNetwork: false,
      allowedDomains: ['example.com', '*.target.org'],
    };
    expect(() => validateTargetUrl('https://example.com/path', policy)).not.toThrow();
    expect(() => validateTargetUrl('https://sub.target.org/path', policy)).not.toThrow();
    expect(() => validateTargetUrl('https://malicious.com', policy)).toThrow(/not in the allowed domains/);
  });

  it('enforces denied domains blacklist', () => {
    const policy = {
      allowPrivateNetwork: false,
      deniedDomains: ['admin.example.com', '*.internal'],
    };
    expect(() => validateTargetUrl('https://example.com', policy)).not.toThrow();
    expect(() => validateTargetUrl('https://admin.example.com', policy)).toThrow(/explicitly denied/);
    expect(() => validateTargetUrl('https://app.internal', policy)).toThrow(/explicitly denied/);
  });

  it('validates ScreenshotInputSchema correctly', () => {
    const valid = ScreenshotInputSchema.parse({
      url: 'https://example.com',
      fullPage: true,
      format: 'png',
      quality: 80,
      viewport: { width: 1920, height: 1080 },
    });
    expect(valid.url).toBe('https://example.com');
    expect(valid.format).toBe('png');

    expect(() => ScreenshotInputSchema.parse({ url: '', quality: 200 })).toThrow();
  });

  it('validates PdfInputSchema correctly', () => {
    const valid = PdfInputSchema.parse({
      url: 'https://example.com',
      format: 'A4',
      landscape: true,
    });
    expect(valid.format).toBe('A4');
  });

  it('masks sensitive authorization header and query values in logger', () => {
    const sensitive = 'Authorization=Bearer secret_token_12345';
    expect(maskSensitiveData(sensitive)).toBe('Authorization=***MASKED***');
  });

  it('maps ScreenPool errors to standard MCP errors', () => {
    const timeoutErr = new RenderTimeoutError('job-1', 15000);
    const mcpErr = toMcpError(timeoutErr);
    expect(mcpErr.code).toBe('TIMEOUT');
    expect(mcpErr.retryable).toBe(true);

    const formatted = formatErrorResponse(timeoutErr);
    expect(formatted.success).toBe(false);
    expect(formatted.error.code).toBe('TIMEOUT');
  });
});
