import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SYSTEM_PATHS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean) as string[];

/** Resolve Chromium executable for integration tests. */
export function getChromiumPath(): string {
  for (const path of SYSTEM_PATHS) {
    if (existsSync(path)) {
      return path;
    }
  }

  try {
    const { computeSystemExecutablePath, detectBrowserPlatform, Browser, ChromeReleaseChannel } =
      require('@puppeteer/browsers') as typeof import('@puppeteer/browsers');
    const platform = detectBrowserPlatform();
    if (platform) {
      return computeSystemExecutablePath({
        browser: Browser.CHROME,
        channel: ChromeReleaseChannel.STABLE,
        platform,
      });
    }
  } catch {
    // ignore
  }

  return '';
}

/** Whether Chromium is available for integration tests. */
export function hasChromium(): boolean {
  const path = getChromiumPath();
  return Boolean(path && existsSync(path));
}
