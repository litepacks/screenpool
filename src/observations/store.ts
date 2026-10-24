import type { Observation } from './types.js';

export class ObservationStore {
  private observations = new Map<string, Observation>();
  private readonly maxEntries: number;

  constructor(maxEntries = 20) {
    this.maxEntries = maxEntries;
  }

  set(observation: Observation): void {
    if (this.observations.size >= this.maxEntries) {
      // Evict oldest observation (FIFO / insertion order)
      const oldestKey = this.observations.keys().next().value;
      if (oldestKey) {
        this.observations.delete(oldestKey);
      }
    }
    this.observations.set(observation.id, observation);
  }

  get(id: string): Observation | undefined {
    return this.observations.get(id);
  }

  has(id: string): boolean {
    return this.observations.has(id);
  }

  delete(id: string): void {
    this.observations.delete(id);
  }

  clear(): void {
    this.observations.clear();
  }
}
