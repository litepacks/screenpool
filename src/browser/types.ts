import puppeteer, { type Browser, type ConnectOptions } from 'puppeteer-core';

export type BrowserLaunchOptions = Parameters<typeof puppeteer.launch>[0];

/**
 * Common abstraction for browser creation / connection providers.
 */
export interface BrowserProvider {
  /** Provider identifier name */
  readonly name: 'puppeteer-core' | 'puppeteer-extra';

  /** Whether stealth mode is active in this provider */
  readonly isStealth: boolean;

  /** Launch a new Chromium browser process */
  launch(options: BrowserLaunchOptions): Promise<Browser>;

  /** Connect to an existing Chromium browser over WebSocket or HTTP URL */
  connect(options: ConnectOptions): Promise<Browser>;

  /** Get provider-specific diagnostics / status metadata */
  getDiagnosticsInfo?(): Record<string, unknown>;
}
