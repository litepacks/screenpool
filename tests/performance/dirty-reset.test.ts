import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScreenPool } from '../../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Dirty-State Page Reset & Hot-Path Isolation', () => {
  let server: Server;
  let serverUrl: string;
  let receivedHeaders: Record<string, string>[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      receivedHeaders.push(req.headers as Record<string, string>);
      res.setHeader('Content-Type', 'text/html');
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <style>
              body { margin: 0; background: white; }
              @media (prefers-color-scheme: dark) {
                body { background: black; }
              }
            </style>
          </head>
          <body>
            <h1 id="header">Page Title</h1>
            <div id="dims"></div>
            <script>
              document.getElementById('dims').textContent = window.innerWidth + 'x' + window.innerHeight;
            </script>
          </body>
        </html>
      `);
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('resets custom viewport back to default on subsequent jobs without leakage', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1, // Single worker guarantees sequential execution on same worker page
      defaultViewport: { width: 1200, height: 800 },
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    await pool.start();

    try {
      // 1. Job with custom small viewport
      const res1 = await pool.screenshot({
        url: `${serverUrl}/view1`,
        viewport: { width: 320, height: 480 },
        selector: '#dims',
        includeElementHtml: true,
      });
      expect(res1.elementHtml).toContain('320x480');

      // 2. Subsequent job with default viewport (should cleanly reset back to 1200x800)
      const res2 = await pool.screenshot({
        url: `${serverUrl}/view2`,
        selector: '#dims',
        includeElementHtml: true,
      });
      expect(res2.elementHtml).toContain('1200x800');
    } finally {
      await pool.stop();
    }
  });

  it('resets custom headers and cookies without leaking to subsequent jobs', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    await pool.start();

    try {
      receivedHeaders = [];

      // 1. Job with custom extra headers
      await pool.screenshot({
        url: `${serverUrl}/headers1`,
        headers: { 'x-custom-tenant': 'tenant_abc' },
      });

      expect(receivedHeaders.length).toBeGreaterThan(0);
      const firstReq = receivedHeaders[receivedHeaders.length - 1];
      expect(firstReq['x-custom-tenant']).toBe('tenant_abc');

      // 2. Subsequent job without custom headers
      await pool.screenshot({
        url: `${serverUrl}/headers2`,
      });

      const secondReq = receivedHeaders[receivedHeaders.length - 1];
      expect(secondReq['x-custom-tenant']).toBeUndefined();
    } finally {
      await pool.stop();
    }
  });

  it('resets custom user agent and dark mode between sequential jobs', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    await pool.start();

    try {
      receivedHeaders = [];

      // 1. Custom User-Agent and dark mode
      await pool.screenshot({
        url: `${serverUrl}/ua1`,
        userAgent: 'ScreenpoolCustomBot/2.0',
        darkMode: true,
      });

      const firstReq = receivedHeaders[receivedHeaders.length - 1];
      expect(firstReq['user-agent']).toBe('ScreenpoolCustomBot/2.0');

      // 2. Next job with default settings
      await pool.screenshot({
        url: `${serverUrl}/ua2`,
      });

      const secondReq = receivedHeaders[receivedHeaders.length - 1];
      expect(secondReq['user-agent']).not.toBe('ScreenpoolCustomBot/2.0');
    } finally {
      await pool.stop();
    }
  });

  it('handles consecutive default render jobs at high speed without overhead', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 2,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    await pool.start();

    try {
      const results = await Promise.all(
        Array.from({ length: 8 }, (_, i) =>
          pool.screenshot({
            html: `<html><body><h1>Rapid Job ${i}</h1></body></html>`,
          }),
        ),
      );

      expect(results.length).toBe(8);
      for (const res of results) {
        expect(res.buffer).toBeInstanceOf(Buffer);
        expect(res.buffer.length).toBeGreaterThan(0);
      }
    } finally {
      await pool.stop();
    }
  });
});
