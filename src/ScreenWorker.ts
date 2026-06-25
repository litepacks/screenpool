import type { Browser, BrowserContext, HTTPRequest, Page } from 'puppeteer-core';
import type {
  JobType,
  PdfOptions,
  QueuedJob,
  ResolvedScreenPoolConfig,
  ScreenshotOptions,
  ViewportConfig,
  WorkerState,
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
import { resetPageState } from './renderers/PageSetup.js';

export class ScreenWorker {
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private state: WorkerState = 'idle';
  private jobsCompleted = 0;
  private requestHandler: ((req: HTTPRequest) => void) | null = null;

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

  private async createContextAndPage(): Promise<void> {
    if (this.context) {
      try {
        await this.context.close();
      } catch {
        // ignore
      }
    }

    this.context = await this.browser.createBrowserContext();
    this.page = await this.context.newPage();
    this.state = 'idle';
    this.jobsCompleted = 0;
  }

  /** Execute a render job with timeout. */
  async run(job: QueuedJob): Promise<void> {
    if (!this.page || !this.context) {
      throw new WorkerCrashedError(this.id, 'Worker page is not initialized.');
    }

    this.state = 'busy';
    const start = Date.now();

    try {
      const result = await this.withTimeout(
        job.id,
        this.config.jobTimeout,
        () => this.dispatch(job),
      );

      result.durationMs = Date.now() - start;
      job.resolve(result);
      this.jobsCompleted++;

      if (
        this.config.workerRestartAfterJobs > 0 &&
        this.jobsCompleted >= this.config.workerRestartAfterJobs
      ) {
        await this.recycle();
      } else {
        await resetPageState(this.page, this.context, this.config.defaultViewport);
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      if (this.isCrashError(err)) {
        this.state = 'crashed';
        await this.recycle().catch(() => undefined);
        job.reject(new WorkerCrashedError(this.id, err.message));
      } else {
        job.reject(err);
        if (this.page && this.context) {
          await resetPageState(this.page, this.context, this.config.defaultViewport).catch(
            () => undefined,
          );
        }
      }
    } finally {
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
        return renderScreenshot(this.page, job.options as ScreenshotOptions, job.id, this.config);
      case 'pdf':
        return renderPdf(this.page, job.options as PdfOptions, job.id, this.config);
      case 'htmlToImage':
        return renderHtmlToImage(this.page, job.options as ScreenshotOptions, job.id, this.config);
      case 'htmlToPdf':
        return renderHtmlToPdf(this.page, job.options as PdfOptions, job.id, this.config);
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
    if (this.page) {
      try {
        await this.page.close();
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
}
