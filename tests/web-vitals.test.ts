import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScreenPool } from '../src/ScreenPool.js';
import {
  rateMetric,
  computeWebVitalsScore,
  WEB_VITALS_THRESHOLDS,
} from '../src/diagnostics/web-vitals.js';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { createScreenpoolMcpServer } from '../src/mcp/server.js';

describe('Core Web Vitals & PageSpeed Unit Tests', () => {
  it('correctly rates metrics according to Google Web Vitals thresholds', () => {
    // LCP (good <= 2500, poor > 4000)
    expect(rateMetric(1500, WEB_VITALS_THRESHOLDS.lcp.good, WEB_VITALS_THRESHOLDS.lcp.poor)).toBe('good');
    expect(rateMetric(2500, WEB_VITALS_THRESHOLDS.lcp.good, WEB_VITALS_THRESHOLDS.lcp.poor)).toBe('good');
    expect(rateMetric(3200, WEB_VITALS_THRESHOLDS.lcp.good, WEB_VITALS_THRESHOLDS.lcp.poor)).toBe('needs-improvement');
    expect(rateMetric(4000, WEB_VITALS_THRESHOLDS.lcp.good, WEB_VITALS_THRESHOLDS.lcp.poor)).toBe('needs-improvement');
    expect(rateMetric(4500, WEB_VITALS_THRESHOLDS.lcp.good, WEB_VITALS_THRESHOLDS.lcp.poor)).toBe('poor');
    expect(rateMetric(undefined, 2500, 4000)).toBeUndefined();

    // CLS (good <= 0.1, poor > 0.25)
    expect(rateMetric(0.05, WEB_VITALS_THRESHOLDS.cls.good, WEB_VITALS_THRESHOLDS.cls.poor)).toBe('good');
    expect(rateMetric(0.18, WEB_VITALS_THRESHOLDS.cls.good, WEB_VITALS_THRESHOLDS.cls.poor)).toBe('needs-improvement');
    expect(rateMetric(0.35, WEB_VITALS_THRESHOLDS.cls.good, WEB_VITALS_THRESHOLDS.cls.poor)).toBe('poor');

    // FCP (good <= 1800, poor > 3000)
    expect(rateMetric(1000, WEB_VITALS_THRESHOLDS.fcp.good, WEB_VITALS_THRESHOLDS.fcp.poor)).toBe('good');
    expect(rateMetric(2200, WEB_VITALS_THRESHOLDS.fcp.good, WEB_VITALS_THRESHOLDS.fcp.poor)).toBe('needs-improvement');
    expect(rateMetric(3500, WEB_VITALS_THRESHOLDS.fcp.good, WEB_VITALS_THRESHOLDS.fcp.poor)).toBe('poor');

    // TTFB (good <= 800, poor > 1800)
    expect(rateMetric(200, WEB_VITALS_THRESHOLDS.ttfb.good, WEB_VITALS_THRESHOLDS.ttfb.poor)).toBe('good');
    expect(rateMetric(1200, WEB_VITALS_THRESHOLDS.ttfb.good, WEB_VITALS_THRESHOLDS.ttfb.poor)).toBe('needs-improvement');
    expect(rateMetric(2100, WEB_VITALS_THRESHOLDS.ttfb.good, WEB_VITALS_THRESHOLDS.ttfb.poor)).toBe('poor');
  });

  it('computes accurate overall performance scores', () => {
    // Perfect vitals
    const perfectScore = computeWebVitalsScore({
      lcpMs: 800,
      cls: 0.01,
      fcpMs: 400,
      ttfbMs: 100,
    });
    expect(perfectScore).toBeGreaterThanOrEqual(90);

    // Degraded vitals
    const poorScore = computeWebVitalsScore({
      lcpMs: 5000,
      cls: 0.45,
      fcpMs: 3500,
      ttfbMs: 2000,
    });
    expect(poorScore).toBeLessThan(50);
  });
});

describe.skipIf(!hasChromium())('ScreenPool PageSpeed Audit Integration Tests', () => {
  let server: Server;
  let baseUrl: string;
  let pool: ScreenPool;

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>PageSpeed Test Page</title>
          <style>
            body { font-family: sans-serif; padding: 20px; }
            .hero-title { font-size: 32px; color: #1a73e8; }
            .banner { width: 300px; height: 100px; background: #eee; margin-top: 10px; }
          </style>
        </head>
        <body>
          <h1 id="main-title" class="hero-title">Welcome to ScreenPool Audit</h1>
          <p>Testing LCP, CLS, FCP and TTFB metrics natively.</p>
          <div class="banner">Content Box</div>
          <script>
            // Simulate slight DOM mutation
            setTimeout(() => {
              const el = document.createElement('div');
              el.textContent = 'Loaded dynamic content';
              document.body.appendChild(el);
            }, 50);
          </script>
        </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as { port: number };
    baseUrl = `http://127.0.0.1:${addr.port}`;

    pool = new ScreenPool({
      poolSize: 2,
      executablePath: getChromiumPath(),
      allowLocalhost: true,
    });
    await pool.start();
  });

  afterAll(async () => {
    if (pool) await pool.stop();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('runs pool.audit and measures Core Web Vitals', async () => {
    const result = await pool.audit({
      url: `${baseUrl}/audit`,
      device: 'desktop',
    });

    expect(result.url).toBe(`${baseUrl}/audit`);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);

    const { webVitals, summary } = result;
    expect(webVitals).toBeDefined();
    expect(typeof webVitals.cls).toBe('number');
    expect(webVitals.fcpMs).toBeGreaterThan(0);
    expect(webVitals.ttfbMs).toBeGreaterThanOrEqual(0);
    expect(webVitals.ratings?.fcp).toBeDefined();

    expect(summary.fcp.rating).toBeDefined();
    expect(summary.cls.rating).toBeDefined();
  });

  it('runs pool.audit with mobile device emulation', async () => {
    const result = await pool.audit({
      url: `${baseUrl}/mobile-audit`,
      device: 'mobile',
    });

    expect(result.url).toBe(`${baseUrl}/mobile-audit`);
    expect(result.webVitals).toBeDefined();
    expect(result.durationMs).toBeGreaterThan(0);
  });

  it('captures webVitals in standard screenshot jobs with diagnostics enabled', async () => {
    const result = await pool.screenshot({
      url: `${baseUrl}/diagnostics-vitals`,
      diagnostics: {
        preset: 'verbose',
        output: 'inline',
        performance: true,
      },
    });

    expect(result.diagnostics).toBeDefined();
    const perf = result.diagnostics?.performance;
    expect(perf).toBeDefined();
    expect(perf?.webVitals).toBeDefined();
    expect(typeof perf?.webVitals?.cls).toBe('number');
    expect(perf?.webVitals?.fcpMs).toBeGreaterThan(0);
  });

  it('audits page via MCP tool screenpool_pagespeed', async () => {
    const mcpServer = await createScreenpoolMcpServer({
      pool,
      config: {
        security: {
          allowPrivateNetwork: true,
          allowedDomains: ['127.0.0.1', 'localhost'],
        },
      },
    });

    const response = await mcpServer.callTool('screenpool_pagespeed', {
      url: `${baseUrl}/mcp-pagespeed`,
      device: 'desktop',
    });

    expect(response).toBeDefined();
    const data = JSON.parse(response.content[0].text);
    expect(data.success).toBe(true);
    expect(data.score).toBeGreaterThan(0);
    expect(data.webVitals).toBeDefined();
    expect(data.webVitals.fcp).toBeDefined();
    expect(data.webVitals.cls).toBeDefined();
  });
});
