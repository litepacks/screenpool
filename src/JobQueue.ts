import type { QueuedJob, ResolvedScreenPoolConfig, WorkerState } from './types.js';
import { QueueOverflowError } from './errors.js';

/** FIFO job queue with overflow protection. */
export class JobQueue {
  private readonly queue: QueuedJob[] = [];

  constructor(private readonly maxQueueSize: number) {}

  /** Current queue length. */
  get length(): number {
    return this.queue.length;
  }

  /**
   * Enqueue a job. Throws QueueOverflowError when full.
   */
  enqueue<T>(job: QueuedJob<T>): { accepted: true; position: number } {
    if (this.queue.length >= this.maxQueueSize) {
      throw new QueueOverflowError(this.queue.length, this.maxQueueSize);
    }

    this.queue.push(job as QueuedJob);
    return { accepted: true, position: this.queue.length };
  }

  /** Dequeue next job or undefined. */
  dequeue(): QueuedJob | undefined {
    return this.queue.shift();
  }

  /** Peek at next job without removing. */
  peek(): QueuedJob | undefined {
    return this.queue[0];
  }

  /** Reject all pending jobs. */
  rejectAll(error: Error): void {
    while (this.queue.length > 0) {
      const job = this.queue.shift();
      job?.reject(error);
    }
  }
}
