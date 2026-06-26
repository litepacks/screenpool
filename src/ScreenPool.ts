import { EventEmitter } from 'node:events';
import type {
  JobType,
  PdfOptions,
  PoolStats,
  QueuedJob,
  RenderResult,
  ResolvedScreenPoolConfig,
  ScreenPoolConfig,
  ScreenshotOptions,
} from './types.js';
import { resolveConfig } from './types.js';
import {
  InvalidRenderInputError,
  MemoryLimitExceededError,
  ScreenPoolNotStartedError,
  ScreenPoolStoppingError,
} from './errors.js';
import { BrowserManager } from './BrowserManager.js';
import { WorkerPool } from './WorkerPool.js';
import { JobQueue } from './JobQueue.js';
import { HealthMonitor } from './HealthMonitor.js';
import {
  validatePdfOptions,
  validateScreenshotOptions,
} from './security/SecurityGuard.js';
import { createJobId } from './utils/uuid.js';

/**
 * In-process Chromium rendering pool with queued jobs and fixed concurrency.
 */
export class ScreenPool extends EventEmitter {
  private readonly config: ResolvedScreenPoolConfig;
  private browserManager: BrowserManager;
  private workerPool: WorkerPool | null = null;
  private jobQueue: JobQueue;
  private healthMonitor: HealthMonitor | null = null;

  private started = false;
  private stopping = false;
  private startTime = 0;
  private completedJobs = 0;
  private failedJobs = 0;

  constructor(config: ScreenPoolConfig) {
    super();
    this.config = resolveConfig(config);
    this.browserManager = new BrowserManager(this.config);
    this.jobQueue = new JobQueue(this.config.maxQueueSize);
  }

  /** Start the pool — launch browser and workers. */
  async start(): Promise<void> {
    if (this.started) return;

    await this.browserManager.launch();
    this.workerPool = new WorkerPool(
      this.browserManager.getBrowser(),
      this.config,
      (workerId) => {
        this.healthMonitor?.incrementWorkerRestarts();
        this.emit('worker:restarted', { workerId });
      },
    );
    await this.workerPool.init();

    this.healthMonitor = new HealthMonitor(
      this.browserManager,
      this.workerPool,
      this.config,
      {
        onBrowserCrashed: async () => {
          this.emit('browser:crashed');
          await this.browserManager.restart();
          await this.workerPool!.setBrowser(this.browserManager.getBrowser());
        },
        onBrowserRestarted: () => {
          this.emit('browser:restarted');
        },
        onWorkerRestarted: (workerId) => {
          this.emit('worker:restarted', { workerId });
        },
        onMemoryPressure: (usageMb, limitMb) => {
          this.emit('memory:pressure', { usageMb, limitMb });
        },
        onMemoryLimitExceeded: (usageMb, limitMb) => {
          this.emit('memory:limitExceeded', { usageMb, limitMb });
        },
        getActiveJobs: () => this.workerPool?.getActiveJobs() ?? 0,
        isStopping: () => this.stopping,
      },
    );

    this.healthMonitor.start();
    this.started = true;
    this.startTime = Date.now();
    this.emit('started');
    this.schedulePump();
  }

  /** Graceful shutdown — alias for stop(). */
  async close(): Promise<void> {
    return this.stop();
  }

  /** Graceful shutdown. */
  async stop(): Promise<void> {
    if (!this.started && !this.stopping) return;

    this.stopping = true;
    this.jobQueue.rejectAll(new ScreenPoolStoppingError());

    await this.waitForActiveJobs();

    this.healthMonitor?.stop();
    await this.workerPool?.close();
    await this.browserManager.close();

    this.started = false;
    this.stopping = false;
    this.emit('stopped');
  }

  /** Capture a screenshot. */
  screenshot(options: ScreenshotOptions): Promise<RenderResult> {
    validateScreenshotOptions(options, this.config);
    return this.enqueueJob('screenshot', options);
  }

  /** Render a PDF. */
  pdf(options: PdfOptions): Promise<RenderResult> {
    validatePdfOptions(options, this.config);
    return this.enqueueJob('pdf', options);
  }

