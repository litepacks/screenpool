import type { Page, ConsoleMessage, HTTPRequest, HTTPResponse } from 'puppeteer-core';

export interface ConsoleMessageInfo {
  type: string;
  text: string;
  location?: {
    url?: string;
    lineNumber?: number;
    columnNumber?: number;
  };
  args?: any[];
}

export interface RequestInfo {
  id: unknown;
  method: string;
  url: string;
  resourceType?: string;
  headers?: Record<string, string>;
}

export interface ResponseInfo {
  request: unknown;
  status: number;
  statusText?: string;
  url: string;
  mimeType?: string;
  headers?: Record<string, string>;
  fromCache?: boolean;
  text?: () => Promise<string>;
}

export interface RequestFailedInfo {
  request: unknown;
  method: string;
  url: string;
  resourceType?: string;
  errorText?: string;
}

export interface DiagnosticPage {
  onConsole(listener: (msg: ConsoleMessageInfo) => void): () => void;
  onPageError(listener: (err: Error) => void): () => void;
  onRequest(listener: (req: RequestInfo) => void): () => void;
  onResponse(listener: (res: ResponseInfo) => void): () => void;
  onRequestFailed(listener: (req: RequestFailedInfo) => void): () => void;
  evaluate<T>(fn: string | ((...args: any[]) => T), ...args: any[]): Promise<T>;
  screenshot(options?: unknown): Promise<Buffer>;
  content(): Promise<string>;
  url(): string;
  title(): Promise<string>;
  isClosed(): boolean;
}

export class PuppeteerDiagnosticPageAdapter implements DiagnosticPage {
  constructor(private page: Page) {}

  onConsole(listener: (msg: ConsoleMessageInfo) => void): () => void {
    const handler = (msg: ConsoleMessage) => {
      const loc = msg.location();
      listener({
        type: msg.type(),
        text: msg.text(),
        location: {
          url: loc.url,
          lineNumber: loc.lineNumber,
          columnNumber: loc.columnNumber,
        },
        args: msg.args(),
      });
    };
    this.page.on('console', handler);
    return () => {
      this.page.off('console', handler);
    };
  }

  onPageError(listener: (err: Error) => void): () => void {
    const handler = (err: any) => listener(err instanceof Error ? err : new Error(String(err)));
    this.page.on('pageerror', handler);
    return () => {
      this.page.off('pageerror', handler);
    };
  }

  onRequest(listener: (req: RequestInfo) => void): () => void {
    const handler = (req: HTTPRequest) => {
      listener({
        id: req,
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
        headers: req.headers(),
      });
    };
    this.page.on('request', handler);
    return () => {
      this.page.off('request', handler);
    };
  }

  onResponse(listener: (res: ResponseInfo) => void): () => void {
    const handler = (res: HTTPResponse) => {
      listener({
        request: res.request(),
        status: res.status(),
        statusText: res.statusText(),
        url: res.url(),
        headers: res.headers(),
        fromCache: res.fromCache(),
        text: () => res.text().catch(() => ''),
      });
    };
    this.page.on('response', handler);
    return () => {
      this.page.off('response', handler);
    };
  }

  onRequestFailed(listener: (req: RequestFailedInfo) => void): () => void {
    const handler = (req: HTTPRequest) => {
      listener({
        request: req,
        method: req.method(),
        url: req.url(),
        resourceType: req.resourceType(),
        errorText: req.failure()?.errorText ?? 'Failed request',
      });
    };
    this.page.on('requestfailed', handler);
    return () => {
      this.page.off('requestfailed', handler);
    };
  }

  async evaluate<T>(fn: string | ((...args: any[]) => T), ...args: any[]): Promise<T> {
    if (this.isClosed()) {
      throw new Error('Page closed');
    }
    return this.page.evaluate(fn as any, ...args);
  }

  async screenshot(options?: unknown): Promise<Buffer> {
    if (this.isClosed()) {
      throw new Error('Page closed');
    }
    const buf = await this.page.screenshot(options as any);
    return Buffer.from(buf as unknown as Uint8Array);
  }

  async content(): Promise<string> {
    if (this.isClosed()) return '';
    return this.page.content();
  }

  url(): string {
    if (this.isClosed()) return '';
    return this.page.url();
  }

  async title(): Promise<string> {
    if (this.isClosed()) return '';
    return this.page.title();
  }

  isClosed(): boolean {
    return this.page.isClosed();
  }
}
