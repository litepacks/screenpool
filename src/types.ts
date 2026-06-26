/** Supported render job types. */
export type JobType = 'screenshot' | 'pdf' | 'htmlToImage' | 'htmlToPdf';

export type WaitUntil = 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2';

export type ScreenshotFormat = 'png' | 'jpeg' | 'webp';

export type PdfFormat = 'A4' | 'A3' | 'Letter' | 'Legal';

export type BlockResourceType =
  | 'image'
  | 'stylesheet'
  | 'font'
  | 'media'
  | 'script'
  | 'xhr'
  | 'fetch'
  | 'websocket'
  | 'other';

export type BrowserType = 'chrome' | 'chrome-headless-shell' | 'chromium';

export type BrowserChannel = 'stable' | 'beta' | 'dev' | 'canary';

export type BrowserShorthand = `${BrowserType}@${BrowserChannel}`;

/** Browser install config for @puppeteer/browsers cache resolution. */
export interface BrowserInstallConfig {
  type?: BrowserType;
  channel?: BrowserChannel;
  buildId?: string;
  cacheDir?: string;
}

/** Memory limits and monitoring configuration. */
export interface MemoryConfig {
  /** Browser process RSS upper limit in MB. */
  limitMb?: number;
  /** V8 heap limit passed via --js-flags=--max-old-space-size. */
  v8HeapMb?: number;
  /** RSS polling interval in ms. Default: 5000 */
  checkIntervalMs?: number;
  /** Emit memory:pressure at limitMb * threshold. Default: 0.85 */
  pressureThreshold?: number;
  /** Restart browser when limit exceeded. Default: true */
  restartOnLimit?: boolean;
}

/** Output and temp directory configuration. */
export interface StorageConfig {
  /** Root directory for render output files (CLI). */
  outputDir?: string;
  /** Temp directory for intermediate files. */
  tempDir?: string;
}

/** ScreenPool configuration. */
export interface ScreenPoolConfig {
  executablePath?: string;
  browser?: BrowserInstallConfig | BrowserShorthand;
  poolSize?: number;
  maxQueueSize?: number;
  jobTimeout?: number;
  browserRestartAfterJobs?: number;
  workerRestartAfterJobs?: number;
  idleTimeout?: number;
  launchArgs?: string[];
  allowLocalhost?: boolean;
  allowPrivateNetworks?: boolean;
  allowFileProtocol?: boolean;
  defaultViewport?: ViewportConfig;
  memory?: MemoryConfig;
  storage?: StorageConfig;
  /** Shorthand for storage.outputDir */
  outputDir?: string;
}

export interface ViewportConfig {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
  hasTouch?: boolean;
}

