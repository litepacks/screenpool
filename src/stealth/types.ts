/**
 * Stealth configuration input options.
 */
export interface StealthConfig {
  /**
   * Enable or disable stealth mode.
   * Default: true when passed as an object.
   */
  enabled?: boolean;

  /**
   * Explicit allow-list of evasions to enable.
   * When specified, only the evasions in this list will be activated.
   */
  enabledEvasions?: string[] | null;

  /**
   * List of specific evasions to disable from the default set.
   * (e.g. ['webgl.vendor', 'navigator.plugins'])
   */
  disabledEvasions?: string[];
}

export type StealthInput = boolean | StealthConfig;

/**
 * Resolved internal stealth configuration with guaranteed defaults.
 */
export interface ResolvedStealthConfig {
  enabled: boolean;
  enabledEvasions: string[] | null;
  disabledEvasions: string[];
}
