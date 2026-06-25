import { describe, it, expect, vi } from 'vitest';
import { Hono } from 'hono';
import { createScreenPoolApp } from '../src/http/createScreenPoolApp.js';
import { errorToStatus } from '../src/http/errorHandler.js';
import {
  QueueOverflowError,
  SecurityBlockedUrlError,
  RenderTimeoutError,
  ScreenPoolNotStartedError,
} from '../src/errors.js';
import type { PoolStats, RenderResult } from '../src/types.js';

function mockPool(overrides: Partial<{
  stats: PoolStats;
  screenshot: () => Promise<RenderResult>;
}> = {}) {
  const defaultStats: PoolStats = {
    started: true,
    poolSize: 4,
    activeJobs: 0,
    queuedJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    browserRestarts: 0,
    workerRestarts: 0,
    uptimeMs: 1000,
    memoryUsageMb: 100,
    memoryLimitMb: 512,
    memoryBlocked: false,
  };

  return {
    stats: vi.fn(() => overrides.stats ?? defaultStats),
    screenshot: overrides.screenshot ?? vi.fn(),
    pdf: vi.fn(),
    htmlToImage: vi.fn(),
    htmlToPdf: vi.fn(),
  } as unknown as import('../src/ScreenPool.js').ScreenPool;
}

describe('HTTP adapter', () => {
  it('GET /health returns ok', async () => {
    const pool = mockPool();
    const app = createScreenPoolApp(pool);
    const res = await app.request('http://localhost/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, started: true });
  });

  it('GET /stats returns pool stats', async () => {
    const pool = mockPool();
    const app = createScreenPoolApp(pool);
    const res = await app.request('http://localhost/stats');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.poolSize).toBe(4);
  });

  it('maps errors to HTTP status codes', () => {
    expect(errorToStatus(new SecurityBlockedUrlError('http://localhost'))).toBe(400);
    expect(errorToStatus(new QueueOverflowError(10, 10))).toBe(429);
    expect(errorToStatus(new ScreenPoolNotStartedError())).toBe(503);
    expect(errorToStatus(new RenderTimeoutError('id', 1000))).toBe(504);
  });
});
