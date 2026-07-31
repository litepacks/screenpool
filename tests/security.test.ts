import { describe, it, expect } from 'vitest';
import {
  validateUrl,
  validateRenderInput,
  validateExtractOptions,
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

  describe('validateExtractOptions', () => {
    it('throws if rules is missing, empty, or whitespace', () => {
      expect(() => validateExtractOptions({ html: '<h1>test</h1>', rules: '' }, config)).toThrow(
        InvalidRenderInputError,
      );
      expect(() => validateExtractOptions({ html: '<h1>test</h1>', rules: '   ' }, config)).toThrow(
        InvalidRenderInputError,
      );
      expect(() => validateExtractOptions({ html: '<h1>test</h1>' } as any, config)).toThrow(
        InvalidRenderInputError,
      );
    });

    it('throws InvalidRenderInputError for syntactically invalid Pipsel DSL rules', () => {
      expect(() =>
        validateExtractOptions({ html: '<h1>test</h1>', rules: 'invalid syntax {{{' }, config),
      ).toThrow(InvalidRenderInputError);
    });

    it('throws InvalidRenderInputError for unknown pipe functions', () => {
      expect(() =>
        validateExtractOptions({ html: '<h1>test</h1>', rules: 'title: "h1" | unknown_pipe_name' }, config),
      ).toThrow(InvalidRenderInputError);
    });

    it('passes for valid Pipsel DSL rules', () => {
      expect(() =>
        validateExtractOptions(
          {
            html: '<h1>test</h1>',
            rules: `
              title: "h1" | text | trim
              items[]: ".item" {
                name: ".name" | text
              }
            `,
          },
          config,
        ),
      ).not.toThrow();
    });

    it('validates URL safety when URL is provided', () => {
      expect(() =>
        validateExtractOptions(
          {
            url: 'http://localhost:8080/data',
            rules: 'title: "h1" | text',
          },
          config,
        ),
      ).toThrow(SecurityBlockedUrlError);
    });
  });
});
