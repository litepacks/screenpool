import { describe, it, expect, afterEach } from 'vitest';
import { ScreenPool } from '../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { handleModeSwitch, handleStateExport, handleStateImport } from '../src/mcp/handlers.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Dynamic Mode Switching & Profile State Hand-off', () => {
  let pool: ScreenPool;
  let tempProfileDir: string;

  afterEach(async () => {
    if (pool) {
      await pool.stop().catch(() => undefined);
    }
    if (tempProfileDir) {
      try {
        rmSync(tempProfileDir, { recursive: true, force: true });
      } catch {}
    }
  });

  it('switches between headless and headed mode on the fly while preserving persistent profile data', async () => {
    tempProfileDir = mkdtempSync(join(tmpdir(), 'sp-profile-'));

    // 1. Start pool in headless mode with persistent userDataDir
    pool = new ScreenPool({
      executablePath: chromiumPath,
      userDataDir: tempProfileDir,
      headless: true,
      poolSize: 1,
      allowLocalhost: true,
    });

    await pool.start();

    // 2. Set cookie/storage in persistent session
    const session1 = await pool.sessions.create({ persistent: true });
    await session1.goto('https://example.com');
    await session1.sendCDP('Network.setCookie', {
      name: 'auth_token',
      value: 'secret_token_12345',
      domain: '.example.com',
      path: '/',
    });

    // Verify cookie exists
    const export1 = await session1.exportState();
    const foundCookie = export1.cookies.find((c) => c.name === 'auth_token');
    expect(foundCookie).toBeDefined();
    expect(foundCookie?.value).toBe('secret_token_12345');
    await session1.close();

    // 3. Switch mode to headed (headless: false) dynamically
    await pool.switchMode({ headless: false });

    // 4. Create new session on the reconfigured browser with same profile
    const session2 = await pool.sessions.create({ persistent: true });
    await session2.goto('https://example.com');

    // Verify cookie persisted across process restart in the same userDataDir
    const export2 = await session2.exportState();
    const persistedCookie = export2.cookies.find((c) => c.name === 'auth_token');
    expect(persistedCookie).toBeDefined();
    expect(persistedCookie?.value).toBe('secret_token_12345');
    await session2.close();

    // 5. Switch back to headless
    await pool.switchMode({ headless: true });
    const session3 = await pool.sessions.create({ persistent: true });
    await session3.goto('https://example.com');
    const export3 = await session3.exportState();
    expect(export3.cookies.some((c) => c.name === 'auth_token')).toBe(true);
    await session3.close();
  });

  it('exports and imports session state across separate sessions', async () => {
    pool = new ScreenPool({
      executablePath: chromiumPath,
      headless: true,
      poolSize: 1,
      allowLocalhost: true,
    });

    await pool.start();

    // Session A: Set cookies and localStorage
    const sessionA = await pool.sessions.create();
    await sessionA.goto('https://example.com');
    await sessionA.sendCDP('Network.setCookie', {
      name: 'session_key',
      value: 'token_abc',
      domain: '.example.com',
      path: '/',
    });

    const stateA = await sessionA.exportState();
    expect(stateA.cookies.some((c) => c.name === 'session_key')).toBe(true);

    // Session B: Fresh session in isolated context
    const sessionB = await pool.sessions.create();
    await sessionB.goto('https://example.com');

    const stateBBefore = await sessionB.exportState();
    expect(stateBBefore.cookies.some((c) => c.name === 'session_key')).toBe(false);

    // Import state from A into B
    const importRes = await sessionB.importState(stateA);
    expect(importRes.importedCookies).toBeGreaterThanOrEqual(1);

    const stateBAfter = await sessionB.exportState();
    expect(stateBAfter.cookies.some((c) => c.name === 'session_key')).toBe(true);

    await sessionA.close();
    await sessionB.close();
  });

  it('handles mode_switch and state export/import via MCP handlers', async () => {
    pool = new ScreenPool({
      executablePath: chromiumPath,
      headless: true,
      poolSize: 1,
      allowLocalhost: true,
    });

    await pool.start();

    const session = await pool.sessions.create();
    await session.goto('https://example.com');

    // 1. Export state via MCP
    const exportRes = await handleStateExport(pool, {
      sessionId: session.id,
    });
    expect(exportRes.success).toBe(true);
    expect(exportRes.state).toBeDefined();

    // 2. Import state via MCP
    const importRes = await handleStateImport(pool, {
      sessionId: session.id,
      cookies: [{ name: 'custom_mcp_cookie', value: 'val123', domain: '.example.com', path: '/' }],
      localStorage: { testKey: 'testVal' },
    });
    expect(importRes.success).toBe(true);
    expect(importRes.importedCookies).toBe(1);

    // 3. Switch mode via MCP
    const switchRes = await handleModeSwitch(pool, {
      headless: true,
      devtools: false,
    });
    expect(switchRes.success).toBe(true);

    await session.close();
  });

  it('opens temporary headed window for user handoff and syncs back updated state', async () => {
    pool = new ScreenPool({
      executablePath: chromiumPath,
      headless: true,
      poolSize: 1,
      allowLocalhost: true,
    });

    await pool.start();

    const session = await pool.sessions.create();
    await session.goto('https://example.com');
    await session.sendCDP('Network.setCookie', {
      name: 'initial_cookie',
      value: 'hello_headless',
      domain: '.example.com',
      path: '/',
    });

    // Open headed handoff
    const handoff = await session.openHeadedHandoff({ url: 'https://example.com', autoSyncOnClose: true });
    expect(handoff.browser).toBeDefined();
    expect(handoff.page).toBeDefined();

    // Simulate user interaction in the headed window (e.g. login / new cookie)
    const headedCdp = await handoff.page.createCDPSession();
    await (headedCdp as any).send('Network.setCookie', {
      name: 'auth_from_user_interaction',
      value: 'logged_in_success',
      domain: '.example.com',
      path: '/',
    });
    await headedCdp.detach().catch(() => undefined);

    // Close handoff and auto-sync state
    const resultState = await handoff.close();
    expect(resultState.cookies.some((c) => c.name === 'auth_from_user_interaction')).toBe(true);

    // Check that headless session now has the new cookie automatically!
    const headlessState = await session.exportState();
    expect(headlessState.cookies.some((c) => c.name === 'auth_from_user_interaction')).toBe(true);

    await session.close();
  });
});
