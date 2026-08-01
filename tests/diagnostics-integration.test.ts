import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScreenPool } from '../src/ScreenPool.js';

describe('Diagnostics Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let pool: ScreenPool;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (url.pathname === '/console') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <body>
            <script>
              console.log("Log message", { info: "public" });
              console.warn("Warning message");
              console.error("Failed to fetch user profile", { secretKey: "secret_123" });
            </script>
            <h1>Console Test</h1>
          </body>
          </html>
        `);
        return;
      }

      if (url.pathname === '/page-error') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <body>
            <script>
              setTimeout(() => {
                throw new TypeError("Uncaught runtime error in script");
              }, 50);
            </script>
            <h1>Page Error Test</h1>
          </body>
          </html>
        `);
        return;
      }

      if (url.pathname === '/http-404') {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }

      if (url.pathname === '/http-500') {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
        return;
      }

      if (url.pathname === '/slow-api') {
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 'ok' }));
        }, 2200);
        return;
      }

      if (url.pathname === '/iframe') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <body>
            <iframe src="about:blank"></iframe>
            <iframe src="about:blank"></iframe>
            <button id="btn1">Click me</button>
            <input type="text" name="username" value="john_doe" />
          </body>
          </html>
        `);
        return;
      }

      if (url.pathname === '/fetch-404') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <body>
            <script>
              fetch('/http-404');
              fetch('/http-500');
            </script>
          </body>
          </html>
        `);
        return;
      }

      // Default success page
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html><head><title>Success Page</title></head><body><h1>Hello World</h1></body></html>');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    pool = new ScreenPool({
      poolSize: 2,
      allowLocalhost: true,
    });
    await pool.start();
  });

  afterAll(async () => {
    await pool.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('captures console.warn and console.error with standard preset', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/console`,
      diagnostics: 'standard',
    });

    expect(result.diagnostics).toBeDefined();
    const summary = result.diagnostics!.summary;
    expect(summary.counts.console).toBeGreaterThan(0);
    expect(summary.counts.consoleErrors).toBe(1);
    expect(summary.topIssues).toBeDefined();
  });

  it('captures uncaught page errors', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/page-error`,
      waitForTimeout: 200,
      diagnostics: {
        preset: 'standard',
        output: 'inline',
      },
    });

    expect(result.diagnostics).toBeDefined();
    const errors = result.diagnostics!.pageErrors || [];
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].message).toContain('Uncaught runtime error');
  });

  it('flags HTTP 404 and 500 response issues', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/fetch-404`,
      waitForTimeout: 300,
      diagnostics: {
        preset: 'standard',
        output: 'inline',
      },
    });

    expect(result.diagnostics).toBeDefined();
    const summary = result.diagnostics!.summary;
    expect(summary.counts.responses4xx).toBe(1);
    expect(summary.counts.responses5xx).toBe(1);
  });

  it('detects slow requests based on slowRequests threshold', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/slow-api`,
      diagnostics: {
        preset: 'standard',
        slowRequests: { thresholdMs: 1500 },
      },
    });

    expect(result.diagnostics).toBeDefined();
    expect(result.diagnostics!.summary.counts.slowRequests).toBe(1);
    expect(result.diagnostics!.summary.slowestRequests[0].durationMs).toBeGreaterThanOrEqual(1500);
  });

  it('captures page state and counts element nodes', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/iframe`,
      diagnostics: {
        preset: 'standard',
        output: 'inline',
      },
    });

    expect(result.diagnostics).toBeDefined();
    const state = result.diagnostics!.pageState;
    expect(state).toBeDefined();
    expect(state?.counts?.iframes).toBe(2);
    expect(state?.counts?.buttons).toBe(1);
    expect(state?.counts?.inputs).toBe(1);

    const interactive = result.diagnostics!.interactiveElements || [];
    expect(interactive.length).toBeGreaterThan(0);
  });

  it('masks secret header values and query parameters', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/console?token=my_secret_token_123&user=admin`,
      headers: {
        Authorization: 'Bearer my_secret_bearer',
      },
      diagnostics: {
        preset: 'verbose',
        output: 'inline',
        includeRequestHeaders: true,
      },
    });

    expect(result.diagnostics).toBeDefined();
    const requests = result.diagnostics!.network?.requests || [];
    const mainReq = requests.find((r) => r.url.includes('/console'));
    expect(mainReq).toBeDefined();

    expect(mainReq!.url).toContain('token=[REDACTED]');
    expect(mainReq!.url).not.toContain('my_secret_token_123');
    expect(mainReq!.headers?.['authorization']).toBe('[REDACTED]');
  });

  it('adds zero overhead and returns undefined diagnostics when disabled', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/success`,
      diagnostics: false,
    });

    expect(result.diagnostics).toBeUndefined();
  });

  it('ensures pool workers clear diagnostics state between consecutive jobs', async () => {
    const job1 = await pool.screenshot({
      url: `${baseUrl}/console`,
      diagnostics: { preset: 'standard', output: 'inline' },
    });

    const job2 = await pool.screenshot({
      url: `${baseUrl}/success`,
      diagnostics: { preset: 'standard', output: 'inline' },
    });

    expect(job1.diagnostics?.console?.length).toBeGreaterThan(0);
    expect(job2.diagnostics?.console?.length).toBe(0);
  });
});
