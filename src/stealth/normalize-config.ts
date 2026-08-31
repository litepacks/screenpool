import type { ResolvedStealthConfig, StealthInput } from './types.js';

/**
 * Normalize stealth configuration from boolean, object, or environment variable.
 */
export function normalizeStealthConfig(
  input?: StealthInput,
  envOverride?: string | boolean,
): ResolvedStealthConfig {
  let raw = input;

  if (raw === undefined && envOverride !== undefined) {
    if (typeof envOverride === 'boolean') {
      raw = envOverride;
    } else if (typeof envOverride === 'string') {
      const lower = envOverride.trim().toLowerCase();
      if (lower === 'true' || lower === '1') {
        raw = true;
      } else if (lower === 'false' || lower === '0') {
        raw = false;
      }
    }
  }

  if (raw === true) {
    return {
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: [],
    };
  }

  if (raw === false || raw === undefined || raw === null) {
    return {
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    };
  }

  const enabled = raw.enabled ?? true;
  if (!enabled) {
    return {
      enabled: false,
      enabledEvasions: null,
      disabledEvasions: [],
    };
  }

  return {
    enabled: true,
    enabledEvasions: Array.isArray(raw.enabledEvasions) ? [...raw.enabledEvasions] : null,
    disabledEvasions: Array.isArray(raw.disabledEvasions) ? [...raw.disabledEvasions] : [],
  };
}
