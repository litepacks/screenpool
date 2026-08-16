import puppeteer, { type Browser } from 'puppeteer-core';
import type { ResolvedScreenPoolConfig } from './types.js';
import { resolveBrowserExecutable } from './utils/resolveBrowserExecutable.js';
import { buildLaunchArgs } from './utils/buildLaunchArgs.js';
import { getBrowserMemoryMb } from './utils/processMemory.js';
import { BrowserCrashedError } from './errors.js';
import { acquireSharedBrowser, touchSharedDaemon } from './utils/sharedDaemon.js';

export type BrowserDisconnectHandler = () => void;

/** Manages a Chromium browser instance (shared daemon or local dedicated process). */
export class BrowserManager {
  private browser: Browser | null = null;
  private executablePath: string | null = null;
  private disconnectHandler: BrowserDisconnectHandler | null = null;
  private isRemote = false;
  private isShared = false;
  private exitHookRegistered = false;
  private exitHook?: () => void;

  constructor(private readonly config: ResolvedScreenPoolConfig) {}

  /** Launch the browser process or connect to existing shared daemon. */
  async launch(): Promise<Browser> {
    if (this.browser?.connected) {
      if (this.isShared) {
        touchSharedDaemon();
      }
      return this.browser;
    }

    if (this.config.browserInstance) {
      this.browser = this.config.browserInstance;
      this.isRemote = true;
      this.isShared = false;
    } else if (this.config.browserWSEndpoint || this.config.browserURL) {
      this.browser = await puppeteer.connect({
        browserWSEndpoint: this.config.browserWSEndpoint,
        browserURL: this.config.browserURL,
        defaultViewport: null,
      });
      this.isRemote = true;
      this.isShared = false;
    } else if (this.config.shared) {
      const { wsEndpoint } = await acquireSharedBrowser(this.config);
      this.browser = await puppeteer.connect({
        browserWSEndpoint: wsEndpoint,
        defaultViewport: null,
      });
      this.isRemote = true;
      this.isShared = true;
    } else {
      this.executablePath = await resolveBrowserExecutable(this.config);
      const args = buildLaunchArgs(this.config);

      this.browser = await puppeteer.launch({
        executablePath: this.executablePath,
        headless: true,
        args,
      });

      this.isRemote = false;
      this.isShared = false;

      this.registerExitHook();
      await this.closeDefaultContextPages(this.browser);
    }

    if (!this.browser) {
      throw new BrowserCrashedError('Failed to launch browser.');
    }

    this.browser.on('disconnected', () => {
      this.browser = null;
      this.removeExitHook();
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
    if (this.isShared) {
      touchSharedDaemon();
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

  /** Close or disconnect browser gracefully with force-kill fallback. */
  async close(): Promise<void> {
    if (this.browser) {
      const browserToClose = this.browser;
      const pid = browserToClose.process()?.pid;
      this.browser = null;
      this.removeExitHook();

      try {
        if (this.config.browserInstance) {
          // Do not close user-provided browser instance
        } else if (this.isRemote || this.isShared || this.config.browserWSEndpoint || this.config.browserURL) {
          browserToClose.disconnect();
        } else {
          // Dedicated local browser: attempt graceful close with a strict timeout
          const closePromise = browserToClose.close();
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Browser.close timed out')), 2000),
          );

          await Promise.race([closePromise, timeoutPromise]).catch(() => {
            // If CDP close hung, force kill the OS process
            if (pid) {
              try {
                process.kill(pid, 'SIGKILL');
              } catch {
                // process already exited
              }
            }
          });
        }
      } catch {
        // ignore close errors
      }
    }
  }

  get isConnected(): boolean {
    return Boolean(this.browser?.connected);
  }

  /** Chromium opens a blank tab in the default context — close it to save memory. */
  private async closeDefaultContextPages(browser: Browser): Promise<void> {
    try {
      const pages = await browser.defaultBrowserContext().pages();
      await Promise.all(
        pages.map((page) => page.close({ runBeforeUnload: false }).catch(() => undefined)),
      );
    } catch {
      // ignore
    }
  }

  /** Register OS process exit hooks so that Chrome process never outlives Node. */
  private registerExitHook(): void {
    if (this.exitHookRegistered) return;
    this.exitHookRegistered = true;

    this.exitHook = () => {
      if (this.browser && !this.isRemote) {
        const pid = this.browser.process()?.pid;
        if (pid) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {}
        }
      }
    };

    process.once('exit', this.exitHook);
  }

  private removeExitHook(): void {
    if (this.exitHookRegistered && this.exitHook) {
      process.removeListener('exit', this.exitHook);
      this.exitHookRegistered = false;
      this.exitHook = undefined;
    }
  }
}
