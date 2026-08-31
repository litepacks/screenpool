import type { Browser } from 'puppeteer-core';
import { join } from 'node:path';
import { rmSync } from 'node:fs';
import type { ResolvedScreenPoolConfig } from './types.js';
import { resolveBrowserExecutable } from './utils/resolveBrowserExecutable.js';
import { buildLaunchArgs } from './utils/buildLaunchArgs.js';
import { getBrowserMemoryMb } from './utils/processMemory.js';
import { BrowserCrashedError } from './errors.js';
import { acquireSharedBrowser, touchSharedDaemon } from './utils/sharedDaemon.js';
import { createBrowserProvider, type BrowserProvider } from './browser/index.js';

export type BrowserDisconnectHandler = () => void;

/** Manages a Chromium browser instance (shared daemon or local dedicated process). */
export class BrowserManager {
  private browser: Browser | null = null;
  private provider: BrowserProvider;
  private executablePath: string | null = null;
  private disconnectHandler: BrowserDisconnectHandler | null = null;
  private isRemote = false;
  private isShared = false;
  private exitHookRegistered = false;
  private exitHook?: () => void;
  private isIntentionalClose = false;

  constructor(private readonly config: ResolvedScreenPoolConfig) {
    this.provider = createBrowserProvider(this.config);
  }

  /** Get active browser provider instance. */
  getProvider(): BrowserProvider {
    return this.provider;
  }

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
      this.browser = await this.provider.connect({
        browserWSEndpoint: this.config.browserWSEndpoint,
        browserURL: this.config.browserURL,
        defaultViewport: null,
      });
      this.isRemote = true;
      this.isShared = false;
    } else if (this.config.shared) {
      const { wsEndpoint } = await acquireSharedBrowser(this.config);
      this.browser = await this.provider.connect({
        browserWSEndpoint: wsEndpoint,
        defaultViewport: null,
      });
      this.isRemote = true;
      this.isShared = true;
    } else {
      this.executablePath = await resolveBrowserExecutable(this.config);
      const args = buildLaunchArgs(this.config);

      this.browser = await this.provider.launch({
        executablePath: this.executablePath,
        headless: this.config.devtools ? false : this.config.headless,
        devtools: this.config.devtools,
        args,
        userDataDir: this.config.userDataDir,
        defaultViewport: this.config.defaultViewport
          ? {
              width: this.config.defaultViewport.width,
              height: this.config.defaultViewport.height,
              deviceScaleFactor: this.config.defaultViewport.deviceScaleFactor,
            }
          : null,
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
      const wasIntentional = this.isIntentionalClose;
      this.isIntentionalClose = false;
      this.browser = null;
      this.removeExitHook();
      if (!wasIntentional) {
        this.disconnectHandler?.();
      }
    });

    return this.browser;
  }

  /** Register handler for browser disconnect/crash. */
  onDisconnect(handler: BrowserDisconnectHandler): void {
    this.disconnectHandler = handler;
  }

  /** Get WebSocket endpoint URL for CDP / DevTools connection if connected. */
  getWSEndpoint(): string | undefined {
    return this.browser?.wsEndpoint();
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

  /** Reconfigure display settings (headless, devtools, remoteDebuggingPort) and restart browser process. */
  async reconfigure(options: {
    headless?: boolean | 'shell';
    devtools?: boolean;
    remoteDebuggingPort?: number;
  }): Promise<Browser> {
    if (options.devtools !== undefined) {
      (this.config as any).devtools = options.devtools;
    }
    if (options.headless !== undefined) {
      (this.config as any).headless = options.headless;
    }
    if (options.remoteDebuggingPort !== undefined) {
      (this.config as any).remoteDebuggingPort = options.remoteDebuggingPort;
    }
    if (this.config.devtools) {
      (this.config as any).headless = false;
    }
    await this.close();
    // Allow OS and Chromium process to release file locks and flush SQLite files
    await new Promise((resolve) => setTimeout(resolve, 400));
    return this.launch();
  }

  /** Close or disconnect browser gracefully with force-kill fallback. */
  async close(): Promise<void> {
    if (this.browser) {
      this.isIntentionalClose = true;
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
          const closePromise = browserToClose.close().catch(() => undefined);
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

          // Ensure OS process has actually terminated
          if (pid) {
            try {
              let attempts = 0;
              while (attempts++ < 20) {
                process.kill(pid, 0);
                await new Promise((r) => setTimeout(r, 50));
              }
              try {
                process.kill(pid, 'SIGKILL');
              } catch {}
            } catch {
              // Process exited successfully
            }
          }

          // Clean up stale lock files in userDataDir if process is gone
          if (this.config.userDataDir) {
            try {
              rmSync(join(this.config.userDataDir, 'SingletonLock'), { force: true });
              rmSync(join(this.config.userDataDir, 'SingletonSocket'), { force: true });
              rmSync(join(this.config.userDataDir, 'SingletonCookie'), { force: true });
            } catch {}
          }
        }
      } catch {
        // ignore close errors
      }
    }
  }

  get isConnected(): boolean {
    return Boolean(this.browser?.connected);
  }

  /** Chromium opens a blank tab in the default context — close it in headless mode to save memory. */
  private async closeDefaultContextPages(browser: Browser): Promise<void> {
    if (this.config.headless === false || this.config.devtools) {
      return;
    }
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
