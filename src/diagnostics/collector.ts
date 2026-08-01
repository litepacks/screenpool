import type { Page } from 'puppeteer-core';
import type {
  DiagnosticMarker,
  DiagnosticsOptions,
  DiagnosticsResult,
  FinalizeContext,
} from './types.js';
import { DiagnosticPage, PuppeteerDiagnosticPageAdapter } from './page-adapter.js';
import { Sanitizer } from './sanitizer.js';
import { SafeSerializer } from './serializer.js';
import { Timeline } from './timeline.js';
import { ConsoleCollector } from './console-collector.js';
import { ErrorCollector } from './error-collector.js';
import { NetworkCollector } from './network-collector.js';
import { capturePageState } from './page-state.js';
import { capturePerformance } from './performance.js';
import { buildDiagnosticsSummary } from './summary.js';
import { cleanExpiredArtifacts, writeDiagnosticArtifacts } from './artifacts.js';
import { createJobId } from '../utils/uuid.js';

export interface DiagnosticsCollector {
  attach(page: Page | DiagnosticPage): Promise<void> | void;
  mark(event: DiagnosticMarker): void;
  finalize(context: FinalizeContext): Promise<DiagnosticsResult>;
  dispose(): Promise<void> | void;
}

export class DiagnosticsCollectorImpl implements DiagnosticsCollector {
  readonly runId: string;
  readonly startTime: number;

  private pageAdapter?: DiagnosticPage;
  private sanitizer: Sanitizer;
  private serializer: SafeSerializer;
  private timeline: Timeline;
  private consoleCollector: ConsoleCollector;
  private errorCollector: ErrorCollector;
  private networkCollector: NetworkCollector;

  private isAttached = false;
  private isDisposed = false;

  constructor(
    private options: DiagnosticsOptions,
    runId?: string,
  ) {
    this.runId = runId ?? `run_${createJobId()}`;
    this.startTime = Date.now();

    this.sanitizer = new Sanitizer(options.redact);
    this.serializer = new SafeSerializer({
      maxDepth: options.maxArgumentDepth,
      maxLength: options.maxArgumentLength,
      sanitizer: this.sanitizer,
    });

    this.timeline = new Timeline(options, this.startTime, this.sanitizer);
    this.consoleCollector = new ConsoleCollector(
      options,
      this.startTime,
      this.serializer,
      this.sanitizer,
      this.timeline,
    );
    this.errorCollector = new ErrorCollector(
      options,
      this.startTime,
      this.sanitizer,
      this.timeline,
    );
    this.networkCollector = new NetworkCollector(
      options,
      this.startTime,
      this.sanitizer,
      this.timeline,
    );
  }

  attach(page: Page | DiagnosticPage): void {
    if (this.isAttached || this.isDisposed) return;

    if ('isClosed' in page && typeof page.isClosed === 'function' && 'onConsole' in page) {
      this.pageAdapter = page as DiagnosticPage;
    } else {
      this.pageAdapter = new PuppeteerDiagnosticPageAdapter(page as Page);
    }

    this.isAttached = true;
    this.timeline.add('run.started', { runId: this.runId });

    try {
      this.consoleCollector.attach(this.pageAdapter);
      this.errorCollector.attach(this.pageAdapter);
      this.networkCollector.attach(this.pageAdapter);
    } catch {
      // Ignore attach errors
    }
  }

  mark(event: DiagnosticMarker): void {
    if (this.isDisposed) return;
    this.timeline.add(event.type, event.data);
  }

