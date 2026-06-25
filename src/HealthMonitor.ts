import type { BrowserManager } from './BrowserManager.js';
import type { WorkerPool } from './WorkerPool.js';
import type { ResolvedScreenPoolConfig } from './types.js';

export interface HealthMonitorCallbacks {
  onBrowserCrashed: () => Promise<void>;
  onBrowserRestarted: () => void;
  onWorkerRestarted: (workerId: number) => void;
  onMemoryPressure: (usageMb: number, limitMb: number) => void;
  onMemoryLimitExceeded: (usageMb: number, limitMb: number) => void;
  getActiveJobs: () => number;
  isStopping: () => boolean;
}

export interface HealthMonitorStats {
  browserRestarts: number;
  workerRestarts: number;
  memoryUsageMb: number;
  memoryBlocked: boolean;
  totalJobsCompleted: number;
}

/** Monitors browser health, memory limits, and crash recovery. */
export class HealthMonitor {
  private memoryTimer: ReturnType<typeof setInterval> | null = null;
  private memoryBlocked = false;
  private memoryUsageMb = 0;
  private browserRestarts = 0;
  private workerRestarts = 0;
  private totalJobsCompleted = 0;
  private recovering = false;

  constructor(
    private readonly browserManager: BrowserManager,
    private readonly workerPool: WorkerPool,
    private readonly config: ResolvedScreenPoolConfig,
    private readonly callbacks: HealthMonitorCallbacks,
  ) {}

  /** Start health monitoring. */
  start(): void {
    this.browserManager.onDisconnect(() => {
      void this.handleBrowserCrash();
    });

    if (this.config.memory.limitMb) {
      this.memoryTimer = setInterval(() => {
        void this.checkMemory();
      }, this.config.memory.checkIntervalMs);
    }
  }

  /** Stop monitoring timers. */
  stop(): void {
    if (this.memoryTimer) {
      clearInterval(this.memoryTimer);
      this.memoryTimer = null;
    }
  }

  get memoryIsBlocked(): boolean {
    return this.memoryBlocked;
  }

  getStats(): HealthMonitorStats {
    return {
      browserRestarts: this.browserRestarts,
      workerRestarts: this.workerRestarts,
      memoryUsageMb: this.memoryUsageMb,
      memoryBlocked: this.memoryBlocked,
      totalJobsCompleted: this.totalJobsCompleted,
    };
  }

  incrementWorkerRestarts(): void {
    this.workerRestarts++;
  }

  incrementJobsCompleted(): void {
    this.totalJobsCompleted++;
  }

  /** Handle browser disconnect/crash with backoff restart. */
  private async handleBrowserCrash(): Promise<void> {
    if (this.recovering || this.callbacks.isStopping()) return;
    this.recovering = true;

    const delays = [100, 200, 400, 800, 2000];
    for (const delay of delays) {
      await sleep(delay);
      try {
        await this.callbacks.onBrowserCrashed();
        this.browserRestarts++;
        this.callbacks.onBrowserRestarted();
        this.memoryBlocked = false;
        break;
      } catch {
        // retry
      }
    }

    this.recovering = false;
  }

  /** Poll browser memory and enforce limits. */
  private async checkMemory(): Promise<void> {
    const limitMb = this.config.memory.limitMb;
    if (!limitMb) return;

    this.memoryUsageMb = await this.browserManager.getProcessMemoryMb();
    const threshold = limitMb * this.config.memory.pressureThreshold;

    if (this.memoryUsageMb >= threshold && this.memoryUsageMb < limitMb) {
      this.callbacks.onMemoryPressure(this.memoryUsageMb, limitMb);
    }

    if (this.memoryUsageMb >= limitMb && !this.memoryBlocked) {
      this.memoryBlocked = true;
      this.callbacks.onMemoryLimitExceeded(this.memoryUsageMb, limitMb);

      if (this.config.memory.restartOnLimit) {
        await this.waitForActiveJobs();
        try {
          await this.browserManager.restart();
          await this.workerPool.setBrowser(this.browserManager.getBrowser());
          this.browserRestarts++;
          this.callbacks.onBrowserRestarted();
          this.memoryUsageMb = await this.browserManager.getProcessMemoryMb();
          if (this.memoryUsageMb < limitMb) {
            this.memoryBlocked = false;
          }
        } catch {
          // stay blocked
        }
      }
    } else if (this.memoryUsageMb < threshold) {
      this.memoryBlocked = false;
    }
  }

  private async waitForActiveJobs(): Promise<void> {
    const maxWait = this.config.jobTimeout + 5000;
    const start = Date.now();
    while (this.callbacks.getActiveJobs() > 0 && Date.now() - start < maxWait) {
      await sleep(100);
    }
  }

  /** Check if browser should restart after N jobs. */
  shouldRestartBrowserAfterJobs(): boolean {
    const limit = this.config.browserRestartAfterJobs;
    return limit > 0 && this.totalJobsCompleted > 0 && this.totalJobsCompleted % limit === 0;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