  /** Render HTML to image. */
  htmlToImage(options: ScreenshotOptions): Promise<RenderResult> {
    if (!options.html) {
      throw new InvalidRenderInputError('html is required for htmlToImage.');
    }
    validateScreenshotOptions(options, this.config);
    return this.enqueueJob('htmlToImage', options);
  }

  /** Render HTML to PDF. */
  htmlToPdf(options: PdfOptions): Promise<RenderResult> {
    if (!options.html) {
      throw new InvalidRenderInputError('html is required for htmlToPdf.');
    }
    validatePdfOptions(options, this.config);
    return this.enqueueJob('htmlToPdf', options);
  }

  /** Pool statistics snapshot. */
  stats(): PoolStats {
    const health = this.healthMonitor?.getStats();
    return {
      started: this.started,
      poolSize: this.config.poolSize,
      activeJobs: this.workerPool?.getActiveJobs() ?? 0,
      queuedJobs: this.jobQueue.length,
      completedJobs: this.completedJobs,
      failedJobs: this.failedJobs,
      browserRestarts: health?.browserRestarts ?? 0,
      workerRestarts: health?.workerRestarts ?? 0,
      uptimeMs: this.started ? Date.now() - this.startTime : 0,
      memoryUsageMb: health?.memoryUsageMb ?? 0,
      memoryLimitMb: this.config.memory.limitMb,
      memoryBlocked: health?.memoryBlocked ?? false,
    };
  }

  /** Resolved config (read-only). */
  get resolvedConfig(): ResolvedScreenPoolConfig {
    return this.config;
  }

  /** Current browser process RSS in MB (0 if not started). */
  async getBrowserMemoryMb(): Promise<number> {
    if (!this.started) return 0;
    return this.browserManager.getProcessMemoryMb();
  }

  private enqueueJob<T>(type: JobType, options: T): Promise<RenderResult> {
    const jobId = createJobId();

    return new Promise<RenderResult>((resolve, reject) => {
      try {
        this.assertCanAcceptJob();
      } catch (error) {
        reject(error);
        return;
      }

      const job: QueuedJob<T> = {
        id: jobId,
        type,
        options,
        enqueuedAt: Date.now(),
        resolve: (result) => {
          this.completedJobs++;
          this.healthMonitor?.incrementJobsCompleted();
          this.emit('job:completed', { jobId, type });
          resolve(result);
        },
        reject: (error) => {
          this.failedJobs++;
          this.emit('job:failed', { jobId, type, error });
          reject(error);
        },
      };

      try {
        const { position } = this.jobQueue.enqueue(job);
        this.emit('job:queued', { jobId, type, position });
        this.schedulePump();
      } catch (error) {
        this.emit('queue:overflow', { queuedJobs: this.jobQueue.length });
        reject(error);
      }
    });
  }

  private assertCanAcceptJob(): void {
    if (!this.started) {
      throw new ScreenPoolNotStartedError();
    }
    if (this.stopping) {
      throw new ScreenPoolStoppingError();
    }
    if (this.healthMonitor?.memoryIsBlocked && this.config.memory.limitMb) {
      const stats = this.healthMonitor.getStats();
      throw new MemoryLimitExceededError(stats.memoryUsageMb, this.config.memory.limitMb);
    }
  }

  private pumpScheduled = false;

  /** Coalesce pump requests so concurrent enqueues fill all idle workers. */
  private schedulePump(): void {
    if (this.pumpScheduled) return;
    this.pumpScheduled = true;
    queueMicrotask(() => {
      this.pumpScheduled = false;
      this.pumpQueue();
    });
  }

  private pumpQueue(): void {
    if (!this.workerPool || !this.started || this.stopping) return;

    while (
      this.jobQueue.length > 0 &&
      this.workerPool.getActiveJobs() < this.config.poolSize
    ) {
      const job = this.jobQueue.dequeue();
      if (!job) break;

      this.emit('job:started', { jobId: job.id, type: job.type });

      void this.workerPool.runJob(job).finally(() => {
        this.schedulePump();
      });
    }
  }

  private async waitForActiveJobs(): Promise<void> {
    const deadline = Date.now() + this.config.jobTimeout + 5000;
    while ((this.workerPool?.getActiveJobs() ?? 0) > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
}
