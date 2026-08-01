import type {
  DiagnosticTimelineEntry,
  DiagnosticTimelineType,
  DiagnosticsOptions,
} from './types.js';
import type { Sanitizer } from './sanitizer.js';

export class Timeline {
  private entries: DiagnosticTimelineEntry[] = [];
  private entryCount = 0;
  private maxEntries: number;
  private isTruncated = false;

  constructor(
    private options: DiagnosticsOptions,
    private startTime: number,
    private sanitizer: Sanitizer,
  ) {
    this.maxEntries = options.maxTimelineEntries ?? 2000;
  }

  add(type: DiagnosticTimelineType, data?: Record<string, unknown>): DiagnosticTimelineEntry {
    this.entryCount++;
    const elapsedMs = Date.now() - this.startTime;
    const id = `timeline_${this.entryCount}`;

    const sanitizedData = data ? this.sanitizer.sanitizeValue(data) : undefined;

    const entry: DiagnosticTimelineEntry = {
      id,
      timestamp: new Date().toISOString(),
      elapsedMs,
      type,
      data: sanitizedData,
    };

    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
      this.isTruncated = true;
    }
    this.entries.push(entry);

    if (this.options.onEvent) {
      try {
        this.options.onEvent(entry);
      } catch {
        // Live event callback error must not interrupt execution
      }
    }

    return entry;
  }

  getEntries(): DiagnosticTimelineEntry[] {
    return this.entries;
  }

  getTruncated(): boolean {
    return this.isTruncated;
  }
}
