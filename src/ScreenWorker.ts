import type { Browser, BrowserContext, Page } from 'puppeteer-core';
import type {
  JobType,
  PdfOptions,
  QueuedJob,
  ResolvedScreenPoolConfig,
  ScreenshotOptions,
  ViewportConfig,
  WorkerState,
  ExtractOptions,
} from './types.js';
import {
  NavigationError,
  RenderTimeoutError,
  WorkerCrashedError,
} from './errors.js';
import { renderScreenshot } from './renderers/ScreenshotRenderer.js';
import { renderPdf } from './renderers/PdfRenderer.js';
import { renderHtmlToImage } from './renderers/HtmlToImageRenderer.js';
import { renderHtmlToPdf } from './renderers/HtmlToPdfRenderer.js';
import { renderExtract } from './renderers/ExtractRenderer.js';
import { resetPageState, createCleanDirtyState, type PageDirtyState } from './renderers/PageSetup.js';

import { resolveDiagnosticsOptions } from './diagnostics/presets.js';
import { DiagnosticsCollectorImpl, type DiagnosticsCollector } from './diagnostics/collector.js';

export class ScreenWorker {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private state: WorkerState = 'idle';
  private jobsCompleted = 0;
  private dirtyState: PageDirtyState = createCleanDirtyState();

  constructor(
    readonly id: number,
    private browser: Browser,
    private readonly config: ResolvedScreenPoolConfig,
  ) {}

  get currentState(): WorkerState {
    return this.state;
  }

  /** Initialize browser context and page. */
  async init(): Promise<void> {
    await this.createContextAndPage();
  }

  private async destroyContext(): Promise<void> {
    if (this.page) {
      try {
        await this.page.close({ runBeforeUnload: false });
      } catch {
        // ignore
      }
      this.page = null;
    }

    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // ignore
      }
      this.context = null;
    }
  }

  private async createContextAndPage(): Promise<void> {
    await this.destroyContext();

    this.context = await this.browser.createBrowserContext();
    this.page = await this.context.newPage();
    this.state = 'idle';
    this.jobsCompleted = 0;
    this.dirtyState = createCleanDirtyState();
  }

  /** Execute a render job with timeout. */
  async run(job: QueuedJob): Promise<void> {
    if (!this.page || !this.context) {
      throw new WorkerCrashedError(this.id, 'Worker page is not initialized.');
    }

    this.state = 'busy';
    const start = Date.now();

    const jobDiagnosticsInput = (job.options as any)?.diagnostics;
    const diagOpts = resolveDiagnosticsOptions(jobDiagnosticsInput, this.config.diagnostics);

    let collector: DiagnosticsCollector | undefined;
    if (diagOpts) {
      collector = new DiagnosticsCollectorImpl(diagOpts, job.id);
      collector.attach(this.page);
    }

    try {
      const result = await this.withTimeout(
        job.id,
        this.config.jobTimeout,
        () => this.dispatch(job),
      );

      result.durationMs = Date.now() - start;

      if (collector) {
        result.diagnostics = await collector.finalize({
          success: true,
          buffer: result.buffer,
          contentType: result.contentType,
        });
      }

      job.resolve(result);
      this.jobsCompleted++;

      if (
        this.config.workerRestartAfterJobs > 0 &&
        this.jobsCompleted >= this.config.workerRestartAfterJobs
      ) {
        await this.recycle();
      } else {
        await resetPageState(this.page, this.context, this.config.defaultViewport, this.dirtyState);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));

      if (collector) {
        const diagResult = await collector.finalize({
          success: false,
          error: err,
        });
        (err as any).diagnostics = diagResult;
      }

      const shouldRecycle =
        this.isCrashError(err) || err instanceof RenderTimeoutError;

      if (shouldRecycle) {
        this.state = 'crashed';
        await this.recycle().catch(() => undefined);
        job.reject(
          err instanceof RenderTimeoutError
            ? err
            : new WorkerCrashedError(this.id, err.message),
        );
      } else {
        job.reject(err);
        if (this.page && this.context) {
          await resetPageState(this.page, this.context, this.config.defaultViewport, this.dirtyState).catch(
            () => undefined,
          );
        }
      }
    } finally {
      if (collector) {
        await collector.dispose();
      }
      if (this.state === 'busy') {
        this.state = 'idle';
      }
    }
  }

  private async dispatch(job: QueuedJob) {
    if (!this.page) {
      throw new WorkerCrashedError(this.id);
    }

    switch (job.type as JobType) {
      case 'screenshot':
        return renderScreenshot(this.page, job.options as ScreenshotOptions, job.id, this.config, this.dirtyState);
      case 'pdf':
        return renderPdf(this.page, job.options as PdfOptions, job.id, this.config, this.dirtyState);
      case 'htmlToImage':
        return renderHtmlToImage(this.page, job.options as ScreenshotOptions, job.id, this.config, this.dirtyState);
      case 'htmlToPdf':
        return renderHtmlToPdf(this.page, job.options as PdfOptions, job.id, this.config, this.dirtyState);
      case 'extract':
        return renderExtract(this.page, job.options as ExtractOptions, job.id, this.config, this.dirtyState);
      default:
        throw new NavigationError(`Unknown job type: ${job.type}`);
    }
  }

  private async withTimeout<T>(
    jobId: string,
    timeoutMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      return await Promise.race([
        fn(),
        new Promise<T>((_, reject) => {
          timer = setTimeout(
            () => reject(new RenderTimeoutError(jobId, timeoutMs)),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  private isCrashError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    return (
      msg.includes('target closed') ||
      msg.includes('session closed') ||
      msg.includes('protocol error') ||
      msg.includes('connection closed')
    );
  }

  /** Recycle context and page. */
  async recycle(): Promise<void> {
    this.state = 'recycling';
    await this.createContextAndPage();
  }

  /** Update browser reference after browser restart. */
  async setBrowser(browser: Browser): Promise<void> {
    this.browser = browser;
    await this.createContextAndPage();
  }

  /** Close worker resources. */
  async close(): Promise<void> {
    await this.destroyContext();
    this.state = 'idle';
  }

  markIdle(): void {
    if (this.state !== 'recycling') {
      this.state = 'idle';
    }
  }

  isIdle(): boolean {
    return this.state === 'idle';
  }

  /** Reserve worker synchronously before async run() starts. */
  tryAcquire(): boolean {
    if (this.state !== 'idle') return false;
    this.state = 'busy';
    return true;
  }
}
