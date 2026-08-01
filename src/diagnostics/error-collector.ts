import type {
  DiagnosticsOptions,
  PageErrorDiagnosticEntry,
} from './types.js';
import type { DiagnosticPage } from './page-adapter.js';
import type { Sanitizer } from './sanitizer.js';
import type { Timeline } from './timeline.js';

export class ErrorCollector {
  private entries: PageErrorDiagnosticEntry[] = [];
  private entryCount = 0;
  private maxEntries: number;
  private cleanupFn?: () => void;
  private isTruncated = false;

  constructor(
    private options: DiagnosticsOptions,
    private startTime: number,
    private sanitizer: Sanitizer,
    private timeline: Timeline,
  ) {
    this.maxEntries = options.maxPageErrors ?? 100;
  }

  attach(page: DiagnosticPage): void {
    if (this.options.pageErrors === false) return;

    this.cleanupFn = page.onPageError((err: Error) => {
      this.handlePageError(err);
    });
  }

  private handlePageError(err: Error): void {
    this.entryCount++;
    const elapsedMs = Date.now() - this.startTime;
    const id = `page_error_${this.entryCount}`;

    const name = err.name || 'Error';
    const message = this.sanitizer.sanitizeText(err.message || String(err));
    const stack = err.stack ? this.sanitizer.sanitizeText(err.stack) : undefined;

    const entry: PageErrorDiagnosticEntry = {
      id,
      timestamp: new Date().toISOString(),
      elapsedMs,
      name,
      message,
      stack,
    };

    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
      this.isTruncated = true;
    }
    this.entries.push(entry);

    this.timeline.add('page-error', {
      id,
      name,
      message,
    });
  }

  getEntries(): PageErrorDiagnosticEntry[] {
    return this.entries;
  }

  getTruncated(): boolean {
    return this.isTruncated;
  }

  dispose(): void {
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = undefined;
    }
  }
}
