import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { ScreenpoolMcpServer } from '../src/mcp/server.js';
import {
  handleHelp,
  handleSessionCreate,
  handleSessionClose,
  handleObserve,
  handleAct,
  handleRun,
  handleRecordStart,
  handleRecordStop,
} from '../src/mcp/handlers.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Screenpool MCP Regression Tests (9 Enhancements)', () => {
  let httpServer: Server;
  let baseUrl: string;
  let pool: ScreenPool;
  let mcpServer: ScreenpoolMcpServer;

  beforeAll(async () => {
    httpServer = createServer((req, res) => {
      if (req.url === '/shadow-dom') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Shadow DOM Test Page</title></head>
            <body>
              <div id="host"></div>
              <script>
                const host = document.getElementById('host');
                const shadow = host.attachShadow({ mode: 'open' });
                shadow.innerHTML = \`
                  <button id="shadow-btn" role="button">Shadow Button</button>
                  <input type="text" id="shadow-input" aria-label="Shadow Input" placeholder="Search shadow" />
                \`;
              </script>
            </body>
          </html>
        `);
      } else if (req.url === '/closed-shadow') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body>
              <custom-closed></custom-closed>
              <script>
                class CustomClosed extends HTMLElement {
                  constructor() {
                    super();
                    this.attachShadow({ mode: 'closed' }).innerHTML = '<button id="closed-btn">Closed</button>';
                  }
                }
                customElements.define('custom-closed', CustomClosed);
              </script>
            </body>
          </html>
        `);
      } else if (req.url === '/visibility-test') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <body style="margin: 0; height: 3000px;">
              <button id="offscreen-btn" style="position: absolute; top: -320px; left: 0; width: 100px; height: 30px;">Skip to search</button>
              <button id="visible-btn" style="position: absolute; top: 50px; left: 50px; width: 100px; height: 30px;">Visible Btn</button>
            </body>
          </html>
        `);
      } else {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Default Page</h1></body></html>');
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
        artifactsDir: '.screenpool/test-regressions',
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

  // Requirement 1: Shadow DOM Support & MDN Test
  it('1. discovers elements in open shadow DOM and performs MDN search flow', async () => {
    const config = mcpServer.currentConfig;

    // Test local open shadow DOM observation & act
    const sessionRes = await handleSessionCreate(pool, {}, config);
    const sessionId = sessionRes.id;
    const session = pool.sessions.get(sessionId)!;
    await session.goto(`${baseUrl}/shadow-dom`);

    const obs = await handleObserve(pool, { sessionId, elements: true }, config);
    const shadowBtn = obs.elements?.find((e) => e.name === 'Shadow Button' || e.text === 'Shadow Button');
    expect(shadowBtn).toBeDefined();
    expect(shadowBtn?.isShadow).toBe(true);

    // Test filling input inside shadow DOM
    const actRes = await handleAct(
      pool,
      {
        sessionId,
        actions: [
          {
            type: 'fill',
            target: { by: 'label', value: 'Shadow Input' },
            value: 'fetch',
          },
        ],
      },
      config,
    );
    expect(actRes.success).toBe(true);
    await handleSessionClose(pool, { sessionId }, config);
  }, 30000);

  it('1b. performs live MDN search flow using Screenpool MCP tools', async () => {
    const config = mcpServer.currentConfig;
    const sessionRes = await handleSessionCreate(
      pool,
      { policy: { targets: { css: true } } },
      config,
    );
    const sessionId = sessionRes.id;
    const session = pool.sessions.get(sessionId)!;
    await session.goto('https://developer.mozilla.org/en-US/', { waitUntil: 'domcontentloaded' });

    const obs1 = await handleObserve(pool, { sessionId, elements: true }, config);
    const searchBtn = obs1.elements?.find(
      (e) => (e.role === 'button' || e.tag === 'button') && (e.name?.includes('Search') || e.text?.includes('Search')),
    );

    if (searchBtn) {
      await handleAct(
        pool,
        {
          sessionId,
          actions: [
            {
              type: 'click',
              target: { by: 'element-id', value: searchBtn.id, observationId: obs1.id },
            },
            { type: 'wait', durationMs: 1000 },
          ],
        },
        config,
      );
    } else {
      await handleAct(
        pool,
        {
          sessionId,
          actions: [
            { type: 'press', key: '/' },
            { type: 'wait', durationMs: 1000 },
          ],
        },
        config,
      );
    }

    const obs2 = await handleObserve(pool, { sessionId, elements: true }, config);
    const searchInput = obs2.elements?.find((e) => e.role === 'textbox' || e.tag === 'input');

    const actRes = await handleAct(
      pool,
      {
        sessionId,
        actions: [
          {
            type: 'fill',
            target: searchInput
              ? { by: 'element-id', value: searchInput.id, observationId: obs2.id }
              : { by: 'role', role: 'textbox' },
            value: 'fetch',
          },
          {
            type: 'press',
            key: 'Enter',
          },
          {
            type: 'wait',
            durationMs: 2000,
          },
        ],
      },
      config,
    );

    if (!actRes.success) {
      console.log('Test 1b Act Error:', JSON.stringify(actRes.steps, null, 2));
    }

    expect(actRes.success).toBe(true);
    const activePage = session.registry.getActive();
    expect(activePage?.url.toLowerCase()).toContain('fetch');
    await handleSessionClose(pool, { sessionId }, config);
  }, 60000);

  // Requirement 2: Target Policy Error Message Payload Example
  it('2. returns detailed payload example in error message when target policy is disallowed', async () => {
    const config = mcpServer.currentConfig;
    const sessionRes = await handleSessionCreate(pool, {}, config);
    const sessionId = sessionRes.id;
    const session = pool.sessions.get(sessionId)!;
    await session.goto(`${baseUrl}/shadow-dom`);

    // Call by: "css" without enabling css policy
    const actRes = await handleAct(
      pool,
      {
        sessionId,
        actions: [
          {
            type: 'click',
            target: { by: 'css', value: '#shadow-btn' },
          },
        ],
      },
      config,
    );

    expect(actRes.success).toBe(false);
    expect(actRes.steps[0].error?.code).toBe('ACTION_NOT_ALLOWED');
    expect(actRes.steps[0].error?.message).toContain('Example payload for screenpool_session_create');
    expect(actRes.steps[0].error?.message).toContain('"css": true');

    // Now enable policy dynamically and verify success
    const actSuccess = await handleAct(
      pool,
      {
        sessionId,
        policy: { targets: { css: true } },
        actions: [
          {
            type: 'click',
            target: { by: 'css', value: '#shadow-btn' },
          },
        ],
      },
      config,
    );
    expect(actSuccess.success).toBe(true);
    await handleSessionClose(pool, { sessionId }, config);
  });

  // Requirement 4: Wait Action durationMs Consistency
  it('4. wait action with durationMs waits at least specified time and reports durationMs accurately', async () => {
    const config = mcpServer.currentConfig;
    const start = Date.now();
    const runRes = await handleRun(
      pool,
      {
        url: `${baseUrl}/shadow-dom`,
        actions: [
          {
            type: 'wait',
            durationMs: 1000,
          },
        ],
      },
      config,
    );
    const elapsed = Date.now() - start;

    expect(runRes.success).toBe(true);
    expect(elapsed).toBeGreaterThanOrEqual(950);
    expect(runRes.steps[0].durationMs).toBeGreaterThanOrEqual(950);
  });

  // Requirement 5: Video Manifest Artifacts (.webm artifact in manifest.artifacts)
  it('5. video: true recording includes .webm file in manifest.artifacts and counts.videos >= 1', async () => {
    const config = mcpServer.currentConfig;
    const recStart = await handleRecordStart(
      pool,
      {
        url: `${baseUrl}/shadow-dom`,
        options: { video: true, preset: 'visual' },
      },
      config,
    );

    const sessionId = recStart.sessionId;
    await handleAct(
      pool,
      {
        sessionId,
        actions: [{ type: 'wait', durationMs: 200 }],
      },
      config,
    );

    const recStop = await handleRecordStop(pool, { sessionId, closeSession: true }, config);
    expect(recStop.success).toBe(true);
    expect(recStop.manifest.counts.videos).toBeGreaterThanOrEqual(1);

    const videoArtifact = recStop.manifest.artifacts.find((a: any) => a.type === 'video');
    expect(videoArtifact).toBeDefined();
    expect(videoArtifact.path).toContain('.webm');
    expect(existsSync(videoArtifact.path)).toBe(true);
  });

  // Requirement 6: Debug Preset Error Artifacts (Screenshot & HTML on error)
  it('6. preset: "debug" generates screenshot and HTML artifacts on action failure', async () => {
    const config = mcpServer.currentConfig;
    const recStart = await handleRecordStart(
      pool,
      {
        url: `${baseUrl}/shadow-dom`,
        options: { preset: 'debug' },
      },
      config,
    );

    const sessionId = recStart.sessionId;
    await handleAct(
      pool,
      {
        sessionId,
        actions: [
          {
            type: 'click',
            target: { by: 'role', role: 'button', name: 'Non Existent Button 999' },
          },
        ],
      },
      config,
    );

    const recStop = await handleRecordStop(pool, { sessionId, closeSession: true }, config);
    expect(recStop.success).toBe(true);

    const screenshotErr = recStop.manifest.artifacts.find(
      (a: any) => a.type === 'screenshot',
    );
    const htmlErr = recStop.manifest.artifacts.find(
      (a: any) => a.type === 'html',
    );

    expect(screenshotErr).toBeDefined();
    expect(htmlErr).toBeDefined();
    expect(existsSync(screenshotErr.path)).toBe(true);
    expect(existsSync(htmlErr.path)).toBe(true);
  });

  // Requirement 7: Observe Visibility & Viewport Accuracy
  it('7. elements with negative bounds or scrolled off-screen are reported with visible: false and inViewport: false', async () => {
    const config = mcpServer.currentConfig;
    const sessionRes = await handleSessionCreate(pool, {}, config);
    const sessionId = sessionRes.id;
    const session = pool.sessions.get(sessionId)!;
    await session.goto(`${baseUrl}/visibility-test`);

    const obs = await handleObserve(pool, { sessionId, elements: true }, config);
    const offscreenBtn = obs.elements?.find((e) => e.name === 'Skip to search' || e.text === 'Skip to search');
    const visibleBtn = obs.elements?.find((e) => e.name === 'Visible Btn' || e.text === 'Visible Btn');

    expect(offscreenBtn).toBeDefined();
    expect(offscreenBtn?.visible).toBe(false);
    expect(offscreenBtn?.inViewport).toBe(false);

    expect(visibleBtn).toBeDefined();
    expect(visibleBtn?.visible).toBe(true);
    expect(visibleBtn?.inViewport).toBe(true);

    await handleSessionClose(pool, { sessionId }, config);
  });

  // Requirement 8: TTL Session Recording Finalization & Closed Manifest Retrieval
  it('8. active recording on TTL expired session is finalized and record_stop returns manifest', async () => {
    const config = mcpServer.currentConfig;
    const recStart = await handleRecordStart(
      pool,
      {
        url: `${baseUrl}/shadow-dom`,
        sessionOptions: { ttlMs: 4000 },
        options: { preset: 'debug' },
      },
      config,
    );

    const sessionId = recStart.sessionId;
    const session = pool.sessions.get(sessionId);
    if (session) {
      (session as any).createdAt = new Date(Date.now() - 10000);
    }
    // Wait for TTL check loop
    await new Promise((r) => setTimeout(r, 1500));

    // Session is closed due to TTL, but record_stop retrieves manifest
    const recStop = await handleRecordStop(pool, { sessionId, closeSession: true }, config);
    expect(recStop.success).toBe(true);
    expect(recStop.manifest).toBeDefined();
    expect(recStop.manifest.artifacts).toBeDefined();

    // Calling closeSession: true multiple times is idempotent
    const recStopAgain = await handleRecordStop(pool, { sessionId, closeSession: true }, config);
    expect(recStopAgain.success).toBe(true);
  });

  // Requirement 9: Help Documentation Completeness
  it('9. handleHelp returns action schemas, shadow DOM support, and target policy enablement example', async () => {
    const helpDoc = await handleHelp({ topic: 'all' });
    expect(helpDoc.shadowDom).toBeDefined();
    expect(helpDoc.actions).toBeDefined();
    expect(helpDoc.actions.click).toBeDefined();
    expect(helpDoc.policy.enablementExample).toBeDefined();
  });
});
