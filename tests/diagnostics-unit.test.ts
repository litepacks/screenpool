import { describe, it, expect } from 'vitest';
import { resolveDiagnosticsOptions, PRESETS } from '../src/diagnostics/presets.js';
import { Sanitizer } from '../src/diagnostics/sanitizer.js';
import { SafeSerializer } from '../src/diagnostics/serializer.js';
import { Timeline } from '../src/diagnostics/timeline.js';
import { buildDiagnosticsSummary } from '../src/diagnostics/summary.js';
import { writeDiagnosticArtifacts, cleanExpiredArtifacts } from '../src/diagnostics/artifacts.js';
import { mkdir, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import os from 'node:os';

describe('Diagnostics Unit Tests', () => {
  describe('Preset & Config Resolver', () => {
    it('returns null when diagnostics is false or undefined', () => {
      expect(resolveDiagnosticsOptions(false)).toBeNull();
      expect(resolveDiagnosticsOptions(undefined)).toBeNull();
      expect(resolveDiagnosticsOptions(null)).toBeNull();
    });

    it('resolves boolean true to standard preset', () => {
      const opts = resolveDiagnosticsOptions(true);
      expect(opts).not.toBeNull();
      expect(opts?.preset).toBe('standard');
      expect(opts?.console).toEqual(['warn', 'error']);
    });

    it('resolves string preset names', () => {
      const errorsOpts = resolveDiagnosticsOptions('errors');
      expect(errorsOpts?.preset).toBe('errors');
      expect(errorsOpts?.console).toEqual(['error']);

      const verboseOpts = resolveDiagnosticsOptions('verbose');
      expect(verboseOpts?.preset).toBe('verbose');
      expect(verboseOpts?.console).toBe(true);
    });

    it('allows custom options object to override preset defaults', () => {
      const opts = resolveDiagnosticsOptions({
        preset: 'standard',
        network: 'document-and-api',
        maxConsoleEntries: 100,
      });

      expect(opts?.preset).toBe('standard');
      expect(opts?.network).toBe('document-and-api');
      expect(opts?.maxConsoleEntries).toBe(100);
      expect(opts?.pageErrors).toBe(true);
    });
  });

  describe('Sanitizer', () => {
    const sanitizer = new Sanitizer();

    it('redacts sensitive headers', () => {
      const headers = {
        Authorization: 'Bearer secret_token_123',
        'User-Agent': 'ScreenpoolTest',
        Cookie: 'session=abc123xyz',
        'X-API-Key': 'key_99999',
      };

      const sanitized = sanitizer.sanitizeHeaders(headers);
      expect(sanitized?.['Authorization']).toBe('[REDACTED]');
      expect(sanitized?.['User-Agent']).toBe('ScreenpoolTest');
      expect(sanitized?.['Cookie']).toBe('[REDACTED]');
      expect(sanitized?.['X-API-Key']).toBe('[REDACTED]');
    });

    it('redacts query parameters in URLs', () => {
      const url = 'https://example.com/api?token=secret123&page=2&apiKey=mykey';
      const sanitized = sanitizer.sanitizeUrl(url);

      expect(sanitized).toContain('token=[REDACTED]');
      expect(sanitized).toContain('apiKey=[REDACTED]');
      expect(sanitized).toContain('page=2');
    });

    it('redacts user credentials in URL authority', () => {
      const url = 'https://admin:password123@example.com/dashboard';
      const sanitized = sanitizer.sanitizeUrl(url);

      expect(sanitized).not.toContain('password123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('recursively redacts JSON keys in objects', () => {
      const data = {
        user: 'alice',
        password: 'super_secret_password',
        token: 'ey12345',
        meta: {
          refreshToken: 'refresh_999',
          publicInfo: 'ok',
        },
      };

      const sanitized = sanitizer.sanitizeValue(data);
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.meta.refreshToken).toBe('[REDACTED]');
      expect(sanitized.meta.publicInfo).toBe('ok');
    });
  });

  describe('SafeSerializer', () => {
    const serializer = new SafeSerializer({ maxDepth: 2, maxLength: 20 });

    it('handles primitive values', () => {
      expect(serializer.serialize(123)).toEqual({ type: 'number', value: 123 });
      expect(serializer.serialize(true)).toEqual({ type: 'boolean', value: true });
      expect(serializer.serialize(null)).toEqual({ type: 'null', value: null });
    });

    it('truncates long strings', () => {
      const longStr = 'This is a very long string exceeding length limit';
      const res = serializer.serialize(longStr);
      expect(res.truncated).toBe(true);
      expect((res.value as string).length).toBeLessThan(longStr.length);
    });

    it('handles circular references safely without throwing', () => {
      const obj: any = { name: 'parent' };
      obj.self = obj;

      const res = serializer.serialize(obj);
      expect(res.type).toBe('object');
      expect((res.value as any).self).toBe('[Circular Reference]');
    });

    it('handles functions, symbols, and BigInt', () => {
      const fnRes = serializer.serialize(function myTestFn() {});
      expect(fnRes.type).toBe('function');
      expect(fnRes.value).toContain('myTestFn');

      const symRes = serializer.serialize(Symbol('testSymbol'));
      expect(symRes.type).toBe('symbol');

      const bigRes = serializer.serialize(BigInt(999999999));
      expect(bigRes.type).toBe('bigint');
      expect(bigRes.value).toBe('999999999');
    });

    it('truncates objects exceeding maxDepth', () => {
      const deepObj = { level1: { level2: { level3: 'deep' } } };
      const res = serializer.serialize(deepObj);
      expect(res.type).toBe('object');
      expect((res.value as any).level1.level2).toBe('[Object]');
    });
  });

  describe('Timeline & Event Emission', () => {
    it('records entries chronologically and invokes onEvent callback', () => {
      const events: any[] = [];
      const timeline = new Timeline(
        { onEvent: (e) => events.push(e) },
        Date.now(),
        new Sanitizer(),
      );

      timeline.add('run.started');
      timeline.add('navigation.started', { url: 'https://example.com' });
      timeline.add('run.completed');

      const entries = timeline.getEntries();
      expect(entries).toHaveLength(3);
      expect(entries[0].type).toBe('run.started');
      expect(entries[1].type).toBe('navigation.started');
      expect(entries[2].type).toBe('run.completed');

      expect(events).toHaveLength(3);
      expect(events[1].data.url).toContain('https://example.com');
    });
  });

  describe('Diagnostics Summary Builder', () => {
    it('calculates counts, duration, and top issues correctly', () => {
      const start = Date.now() - 1000;
      const end = Date.now();

      const summary = buildDiagnosticsSummary({
        runId: 'run_test_1',
        startTime: start,
        endTime: end,
        success: false,
        consoleEntries: [
          { id: 'c1', timestamp: new Date().toISOString(), elapsedMs: 10, level: 'error', text: 'Error 1' },
          { id: 'c2', timestamp: new Date().toISOString(), elapsedMs: 20, level: 'warn', text: 'Warn 1' },
        ],
        pageErrors: [
          { id: 'p1', timestamp: new Date().toISOString(), elapsedMs: 30, name: 'TypeError', message: 'Null pointer' },
        ],
        requests: [
          { id: 'r1', timestamp: new Date().toISOString(), elapsedMs: 5, method: 'GET', url: 'https://example.com/api' },
        ],
        responses: [
          { requestId: 'r1', timestamp: new Date().toISOString(), elapsedMs: 500, status: 500, url: 'https://example.com/api', durationMs: 495 },
        ],
        failures: [
          { requestId: 'r2', timestamp: new Date().toISOString(), elapsedMs: 100, method: 'GET', url: 'https://example.com/bad', errorText: 'net::ERR_FAILED' },
        ],
        issues: [
          { type: 'http-error', severity: 'error', message: 'HTTP 500', status: 500 },
          { type: 'request-failed', severity: 'error', message: 'Request failed' },
        ],
        truncatedFlags: { console: false },
      });

      expect(summary.runId).toBe('run_test_1');
      expect(summary.success).toBe(false);
      expect(summary.counts.console).toBe(2);
      expect(summary.counts.consoleErrors).toBe(1);
      expect(summary.counts.pageErrors).toBe(1);
      expect(summary.counts.failedRequests).toBe(1);
      expect(summary.counts.responses5xx).toBe(1);
      expect(summary.counts.issues).toBe(2);
      expect(summary.slowestRequests[0].durationMs).toBe(495);
    });
  });

  describe('Artifact Writing & Cleanup', () => {
    it('writes summary and artifact files to disk', async () => {
      const tempDir = join(os.tmpdir(), `screenpool_diag_test_${Date.now()}`);
      await mkdir(tempDir, { recursive: true });

      const summary = buildDiagnosticsSummary({
        runId: 'run_artifact_test',
        startTime: Date.now() - 500,
        endTime: Date.now(),
        success: true,
        consoleEntries: [],
        pageErrors: [],
        requests: [],
        responses: [],
        failures: [],
        issues: [],
        truncatedFlags: {},
      });

      const res = await writeDiagnosticArtifacts({
        runId: 'run_artifact_test',
        options: { artifactsDir: tempDir, captureOnSuccess: ['summary', 'html'] },
        summary,
        htmlContent: '<html><body>Test</body></html>',
      });

      expect(res.artifacts.length).toBeGreaterThan(0);
      expect(res.artifactErrors).toHaveLength(0);

      const files = await readdir(res.artifacts[0].path.replace(/\/[^/]+$/, ''));
      expect(files).toContain('summary.json');
      expect(files).toContain('page.html');
    });

    it('cleans expired artifact directories based on TTL', async () => {
      const rootDir = join(os.tmpdir(), `screenpool_ttl_test_${Date.now()}`);
      const oldFolder = join(rootDir, 'run_1000000000000_abc123');
      await mkdir(oldFolder, { recursive: true });
      await writeFile(join(oldFolder, 'summary.json'), '{}', 'utf8');

      // Run cleanup with TTL 1ms
      await cleanExpiredArtifacts(rootDir, 1);

      const entries = await readdir(rootDir).catch(() => []);
      expect(entries).not.toContain('run_1000000000000_abc123');
    });
  });
});
