import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ScreenPool } from '../src/ScreenPool.js';
import { ScreenPoolNotStartedError, QueueOverflowError } from '../src/errors.js';

describe('ScreenPool', () => {
  it('throws when not started', async () => {
    const pool = new ScreenPool({ executablePath: process.execPath });
    await expect(
      pool.screenshot({ url: 'https://example.com' }),
    ).rejects.toThrow(ScreenPoolNotStartedError);
  });

  it('stats reflect initial state', () => {
    const pool = new ScreenPool({ executablePath: process.execPath, poolSize: 2 });
    const stats = pool.stats();
    expect(stats.started).toBe(false);
    expect(stats.poolSize).toBe(2);
    expect(stats.activeJobs).toBe(0);
    expect(stats.queuedJobs).toBe(0);
  });
});

describe('ScreenPool queue overflow', () => {
  it('rejects when queue is full', async () => {
    const pool = new ScreenPool({
      executablePath: process.execPath,
      poolSize: 1,
      maxQueueSize: 1,
    });

    // Mock start without browser
    (pool as unknown as { started: boolean }).started = true;
    (pool as unknown as { workerPool: { getActiveJobs: () => number; runJob: () => Promise<void> } }).workerPool = {
      getActiveJobs: () => 1,
      runJob: () => new Promise(() => undefined),
    };

    const p1 = pool.screenshot({ url: 'https://example.com' });
    await expect(pool.screenshot({ url: 'https://example.org' })).rejects.toThrow(
      QueueOverflowError,
    );

    void p1;
  });
});

describe('ScreenPool concurrency', () => {
  it('limits active jobs to poolSize', async () => {
    const pool = new ScreenPool({
      executablePath: process.execPath,
      poolSize: 2,
      maxQueueSize: 10,
    });

    let active = 0;
    let maxActive = 0;

    (pool as unknown as { started: boolean }).started = true;
    (pool as unknown as {
      workerPool: {
        getActiveJobs: () => number;
        runJob: (job: { resolve: (v: unknown) => void }) => Promise<void>;
      };
    }).workerPool = {
      getActiveJobs: () => active,
      runJob: async (job) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 50));
        active--;
        job.resolve({
          buffer: Buffer.from(''),
          contentType: 'image/png',
          durationMs: 1,
          jobId: 'x',
          type: 'screenshot',
        });
      },
    };

    (pool as unknown as { healthMonitor: { memoryIsBlocked: boolean } | null }).healthMonitor = null;

    const jobs = [
      pool.screenshot({ url: 'https://a.com' }),
      pool.screenshot({ url: 'https://b.com' }),
      pool.screenshot({ url: 'https://c.com' }),
    ];

    await Promise.all(jobs);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
