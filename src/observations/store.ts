import type { Observation } from './types.js';

export class ObservationStore {
  private observations = new Map<string, Observation>();

  set(observation: Observation): void {
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
