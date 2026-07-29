import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type {
  BrowserInstallConfig,
  BrowserShorthand,
  BrowserType,
  BrowserChannel,
  ScreenPoolConfig,
} from '../types.js';
import {
  BrowserNotFoundError,
  BrowserNotInstalledError,
  BrowserResolveError,
  InvalidRenderInputError,
} from '../errors.js';

const SYSTEM_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

const BROWSER_TYPE_MAP: Record<BrowserType, string> = {
  chrome: 'chrome',
  'chrome-headless-shell': 'chrome-headless-shell',
  chromium: 'chromium',
};

/** Parse shorthand like "chrome@stable". */
export function parseBrowserShorthand(shorthand: string): BrowserInstallConfig {
  const match = shorthand.match(/^([a-z-]+)@([a-z]+)$/);
  if (!match) {
    throw new InvalidRenderInputError(
      `Invalid browser shorthand: ${shorthand}. Expected format: chrome@stable`,
    );
  }

  const type = match[1] as BrowserType;
  const channel = match[2] as BrowserChannel;

  if (!BROWSER_TYPE_MAP[type]) {
    throw new InvalidRenderInputError(`Unknown browser type: ${type}`);
  }

  return { type, channel };
}

function normalizeBrowserConfig(
  browser: BrowserInstallConfig | BrowserShorthand,
): BrowserInstallConfig {
  if (typeof browser === 'string') {
    return parseBrowserShorthand(browser);
  }
  return {
    type: browser.type ?? 'chrome',
    channel: browser.channel ?? 'stable',
    buildId: browser.buildId,
    cacheDir: browser.cacheDir,
  };
}

/** Default screenpool browser cache (~/.screenpool/browser). */
export function getDefaultCacheDir(): string {
  return (
    process.env.SCREENPOOL_CACHE_DIR ??
    process.env.PUPPETEER_CACHE_DIR ??
    join(homedir(), '.screenpool', 'browser')
  );
}

/**
 * Cache directories to search for installed browsers.
 * Priority: explicit cache dir > SCREENPOOL_CACHE_DIR > PUPPETEER_CACHE_DIR > ~/.screenpool/browser > ~/.cache/puppeteer > process.cwd()
 */
