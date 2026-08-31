import { describe, it, expect } from 'vitest';
import { ScreenPool } from '../../src/ScreenPool.js';
import { buildLaunchArgs } from '../../src/utils/buildLaunchArgs.js';
import { resolveConfig } from '../../src/types.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';

const chromiumPath = getChromiumPath();

describe('Optimized Chromium Launch Flags', () => {
  it('buildLaunchArgs includes all performance optimization flags', () => {
    const config = resolveConfig({});
    const args = buildLaunchArgs(config);

    expect(args).toContain('--disable-background-timer-throttling');
    expect(args).toContain('--disable-backgrounding-occluded-windows');
    expect(args).toContain('--disable-renderer-backgrounding');
    expect(args).toContain('--disable-ipc-flooding-protection');
    expect(args).toContain(
      '--disable-features=Translate,BackForwardCache,AcceptCHFrame,MediaRouter,OptimizationHints,ProcessPerSiteUpToLimit',
    );
    expect(args).toContain('--disable-breakpad');
    expect(args).toContain('--disable-component-extensions-with-background-pages');
    expect(args).toContain('--disable-domain-reliability');
    expect(args).toContain('--run-all-compositor-stages-before-draw');
    expect(args).toContain('--font-render-hinting=none');
  });

  it('preserves performance flags in devtools mode while removing headless flags', () => {
    const config = resolveConfig({ devtools: true });
    const args = buildLaunchArgs(config);

    expect(args.some((a) => a.startsWith('--headless'))).toBe(false);
    expect(args).toContain('--disable-background-timer-throttling');
    expect(args).toContain('--disable-ipc-flooding-protection');
    expect(args).toContain('--enable-automation');
  });

  describe.skipIf(!hasChromium())('Browser Execution with Performance Flags', () => {
    it('successfully launches Chromium and renders with all flags enabled', async () => {
      const pool = new ScreenPool({
        executablePath: chromiumPath,
        poolSize: 1,
      });

      await pool.start();

      try {
        const result = await pool.screenshot({
          html: '<div style="font-family:sans-serif;padding:20px;"><h1>Compositor & Flag Test</h1></div>',
        });

        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
      } finally {
        await pool.stop();
      }
    });
  });
});
