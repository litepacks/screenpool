import puppeteerCore, { type Browser, type ConnectOptions } from 'puppeteer-core';
import type { BrowserLaunchOptions, BrowserProvider } from '../types.js';
import type { ResolvedStealthConfig } from '../../stealth/types.js';
import { createStealthPlugin, STEALTH_DEPENDENCY_ERROR_MESSAGE } from '../../stealth/create-stealth-plugin.js';

/**
 * Enhanced browser provider using puppeteer-extra and puppeteer-extra-plugin-stealth
 * with per-instance isolation (no global state contamination).
 */
export class PuppeteerExtraProvider implements BrowserProvider {
  readonly name = 'puppeteer-extra' as const;
  readonly isStealth = true;

  private extraInstance: any = null;
  private stealthPlugin: any = null;
  private initPromise: Promise<void> | null = null;

  constructor(private readonly stealthConfig: ResolvedStealthConfig) {}

  private async ensureInitialized(): Promise<void> {
    if (this.extraInstance) return;
    if (!this.initPromise) {
      this.initPromise = (async () => {
        let addExtraModule: any;
        try {
          addExtraModule = await import('puppeteer-extra');
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

        const addExtra = addExtraModule.addExtra ?? addExtraModule.default?.addExtra ?? addExtraModule.default;
        if (typeof addExtra !== 'function') {
          throw new Error(STEALTH_DEPENDENCY_ERROR_MESSAGE);
        }

        // Create isolated puppeteer-extra instance wrapping puppeteer-core
        const extra = addExtra(puppeteerCore);
        this.stealthPlugin = await createStealthPlugin(this.stealthConfig);
        extra.use(this.stealthPlugin);
        this.extraInstance = extra;
      })();
    }
    await this.initPromise;
  }

  async launch(options: BrowserLaunchOptions): Promise<Browser> {
    await this.ensureInitialized();
    return this.extraInstance.launch(options);
  }

  async connect(options: ConnectOptions): Promise<Browser> {
    await this.ensureInitialized();
    return this.extraInstance.connect(options);
  }

  getDiagnosticsInfo(): Record<string, unknown> {
    const evasionsCount =
      this.stealthPlugin?.enabledEvasions instanceof Set
        ? this.stealthPlugin.enabledEvasions.size
        : Array.isArray(this.stealthPlugin?.enabledEvasions)
        ? this.stealthPlugin.enabledEvasions.length
        : undefined;

    return {
      provider: this.name,
      stealth: {
        enabled: true,
        evasionsCount,
        disabledEvasions: this.stealthConfig.disabledEvasions,
        enabledEvasions: this.stealthConfig.enabledEvasions,
      },
    };
  }
}
