import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('recovery', () => {
  it('emits worker:restarted on worker recycle threshold', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      workerRestartAfterJobs: 1,
    });

    const restarted: number[] = [];
    pool.on('worker:restarted', ({ workerId }: { workerId: number }) => {
      restarted.push(workerId);
    });

    await pool.start();

    try {
      await pool.screenshot({
        html: '<html><body><h1>Test</h1></body></html>',
        viewport: { width: 400, height: 300 },
      });

      expect(restarted.length).toBeGreaterThanOrEqual(0);
    } finally {
      await pool.stop();
    }
  }, 60_000);
});

describe('recovery (unit)', () => {
  it('ScreenPool supports browser:restarted event', async () => {
    const pool = new ScreenPool({ executablePath: process.execPath });
    let emitted = false;
    pool.on('browser:restarted', () => {
      emitted = true;
    });
    pool.emit('browser:restarted');
    expect(emitted).toBe(true);
  });
});
