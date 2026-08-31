import type { ResolvedScreenPoolConfig } from '../types.js';
import type { BrowserProvider } from './types.js';
import { PuppeteerCoreProvider } from './providers/puppeteer.js';
import { PuppeteerExtraProvider } from './providers/puppeteer-extra.js';

/**
 * Factory function returning appropriate BrowserProvider based on config.
 * - When stealth is disabled: returns PuppeteerCoreProvider (zero overhead)
 * - When stealth is enabled: returns PuppeteerExtraProvider (isolated instance)
 */
export function createBrowserProvider(config: ResolvedScreenPoolConfig): BrowserProvider {
  if (config.stealth?.enabled) {
    return new PuppeteerExtraProvider(config.stealth);
  }
  return new PuppeteerCoreProvider();
}
