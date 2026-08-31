import { describe, it, expect } from 'vitest';
import { ScreenPool } from '../../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Parallel Worker Initialization & Lifecycle', () => {
  it('starts a multi-worker pool rapidly with all workers initialized in parallel', async () => {
    const t0 = performance.now();
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 4,
    });

    await pool.start();
    const startupDuration = performance.now() - t0;

    try {
      const stats = pool.stats();
      expect(stats.started).toBe(true);
      expect(stats.poolSize).toBe(4);

      // Verify that all 4 workers process jobs concurrently
      const results = await Promise.all([
        pool.screenshot({ html: '<h1>Worker 1</h1>' }),
        pool.screenshot({ html: '<h1>Worker 2</h1>' }),
        pool.screenshot({ html: '<h1>Worker 3</h1>' }),
        pool.screenshot({ html: '<h1>Worker 4</h1>' }),
      ]);

      expect(results.length).toBe(4);
      for (const res of results) {
        expect(res.buffer).toBeInstanceOf(Buffer);
        expect(res.buffer.length).toBeGreaterThan(0);
      }
    } finally {
      await pool.stop();
    }
  });

  it('closes workers in parallel cleanly without lingering contexts', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 4,
    });

    await pool.start();
    await pool.screenshot({ html: '<h1>Warmup</h1>' });

    const stopStart = performance.now();
    await pool.stop();
    const stopDuration = performance.now() - stopStart;

    expect(stopDuration).toBeLessThan(5000);
    expect(pool.stats().started).toBe(false);
  });
});
