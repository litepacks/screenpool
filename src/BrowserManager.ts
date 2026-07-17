import puppeteer, { type Browser } from 'puppeteer-core';
import type { ResolvedScreenPoolConfig } from './types.js';
import { resolveBrowserExecutable } from './utils/resolveBrowserExecutable.js';
import { buildLaunchArgs } from './utils/buildLaunchArgs.js';
import { getBrowserMemoryMb } from './utils/processMemory.js';
import { BrowserCrashedError } from './errors.js';

export type BrowserDisconnectHandler = () => void;

/** Manages a single shared Chromium browser instance. */
export class BrowserManager {
  private browser: Browser | null = null;
  private executablePath: string | null = null;
  private disconnectHandler: BrowserDisconnectHandler | null = null;

  constructor(private readonly config: ResolvedScreenPoolConfig) {}

  /** Launch the browser process. */
  async launch(): Promise<Browser> {
    if (this.browser?.connected) {
      return this.browser;
    }

    if (this.config.browserInstance) {
      this.browser = this.config.browserInstance;
    } else if (this.config.browserWSEndpoint || this.config.browserURL) {
      this.browser = await puppeteer.connect({
        browserWSEndpoint: this.config.browserWSEndpoint,
        browserURL: this.config.browserURL,
        defaultViewport: null,
      });
    } else {
      this.executablePath = await resolveBrowserExecutable(this.config);
      const args = buildLaunchArgs(this.config);

      this.browser = await puppeteer.launch({
        executablePath: this.executablePath,
        headless: true,
        args,
      });

      await this.closeDefaultContextPages(this.browser);
    }

    this.browser.on('disconnected', () => {
      this.browser = null;
      this.disconnectHandler?.();
    });

    return this.browser;
  }

  /** Register handler for browser disconnect/crash. */
  onDisconnect(handler: BrowserDisconnectHandler): void {
    this.disconnectHandler = handler;
  }

  /** Get the active browser or throw. */
  getBrowser(): Browser {
    if (!this.browser?.connected) {
      throw new BrowserCrashedError('Browser is not connected.');
    }
    return this.browser;
  }

  /** Browser process PID. */
  getPid(): number | undefined {
    return this.browser?.process()?.pid ?? undefined;
  }

  /** Current browser process RSS in MB. */
  async getProcessMemoryMb(): Promise<number> {
    const pid = this.getPid();
    if (!pid) return 0;
    return getBrowserMemoryMb(pid);
  }

  /** Restart browser process. */
  async restart(): Promise<Browser> {
    await this.close();
    return this.launch();
  }

  /** Close browser gracefully. */
  async close(): Promise<void> {
    if (this.browser) {
      try {
        if (this.config.browserInstance) {
          // Do not close or disconnect a user-provided browser instance
        } else if (this.config.browserWSEndpoint || this.config.browserURL) {
          this.browser.disconnect();
        } else {
          await this.browser.close();
        }
      } catch {
        // ignore close errors on crashed browser
      }
      this.browser = null;
    }
  }

  get isConnected(): boolean {
    return Boolean(this.browser?.connected);
  }

  /** Chromium opens a blank tab in the default context — close it to save memory. */
  private async closeDefaultContextPages(browser: Browser): Promise<void> {
    const pages = await browser.defaultBrowserContext().pages();
    await Promise.all(
      pages.map((page) => page.close({ runBeforeUnload: false }).catch(() => undefined)),
    );
  }
}
