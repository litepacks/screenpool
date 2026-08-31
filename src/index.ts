export { ScreenPool } from './ScreenPool.js';
export type { StatelessRunOptions } from './ScreenPool.js';

export { SessionManager } from './sessions/manager.js';
export { BrowserSessionImpl } from './sessions/session.js';
export { ActionError } from './actions/errors.js';
export type { ActionErrorCode } from './actions/errors.js';

export type * from './actions/types.js';
export type * from './sessions/types.js';
export type * from './pages/types.js';
export type * from './observations/types.js';
export type * from './recording/types.js';

export type {
  ScreenPoolConfig,
  ScreenshotOptions,
  PdfOptions,
  PdfSettings,
  RenderResult,
  PoolStats,
  JobType,
  BrowserInstallConfig,
  BrowserShorthand,
  MemoryConfig,
  StorageConfig,
  ViewportConfig,
  WaitUntil,
  ScreenshotFormat,
  PdfFormat,
  ExtractOptions,
  ExtractResult,
} from './types.js';

export {
  ScreenPoolError,
  DiagnosticsError,
  ScreenPoolNotStartedError,
  ScreenPoolStoppingError,
  QueueOverflowError,
  RenderTimeoutError,
  NavigationError,
  BrowserCrashedError,
  WorkerCrashedError,
  InvalidRenderInputError,
  SecurityBlockedUrlError,
  MemoryLimitExceededError,
  BrowserNotInstalledError,
  BrowserNotFoundError,
  BrowserResolveError,
  InvalidOutputPathError,
  isScreenPoolError,
} from './errors.js';

export {
  resolveBrowserExecutable,
  parseBrowserShorthand,
  setupBrowser,
  getDefaultCacheDir,
  getSearchCacheDirs,
} from './utils/resolveBrowserExecutable.js';
export type { SetupBrowserOptions, SetupBrowserResult } from './utils/resolveBrowserExecutable.js';
export { resolveOutputPath, ensureOutputDir, formatToExt } from './utils/resolveOutputPath.js';

export * as diagnostics from './diagnostics/index.js';
export type * from './diagnostics/types.js';

export type { StealthConfig, StealthInput, ResolvedStealthConfig } from './stealth/types.js';
export { normalizeStealthConfig } from './stealth/normalize-config.js';
export type { BrowserProvider } from './browser/types.js';
export { createBrowserProvider } from './browser/create-browser-provider.js';