export function getSearchCacheDirs(explicitCacheDir?: string): string[] {
  const dirs = new Set<string>();

  if (explicitCacheDir) {
    dirs.add(explicitCacheDir);
  }

  if (process.env.SCREENPOOL_CACHE_DIR) {
    dirs.add(process.env.SCREENPOOL_CACHE_DIR);
  }

  if (process.env.PUPPETEER_CACHE_DIR) {
    dirs.add(process.env.PUPPETEER_CACHE_DIR);
  }

  dirs.add(join(homedir(), '.screenpool', 'browser'));
  dirs.add(join(homedir(), '.screenpool'));
  dirs.add(join(homedir(), '.cache', 'puppeteer'));
  dirs.add(process.cwd());

  return [...dirs];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

interface InstalledBrowserEntry {
  browser: string;
  buildId: string;
  platform: string;
  executablePath?: string;
}

/** Compare Chrome-style build IDs (e.g. 150.0.7871.24) for descending sort. */
function compareBuildIds(a: string, b: string): number {
  const pa = a.split('.').map((part) => Number(part));
  const pb = b.split('.').map((part) => Number(part));
  const len = Math.max(pa.length, pb.length);

  for (let i = 0; i < len; i++) {
    const diff = (pb[i] ?? 0) - (pa[i] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }

  return 0;
}

async function resolveFromBrowsersPackage(
  config: ScreenPoolConfig,
): Promise<string> {
  if (!config.browser) {
    throw new BrowserResolveError('browser config is required');
  }

  const browserConfig = normalizeBrowserConfig(config.browser);
  const type = browserConfig.type ?? 'chrome';
  const channel = browserConfig.channel ?? 'stable';
  const shorthand = `${type}@${channel}`;

  let browsersModule: typeof import('@puppeteer/browsers');
  try {
    browsersModule = await import('@puppeteer/browsers');
  } catch (error) {
    throw new BrowserResolveError(
      'Package @puppeteer/browsers is not installed. Run: npm install @puppeteer/browsers',
      error,
    );
  }

  const {
    Browser,
    computeExecutablePath,
    getInstalledBrowsers,
    resolveBuildId,
    detectBrowserPlatform,
  } = browsersModule;

  const browserKeyMap = {
    chrome: Browser.CHROME,
    'chrome-headless-shell': Browser.CHROMEHEADLESSSHELL,
    chromium: Browser.CHROMIUM,
  } as const;

  const browserEnum = browserKeyMap[type as keyof typeof browserKeyMap] ?? Browser.CHROME;

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new BrowserResolveError('Could not detect browser platform.');
  }

  const preferredBuildId =
    browserConfig.buildId ?? (await resolveBuildId(browserEnum, platform, channel));

  const cacheDirs = getSearchCacheDirs(browserConfig.cacheDir);
  const searchedDirs: string[] = [];

  for (const cacheDir of cacheDirs) {
    searchedDirs.push(cacheDir);
    let installed: InstalledBrowserEntry[];
    try {
      installed = await getInstalledBrowsers({ cacheDir });
    } catch {
      continue;
    }

    const matches = installed.filter(
      (entry) => entry.browser === browserEnum && entry.platform === platform,
    );

    if (matches.length === 0) {
      continue;
    }

    // Exact buildId match (latest stable channel version)
    const exact = matches.find((entry) => entry.buildId === preferredBuildId);
    if (exact?.executablePath && (await fileExists(exact.executablePath))) {
      return exact.executablePath;
    }

    try {
      const exactPath = computeExecutablePath({
        browser: browserEnum,
        buildId: preferredBuildId,
        cacheDir,
      });
      if (await fileExists(exactPath)) {
        return exactPath;
      }
    } catch {
      // not in this cache dir
    }

    // Fallback: newest installed version in this cache dir
    const sorted = [...matches].sort((a, b) => compareBuildIds(a.buildId, b.buildId));
    for (const entry of sorted) {
      if (entry.executablePath && (await fileExists(entry.executablePath))) {
        return entry.executablePath;
      }

      try {
        const path = computeExecutablePath({
          browser: browserEnum,
          buildId: entry.buildId,
          cacheDir,
        });
        if (await fileExists(path)) {
          return path;
        }
      } catch {
        continue;
      }
    }
  }

  throw new BrowserNotInstalledError(
    shorthand,
    `npx @puppeteer/browsers install ${type}@${channel}\n` +
      `Or set PUPPETEER_CACHE_DIR to your install location.\n` +
      `Searched cache dirs:\n${searchedDirs.map((d) => `  - ${d}`).join('\n')}`,
  );
}

async function resolveFromEnvOrSystem(): Promise<string | undefined> {
  const envPaths = [
    process.env.CHROME_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROMIUM_PATH,
  ].filter(Boolean) as string[];

  for (const path of envPaths) {
    if (await fileExists(path)) {
      return path;
    }
  }

  // Check cache directories for any previously installed browser
  for (const cacheDir of getSearchCacheDirs()) {
    try {
      const { getInstalledBrowsers } = await import('@puppeteer/browsers');
      const installed = await getInstalledBrowsers({ cacheDir });
      for (const entry of installed) {
        if (entry.executablePath && (await fileExists(entry.executablePath))) {
          return entry.executablePath;
        }
      }
    } catch {
      // ignore
    }
  }

  // Check candidate system paths for Chrome / Chromium / Edge / Brave
  const candidatePaths = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    join(homedir(), 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    join(homedir(), 'Applications', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'),
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome-unstable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/snap/bin/google-chrome',
    '/usr/bin/brave-browser',
    ...SYSTEM_PATHS,
  ];

  for (const path of candidatePaths) {
    if (await fileExists(path)) {
      return path;
    }
  }

  // Check PATH for binary (which / where)
  try {
    const { execSync } = await import('node:child_process');
    const { platform: osPlatform } = await import('node:os');
    const cmd = osPlatform() === 'win32' ? 'where' : 'which';
    const bins = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'chrome', 'brave-browser'];
    for (const bin of bins) {
      try {
        const output = execSync(`${cmd} ${bin}`, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
        const firstLine = output.split(/\r?\n/)[0]?.trim();
        if (firstLine && (await fileExists(firstLine))) {
          return firstLine;
        }
      } catch {}
    }
  } catch {}

  try {
    const { computeSystemExecutablePath, detectBrowserPlatform, Browser, ChromeReleaseChannel } =
      await import('@puppeteer/browsers');
    const platform = detectBrowserPlatform();
    if (platform) {
      const computed = computeSystemExecutablePath({
        browser: Browser.CHROME,
        channel: ChromeReleaseChannel.STABLE,
        platform,
      });
      if (await fileExists(computed)) {
        return computed;
      }
    }
  } catch {
    // optional peer not available
  }

  return undefined;
}

/**
 * Resolve Chromium executable path from config, env, or system.
 * Priority: executablePath > browser cache > env > system paths > auto-install fallback
 */
export async function resolveBrowserExecutable(config: ScreenPoolConfig): Promise<string> {
  if (config.executablePath && config.browser) {
    throw new InvalidRenderInputError('Provide either executablePath or browser, not both.');
  }

  if (config.executablePath) {
    if (!(await fileExists(config.executablePath))) {
      throw new BrowserNotFoundError(`Executable not found: ${config.executablePath}`);
    }
    return config.executablePath;
  }

  if (config.browser) {
    try {
      return await resolveFromBrowsersPackage(config);
    } catch (err) {
      // If specified browser fails to resolve, attempt auto-setup
      const setupRes = await setupBrowser({ browser: config.browser });
      return setupRes.executablePath;
    }
  }

  const fallback = await resolveFromEnvOrSystem();
  if (fallback) {
    return fallback;
  }

  // Auto-install fallback: automatically download chrome@stable if no browser exists anywhere on the system
  try {
    const setupRes = await setupBrowser({ browser: 'chrome@stable' });
    return setupRes.executablePath;
  } catch (err: any) {
    throw new BrowserNotFoundError(
      `No Chrome/Chromium installation found on system, and auto-download failed: ${err?.message || err}`,
    );
  }
}

export interface SetupBrowserOptions {
  /** Browser shorthand e.g. 'chrome@stable' or config object. Default: 'chrome@stable' */
  browser?: BrowserInstallConfig | BrowserShorthand;
  /** Custom directory to install browser into. Default: ~/.screenpool/browser */
  cacheDir?: string;
  /** Force re-download even if browser binary already exists. */
  force?: boolean;
  /** Optional callback for download progress updates. */
  onProgress?: (downloadedBytes: number, totalBytes: number) => void;
}

export interface SetupBrowserResult {
  executablePath: string;
  browser: string;
  buildId: string;
  cacheDir: string;
  alreadyInstalled: boolean;
}

/**
 * Download and setup Chromium browser binary into cache directory (~/.screenpool/browser by default).
 */
export async function setupBrowser(
  options: SetupBrowserOptions = {},
): Promise<SetupBrowserResult> {
  const browserConfig = normalizeBrowserConfig(options.browser ?? 'chrome@stable');
  const type = browserConfig.type ?? 'chrome';
  const channel = browserConfig.channel ?? 'stable';

  let browsersModule: typeof import('@puppeteer/browsers');
  try {
    browsersModule = await import('@puppeteer/browsers');
  } catch (error) {
    throw new BrowserResolveError(
      'Package @puppeteer/browsers is not installed. Run: npm install @puppeteer/browsers',
      error,
    );
  }

  const {
    Browser,
    computeExecutablePath,
    getInstalledBrowsers,
    resolveBuildId,
    detectBrowserPlatform,
    install,
  } = browsersModule;

  const browserKeyMap = {
    chrome: Browser.CHROME,
    'chrome-headless-shell': Browser.CHROMEHEADLESSSHELL,
    chromium: Browser.CHROMIUM,
  } as const;

  const browserEnum = browserKeyMap[type as keyof typeof browserKeyMap] ?? Browser.CHROME;

  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new BrowserResolveError('Could not detect browser platform.');
  }

  const cacheDir = options.cacheDir ?? browserConfig.cacheDir ?? getDefaultCacheDir();

  if (!options.force) {
    try {
      const installed = await getInstalledBrowsers({ cacheDir });
      const matches = installed.filter(
        (entry) => entry.browser === browserEnum && entry.platform === platform,
      );

      if (browserConfig.buildId) {
        const exact = matches.find((entry) => entry.buildId === browserConfig.buildId);
        if (exact?.executablePath && (await fileExists(exact.executablePath))) {
          return {
            executablePath: exact.executablePath,
            browser: browserEnum,
            buildId: exact.buildId,
            cacheDir,
            alreadyInstalled: true,
          };
        }
      }

      // Any valid installed version for this browser type
      const sorted = [...matches].sort((a, b) => compareBuildIds(a.buildId, b.buildId));
      for (const entry of sorted) {
        if (entry.executablePath && (await fileExists(entry.executablePath))) {
          return {
            executablePath: entry.executablePath,
            browser: browserEnum,
            buildId: entry.buildId,
            cacheDir,
            alreadyInstalled: true,
          };
        }
      }
    } catch {
      // ignore lookup errors and proceed with installation
    }
  }

  const buildId =
    browserConfig.buildId ?? (await resolveBuildId(browserEnum, platform, channel));

  const buildDir = join(cacheDir, browserEnum, `${platform}-${buildId}`);
  const zipFile = `${buildDir}.zip`;
  const { rm } = await import('node:fs/promises');

  try {
    const computedPath = computeExecutablePath({
      browser: browserEnum,
      buildId,
      cacheDir,
    });
    if (!(await fileExists(computedPath))) {
      await rm(buildDir, { recursive: true, force: true }).catch(() => {});
      await rm(zipFile, { force: true }).catch(() => {});
    }
  } catch {
    // ignore cleanup errors
  }

  let installedBrowser;
  try {
    installedBrowser = await install({
      browser: browserEnum,
      buildId,
      cacheDir,
      platform,
      downloadProgressCallback: options.onProgress,
    });
  } catch {
    // Clean up potentially corrupted zip archive or folder and retry once
    await rm(buildDir, { recursive: true, force: true }).catch(() => {});
    await rm(zipFile, { force: true }).catch(() => {});

    installedBrowser = await install({
      browser: browserEnum,
      buildId,
      cacheDir,
      platform,
      downloadProgressCallback: options.onProgress,
    });
  }

  if (!(await fileExists(installedBrowser.executablePath))) {
    await rm(buildDir, { recursive: true, force: true }).catch(() => {});
    await rm(zipFile, { force: true }).catch(() => {});
    throw new BrowserResolveError(
      `Failed to setup ${type}@${channel}: Browser executable missing at ${installedBrowser.executablePath}`,
    );
  }

  return {
    executablePath: installedBrowser.executablePath,
    browser: browserEnum,
    buildId,
    cacheDir,
    alreadyInstalled: false,
  };
}
