import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function findInstalledChromeForTesting(): string | null {
  const cacheDirs = [
    join(homedir(), '.screenpool', 'browser', 'chrome'),
    join(homedir(), '.cache', 'puppeteer', 'chrome'),
  ];

  for (const baseDir of cacheDirs) {
    if (!existsSync(baseDir)) continue;
    try {
      const versions = readdirSync(baseDir).sort().reverse();
      for (const ver of versions) {
        const candidate1 = join(
          baseDir,
          ver,
          'chrome-mac-arm64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        );
        if (existsSync(candidate1)) return candidate1;

        const candidate2 = join(
          baseDir,
          ver,
          'chrome-mac-x64',
          'Google Chrome for Testing.app',
          'Contents',
          'MacOS',
          'Google Chrome for Testing',
        );
        if (existsSync(candidate2)) return candidate2;

        const candidate3 = join(baseDir, ver, 'chrome-linux64', 'chrome');
        if (existsSync(candidate3)) return candidate3;
      }
    } catch {}
  }
  return null;
}

const SYSTEM_PATHS = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  process.env.CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter(Boolean) as string[];

/** Resolve Chromium executable for integration tests. */
export function getChromiumPath(): string {
  const cft = findInstalledChromeForTesting();
  if (cft) return cft;

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
