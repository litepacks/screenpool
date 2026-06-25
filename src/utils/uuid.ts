import { randomUUID } from 'node:crypto';

/** Generate a unique job ID. */
export function createJobId(): string {
  return randomUUID();
}
