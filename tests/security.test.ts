import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  validateRenderInput,
} from '../src/security/SecurityGuard.js';
import { resolveConfig } from '../src/types.js';
import {
  SecurityBlockedUrlError,
  InvalidRenderInputError,
} from '../src/errors.js';

const config = resolveConfig({ executablePath: '/usr/bin/chromium' });

describe('SecurityGuard', () => {
  it('blocks localhost by default', () => {
    expect(() => validateUrl('http://localhost:3000', config)).toThrow(
      SecurityBlockedUrlError,
    );
    expect(() => validateUrl('http://127.0.0.1/', config)).toThrow(
      SecurityBlockedUrlError,
    );
  });

  it('blocks private IP ranges', () => {
    expect(() => validateUrl('http://192.168.1.1/', config)).toThrow(
      SecurityBlockedUrlError,
    );
    expect(() => validateUrl('http://10.0.0.1/', config)).toThrow(
      SecurityBlockedUrlError,
    );
    expect(() => validateUrl('http://172.16.0.1/', config)).toThrow(
      SecurityBlockedUrlError,
    );
  });

  it('blocks metadata IP', () => {
    expect(() => validateUrl('http://169.254.169.254/', config)).toThrow(
      SecurityBlockedUrlError,
    );
  });

  it('blocks file protocol by default', () => {
    expect(() => validateUrl('file:///etc/passwd', config)).toThrow(
      SecurityBlockedUrlError,
    );
  });

  it('allows localhost when configured', () => {
    const localConfig = resolveConfig({
      executablePath: '/usr/bin/chromium',
      allowLocalhost: true,
    });
    expect(() => validateUrl('http://localhost:3000', localConfig)).not.toThrow();
  });

  it('allows private networks when configured', () => {
    const privateConfig = resolveConfig({
      executablePath: '/usr/bin/chromium',
      allowPrivateNetworks: true,
    });
    expect(() => validateUrl('http://192.168.1.1/', privateConfig)).not.toThrow();
  });

  it('requires url or html', () => {
    expect(() => validateRenderInput({})).toThrow(InvalidRenderInputError);
    expect(() => validateRenderInput({ url: 'https://example.com', html: '<p>x</p>' })).toThrow(
      InvalidRenderInputError,
    );
  });

  it('allows public https URLs', () => {
    expect(() => validateUrl('https://example.com', config)).not.toThrow();
  });
});
