import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';

const chromiumPath = getChromiumPath();
const POOL_SIZE = 4;

describe.skipIf(!hasChromium())('page lifecycle / memory', () => {
  it('keeps exactly poolSize tabs open after many jobs', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: POOL_SIZE,
      workerRestartAfterJobs: 0,
    });

    await pool.start();

    try {
      let stats = await pool.getPageStats();
      expect(stats.workerPages).toBe(POOL_SIZE);
      expect(stats.defaultContextPages).toBe(0);

      await Promise.all(
        Array.from({ length: 12 }, (_, i) =>
          pool.screenshot({
            html: `<html><body><h1>Job ${i}</h1>${'<p>x</p>'.repeat(20)}</body></html>`,
            viewport: { width: 800, height: 600 },
            fullPage: true,
          }),
        ),
      );

      stats = await pool.getPageStats();
      expect(stats.workerPages).toBe(POOL_SIZE);
      expect(stats.defaultContextPages).toBe(0);
      expect(stats.workerPages).toBe(stats.expectedPages);
    } finally {
      await pool.stop();
    }
  });

  it('closes worker tabs on stop', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 2,
    });

    await pool.start();
    await pool.screenshot({
      html: '<html><body>one</body></html>',
      viewport: { width: 400, height: 300 },
    });

    const beforeStop = await pool.getPageStats();
    expect(beforeStop.workerPages).toBe(2);

    await pool.stop();
    expect(pool.stats().started).toBe(false);
  });
});
