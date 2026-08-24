import { createServer, type Server } from 'node:http';
import { existsSync, unlinkSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { ScreenpoolMcpServer } from '../src/mcp/server.js';
import {
  handleScreenshot,
  handlePdf,
  handleHtml,
  handleMetadata,
  handleHealth,
  handleCapabilities,
  handleHelp,
  handleSessionCreate,
  handleSessionPages,
  handleSessionClose,
  handleObserve,
  handleAct,
  handleRun,
  handleRecordStart,
  handleRecordStop,
  handleRecordGet,
} from '../src/mcp/handlers.js';
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
      allowLocalhost: true,
      allowPrivateNetworks: true,
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
  }, 60000);

  afterAll(async () => {
    if (mcpServer) await mcpServer.close();
    if (pool) await pool.stop();
    if (httpServer) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }, 60000);

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

  it('captures element screenshot and extracts element code via MCP handler', async () => {
    const config = mcpServer.currentConfig;
    const res = await handleScreenshot(
      pool,
      {
        url: `${baseUrl}/test-page`,
        selector: 'h1',
        includeElementHtml: true,
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.elementHtml).toContain('Screenpool MCP Integration');
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
        timeout: 10000,
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.title).toBe('MCP Test Page');
    expect(res.description).toBe('Testing Screenpool MCP Server integration');
  });

  it('extracts HTML with timeout and waitUntil networkidle options', async () => {
    const config = mcpServer.currentConfig;
    const res = await handleHtml(
      pool,
      {
        url: `${baseUrl}/test-page`,
        timeout: 10000,
        waitUntil: 'networkidle' as any,
      },
      config,
    );

    expect(res.success).toBe(true);
    expect(res.html).toContain('MCP Test Page');
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

  it('returns documentation via MCP help handler', async () => {
    const helpAll = await handleHelp({ topic: 'all' });
    expect(helpAll.topic).toBe('all');
    expect(helpAll.tools.screenpool_screenshot).toBeDefined();
    expect(helpAll.diagnostics.presets).toBeDefined();

    const helpTools = await handleHelp({ topic: 'tools' });
    expect(helpTools.topic).toBe('tools');
    expect(helpTools.tools.screenpool_pdf).toBeDefined();
  });

  it('manages sessions, observe, act, and record via MCP handlers', async () => {
    const config = mcpServer.currentConfig;

    // 1. Create Session
    const sessionRes = await handleSessionCreate(pool, {}, config);
    expect(sessionRes.id).toBeDefined();
    const sessionId = sessionRes.id;

    // 2. List Pages
    const pagesRes = await handleSessionPages(pool, { sessionId }, config);
    expect(pagesRes.pages.length).toBeGreaterThan(0);

    // Navigate main page
    const session = pool.sessions.get(sessionId)!;
    await session.goto(`${baseUrl}/test-page`);

    // 3. Start Recording
    const recStartRes = await handleRecordStart(pool, { sessionId, options: { preset: 'debug' } }, config);
    expect(recStartRes.recordingId).toBeDefined();

    // Check Record Status
    const recGetRes = await handleRecordGet(pool, { sessionId }, config);
    expect(recGetRes.active?.id).toBeDefined();

    // 4. Observe Page
    const obsRes = await handleObserve(pool, { sessionId, screenshot: false, html: 'compact' }, config);
    expect(obsRes.id).toBeDefined();

    // 5. Execute Act
    const actRes = await handleAct(
      pool,
      {
        sessionId,
        observationId: obsRes.id,
        actions: [
          {
            type: 'wait',
            durationMs: 100,
          },
        ],
      },
      config,
    );
    expect(actRes.success).toBe(true);

    // 6. Stop Recording
    const recStopRes = await handleRecordStop(pool, { sessionId }, config);
    expect(recStopRes.success).toBe(true);
    expect(recStopRes.manifest.id).toBeDefined();

    // 7. Close Session
    const closeRes = await handleSessionClose(pool, { sessionId }, config);
    expect(closeRes.success).toBe(true);
  });

  it('starts recording with auto-created session and stops with single-command auto-close', async () => {
    const config = mcpServer.currentConfig;

    // 1. Single-command start recording without pre-existing sessionId
    const recStartRes = await handleRecordStart(
      pool,
      {
        url: `${baseUrl}/test-page`,
        options: { preset: 'debug', screenshots: 'each-action' },
      },
      config,
    );

    expect(recStartRes.success).toBe(true);
    expect(recStartRes.recordingId).toBeDefined();
    expect(recStartRes.sessionId).toBeDefined();
    expect(recStartRes.autoCreatedSession).toBe(true);

    const sessionId = recStartRes.sessionId;

    // Verify record get works without passing sessionId
    const getRes = await handleRecordGet(pool, {}, config);
    expect(getRes.success).toBe(true);
    expect(getRes.sessionId).toBe(sessionId);
    expect(getRes.active?.id).toBe(recStartRes.recordingId);

    // Perform an action on auto-created session
    await handleAct(
      pool,
      {
        sessionId,
        actions: [{ type: 'wait', durationMs: 100 }],
      },
      config,
    );

    // 2. Single-command stop recording without sessionId, with closeSession: true
    const recStopRes = await handleRecordStop(pool, { closeSession: true }, config);
    expect(recStopRes.success).toBe(true);
    expect(recStopRes.sessionId).toBe(sessionId);
    expect(recStopRes.manifest).toBeDefined();
    expect(recStopRes.artifacts.length).toBeGreaterThan(0);

    // Verify session was closed
    const sessionCheck = pool.sessions.get(sessionId);
    expect(sessionCheck).toBeUndefined();
  });

  it('executes stateless browser action run returning complete recording manifest', async () => {
    const config = mcpServer.currentConfig;
    const runRes = await handleRun(
      pool,
      {
        url: `${baseUrl}/test-page`,
        actions: [
          {
            type: 'wait',
            durationMs: 100,
          },
        ],
        recording: {
          preset: 'actions',
        },
      },
      config,
    );

    expect(runRes.success).toBe(true);
    expect(runRes.recordingId).toBeDefined();
    expect(runRes.recording).toBeDefined();
    expect(runRes.recording?.id).toBe(runRes.recordingId);
    expect(runRes.recording?.artifacts).toBeDefined();
  });

  it('supports persistent session creation and safe cleanup', async () => {
    const sessionInfo = await handleSessionCreate(pool, { persistent: true });
    expect(sessionInfo.id).toBeDefined();
    expect(sessionInfo.persistent).toBe(true);

    const session = pool.sessions.require(sessionInfo.id);
    expect(session.isPersistent).toBe(true);

    await session.goto(`${baseUrl}/test-page`);

    // Verify observe and actions work on persistent session
    const obs = await handleObserve(pool, { sessionId: sessionInfo.id, elements: true });
    expect(obs.sessionId).toBe(sessionInfo.id);

    // Closing persistent session cleans up pages without error
    const closeRes = await handleSessionClose(pool, { sessionId: sessionInfo.id });
    expect(closeRes.success).toBe(true);
    expect(pool.sessions.get(sessionInfo.id)).toBeUndefined();
  });

  it('provides comprehensive handleHelp documentation across topics', async () => {
    const allHelp = await handleHelp({ topic: 'all' });
    expect(allHelp.topic).toBe('all');
    expect(allHelp.tools.screenpool_session_create).toBeDefined();
    expect(allHelp.authAndSessions).toBeDefined();
    expect(allHelp.actions.click).toBeDefined();
    expect(allHelp.targets.types.role).toBeDefined();
    expect(allHelp.recording.presets.visual).toBeDefined();

    const authHelp = await handleHelp({ topic: 'auth' });
    expect(authHelp.authAndSessions.persistentProfiles).toBeDefined();

    const actionsHelp = await handleHelp({ topic: 'actions' });
    expect(actionsHelp.actions.fill).toBeDefined();
    expect(actionsHelp.targets).toBeDefined();

    const caps = await handleCapabilities(mcpServer.currentConfig);
    expect(caps.tools.length).toBe(16);
    expect(caps.sessions.persistentProfileSupported).toBe(true);
  });
});
