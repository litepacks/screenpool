import { describe, it, expect } from 'vitest';
import { parseBrowserShorthand, getSearchCacheDirs } from '../src/utils/resolveBrowserExecutable.js';
import { InvalidRenderInputError } from '../src/errors.js';
import { join } from 'node:path';

describe('parseBrowserShorthand', () => {
  it('parses chrome@stable', () => {
    expect(parseBrowserShorthand('chrome@stable')).toEqual({
      type: 'chrome',
      channel: 'stable',
    });
  });

  it('parses chrome-headless-shell@stable', () => {
    expect(parseBrowserShorthand('chrome-headless-shell@stable')).toEqual({
      type: 'chrome-headless-shell',
      channel: 'stable',
    });
  });

  it('throws on invalid shorthand', () => {
    expect(() => parseBrowserShorthand('invalid')).toThrow(InvalidRenderInputError);
  });
});

describe('getSearchCacheDirs', () => {
  it('includes cwd for npx install default location', () => {
    const dirs = getSearchCacheDirs();
    expect(dirs).toContain(process.cwd());
  });

  it('puts explicit cacheDir first', () => {
    const dirs = getSearchCacheDirs('/custom/cache');
    expect(dirs[0]).toBe('/custom/cache');
  });
});

describe('resolveBrowserExecutable priority', () => {
  it('resolves chrome@stable from project cwd cache', async () => {
    const { resolveBrowserExecutable } = await import('../src/utils/resolveBrowserExecutable.js');
    const localChrome = join(
      process.cwd(),
      'chrome',
      'mac_arm-150.0.7871.24',
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );

    const { access } = await import('node:fs/promises');
    try {
      await access(localChrome);
    } catch {
      return; // skip if local install not present
    }

    const path = await resolveBrowserExecutable({ browser: 'chrome@stable' });
    expect(path).toContain('Google Chrome for Testing');
  });

  it('uses executablePath when provided', async () => {
    const { resolveBrowserExecutable } = await import('../src/utils/resolveBrowserExecutable.js');
    // Use node binary as stand-in for existence check on any system
    const nodePath = process.execPath;
    const path = await resolveBrowserExecutable({ executablePath: nodePath });
    expect(path).toBe(nodePath);
  });

  it('throws when neither executablePath nor browser nor fallback exists', async () => {
    const { resolveBrowserExecutable } = await import('../src/utils/resolveBrowserExecutable.js');
    const { BrowserNotFoundError } = await import('../src/errors.js');

    const original = { ...process.env };
    delete process.env.CHROME_PATH;
    delete process.env.PUPPETEER_EXECUTABLE_PATH;
    delete process.env.CHROMIUM_PATH;

    await expect(
      resolveBrowserExecutable({ executablePath: '/nonexistent/chromium-path-xyz' }),
    ).rejects.toThrow(BrowserNotFoundError);

    process.env = original;
  });
});
