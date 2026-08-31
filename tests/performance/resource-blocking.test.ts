import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScreenPool } from '../../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('CDP Fast Resource Blocking', () => {
  let server: Server;
  let serverUrl: string;
  let requestedPaths: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      const urlPath = req.url || '';
      requestedPaths.push(urlPath);

      if (urlPath.endsWith('.css')) {
        res.setHeader('Content-Type', 'text/css');
        res.end('body { background-color: rgb(255, 0, 0); }');
        return;
      }

      if (urlPath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
        // 1x1 transparent PNG
        const pngBuf = Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        );
        res.end(pngBuf);
        return;
      }

      res.setHeader('Content-Type', 'text/html');
      res.end(`
        <!DOCTYPE html>
        <html>
          <head>
            <link rel="stylesheet" href="/style.css">
          </head>
          <body>
            <h1>Resource Test</h1>
            <img id="test-img" src="/photo.png" alt="test image" />
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

  it('blocks images natively via CDP without fetching from server', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    await pool.start();

    try {
      requestedPaths = [];

      // 1. Run screenshot with image blocking enabled
      await pool.screenshot({
        url: `${serverUrl}/page1`,
        blockResources: ['image'],
        waitUntil: 'load',
      });

      // photo.png should NOT be received by server because CDP blocked it client-side
      const imageRequested = requestedPaths.some((p) => p.includes('photo.png'));
      expect(imageRequested).toBe(false);

      // CSS should still be requested
      const cssRequested = requestedPaths.some((p) => p.includes('style.css'));
      expect(cssRequested).toBe(true);

      // 2. Next job without blockResources (subsequent job unblocks images)
      requestedPaths = [];
      await pool.screenshot({
        url: `${serverUrl}/page2`,
        waitUntil: 'load',
      });

      const secondImageReq = requestedPaths.some((p) => p.includes('photo.png'));
      expect(secondImageReq).toBe(true);
    } finally {
      await pool.stop();
    }
  });

  it('blocks stylesheets natively via CDP', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    await pool.start();

    try {
      requestedPaths = [];

      // Run with stylesheet blocking
      await pool.screenshot({
        url: `${serverUrl}/page3`,
        blockResources: ['stylesheet'],
        waitUntil: 'load',
      });

      const cssRequested = requestedPaths.some((p) => p.includes('style.css'));
      expect(cssRequested).toBe(false);

      const imageRequested = requestedPaths.some((p) => p.includes('photo.png'));
      expect(imageRequested).toBe(true);
    } finally {
      await pool.stop();
    }
  });
});
