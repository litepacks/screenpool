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

function getDefaultCacheDir(): string {
  return process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), '.cache', 'puppeteer');
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

async function resolveFromBrowsersPackage(
  config: ScreenPoolConfig,
): Promise<string> {
  if (!config.browser) {
    throw new BrowserResolveError('browser config is required');
  }

  const browserConfig = normalizeBrowserConfig(config.browser);
  const type = browserConfig.type ?? 'chrome';
  const channel = browserConfig.channel ?? 'stable';
  const cacheDir = browserConfig.cacheDir ?? getDefaultCacheDir();
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

  const { Browser, computeExecutablePath, getInstalledBrowsers, resolveBuildId, detectBrowserPlatform } =
    browsersModule;

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

  const buildId =
    browserConfig.buildId ?? (await resolveBuildId(browserEnum, platform, channel));

  const installed = await getInstalledBrowsers({ cacheDir });
  const isInstalled = installed.some(
    (b) => b.browser === browserEnum && b.buildId === buildId,
  );

  if (!isInstalled) {
    throw new BrowserNotInstalledError(
      shorthand,
      `npx @puppeteer/browsers install ${type}@${channel}`,
    );
  }

  return computeExecutablePath({
    browser: browserEnum,
    buildId,
    cacheDir,
  });
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

  for (const path of SYSTEM_PATHS) {
    if (await fileExists(path)) {
      return path;
    }
  }

  try {
    const { computeSystemExecutablePath, detectBrowserPlatform, Browser, ChromeReleaseChannel } =
      await import('@puppeteer/browsers');
    const platform = detectBrowserPlatform();
    if (platform) {
      return computeSystemExecutablePath({
        browser: Browser.CHROME,
        channel: ChromeReleaseChannel.STABLE,
        platform,
      });
    }
  } catch {
    // optional peer not available
  }

  return undefined;
}

/**
 * Resolve Chromium executable path from config, env, or system.
 * Priority: executablePath > browser cache > env > system paths
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
    return resolveFromBrowsersPackage(config);
  }

  const fallback = await resolveFromEnvOrSystem();
  if (fallback) {
    return fallback;
  }

  throw new BrowserNotFoundError();
}
