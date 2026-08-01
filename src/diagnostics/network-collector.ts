import type {
  DiagnosticIssue,
  DiagnosticsOptions,
  NetworkFailureDiagnosticEntry,
  NetworkRequestDiagnosticEntry,
  NetworkResponseDiagnosticEntry,
} from './types.js';
import type { DiagnosticPage, RequestInfo, ResponseInfo, RequestFailedInfo } from './page-adapter.js';
import type { Sanitizer } from './sanitizer.js';
import type { Timeline } from './timeline.js';

interface RequestMeta {
  id: string;
  url: string;
  method: string;
  resourceType?: string;
  startTime: number;
  headers?: Record<string, string>;
}

export class NetworkCollector {
  private requests: NetworkRequestDiagnosticEntry[] = [];
  private responses: NetworkResponseDiagnosticEntry[] = [];
  private failures: NetworkFailureDiagnosticEntry[] = [];
  private issues: DiagnosticIssue[] = [];

  private requestMap = new Map<unknown, RequestMeta>();
  private requestCounter = 0;
  private maxEntries: number;

  private slowThresholdMs: number;
  private cleanups: Array<() => void> = [];
  private isTruncated = false;

  constructor(
    private options: DiagnosticsOptions,
    private startTime: number,
    private sanitizer: Sanitizer,
    private timeline: Timeline,
  ) {
    this.maxEntries = options.maxNetworkEntries ?? 1000;
    if (typeof options.slowRequests === 'object') {
      this.slowThresholdMs = options.slowRequests.thresholdMs;
    } else if (options.slowRequests === true) {
      this.slowThresholdMs = 2000;
    } else {
      this.slowThresholdMs = 0; // disabled
    }
  }

  attach(page: DiagnosticPage): void {
    const mode = this.options.network ?? 'failed-only';
    if (mode === 'off') return;

    this.cleanups.push(
      page.onRequest((req: RequestInfo) => this.handleRequest(req)),
    );
    this.cleanups.push(
      page.onResponse((res: ResponseInfo) => void this.handleResponse(res)),
    );
    this.cleanups.push(
      page.onRequestFailed((req: RequestFailedInfo) => this.handleRequestFailed(req)),
    );
  }

  private shouldTrackResourceType(resourceType?: string): boolean {
    const mode = this.options.network ?? 'failed-only';
    if (mode === 'all' || mode === 'failed-only') return true;
    if (mode === 'document-and-api') {
      const type = (resourceType || '').toLowerCase();
      return type === 'document' || type === 'xhr' || type === 'fetch';
    }
    return true;
  }

  private handleRequest(req: RequestInfo): void {
    if (!this.shouldTrackResourceType(req.resourceType)) return;

    this.requestCounter++;
    const requestId = `req_${this.requestCounter}`;
    const elapsedMs = Date.now() - this.startTime;
    const sanitizedUrl = this.sanitizer.sanitizeUrl(req.url);

    const meta: RequestMeta = {
      id: requestId,
      url: sanitizedUrl,
      method: req.method,
      resourceType: req.resourceType,
      startTime: Date.now(),
      headers: this.options.includeRequestHeaders
        ? this.sanitizer.sanitizeHeaders(req.headers)
        : undefined,
    };

    this.requestMap.set(req.id, meta);

    const mode = this.options.network ?? 'failed-only';
    if (mode !== 'failed-only') {
      const entry: NetworkRequestDiagnosticEntry = {
        id: requestId,
        timestamp: new Date().toISOString(),
        elapsedMs,
        method: req.method,
        url: sanitizedUrl,
        resourceType: req.resourceType,
        headers: meta.headers,
      };

      if (this.requests.length >= this.maxEntries) {
        this.requests.shift();
        this.isTruncated = true;
      }
      this.requests.push(entry);

      this.timeline.add('request.started', {
        requestId,
        method: req.method,
        url: sanitizedUrl,
      });
    }
  }

