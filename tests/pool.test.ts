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

  it('stats reflect initial state and minWorkers config', () => {
    const pool = new ScreenPool({ executablePath: process.execPath, poolSize: 4, minWorkers: 1 });
    const stats = pool.stats();
    expect(stats.started).toBe(false);
    expect(stats.poolSize).toBe(4);
    expect(stats.minWorkers).toBe(1);
    expect(stats.activeJobs).toBe(0);
    expect(stats.queuedJobs).toBe(0);
  });
});

describe('ScreenPool idleTimeout & lazy worker scaling', () => {
  it('triggers idle timeout when pool has no active jobs or sessions', async () => {
    const pool = new ScreenPool({
      executablePath: process.execPath,
      poolSize: 2,
      minWorkers: 1,
      idleTimeout: 50,
    });

    (pool as any).started = true;
    (pool as any).workerPool = {
      getActiveJobs: () => 0,
      close: async () => undefined,
      getInitializedWorkersCount: () => 1,
    };
    (pool as any).browserManager = {
      close: async () => undefined,
      getProvider: () => ({ name: 'puppeteer-core' }),
    };

    let idleTriggered = false;
    pool.on('idle:timeout', () => {
      idleTriggered = true;
    });

    // Start checking idle state
    (pool as any).checkIdleState();

    await new Promise((r) => setTimeout(r, 80));
    expect(idleTriggered).toBe(true);
    expect(pool.stats().started).toBe(false);
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
  function mockStartedPool(poolSize: number, maxQueueSize: number) {
    const pool = new ScreenPool({
      executablePath: process.execPath,
      poolSize,
      maxQueueSize,
    });

    let active = 0;
    let maxActive = 0;
    let dispatched = 0;

    (pool as unknown as { started: boolean }).started = true;
    (pool as unknown as {
      workerPool: {
        getActiveJobs: () => number;
        runJob: (job: {
          id: string;
          resolve: (v: unknown) => void;
        }) => Promise<void>;
      };
    }).workerPool = {
      getActiveJobs: () => active,
      runJob: async (job) => {
        active++;
        dispatched++;
        maxActive = Math.max(maxActive, active);
        await new Promise((r) => setTimeout(r, 30));
        active--;
        job.resolve({
          buffer: Buffer.from(''),
          contentType: 'image/png',
          durationMs: 1,
          jobId: job.id,
          type: 'screenshot',
        });
      },
    };
    (pool as unknown as { healthMonitor: { memoryIsBlocked: boolean } | null }).healthMonitor =
      null;

    return { pool, getMaxActive: () => maxActive, getDispatched: () => dispatched };
  }

  it('limits active jobs to poolSize', async () => {
    const { pool, getMaxActive } = mockStartedPool(2, 10);

    const jobs = [
      pool.screenshot({ url: 'https://a.com' }),
      pool.screenshot({ url: 'https://b.com' }),
      pool.screenshot({ url: 'https://c.com' }),
    ];

    await Promise.all(jobs);
    expect(getMaxActive()).toBeLessThanOrEqual(2);
  });

  it('dispatches up to poolSize jobs immediately on burst enqueue', async () => {
    const { pool, getDispatched, getMaxActive } = mockStartedPool(4, 20);

    const jobs = Array.from({ length: 10 }, () =>
      pool.screenshot({ url: 'https://example.com' }),
    );

    await new Promise((r) => setTimeout(r, 0));
    expect(getDispatched()).toBe(4);
    expect(getMaxActive()).toBe(4);

    await Promise.all(jobs);
    expect(getDispatched()).toBe(10);
    expect(getMaxActive()).toBe(4);
  });
});
