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

import type {
  DiagnosticsInput,
  DiagnosticsOptions,
  DiagnosticsResult,
  CoreWebVitalsDiagnostic,
  WebVitalsRating,
  NavigationPerformanceDiagnostic,
} from './diagnostics/types.js';

export type {
  DiagnosticsInput,
  DiagnosticsOptions,
  DiagnosticsResult,
  CoreWebVitalsDiagnostic,
  WebVitalsRating,
  NavigationPerformanceDiagnostic,
};
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
  /** Minimum pre-warmed workers kept in memory (default: 1, set to 0 for pure on-demand lazy workers) */
  minWorkers?: number;
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

/** Configuration options for PageSpeed / Core Web Vitals audit. */
export interface AuditOptions {
  /** Target URL to audit */
  url: string;
  /** Emulate device viewport (default: 'desktop') */
  device?: 'desktop' | 'mobile';
  /** Custom viewport configuration */
  viewport?: ViewportConfig;
  /** Navigation wait condition (default: 'load') */
  waitUntil?: WaitUntil;
  /** Navigation timeout in ms (default: 30000) */
  timeout?: number;
  /** Throttling options or slow network emulation */
  throttling?: {
    downloadKbps?: number;
    uploadKbps?: number;
    latencyMs?: number;
  };
  /** Collect extra diagnostic artifacts or logs */
  diagnostics?: DiagnosticsInput;
}

/** Result returned from PageSpeed / Core Web Vitals audit. */
export interface AuditResult {
  url: string;
  durationMs: number;
  score: number;
  webVitals: CoreWebVitalsDiagnostic;
  performance?: NavigationPerformanceDiagnostic;
  summary: {
    lcp: { valueMs?: number; rating?: WebVitalsRating; element?: string };
    cls: { score?: number; rating?: WebVitalsRating };
    fcp: { valueMs?: number; rating?: WebVitalsRating };
    ttfb: { valueMs?: number; rating?: WebVitalsRating };
    inp: { valueMs?: number; rating?: WebVitalsRating };
  };
  diagnostics?: DiagnosticsResult;
}

/** Pool statistics snapshot. */
export interface PoolStats {
  started: boolean;
  poolSize: number;
  minWorkers?: number;
  initializedWorkers?: number;
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
  minWorkers: number;
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
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-ipc-flooding-protection',
  '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,ProcessPerSiteUpToLimit',
  '--disable-breakpad',
  '--disable-component-extensions-with-background-pages',
  '--disable-domain-reliability',
  '--run-all-compositor-stages-before-draw',
  '--font-render-hinting=none',
  '--disable-speech-api',
  '--disable-client-side-phishing-detection',
  '--disable-notifications',
] as const;

export const DEFAULT_POOL_SIZE = 4;
export const DEFAULT_MAX_QUEUE_SIZE = 100;
export const DEFAULT_JOB_TIMEOUT = 15_000;
export const DEFAULT_WORKER_RESTART_AFTER_JOBS = 500;
export const DEFAULT_OUTPUT_DIR = './output';

import os from 'node:os';
import { resolveDiagnosticsOptions } from './diagnostics/presets.js';

/** Apply defaults to user config. */
export function resolveConfig(config?: ScreenPoolConfig | null): ResolvedScreenPoolConfig {
  const conf = config || {};
  const outputDir =
    conf.outputDir ??
    conf.storage?.outputDir ??
    process.env.SCREENPOOL_OUTPUT_DIR ??
    DEFAULT_OUTPUT_DIR;

  const tempDir =
    conf.storage?.tempDir ??
    process.env.SCREENPOOL_TEMP_DIR ??
    `${os.tmpdir()}/screenpool`;

  const userDataDir =
    conf.userDataDir ??
    process.env.SCREENPOOL_USER_DATA_DIR;

  const envDiagnosticsInput = process.env.SCREENPOOL_DIAGNOSTICS;
  let resolvedDiagnosticsInput = conf.diagnostics;
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

  const devtools = conf.devtools ?? (process.env.SCREENPOOL_DEVTOOLS === 'true');
  const remoteDebuggingPort =
    conf.remoteDebuggingPort ??
    (process.env.SCREENPOOL_REMOTE_DEBUGGING_PORT
      ? Number.parseInt(process.env.SCREENPOOL_REMOTE_DEBUGGING_PORT, 10)
      : undefined);

  let headless: boolean | 'shell' = conf.headless ?? true;
  if (devtools) {
    headless = false;
  }

  const stealth = normalizeStealthConfig(conf.stealth, process.env.SCREENPOOL_STEALTH);

  return {
    executablePath: conf.executablePath,
    browser: conf.browser,
    browserWSEndpoint: conf.browserWSEndpoint,
    browserURL: conf.browserURL,
    browserInstance: conf.browserInstance,
    poolSize: conf.poolSize ?? DEFAULT_POOL_SIZE,
    minWorkers:
      conf.minWorkers !== undefined
        ? Math.max(0, Math.min(conf.minWorkers, conf.poolSize ?? DEFAULT_POOL_SIZE))
        : Math.min(1, conf.poolSize ?? DEFAULT_POOL_SIZE),
    maxQueueSize: conf.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE,
    jobTimeout: conf.jobTimeout ?? DEFAULT_JOB_TIMEOUT,
    browserRestartAfterJobs: conf.browserRestartAfterJobs ?? 0,
    workerRestartAfterJobs: conf.workerRestartAfterJobs ?? DEFAULT_WORKER_RESTART_AFTER_JOBS,
    idleTimeout: conf.idleTimeout ?? 0,
    launchArgs: conf.launchArgs ?? [],
    allowLocalhost: conf.allowLocalhost ?? false,
    allowPrivateNetworks: conf.allowPrivateNetworks ?? false,
    allowFileProtocol: conf.allowFileProtocol ?? false,
    shared: conf.shared ?? (process.env.SCREENPOOL_SHARED === 'true'),
    userDataDir,
    devtools,
    remoteDebuggingPort,
    headless,
    stealth,
    defaultViewport: conf.defaultViewport ?? {
      width: 1280,
      height: 720,
      deviceScaleFactor: 1,
    },
    diagnostics: globalDiagOpts ?? undefined,
    memory: {
      limitMb: conf.memory?.limitMb,
      v8HeapMb: conf.memory?.v8HeapMb,
      checkIntervalMs: conf.memory?.checkIntervalMs ?? 5000,
      pressureThreshold: conf.memory?.pressureThreshold ?? 0.85,
      restartOnLimit: conf.memory?.restartOnLimit ?? true,
    },
    storage: { outputDir, tempDir },
  };
}
