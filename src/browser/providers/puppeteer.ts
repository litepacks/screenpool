import puppeteer, { type Browser, type ConnectOptions } from 'puppeteer-core';
import type { BrowserLaunchOptions, BrowserProvider } from '../types.js';

/**
 * Standard browser provider using puppeteer-core directly with zero overhead.
 */
export class PuppeteerCoreProvider implements BrowserProvider {
  readonly name = 'puppeteer-core' as const;
  readonly isStealth = false;

  async launch(options: BrowserLaunchOptions): Promise<Browser> {
    return puppeteer.launch(options);
  }

  async connect(options: ConnectOptions): Promise<Browser> {
    return puppeteer.connect(options);
  }

  getDiagnosticsInfo(): Record<string, unknown> {
    return {
      provider: this.name,
      stealth: false,
    };
  }
}
