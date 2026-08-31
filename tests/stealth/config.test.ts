import { describe, it, expect } from 'vitest';
import { normalizeStealthConfig } from '../../src/stealth/normalize-config.js';
import { resolveConfig } from '../../src/types.js';

describe('Stealth Configuration & Normalization', () => {
  it('defaults to disabled when undefined or false', () => {
    expect(normalizeStealthConfig(undefined)).toEqual({
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    });

    expect(normalizeStealthConfig(false)).toEqual({
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    });
  });

  it('enables stealth with simple boolean true', () => {
    expect(normalizeStealthConfig(true)).toEqual({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: [],
    });
  });

  it('handles object configuration with enabled: true', () => {
    expect(normalizeStealthConfig({ enabled: true })).toEqual({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: [],
    });

    expect(normalizeStealthConfig({})).toEqual({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: [],
    });
  });

  it('handles object configuration with enabled: false', () => {
    expect(normalizeStealthConfig({ enabled: false })).toEqual({
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    });
  });

  it('normalizes disabledEvasions array', () => {
    const config = normalizeStealthConfig({
      enabled: true,
      disabledEvasions: ['webgl.vendor', 'navigator.plugins'],
    });

    expect(config).toEqual({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: ['webgl.vendor', 'navigator.plugins'],
    });
  });

  it('normalizes enabledEvasions whitelist array', () => {
    const config = normalizeStealthConfig({
      enabled: true,
      enabledEvasions: ['navigator.webdriver', 'navigator.languages'],
    });

    expect(config).toEqual({
      enabled: true,
      enabledEvasions: ['navigator.webdriver', 'navigator.languages'],
      disabledEvasions: [],
    });
  });

  it('respects SCREENPOOL_STEALTH environment variable override when input is undefined', () => {
    expect(normalizeStealthConfig(undefined, 'true')).toEqual({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: [],
    });

    expect(normalizeStealthConfig(undefined, '1')).toEqual({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: [],
    });

    expect(normalizeStealthConfig(undefined, 'false')).toEqual({
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    });

    // Explicit config in code takes priority over env var
    expect(normalizeStealthConfig(false, 'true')).toEqual({
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    });
  });

  it('integrates seamlessly in ScreenPool resolveConfig', () => {
    const resolvedDefault = resolveConfig({});
    expect(resolvedDefault.stealth).toEqual({
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    });

    const resolvedStealth = resolveConfig({
      stealth: {
        enabled: true,
        disabledEvasions: ['webgl.vendor'],
      },
    });
    expect(resolvedStealth.stealth).toEqual({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: ['webgl.vendor'],
    });
  });
});
