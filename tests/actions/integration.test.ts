import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { existsSync } from 'node:fs';
import { ScreenPool } from '../../src/ScreenPool.js';

describe('Browser Actions & Recording Integration Tests', () => {
  let server: Server;
  let serverUrl: string;
  let pool: ScreenPool;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url || '/';
      res.setHeader('Content-Type', 'text/html');

      if (url === '/main') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Main Page</title></head>
            <body>
              <h1>Welcome to Main Page</h1>
              <a id="target-blank-link" href="/popup" target="_blank">Target Blank Link</a>
              <button id="win-open-btn" onclick="window.open('/popup', '_blank')">Window Open Button</button>
              <button id="oauth-btn" onclick="window.open('/popup-auto-close', '_blank')">Login with GitHub</button>
              <button id="multi-popup-btn" onclick="window.open('/popup', '_blank'); window.open('/popup', '_blank');">Multi Popup</button>
              <input id="username" placeholder="Username" />
              <button id="submit-btn">Submit</button>
            </body>
          </html>
        `);
      } else if (url === '/popup') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Popup Page</title></head>
            <body>
              <h1>GitHub Login Popup</h1>
              <input id="popup-user" aria-label="Username" />
              <button id="continue-btn">Continue</button>
            </body>
          </html>
        `);
      } else if (url === '/popup-auto-close') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>OAuth Processing</title></head>
            <body>
              <p>Authenticating...</p>
              <script>
                setTimeout(() => {
                  window.close();
                }, 200);
              </script>
            </body>
          </html>
        `);
      } else {
        res.end('<html><body>Default</body></html>');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        serverUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    pool = new ScreenPool({ poolSize: 2 });
    await pool.start();
  });

  afterEach(async () => {
    await pool.stop().catch(() => undefined);
  });

  test('Session creation, page registry, observe and action execution', async () => {
    const session = await pool.sessions.create();
    expect(session.id).toBeDefined();

    await session.goto(`${serverUrl}/main`);

    const pages = await session.pages.list();
    expect(pages.length).toBe(1);
    expect(pages[0].url).toContain('/main');

    const obs = await session.observe({ screenshot: false, html: 'compact' });
    expect(obs.id).toBeDefined();
    expect(obs.elements?.length).toBeGreaterThan(0);

    const actResult = await session.act({
      observationId: obs.id,
      actions: [
        {
          type: 'fill',
          target: { by: 'label', value: 'Username' },
          value: 'test-user',
        },
      ],
    });

    expect(actResult.success).toBe(true);
    expect(actResult.steps[0].status).toBe('success');

    await session.close();
  });

  test('Handling target="_blank" and window.open popups with expectation and opener activation fallback', async () => {
    const session = await pool.sessions.create({
      pages: {
        maxPages: 5,
        onPopup: 'register',
        onActivePageClosed: 'activate-opener',
      },
    });

    await session.goto(`${serverUrl}/main`);

    // Click button opening popup with expectation
    const loginResult = await session.act({
      actions: [
        {
          type: 'click',
          target: { by: 'role', role: 'button', name: 'Window Open Button' },
          expect: {
            page: {
              event: 'popup',
              alias: 'github-login',
              activate: true,
              timeoutMs: 5_000,
            },
          },
        },
      ],
    });

    expect(loginResult.success).toBe(true);
    expect(loginResult.steps[0].openedPages?.length).toBe(1);

    const popupSummary = loginResult.steps[0].openedPages![0];
    expect(popupSummary.alias).toBe('github-login');
    expect(popupSummary.openerPageId).toBe(loginResult.initialPageId);

    // Verify active page switched to popup
    expect(session.activePageId).toBe(popupSummary.id);

    // Observe popup page using alias
    const popupObs = await session.observe({
      page: { by: 'alias', value: 'github-login' },
    });
    expect(popupObs.pageId).toBe(popupSummary.id);

    // Close popup
    await session.pages.close({ by: 'alias', value: 'github-login' });

    // Verify active page falls back to opener (main page)
    expect(session.activePageId).toBe(loginResult.initialPageId);

    await session.close();
  });

  test('Handling self-closing OAuth popups', async () => {
    const session = await pool.sessions.create();
    await session.goto(`${serverUrl}/main`);

    const actResult = await session.act({
      actions: [
        {
          type: 'click',
          target: { by: 'role', role: 'button', name: 'Login with GitHub' },
          expect: {
            page: {
              event: 'popup',
              alias: 'oauth-popup',
              activate: true,
            },
          },
        },
        {
          type: 'page.wait',
          condition: {
            type: 'closed',
            page: { by: 'alias', value: 'oauth-popup' },
          },
        },
      ],
    });

    expect(actResult.success).toBe(true);

    await session.close();
  });

  test('Stateless run API with recording enabled', async () => {
    const runResult = await pool.run({
      url: `${serverUrl}/main`,
      actions: [
        {
          type: 'click',
          target: { by: 'role', role: 'button', name: 'Window Open Button' },
          expect: {
            page: {
              event: 'popup',
              alias: 'popup-alias',
            },
          },
        },
      ],
      recording: {
        preset: 'actions',
        screenshots: 'each-action',
      },
    });

    expect(runResult.success).toBe(true);
    expect(runResult.recordingId).toBeDefined();
  });

  test('Visual video recording produces interactive HTML5 video presentation player artifact', async () => {
    const session = await pool.sessions.create({ pages: { maxPages: 2 } });
    const recording = await session.record.start({ preset: 'visual', video: true });
    await session.goto(`${serverUrl}/main`);
    await session.act({
      actions: [{ type: 'wait', durationMs: 150 }],
    });
    const manifest = await recording.stop();
    expect(manifest.artifacts.some((a) => a.type === 'video')).toBe(true);
    const videoArt = manifest.artifacts.find((a) => a.type === 'video')!;
    expect(['video/webm', 'text/html']).toContain(videoArt.mimeType);
    expect(existsSync(videoArt.path)).toBe(true);
    await session.close();
  });

  test('Consecutive link clicks with navigation stabilize context automatically without throwing context destroyed error', async () => {
    const session = await pool.sessions.create({ pages: { maxPages: 2 } });
    await session.goto(`${serverUrl}/main`);
    const actResult = await session.act({
      actions: [
        {
          type: 'click',
          target: { by: 'text', value: 'Target Blank Link' },
        },
        {
          type: 'wait',
          durationMs: 100,
        },
      ],
    });
    expect(actResult.success).toBe(true);
    await session.close();
  });
});
