/** Supported render job types. */
export type JobType = 'screenshot' | 'pdf' | 'htmlToImage' | 'htmlToPdf' | 'extract';

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

import type { DiagnosticsInput, DiagnosticsOptions, DiagnosticsResult } from './diagnostics/types.js';
import type { StealthConfig, StealthInput, ResolvedStealthConfig } from './stealth/types.js';
import { normalizeStealthConfig } from './stealth/normalize-config.js';

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
  browserWSEndpoint?: string;
  browserURL?: string;
  browserInstance?: any;
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
  /** Share singleton browser process across instances (default: false for programmatic ScreenPool, true for MCP) */
  shared?: boolean;
  defaultViewport?: ViewportConfig;
  memory?: MemoryConfig;
  storage?: StorageConfig;
  /** Global default diagnostics options */
  diagnostics?: DiagnosticsInput;
  /** Shorthand for storage.outputDir */
  outputDir?: string;
  /** Path to persistent user data directory for Chromium profile (cookies, localStorage, auth) */
  userDataDir?: string;
  /** Auto-open Chrome DevTools for every page (implies headless: false) */
  devtools?: boolean;
  /** Remote debugging port for CDP / DevTools connection (e.g. 9222 or 0) */
  remoteDebuggingPort?: number;
  /** Headless mode setting (default: true) */
  headless?: boolean | 'shell';
  /** Stealth mode configuration to evade browser automation detection */
  stealth?: StealthInput;
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
  includeElementHtml?: boolean;
  includeCode?: boolean;
  diagnostics?: DiagnosticsInput;
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
  diagnostics?: DiagnosticsInput;
}

export interface ExtractOptions {
  url?: string;
  html?: string;
  rules: string;
  viewport?: ViewportConfig;
  userAgent?: string;
  headers?: Record<string, string>;
  cookies?: CookieConfig[];
  waitUntil?: WaitUntil;
  waitForSelector?: string;
  waitForTimeout?: number;
  injectCSS?: string;
  injectJS?: string;
  blockResources?: BlockResourceType[];
  diagnostics?: DiagnosticsInput;
}

export interface ExtractResult extends RenderResult {
  data: any;
}

/** Result returned from render methods. */
export interface RenderResult {
  buffer: Buffer;
  contentType: string;
  durationMs: number;
  jobId: string;
  type: JobType;
  elementHtml?: string;
  diagnostics?: DiagnosticsResult;
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
  browserProvider?: 'puppeteer-core' | 'puppeteer-extra';
  stealth?: {
    enabled: boolean;
    evasionsCount?: number;
  };
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
  browserWSEndpoint?: string;
  browserURL?: string;
  browserInstance?: any;
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
  shared: boolean;
  /** Path to persistent user data directory for Chromium profile */
  userDataDir?: string;
  devtools: boolean;
  remoteDebuggingPort?: number;
  headless: boolean | 'shell';
  stealth: ResolvedStealthConfig;
  defaultViewport: ViewportConfig;
  diagnostics?: DiagnosticsOptions;
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
import { resolveDiagnosticsOptions } from './diagnostics/presets.js';

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

  const userDataDir =
    config.userDataDir ??
    process.env.SCREENPOOL_USER_DATA_DIR;

  const envDiagnosticsInput = process.env.SCREENPOOL_DIAGNOSTICS;
  let resolvedDiagnosticsInput = config.diagnostics;
  if (resolvedDiagnosticsInput === undefined && envDiagnosticsInput !== undefined) {
    if (envDiagnosticsInput === 'true') resolvedDiagnosticsInput = true;
    else if (envDiagnosticsInput === 'false') resolvedDiagnosticsInput = false;
    else resolvedDiagnosticsInput = envDiagnosticsInput as any;
  }

  const envDiagnosticsDir = process.env.SCREENPOOL_DIAGNOSTICS_DIR;
  const envDiagnosticsOutput = process.env.SCREENPOOL_DIAGNOSTICS_OUTPUT as any;
  const envDiagnosticsTtl = process.env.SCREENPOOL_DIAGNOSTICS_TTL_MS
    ? Number.parseInt(process.env.SCREENPOOL_DIAGNOSTICS_TTL_MS, 10)
    : undefined;
  const envMaxConsole = process.env.SCREENPOOL_DIAGNOSTICS_MAX_CONSOLE
    ? Number.parseInt(process.env.SCREENPOOL_DIAGNOSTICS_MAX_CONSOLE, 10)
    : undefined;
  const envMaxNetwork = process.env.SCREENPOOL_DIAGNOSTICS_MAX_NETWORK
    ? Number.parseInt(process.env.SCREENPOOL_DIAGNOSTICS_MAX_NETWORK, 10)
    : undefined;

  const globalDiagOpts = resolveDiagnosticsOptions(resolvedDiagnosticsInput, {
    artifactsDir: envDiagnosticsDir,
    output: envDiagnosticsOutput,
    artifactTtlMs: envDiagnosticsTtl,
    maxConsoleEntries: envMaxConsole,
    maxNetworkEntries: envMaxNetwork,
  });

  const devtools = config.devtools ?? (process.env.SCREENPOOL_DEVTOOLS === 'true');
  const remoteDebuggingPort =
    config.remoteDebuggingPort ??
    (process.env.SCREENPOOL_REMOTE_DEBUGGING_PORT
      ? Number.parseInt(process.env.SCREENPOOL_REMOTE_DEBUGGING_PORT, 10)
      : undefined);

  let headless: boolean | 'shell' = config.headless ?? true;
  if (devtools) {
    headless = false;
  }

  const stealth = normalizeStealthConfig(config.stealth, process.env.SCREENPOOL_STEALTH);

  return {
    executablePath: config.executablePath,
    browser: config.browser,
    browserWSEndpoint: config.browserWSEndpoint,
    browserURL: config.browserURL,
    browserInstance: config.browserInstance,
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
    shared: config.shared ?? (process.env.SCREENPOOL_SHARED === 'true'),
    userDataDir,
    devtools,
    remoteDebuggingPort,
    headless,
    stealth,
    defaultViewport: config.defaultViewport ?? {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
    diagnostics: globalDiagOpts ?? undefined,
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