  async finalize(context: FinalizeContext): Promise<DiagnosticsResult> {
    const endTime = Date.now();
    this.timeline.add(context.success ? 'run.completed' : 'run.failed', {
      error: context.error?.message,
    });

    try {
      // 1. Final Page State
      let pageState;
      let interactiveElements;
      if (this.options.pageState !== false && this.pageAdapter) {
        const captured = await capturePageState(this.pageAdapter, this.sanitizer);
        pageState = captured.pageState;
        interactiveElements = captured.interactiveElements;
      }

      // 2. Performance Metrics
      let performanceMetrics;
      if (this.options.performance && this.pageAdapter) {
        performanceMetrics = await capturePerformance(this.pageAdapter);
      }

      // 3. HTML Content
      let htmlContent: string | undefined;
      const typesToCapture = new Set(
        context.success
          ? this.options.captureOnSuccess ?? []
          : this.options.captureOnError ?? ['screenshot', 'html', 'page-state'],
      );

      if (typesToCapture.has('html') && this.pageAdapter && !this.pageAdapter.isClosed()) {
        try {
          htmlContent = await this.pageAdapter.content();
        } catch {
          // ignore
        }
      }

      // 4. Screenshot Buffer
      let screenshotBuffer = context.buffer;
      if (
        !screenshotBuffer &&
        typesToCapture.has('screenshot') &&
        this.pageAdapter &&
        !this.pageAdapter.isClosed()
      ) {
        try {
          screenshotBuffer = await this.pageAdapter.screenshot();
        } catch {
          // ignore screenshot failure
        }
      }

      // Collect entries
      const consoleEntries = this.consoleCollector.getEntries();
      const pageErrors = this.errorCollector.getEntries();
      const requests = this.networkCollector.getRequests();
      const responses = this.networkCollector.getResponses();
      const failures = this.networkCollector.getFailures();
      const issues = this.networkCollector.getIssues();
      const timelineEntries = this.timeline.getEntries();

      const truncatedFlags = {
        console: this.consoleCollector.getTruncated(),
        pageErrors: this.errorCollector.getTruncated(),
        network: this.networkCollector.getTruncated(),
        timeline: this.timeline.getTruncated(),
      };

      // 5. Diagnostics Summary
      const summary = buildDiagnosticsSummary({
        runId: this.runId,
        startTime: this.startTime,
        endTime,
        success: context.success,
        pageState,
        consoleEntries,
        pageErrors,
        requests,
        responses,
        failures,
        issues,
        truncatedFlags,
      });

      // 6. Artifact Writing
      let artifacts;
      let artifactErrors;

      const outputMode = this.options.output ?? 'summary';
      const shouldWriteDisk =
        outputMode === 'artifacts' ||
        (!context.success && (this.options.captureOnError?.length ?? 0) > 0) ||
        (context.success && (this.options.captureOnSuccess?.length ?? 0) > 0);

      if (shouldWriteDisk) {
        const saved = await writeDiagnosticArtifacts({
          runId: this.runId,
          options: this.options,
          summary,
          consoleEntries,
          pageErrors,
          requests,
          responses,
          failures,
          timelineEntries,
          pageState,
          interactiveElements,
          htmlContent,
          screenshotBuffer,
        });

        artifacts = saved.artifacts;
        artifactErrors = saved.artifactErrors.length > 0 ? saved.artifactErrors : undefined;
        summary.artifacts = artifacts;
      }

      // 7. Async TTL Cleanup (non-blocking)
      if (this.options.artifactTtlMs && this.options.artifactsDir) {
        void cleanExpiredArtifacts(this.options.artifactsDir, this.options.artifactTtlMs);
      }

      // 8. Result Construction based on Output Mode
      const result: DiagnosticsResult = {
        id: this.runId,
        preset: this.options.preset,
        summary,
        artifacts,
        artifactErrors,
      };

      if (outputMode === 'inline') {
        result.console = consoleEntries;
        result.pageErrors = pageErrors;
        result.network = { requests, responses, failures };
        result.pageState = pageState;
        result.interactiveElements = interactiveElements;
        result.performance = performanceMetrics;
        result.timeline = timelineEntries;
        result.issues = issues;
      }

      return result;
    } catch (err) {
      // Controlled fallback if finalize fails
      return {
        id: this.runId,
        preset: this.options.preset,
        summary: buildDiagnosticsSummary({
          runId: this.runId,
          startTime: this.startTime,
          endTime,
          success: context.success,
          consoleEntries: [],
          pageErrors: [],
          requests: [],
          responses: [],
          failures: [],
          issues: [],
          truncatedFlags: {},
        }),
        error: {
          code: 'DIAGNOSTICS_FINALIZE_FAILED',
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }
  }

  dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.isAttached = false;

    this.consoleCollector.dispose();
    this.errorCollector.dispose();
    this.networkCollector.dispose();
    this.pageAdapter = undefined;
  }
}
