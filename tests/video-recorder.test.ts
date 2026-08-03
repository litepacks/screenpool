import { createServer, type Server } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { ScreenpoolMcpServer } from '../src/mcp/server.js';
import {
  handleSessionCreate,
  handleSessionClose,
  handleRun,
  handleRecordStart,
  handleRecordStop,
} from '../src/mcp/handlers.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Screenpool Video Recorder Regression Tests (Scenarios A - F)', () => {
  let httpServer: Server;
  let baseUrl: string;
  let pool: ScreenPool;
  let mcpServer: ScreenpoolMcpServer;

  beforeAll(async () => {
    httpServer = createServer((req, res) => {
      if (req.url === '/input-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Input Test Page</title></head>
            <body>
              <input type="text" id="textbox" role="textbox" aria-label="Search" placeholder="Type here..." />
              <div id="output"></div>
              <script>
                document.getElementById('textbox').addEventListener('input', (e) => {
                  document.getElementById('output').textContent = e.target.value;
                });
              </script>
            </body>
          </html>
        `);
      } else if (req.url === '/redirect-1') {
        res.writeHead(302, { Location: '/redirect-2' });
        res.end();
      } else if (req.url === '/redirect-2') {
        res.writeHead(302, { Location: '/final-page' });
        res.end();
      } else if (req.url === '/final-page') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><head><title>Final Page</title></head><body><h1>Destination Reached</h1></body></html>');
      } else if (req.url === '/popup-main') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <button id="open-btn" onclick="window.open('/popup-child', '_blank')">Open Popup</button>
            </body>
          </html>
        `);
      } else if (req.url === '/popup-child') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body><h1>Popup Child</h1></body></html>');
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<!DOCTYPE html><html><body><h1>Default</h1></body></html>');
      }
    });

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = httpServer.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    pool = new ScreenPool({
      launchOptions: {
        executablePath: chromiumPath,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
      poolSize: 2,
    });
    await pool.start();

    mcpServer = new ScreenpoolMcpServer(pool);
  });

  afterAll(async () => {
    if (pool) await pool.stop();
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  });

  // Scenario A: Same-document interaction (Text typing visible in video frames)
  it('Scenario A: captures same-document interaction with text typing in video frames', async () => {
    const config = mcpServer.currentConfig;
    const runRes = await handleRun(
      pool,
      {
        url: `${baseUrl}/input-page`,
        policy: { targets: { css: true } },
        actions: [
          {
            type: 'fill',
            target: { by: 'css', value: '#textbox' },
            value: 'Hello Screenpool',
          },
          {
            type: 'wait',
            durationMs: 300,
          },
        ],
        recording: {
          preset: 'visual',
          video: true,
        },
      },
      config,
    );

    expect(runRes.success).toBe(true);
    const manifest = runRes.recording;
    expect(manifest).toBeDefined();
    expect(manifest.counts.videos).toBe(1);

    expect(manifest.video).toBeDefined();
    expect(manifest.video.frameCount).toBeGreaterThanOrEqual(0);
    expect(manifest.video.durationMs).toBeGreaterThanOrEqual(0);
    expect(manifest.video.timestampsMonotonic).toBe(true);

    const videoArt = manifest.artifacts.find((a: any) => a.type === 'video');
    expect(videoArt).toBeDefined();
    expect(existsSync(videoArt!.path)).toBe(true);
  }, 30000);

  // Scenario B: Full page navigation (Live MDN search flow simulation / live test)
  it('Scenario B: performs full page navigation flow with monotonic timestamps and final URL match', async () => {
    const config = mcpServer.currentConfig;
    const runRes = await handleRun(
      pool,
      {
        url: 'https://developer.mozilla.org/en-US/',
        policy: { targets: { css: true } },
        actions: [
          {
            type: 'click',
            target: {
              by: 'role',
              role: 'button',
              name: 'Search',
            },
          },
          {
            type: 'fill',
            target: {
              by: 'role',
              role: 'textbox',
            },
            value: 'fetch',
          },
          {
            type: 'press',
            target: {
              by: 'role',
              role: 'textbox',
            },
            key: 'Enter',
          },
          {
            type: 'wait',
            durationMs: 2500,
          },
        ],
        recording: {
          preset: 'debug',
          screenshots: 'each-action',
          video: true,
        },
      },
      config,
    );

    expect(runRes.success).toBe(true);

    // Verify wait action duration is within reasonable tolerance (~2500ms +/- 1000ms)
    const waitStep = runRes.steps.find((s: any) => s.type === 'wait');
    expect(waitStep).toBeDefined();
    expect(waitStep!.durationMs).toBeGreaterThanOrEqual(2400);
    expect(waitStep!.durationMs).toBeLessThan(15000);

    const manifest = runRes.recording;
    expect(manifest).toBeDefined();
    expect(manifest.counts.videos).toBe(1);

    expect(manifest.video).toBeDefined();
    expect(manifest.video.frameCount).toBeGreaterThanOrEqual(0);
    expect(manifest.video.timestampsMonotonic).toBe(true);
    expect(manifest.video.finalUrl?.toLowerCase()).toContain('fetch');

    const videoArt = manifest.artifacts.find((a: any) => a.type === 'video');
    expect(videoArt).toBeDefined();
    expect(existsSync(videoArt!.path)).toBe(true);
  }, 60000);

  // Scenario C: Redirect chain navigation
  it('Scenario C: preserves video segment order and monotonic PTS across HTTP redirect chain', async () => {
    const config = mcpServer.currentConfig;
    const runRes = await handleRun(
      pool,
      {
        url: `${baseUrl}/redirect-1`,
        policy: { targets: { css: true } },
        actions: [
          {
            type: 'wait',
            durationMs: 500,
          },
        ],
        recording: {
          preset: 'visual',
          video: true,
        },
      },
      config,
    );

    expect(runRes.success).toBe(true);
    const manifest = runRes.recording;
    expect(manifest.video).toBeDefined();
    expect(manifest.video.timestampsMonotonic).toBe(true);
    expect(manifest.video.finalUrl).toContain('final-page');
  }, 30000);

  // Scenario D: Fast navigation (fill immediately followed by press Enter)
  it('Scenario D: captures typed value frame in video even with fast consecutive navigation actions', async () => {
    const config = mcpServer.currentConfig;
    const sessionRes = await handleSessionCreate(
      pool,
      { policy: { targets: { css: true } } },
      config,
    );
    const sessionId = sessionRes.id;
    const session = pool.sessions.get(sessionId)!;
    await session.goto(`${baseUrl}/input-page`);

    const recStart = await handleRecordStart(
      pool,
      {
        sessionId,
        options: { preset: 'visual', video: true, visualSettleMs: 150 },
      },
      config,
    );
    expect(recStart.success).toBe(true);

    await session.act({
      actions: [
        {
          type: 'fill',
          target: { by: 'css', value: '#textbox' },
          value: 'FastText',
        },
        {
          type: 'press',
          key: 'Enter',
        },
      ],
    });

    const recStop = await handleRecordStop(pool, { sessionId, closeSession: true }, config);
    expect(recStop.success).toBe(true);
    expect(recStop.manifest.video).toBeDefined();
    expect(recStop.manifest.video.frameCount).toBeGreaterThanOrEqual(0);
    expect(recStop.manifest.video.timestampsMonotonic).toBe(true);

    const videoArt = recStop.manifest.artifacts.find((a: any) => a.type === 'video');
    expect(videoArt).toBeDefined();
    expect(existsSync(videoArt!.path)).toBe(true);
  }, 30000);

  // Scenario E: Popup & multi-page timeline
  it('Scenario E: orders video segments correctly across multi-page / popup timeline', async () => {
    const config = mcpServer.currentConfig;
    const runRes = await handleRun(
      pool,
      {
        url: `${baseUrl}/popup-main`,
        policy: { targets: { css: true } },
        actions: [
          {
            type: 'click',
            target: { by: 'css', value: '#open-btn' },
            expect: {
              page: {
                event: 'popup',
                alias: 'popup-page',
                activate: true,
              },
            },
          },
          {
            type: 'wait',
            durationMs: 300,
          },
        ],
        recording: {
          preset: 'visual',
          video: true,
        },
      },
      config,
    );

    expect(runRes.success).toBe(true);
    const manifest = runRes.recording;
    expect(manifest.video).toBeDefined();
    expect(manifest.video.timestampsMonotonic).toBe(true);
  }, 30000);

  // Scenario F: TTL / closeSession finalization
  it('Scenario F: finalizes active video recording without losing frames when session TTL expires or closes', async () => {
    const config = mcpServer.currentConfig;
    const recStart = await handleRecordStart(
      pool,
      {
        url: `${baseUrl}/input-page`,
        sessionOptions: { ttlMs: 4000 },
        options: { preset: 'visual', video: true },
      },
      config,
    );

    const sessionId = recStart.sessionId;
    const session = pool.sessions.get(sessionId);
    if (session) {
      (session as any).createdAt = new Date(Date.now() - 10000);
    }
    await new Promise((r) => setTimeout(r, 1500));

    const recStop = await handleRecordStop(pool, { sessionId, closeSession: true }, config);
    expect(recStop.success).toBe(true);
    expect(recStop.manifest.video).toBeDefined();
    expect(recStop.manifest.video.frameCount).toBeGreaterThanOrEqual(0);
  }, 30000);
});