  private async handleResponse(res: ResponseInfo): Promise<void> {
    const reqMeta = this.requestMap.get(res.request);
    const sanitizedUrl = reqMeta ? reqMeta.url : this.sanitizer.sanitizeUrl(res.url);
    const requestId = reqMeta ? reqMeta.id : `req_unknown_${this.requestCounter++}`;
    const durationMs = reqMeta ? Date.now() - reqMeta.startTime : undefined;
    const elapsedMs = Date.now() - this.startTime;

    const status = res.status;
    const mode = this.options.network ?? 'failed-only';

    // HTTP 4xx / 5xx Issues
    if (this.options.httpErrors !== false && status >= 400) {
      const issueType = 'http-error';
      const severity = status >= 500 ? 'error' : 'warning';
      this.issues.push({
        type: issueType,
        severity,
        message: `HTTP ${status} ${res.statusText || ''} for ${sanitizedUrl}`.trim(),
        url: sanitizedUrl,
        status,
        relatedEntryId: requestId,
      });
    }

    // Slow Requests
    if (this.slowThresholdMs > 0 && durationMs && durationMs >= this.slowThresholdMs) {
      this.issues.push({
        type: 'slow-request',
        severity: 'warning',
        message: `Slow request to ${sanitizedUrl} took ${durationMs}ms (threshold: ${this.slowThresholdMs}ms)`,
        url: sanitizedUrl,
        status,
        relatedEntryId: requestId,
      });
    }

    // Optional response body capture
    let body: string | undefined;
    if (this.options.includeResponseBodies && res.text) {
      const headers = res.headers || {};
      const contentType = (headers['content-type'] || headers['Content-Type'] || '').toLowerCase();

      const isText =
        contentType.includes('application/json') ||
        contentType.includes('text/') ||
        contentType.includes('application/xml');

      const hasAuthHeader = Boolean(
        headers['authorization'] ||
          headers['Authorization'] ||
          headers['set-cookie'] ||
          headers['Set-Cookie'],
      );

      if (isText && !hasAuthHeader) {
        try {
          const rawText = await res.text();
          const maxLen = this.options.maxResponseBodyLength ?? 100_000;
          body = this.sanitizer.sanitizeText(
            rawText.length > maxLen ? rawText.slice(0, maxLen) + '...' : rawText,
          );
        } catch {
          // ignore body reading failure
        }
      }
    }

    const isSlow = this.slowThresholdMs > 0 && durationMs !== undefined && durationMs >= this.slowThresholdMs;

    if (mode !== 'failed-only' || status >= 400 || isSlow) {
      const entry: NetworkResponseDiagnosticEntry = {
        requestId,
        timestamp: new Date().toISOString(),
        elapsedMs,
        status,
        statusText: res.statusText,
        url: sanitizedUrl,
        headers: this.options.includeResponseHeaders
          ? this.sanitizer.sanitizeHeaders(res.headers)
          : undefined,
        durationMs,
        fromCache: res.fromCache,
        body,
      };

      if (this.responses.length >= this.maxEntries) {
        this.responses.shift();
        this.isTruncated = true;
      }
      this.responses.push(entry);

      this.timeline.add('response.received', {
        requestId,
        status,
        url: sanitizedUrl,
        durationMs,
      });
    }

    this.requestMap.delete(res.request);
  }

  private handleRequestFailed(req: RequestFailedInfo): void {
    const reqMeta = this.requestMap.get(req.request);
    const sanitizedUrl = reqMeta ? reqMeta.url : this.sanitizer.sanitizeUrl(req.url);
    const requestId = reqMeta ? reqMeta.id : `req_failed_${this.requestCounter++}`;
    const elapsedMs = Date.now() - this.startTime;

    const errorText = req.errorText ?? 'Failed request';

    const entry: NetworkFailureDiagnosticEntry = {
      requestId,
      timestamp: new Date().toISOString(),
      elapsedMs,
      method: req.method,
      url: sanitizedUrl,
      resourceType: req.resourceType,
      errorText,
    };

    if (this.failures.length >= this.maxEntries) {
      this.failures.shift();
      this.isTruncated = true;
    }
    this.failures.push(entry);

    this.issues.push({
      type: 'request-failed',
      severity: 'error',
      message: `Request failed: ${req.method} ${sanitizedUrl} (${errorText})`,
      url: sanitizedUrl,
      relatedEntryId: requestId,
    });

    this.timeline.add('request.failed', {
      requestId,
      url: sanitizedUrl,
      errorText,
    });

    this.requestMap.delete(req.request);
  }

  getRequests(): NetworkRequestDiagnosticEntry[] {
    return this.requests;
  }

  getResponses(): NetworkResponseDiagnosticEntry[] {
    return this.responses;
  }

  getFailures(): NetworkFailureDiagnosticEntry[] {
    return this.failures;
  }

  getIssues(): DiagnosticIssue[] {
    return this.issues;
  }

  getTruncated(): boolean {
    return this.isTruncated;
  }

  dispose(): void {
    for (const cleanup of this.cleanups) {
      cleanup();
    }
    this.cleanups = [];
    this.requestMap.clear();
  }
}
