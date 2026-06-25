import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { ScreenPoolStoppingError } from '../src/errors.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('shutdown', () => {
  it('rejects queued jobs on stop', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      maxQueueSize: 10,
      jobTimeout: 30_000,
    });

    await pool.start();

    const slow = pool.screenshot({
      url: 'https://example.com',
      waitForTimeout: 3000,
    });

    // Fill the single worker
    await new Promise((r) => setTimeout(r, 100));

    const queued = pool.screenshot({ url: 'https://example.org' });

    const stopPromise = pool.stop();

    await expect(queued).rejects.toThrow(ScreenPoolStoppingError);
    await slow;
    await stopPromise;

    expect(pool.stats().started).toBe(false);
  });
});
