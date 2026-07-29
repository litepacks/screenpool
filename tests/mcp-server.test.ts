import { createServer, type Server } from 'node:http';
import { existsSync, unlinkSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { ScreenpoolMcpServer } from '../src/mcp/server.js';
import { handleScreenshot, handlePdf, handleHtml, handleMetadata, handleHealth, handleCapabilities } from '../src/mcp/handlers.js';
import { validateTargetUrl } from '../src/mcp/security.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('MCP Server Integration Tests', () => {
  let httpServer: Server;
  let baseUrl: string;
  let pool: ScreenPool;
  let mcpServer: ScreenpoolMcpServer;

  beforeAll(async () => {
    // Start local test HTTP server
    httpServer = createServer((req, res) => {
      if (req.url === '/test-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>MCP Test Page</title>
              <meta name="description" content="Testing Screenpool MCP Server integration">
              <link rel="canonical" href="http://127.0.0.1/test-page">
            </head>
            <body style="background: lightblue;">
              <h1>Screenpool MCP Integration</h1>
              <p>Rendering web pages for AI assistants.</p>
            </body>
          </html>
        `);
      } else if (req.url === '/large-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<html><body>${'A'.repeat(5000)}</body></html>`);
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 2,
    });
    await pool.start();

    mcpServer = new ScreenpoolMcpServer({
      screenPool: pool,
      config: {
        security: { allowPrivateNetwork: true },
        artifactsDir: '.screenpool/test-artifacts',
      },
    });
    await mcpServer.init();
  });

  afterAll(async () => {
    if (mcpServer) await mcpServer.close();
    if (pool) await pool.stop();
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  it('captures screenshot via MCP handler', async () => {
    const config = mcpServer.currentConfig;
    const res = await handleScreenshot(
      pool,
      {
        url: `${baseUrl}/test-page`,
        format: 'png',
        viewport: { width: 800, height: 600 },
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.mimeType).toBe('image/png');
    expect(res.path).toContain('.screenpool/test-artifacts');
    expect(existsSync(res.path)).toBe(true);

    try { unlinkSync(res.path); } catch {}
  });

  it('renders PDF via MCP handler', async () => {
    const config = mcpServer.currentConfig;
    const res = await handlePdf(
      pool,
      {
        url: `${baseUrl}/test-page`,
        format: 'A4',
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.mimeType).toBe('application/pdf');
    expect(existsSync(res.path)).toBe(true);

    try { unlinkSync(res.path); } catch {}
  });

  it('extracts HTML via MCP handler', async () => {
    const config = mcpServer.currentConfig;
    const res = await handleHtml(
      pool,
      {
        url: `${baseUrl}/test-page`,
        maxChars: 10000,
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.html).toContain('<h1>Screenpool MCP Integration</h1>');
    expect(res.truncated).toBe(false);
  });

  it('truncates large HTML content when maxChars is exceeded', async () => {
    const config = mcpServer.currentConfig;
    const res = await handleHtml(
      pool,
      {
        url: `${baseUrl}/large-page`,
        maxChars: 100,
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.truncated).toBe(true);
    expect(res.returnedLength).toBe(100);
  });

  it('extracts page metadata via MCP handler', async () => {
    const config = mcpServer.currentConfig;
    const res = await handleMetadata(
      pool,
      {
        url: `${baseUrl}/test-page`,
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.title).toBe('MCP Test Page');
    expect(res.description).toBe('Testing Screenpool MCP Server integration');
  });

  it('returns pool health stats via MCP health handler', async () => {
    const config = mcpServer.currentConfig;
    const health = await handleHealth(pool, config);

    expect(health.status).toBe('ok');
    expect(health.poolSize).toBe(2);
  });

  it('returns capabilities via MCP capabilities handler', async () => {
    const config = mcpServer.currentConfig;
    const caps = await handleCapabilities(config);

    expect(caps.version).toBeDefined();
    expect(caps.tools).toContain('screenpool_screenshot');
    expect(caps.tools).toContain('screenpool_pdf');
    expect(caps.formats.screenshot).toContain('png');
  });
});
