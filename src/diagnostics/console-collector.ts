import type {
  ConsoleDiagnosticEntry,
  ConsoleLevel,
  DiagnosticsOptions,
} from './types.js';
import type { DiagnosticPage, ConsoleMessageInfo } from './page-adapter.js';
import type { SafeSerializer } from './serializer.js';
import type { Sanitizer } from './sanitizer.js';
import type { Timeline } from './timeline.js';

export class ConsoleCollector {
  private entries: ConsoleDiagnosticEntry[] = [];
  private entryCount = 0;
  private allowedLevels: Set<ConsoleLevel> | null = null;
  private maxEntries: number;
  private cleanupFn?: () => void;
  private isTruncated = false;

  constructor(
    private options: DiagnosticsOptions,
    private startTime: number,
    private serializer: SafeSerializer,
    private sanitizer: Sanitizer,
    private timeline: Timeline,
  ) {
    this.maxEntries = options.maxConsoleEntries ?? 500;

    if (Array.isArray(options.console)) {
      this.allowedLevels = new Set(options.console);
    } else if (options.console === true) {
      this.allowedLevels = null; // null means allow all
    } else {
      this.allowedLevels = new Set(['warn', 'error']);
    }
  }

  attach(page: DiagnosticPage): void {
    if (this.options.console === false) return;

    this.cleanupFn = page.onConsole((msg: ConsoleMessageInfo) => {
      this.handleConsoleMessage(msg);
    });
  }

  private handleConsoleMessage(msg: ConsoleMessageInfo): void {
    const rawType = msg.type.toLowerCase();
    const level: ConsoleLevel =
      rawType === 'warning'
        ? 'warn'
        : ['log', 'debug', 'info', 'warn', 'error'].includes(rawType)
        ? (rawType as ConsoleLevel)
        : 'log';

    if (this.allowedLevels && !this.allowedLevels.has(level)) {
      return;
    }

    this.entryCount++;
    const elapsedMs = Date.now() - this.startTime;
    const id = `console_${this.entryCount}`;

    const text = this.sanitizer.sanitizeText(msg.text);

    let location: ConsoleDiagnosticEntry['location'];
    if (msg.location?.url) {
      location = {
        url: this.sanitizer.sanitizeUrl(msg.location.url),
        line: msg.location.lineNumber,
        column: msg.location.columnNumber,
      };
    }

    // Process args if present
    let args: ConsoleDiagnosticEntry['args'];
    if (msg.args && msg.args.length > 0) {
      args = msg.args.map((arg) => this.serializer.serialize(arg));
    }

    const entry: ConsoleDiagnosticEntry = {
      id,
      timestamp: new Date().toISOString(),
      elapsedMs,
      level,
      text,
      location,
      args,
    };

    if (this.entries.length >= this.maxEntries) {
      this.entries.shift();
      this.isTruncated = true;
    }
    this.entries.push(entry);

    this.timeline.add('console', {
      id,
      level,
      text,
    });
  }

  getEntries(): ConsoleDiagnosticEntry[] {
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
