import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { RenderTimeoutError } from '../src/errors.js';

const chromiumPath = getChromiumPath();
const canRun = hasChromium();

describe.skipIf(!canRun)('timeout', () => {
  it('throws RenderTimeoutError for slow pages', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      jobTimeout: 500,
    });

    await pool.start();

    try {
      await expect(
        pool.screenshot({
          html: '<html><body>timeout test</body></html>',
          waitForTimeout: 5000,
        }),
      ).rejects.toThrow(RenderTimeoutError);
    } finally {
      await pool.stop();
    }
  }, 60_000);
});

describe('timeout (unit)', () => {
  it('RenderTimeoutError has jobId and timeoutMs', () => {
    const err = new RenderTimeoutError('job-1', 1500);
    expect(err.jobId).toBe('job-1');
    expect(err.timeoutMs).toBe(1500);
    expect(err.name).toBe('RenderTimeoutError');
  });
});
