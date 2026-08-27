import { describe, it, expect, afterEach } from 'vitest';
import { ScreenPool } from '../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { handleCdpSend } from '../src/mcp/handlers.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Chrome DevTools & CDP (Chrome DevTools Protocol) Support', () => {
  let pool: ScreenPool;

  afterEach(async () => {
    if (pool) {
      await pool.stop().catch(() => undefined);
    }
  });

  it('exposes WebSocket endpoint and DevTools inspection info from session', async () => {
    pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
    });

    await pool.start();

    const ws = pool.getWSEndpoint();
    expect(ws).toBeDefined();
    expect(ws).toMatch(/^ws:\/\//);

    const session = await pool.sessions.create();
    expect(session.id).toBeDefined();

    const devtools = await session.getDevTools();
    expect(devtools.wsEndpoint).toBe(ws);
    expect(devtools.inspectUrl).toContain('devtools://devtools/bundled/inspector.html');
    expect(devtools.targetId).toBeDefined();
    expect(devtools.pageId).toBe(session.mainPageId);

    const info = session.getInfo();
    expect(info.devtools).toBeDefined();
    expect(info.devtools?.wsEndpoint).toBe(ws);
    expect(info.devtools?.inspectUrl).toContain('devtools://devtools/bundled/inspector.html');

    await session.close();
  });

  it('creates direct CDPSession and sends CDP commands via sendCDP', async () => {
    pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
    });

    await pool.start();

    const session = await pool.sessions.create();

    // 1. Test session.sendCDP with Emulation command
    const metricsResult = await session.sendCDP('Page.getLayoutMetrics');
    expect(metricsResult).toBeDefined();
    expect(metricsResult.contentSize || metricsResult.layoutViewport).toBeDefined();

    // 2. Test session.createCDPSession for event listening
    const cdpClient = await session.createCDPSession();
    expect(cdpClient).toBeDefined();

    let domEnabled = false;
    await cdpClient.send('DOM.enable').then(() => {
      domEnabled = true;
    });
    expect(domEnabled).toBe(true);

    const doc = await cdpClient.send('DOM.getDocument');
    expect(doc.root).toBeDefined();
    expect(doc.root.nodeId).toBeGreaterThanOrEqual(1);

    await cdpClient.detach().catch(() => undefined);
    await session.close();
  });

  it('executes CDP commands through MCP handleCdpSend handler', async () => {
    pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
    });

    await pool.start();

    const session = await pool.sessions.create();

    const mcpResult = await handleCdpSend(pool, {
      sessionId: session.id,
      method: 'Page.getLayoutMetrics',
    });

    expect(mcpResult.success).toBe(true);
    expect(mcpResult.sessionId).toBe(session.id);
    expect(mcpResult.method).toBe('Page.getLayoutMetrics');
    expect(mcpResult.result).toBeDefined();

    await session.close();
  });

  it('launches browser with custom remoteDebuggingPort', async () => {
    const port = 9333;
    pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
      remoteDebuggingPort: port,
    });

    await pool.start();

    // Connect to port via HTTP to check /json/version
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.Browser).toBeDefined();
    expect(json.webSocketDebuggerUrl).toBeDefined();
  });
});
