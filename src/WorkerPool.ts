import type { Browser } from 'puppeteer-core';
import type { QueuedJob, ResolvedScreenPoolConfig } from './types.js';
import { ScreenWorker } from './ScreenWorker.js';

/** Pool of ScreenWorker instances with acquire/release semantics. */
export class WorkerPool {
  private workers: ScreenWorker[] = [];
  private activeJobs = 0;
  private readonly waitQueue: Array<(worker: ScreenWorker) => void> = [];

  constructor(
    private browser: Browser,
    private readonly config: ResolvedScreenPoolConfig,
    private readonly onWorkerRestarted?: (workerId: number) => void,
  ) {}

  /** Initialize all workers. */
  async init(): Promise<void> {
    this.workers = [];
    for (let i = 0; i < this.config.poolSize; i++) {
      const worker = new ScreenWorker(i, this.browser, this.config);
      await worker.init();
      this.workers.push(worker);
    }
  }

  /** Run a job on an acquired worker (helper). */
  async runJob(job: QueuedJob): Promise<void> {
    this.activeJobs++;
    const worker = await this.waitForIdleWorker();
    try {
      await worker.run(job);
    } finally {
      this.activeJobs = Math.max(0, this.activeJobs - 1);
      worker.markIdle();
      const waiter = this.waitQueue.shift();
      if (waiter) {
        waiter(worker);
      }
    }
  }

  private waitForIdleWorker(): Promise<ScreenWorker> {
    const idle = this.workers.find((w) => w.tryAcquire());
    if (idle) {
      return Promise.resolve(idle);
    }

    return new Promise<ScreenWorker>((resolve) => {
      this.waitQueue.push((worker) => {
        if (!worker.tryAcquire()) {
          void this.waitForIdleWorker().then(resolve);
          return;
        }
        resolve(worker);
      });
    });
  }

  /** Restart a single worker. */
  async restartWorker(id: number): Promise<void> {
    const worker = this.workers[id];
    if (!worker) return;
    await worker.recycle();
    this.onWorkerRestarted?.(id);
  }

  /** Recreate all workers after browser restart. */
  async restartAll(browser: Browser): Promise<void> {
    await this.close();
    this.browser = browser;
    await this.init();
  }

  /** Update browser reference for all workers. */
  async setBrowser(browser: Browser): Promise<void> {
    this.browser = browser;
    for (const worker of this.workers) {
      await worker.setBrowser(browser);
    }
  }

  getActiveJobs(): number {
    return this.activeJobs;
  }

  getPoolSize(): number {
    return this.workers.length;
  }

  /** Close all workers. */
  async close(): Promise<void> {
    for (const worker of this.workers) {
      await worker.close();
    }
    this.workers = [];
    this.activeJobs = 0;
    this.waitQueue.length = 0;
  }
}