export interface CookieConfig {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

export interface ScreenshotOptions {
  url?: string;
  html?: string;
  baseURL?: string;
  viewport?: ViewportConfig;
  format?: ScreenshotFormat;
  quality?: number;
  fullPage?: boolean;
  selector?: string;
  clip?: { x: number; y: number; width: number; height: number };
  omitBackground?: boolean;
  darkMode?: boolean;
  userAgent?: string;
  headers?: Record<string, string>;
  cookies?: CookieConfig[];
  waitUntil?: WaitUntil;
  waitForSelector?: string;
  waitForTimeout?: number;
  injectCSS?: string;
  injectJS?: string;
  blockResources?: BlockResourceType[];
}

export interface PdfMarginConfig {
  top?: string;
  right?: string;
  bottom?: string;
  left?: string;
}

export interface PdfSettings {
  format?: PdfFormat;
  width?: string;
  height?: string;
  margin?: PdfMarginConfig;
  printBackground?: boolean;
  landscape?: boolean;
  preferCSSPageSize?: boolean;
  scale?: number;
  pageRanges?: string;
  displayHeaderFooter?: boolean;
  headerTemplate?: string;
  footerTemplate?: string;
}

export interface PdfOptions {
  url?: string;
  html?: string;
  baseURL?: string;
  viewport?: ViewportConfig;
  pdf?: PdfSettings;
  userAgent?: string;
  headers?: Record<string, string>;
  cookies?: CookieConfig[];
  waitUntil?: WaitUntil;
  waitForSelector?: string;
  waitForTimeout?: number;
  injectCSS?: string;
  injectJS?: string;
}

/** Result returned from render methods. */
export interface RenderResult {
  buffer: Buffer;
  contentType: string;
  durationMs: number;
  jobId: string;
  type: JobType;
}

/** Pool statistics snapshot. */
export interface PoolStats {
  started: boolean;
  poolSize: number;
  activeJobs: number;
  queuedJobs: number;
  completedJobs: number;
  failedJobs: number;
  browserRestarts: number;
  workerRestarts: number;
  uptimeMs: number;
  memoryUsageMb: number;
  memoryLimitMb?: number;
  memoryBlocked: boolean;
}

/** Internal queued job representation. */
export interface QueuedJob<T = unknown> {
  id: string;
  type: JobType;
  options: T;
  enqueuedAt: number;
  resolve: (result: RenderResult) => void;
  reject: (error: Error) => void;
}

export type WorkerState = 'idle' | 'busy' | 'recycling' | 'crashed';

/** Resolved configuration with defaults applied. */
export interface ResolvedScreenPoolConfig {
  executablePath?: string;
  browser?: BrowserInstallConfig | BrowserShorthand;
  poolSize: number;
  maxQueueSize: number;
  jobTimeout: number;
  browserRestartAfterJobs: number;
  workerRestartAfterJobs: number;
  idleTimeout: number;
  launchArgs: string[];
  allowLocalhost: boolean;
  allowPrivateNetworks: boolean;
  allowFileProtocol: boolean;
  defaultViewport: ViewportConfig;
  memory: Required<Pick<MemoryConfig, 'checkIntervalMs' | 'pressureThreshold' | 'restartOnLimit'>> &
    MemoryConfig;
  storage: Required<Pick<StorageConfig, 'outputDir' | 'tempDir'>>;
}

export const DEFAULT_CHROMIUM_ARGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-popup-blocking',
  '--no-first-run',
  '--disable-component-update',
  '--metrics-recording-only',
  '--mute-audio',
  '--hide-scrollbars',
  '--disk-cache-size=0',
  '--media-cache-size=0',
  '--aggressive-cache-discard',
] as const;

export const DEFAULT_POOL_SIZE = 4;
export const DEFAULT_MAX_QUEUE_SIZE = 100;
export const DEFAULT_JOB_TIMEOUT = 15_000;
export const DEFAULT_WORKER_RESTART_AFTER_JOBS = 500;
export const DEFAULT_OUTPUT_DIR = './output';

import os from 'node:os';

/** Apply defaults to user config. */
export function resolveConfig(config: ScreenPoolConfig): ResolvedScreenPoolConfig {
  const outputDir =
    config.outputDir ??
    config.storage?.outputDir ??
    process.env.SCREENPOOL_OUTPUT_DIR ??
    DEFAULT_OUTPUT_DIR;

  const tempDir =
    config.storage?.tempDir ??
    process.env.SCREENPOOL_TEMP_DIR ??
    `${os.tmpdir()}/screenpool`;

  return {
    executablePath: config.executablePath,
    browser: config.browser,
    poolSize: config.poolSize ?? DEFAULT_POOL_SIZE,
    maxQueueSize: config.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
    jobTimeout: config.jobTimeout ?? DEFAULT_JOB_TIMEOUT,
    browserRestartAfterJobs: config.browserRestartAfterJobs ?? 0,
    workerRestartAfterJobs: config.workerRestartAfterJobs ?? DEFAULT_WORKER_RESTART_AFTER_JOBS,
    idleTimeout: config.idleTimeout ?? 0,
    launchArgs: config.launchArgs ?? [],
    allowLocalhost: config.allowLocalhost ?? false,
    allowPrivateNetworks: config.allowPrivateNetworks ?? false,
    allowFileProtocol: config.allowFileProtocol ?? false,
    defaultViewport: config.defaultViewport ?? {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
    memory: {
      limitMb: config.memory?.limitMb,
      v8HeapMb: config.memory?.v8HeapMb,
      checkIntervalMs: config.memory?.checkIntervalMs ?? 5000,
      pressureThreshold: config.memory?.pressureThreshold ?? 0.85,
      restartOnLimit: config.memory?.restartOnLimit ?? true,
    },
    storage: { outputDir, tempDir },
  };
}
