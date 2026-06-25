import { describe, it, expect } from 'vitest';
import { JobQueue } from '../src/JobQueue.js';
import { QueueOverflowError } from '../src/errors.js';
import type { QueuedJob } from '../src/types.js';

function mockJob(id: string): QueuedJob {
  return {
    id,
    type: 'screenshot',
    options: {},
    enqueuedAt: Date.now(),
    resolve: () => undefined,
    reject: () => undefined,
  };
}

describe('JobQueue', () => {
  it('enqueues jobs in FIFO order', () => {
    const queue = new JobQueue(3);
    queue.enqueue(mockJob('1'));
    queue.enqueue(mockJob('2'));
    expect(queue.dequeue()?.id).toBe('1');
    expect(queue.dequeue()?.id).toBe('2');
  });

  it('throws QueueOverflowError when full', () => {
    const queue = new JobQueue(2);
    queue.enqueue(mockJob('1'));
    queue.enqueue(mockJob('2'));
    expect(() => queue.enqueue(mockJob('3'))).toThrow(QueueOverflowError);
  });

  it('rejects all pending jobs', () => {
    const queue = new JobQueue(5);
    const error = new Error('shutdown');
    let rejected = 0;
    const job = mockJob('1');
    job.reject = () => {
      rejected++;
    };
    queue.enqueue(job);
    queue.rejectAll(error);
    expect(rejected).toBe(1);
    expect(queue.length).toBe(0);
  });
});
