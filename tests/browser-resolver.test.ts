import { describe, it, expect } from 'vitest';
import { parseBrowserShorthand } from '../src/utils/resolveBrowserExecutable.js';
import { InvalidRenderInputError } from '../src/errors.js';

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

describe('resolveBrowserExecutable priority', () => {
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
