import { describe, it, expect, afterEach } from 'vitest';
import { ScreenPool } from '../../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Pool Isolation (Normal vs Stealth in same process)', () => {
  let normalPool: ScreenPool | null = null;
  let stealthPool: ScreenPool | null = null;

  afterEach(async () => {
    if (normalPool) {
      await normalPool.stop();
      normalPool = null;
    }
    if (stealthPool) {
      await stealthPool.stop();
      stealthPool = null;
    }
  });

  it('runs non-stealth and stealth pools concurrently without cross-contamination', async () => {
    normalPool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      stealth: false,
    });

    stealthPool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      stealth: true,
    });

    await Promise.all([
      normalPool.start(),
      stealthPool.start(),
    ]);

    const normalStats = normalPool.stats();
    const stealthStats = stealthPool.stats();

    expect(normalStats.browserProvider).toBe('puppeteer-core');
    expect(normalStats.stealth?.enabled).toBe(false);

    expect(stealthStats.browserProvider).toBe('puppeteer-extra');
    expect(stealthStats.stealth?.enabled).toBe(true);

    // Verify status() API
    const normalStatus = normalPool.status();
    const stealthStatus = stealthPool.status();

    expect(normalStatus.browserProvider).toBe('puppeteer-core');
    expect(normalStatus.stealth.enabled).toBe(false);

    expect(stealthStatus.browserProvider).toBe('puppeteer-extra');
    expect(stealthStatus.stealth.enabled).toBe(true);

    // Execute jobs concurrently across both pools
    const [normalRes, stealthRes] = await Promise.all([
      normalPool.screenshot({
        html: '<html><body><h1 id="title">Vanilla Pool</h1></body></html>',
        waitForSelector: '#title',
      }),
      stealthPool.screenshot({
        html: '<html><body><h1 id="title">Stealth Pool</h1></body></html>',
        waitForSelector: '#title',
      }),
    ]);

    expect(normalRes.buffer).toBeInstanceOf(Buffer);
    expect(stealthRes.buffer).toBeInstanceOf(Buffer);
    expect(normalRes.buffer.length).toBeGreaterThan(100);
    expect(stealthRes.buffer.length).toBeGreaterThan(100);
  });
});
