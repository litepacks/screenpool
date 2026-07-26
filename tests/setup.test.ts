import { describe, it, expect } from 'vitest';
import { setupBrowser, getDefaultCacheDir } from '../src/index.js';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';

describe('setupBrowser', () => {
  it('returns default cache dir as ~/.screenpool/browser', () => {
    const dir = getDefaultCacheDir();
    expect(dir).toBe(join(homedir(), '.screenpool', 'browser'));
  });

  it('detects existing installed browser in cacheDir without downloading', async () => {
    const testCacheDir = join(process.cwd(), 'output', 'test-setup-cache');

    const { computeExecutablePath, detectBrowserPlatform, Browser } = await import('@puppeteer/browsers');
    const platform = detectBrowserPlatform()!;
    const dummyBuildId = '100.0.0.0';
    const dummyExecPath = computeExecutablePath({
      browser: Browser.CHROME,
      buildId: dummyBuildId,
      platform,
      cacheDir: testCacheDir,
    });

    const dummyDir = join(dummyExecPath, '..');
    await mkdir(dummyDir, { recursive: true });
    await writeFile(dummyExecPath, '#!/bin/sh\necho "dummy"');

    try {
      const result = await setupBrowser({
        browser: 'chrome@stable',
        cacheDir: testCacheDir,
      });

      expect(result.browser).toBe('chrome');
      expect(result.alreadyInstalled).toBe(true);
      expect(result.buildId).toBe(dummyBuildId);
      expect(result.executablePath).toBe(dummyExecPath);
    } finally {
      await rm(testCacheDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
