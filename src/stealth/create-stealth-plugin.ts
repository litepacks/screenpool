import type { ResolvedStealthConfig } from './types.js';

export const STEALTH_DEPENDENCY_ERROR_MESSAGE = `Screenpool stealth mode requires "puppeteer-extra" and "puppeteer-extra-plugin-stealth".

Install them with:

npm install puppeteer-extra puppeteer-extra-plugin-stealth`;

/**
 * Dynamically loads puppeteer-extra-plugin-stealth and instantiates the plugin
 * with custom evasion configuration (enabled / disabled evasions).
 */
export async function createStealthPlugin(config: ResolvedStealthConfig): Promise<any> {
  let StealthPluginModule: any;
  try {
    StealthPluginModule = await import('puppeteer-extra-plugin-stealth');
  } catch (err: any) {
    if (
      err?.code === 'ERR_MODULE_NOT_FOUND' ||
      err?.code === 'MODULE_NOT_FOUND' ||
      err?.message?.includes('Cannot find module') ||
      err?.message?.includes('Cannot find package')
    ) {
      throw new Error(STEALTH_DEPENDENCY_ERROR_MESSAGE);
    }
    throw err;
  }

  const StealthPluginFactory = StealthPluginModule.default ?? StealthPluginModule;
  const plugin = typeof StealthPluginFactory === 'function' ? StealthPluginFactory() : StealthPluginFactory;

  // Configure evasions if specified
  if (plugin && plugin.enabledEvasions) {
    // If explicit whitelist is provided, only enable those
    if (config.enabledEvasions && Array.isArray(config.enabledEvasions)) {
      if (plugin.enabledEvasions instanceof Set) {
        plugin.enabledEvasions = new Set(config.enabledEvasions);
      } else if (Array.isArray(plugin.enabledEvasions)) {
        plugin.enabledEvasions = [...config.enabledEvasions];
      }
    }

    // Apply blacklist of disabled evasions
    if (config.disabledEvasions && config.disabledEvasions.length > 0) {
      for (const evasion of config.disabledEvasions) {
        if (plugin.enabledEvasions instanceof Set) {
          plugin.enabledEvasions.delete(evasion);
        } else if (Array.isArray(plugin.enabledEvasions)) {
          const idx = plugin.enabledEvasions.indexOf(evasion);
          if (idx !== -1) {
            plugin.enabledEvasions.splice(idx, 1);
          }
        }
      }
    }
  }

  return plugin;
}
