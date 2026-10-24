import type { Browser } from 'puppeteer-core';
import type { QueuedJob, ResolvedScreenPoolConfig } from './types.js';
import { ScreenWorker } from './ScreenWorker.js';

/** Pool of ScreenWorker instances with acquire/release semantics and lazy on-demand scaling. */
export class WorkerPool {
  private workers: ScreenWorker[] = [];
  private activeJobs = 0;
  private readonly waitQueue: Array<(worker: ScreenWorker) => void> = [];

  constructor(
    private browser: Browser,
    private readonly config: ResolvedScreenPoolConfig,
    private readonly onWorkerRestarted?: (workerId: number) => void,
  ) {}

  /** Initialize workers lazily: instantiate poolSize workers, but only pre-warm minWorkers (default: poolSize). */
  async init(): Promise<void> {
    const minWorkers = Math.min(
      this.config.minWorkers ?? this.config.poolSize,
      this.config.poolSize,
    );
    const workers = Array.from(
      { length: this.config.poolSize },
      (_, i) => new ScreenWorker(i, this.browser, this.config),
    );
    if (minWorkers > 0) {
      await Promise.all(workers.slice(0, minWorkers).map((w) => w.init()));
    }
    this.workers = workers;
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

  private async waitForIdleWorker(): Promise<ScreenWorker> {
    // 1. Fast path: Find an already initialized idle worker
    const initializedIdle = this.workers.find((w) => w.isInitialized() && w.tryAcquire());
    if (initializedIdle) {
      return initializedIdle;
    }

    // 2. On-demand initialization: If an uninitialized worker is available, acquire and initialize it
    const uninitialized = this.workers.find((w) => !w.isInitialized() && w.tryAcquire());
    if (uninitialized) {
      try {
        await uninitialized.init();
        return uninitialized;
      } catch (err) {
        uninitialized.markIdle();
        throw err;
      }
    }

    // 3. All poolSize workers are busy, wait in queue
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
    if (worker.isInitialized()) {
      await worker.recycle();
      this.onWorkerRestarted?.(id);
    }
  }

  /** Recreate all workers after browser restart. */
  async restartAll(browser: Browser): Promise<void> {
    await this.close();
    this.browser = browser;
    await this.init();
  }

  /** Update browser reference for all workers in parallel. */
  async setBrowser(browser: Browser): Promise<void> {
    this.browser = browser;
    await Promise.all(this.workers.map((worker) => worker.setBrowser(browser)));
  }

  getActiveJobs(): number {
    return this.activeJobs;
  }

  getPoolSize(): number {
    return this.workers.length;
  }

  getInitializedWorkersCount(): number {
    return this.workers.filter((w) => w.isInitialized()).length;
  }

  /** Close all workers in parallel. */
  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.close()));
    this.workers = [];
    this.activeJobs = 0;
    this.waitQueue.length = 0;
  }
}
