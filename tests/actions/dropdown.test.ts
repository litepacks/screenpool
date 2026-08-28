import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScreenPool } from '../../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';
import { handleRun } from '../../src/mcp/handlers.js';
import type { McpServerConfig } from '../../src/mcp/config.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Dropdown & Menu Interaction Tests', () => {
  let server: Server;
  let serverUrl: string;
  let pool: ScreenPool;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const url = req.url || '/';
      res.setHeader('Content-Type', 'text/html; charset=utf-8');

      if (url === '/dropdown-demo') {
        res.end(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Dropdown Interaction Demo</title>
              <style>
                body { font-family: sans-serif; padding: 20px; }
                .hidden { display: none !important; }
                
                /* Custom Dropdown Styles */
                .dropdown { position: relative; display: inline-block; margin-bottom: 20px; }
                .dropdown-btn { padding: 10px 16px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; }
                .dropdown-menu {
                  position: absolute;
                  top: 100%;
                  left: 0;
                  background: white;
                  border: 1px solid #e2e8f0;
                  box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
                  border-radius: 6px;
                  min-width: 180px;
                  z-index: 10;
                  margin-top: 4px;
                }
                .dropdown-item {
                  padding: 8px 12px;
                  cursor: pointer;
                  display: block;
                  border: none;
                  background: transparent;
                  width: 100%;
                  text-align: left;
                }
                .dropdown-item:hover, .dropdown-item.focused { background: #f1f5f9; color: #0284c7; }

                /* Selected status indicators */
                .status-box { margin-top: 10px; padding: 8px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; }
              </style>
            </head>
            <body>
              <h1>Interactive Dropdown Demo Page</h1>

              <!-- 1. Standard Click-to-Open Custom Dropdown -->
              <section id="custom-select-section">
                <h2>Custom Select Dropdown</h2>
                <div class="dropdown">
                  <button id="fruit-dropdown-btn" class="dropdown-btn" onclick="toggleDropdown()">Select a Fruit</button>
                  <div id="fruit-menu" class="dropdown-menu hidden" role="menu">
                    <button id="opt-apple" class="dropdown-item" role="menuitem" onclick="selectFruit('Apple')">🍎 Apple</button>
                    <button id="opt-banana" class="dropdown-item" role="menuitem" onclick="selectFruit('Banana')">🍌 Banana</button>
                    <button id="opt-strawberry" class="dropdown-item" role="menuitem" onclick="selectFruit('Strawberry')">🍓 Strawberry</button>
                  </div>
                </div>
                <div id="selected-fruit-result" class="status-box">No fruit selected</div>
              </section>

              <!-- 2. Async/Delayed Dropdown Menu -->
              <section id="async-section">
                <h2>Async Loaded Dropdown</h2>
                <button id="async-btn" class="dropdown-btn" onclick="openAsyncMenu()">Load Remote Options</button>
                <div id="async-menu" class="dropdown-menu hidden">
                  <div id="async-loading">Loading options...</div>
                  <div id="async-items" class="hidden">
                    <button id="plan-starter" class="dropdown-item" onclick="selectPlan('Starter Plan')">Starter Plan</button>
                    <button id="plan-enterprise" class="dropdown-item" onclick="selectPlan('Enterprise Plan')">Enterprise Plan</button>
                  </div>
                </div>
                <div id="selected-plan-result" class="status-box">No plan selected</div>
              </section>

              <!-- 3. Native HTML Select Element -->
              <section id="native-select-section">
                <h2>Native Select</h2>
                <select id="country-select" onchange="document.getElementById('selected-country-result').innerText = 'Country: ' + this.value">
                  <option value="us">United States</option>
                  <option value="de">Germany</option>
                  <option value="tr">Turkey</option>
                  <option value="jp">Japan</option>
                </select>
                <div id="selected-country-result" class="status-box">Country: us</div>
              </section>

              <!-- 4. Keyboard Driven Dropdown -->
              <section id="keyboard-section">
                <h2>Keyboard Dropdown</h2>
                <div class="dropdown">
                  <button id="kb-dropdown-btn" class="dropdown-btn" tabindex="0">Keyboard Menu</button>
                  <div id="kb-menu" class="dropdown-menu hidden">
                    <div id="kb-opt-1" class="dropdown-item">Item 1</div>
                    <div id="kb-opt-2" class="dropdown-item">Item 2</div>
                    <div id="kb-opt-3" class="dropdown-item">Item 3</div>
                  </div>
                </div>
                <div id="selected-kb-result" class="status-box">No KB item selected</div>
              </section>

              <script>
                function toggleDropdown() {
                  const menu = document.getElementById('fruit-menu');
                  menu.classList.toggle('hidden');
                }

                function selectFruit(name) {
                  document.getElementById('fruit-dropdown-btn').innerText = name;
                  document.getElementById('selected-fruit-result').innerText = 'Selected: ' + name;
                  document.getElementById('fruit-menu').classList.add('hidden');
                }

                function openAsyncMenu() {
                  const menu = document.getElementById('async-menu');
                  menu.classList.remove('hidden');
                  setTimeout(() => {
                    document.getElementById('async-loading').classList.add('hidden');
                    document.getElementById('async-items').classList.remove('hidden');
                  }, 150);
                }

                function selectPlan(plan) {
                  document.getElementById('selected-plan-result').innerText = 'Plan: ' + plan;
                  document.getElementById('async-menu').classList.add('hidden');
                }

                // Keyboard handling
                const kbBtn = document.getElementById('kb-dropdown-btn');
                const kbMenu = document.getElementById('kb-menu');
                let activeIndex = -1;
                const kbItems = [
                  document.getElementById('kb-opt-1'),
                  document.getElementById('kb-opt-2'),
                  document.getElementById('kb-opt-3')
                ];

                kbBtn.addEventListener('click', () => {
                  kbMenu.classList.toggle('hidden');
                  activeIndex = -1;
                });

                kbBtn.addEventListener('keydown', (e) => {
                  if (kbMenu.classList.contains('hidden') && (e.key === 'ArrowDown' || e.key === 'Enter')) {
                    kbMenu.classList.remove('hidden');
                    activeIndex = 0;
                    updateKbFocus();
                    e.preventDefault();
                    return;
                  }
                  if (!kbMenu.classList.contains('hidden')) {
                    if (e.key === 'ArrowDown') {
                      activeIndex = (activeIndex + 1) % kbItems.length;
                      updateKbFocus();
                      e.preventDefault();
                    } else if (e.key === 'ArrowUp') {
                      activeIndex = (activeIndex - 1 + kbItems.length) % kbItems.length;
                      updateKbFocus();
                      e.preventDefault();
                    } else if (e.key === 'Enter' && activeIndex >= 0) {
                      const selected = kbItems[activeIndex].innerText;
                      document.getElementById('selected-kb-result').innerText = 'KB Selected: ' + selected;
                      kbMenu.classList.add('hidden');
                      e.preventDefault();
                    }
                  }
                });

                function updateKbFocus() {
                  kbItems.forEach((item, idx) => {
                    if (idx === activeIndex) {
                      item.classList.add('focused');
                    } else {
                      item.classList.remove('focused');
                    }
                  });
                }
              </script>
            </body>
          </html>
        `);
      } else {
        res.statusCode = 404;
        res.end('Not Found');
      }
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          serverUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      headless: 'shell',
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });
    await pool.start();
  });

  afterEach(async () => {
    if (pool) {
      await pool.stop();
    }
  });

  test('Flow 1: Clicks custom dropdown trigger, then clicks option in opened menu', async () => {
    const session = await pool.sessions.create({
      policy: {
        targets: { css: true, semantic: true, elementId: true, point: true },
      },
    });
    await session.goto(`${serverUrl}/dropdown-demo`);

    // 1. Click dropdown trigger
    // 2. Click option "Banana" inside the opened dropdown menu
    const actResult = await session.act([
      {
        type: 'click',
        target: { by: 'css', value: '#fruit-dropdown-btn' },
      },
      {
        type: 'click',
        target: { by: 'css', value: '#opt-banana' },
      },
    ]);

    expect(actResult.success).toBe(true);
    expect(actResult.steps).toHaveLength(2);
    expect(actResult.steps[0]?.status).toBe('success');
    expect(actResult.steps[1]?.status).toBe('success');

    // Verify DOM state
    const resultText = await (session as any).registry.getMain().rawPage.evaluate(
      () => document.getElementById('selected-fruit-result')?.innerText,
    );
    expect(resultText).toBe('Selected: Banana');

    await session.close();
  });

  test('Flow 2: Dynamic / Async dropdown with wait condition before clicking option', async () => {
    const session = await pool.sessions.create({
      policy: {
        targets: { css: true, semantic: true, elementId: true, point: true },
      },
    });
    await session.goto(`${serverUrl}/dropdown-demo`);

    const actResult = await session.act([
      {
        type: 'click',
        target: { by: 'css', value: '#async-btn' },
      },
      {
        type: 'wait',
        selector: { by: 'css', value: '#plan-enterprise' },
        state: 'visible',
        timeoutMs: 3000,
      },
      {
        type: 'click',
        target: { by: 'css', value: '#plan-enterprise' },
      },
    ]);

    expect(actResult.success).toBe(true);
    expect(actResult.steps).toHaveLength(3);

    const planText = await (session as any).registry.getMain().rawPage.evaluate(
      () => document.getElementById('selected-plan-result')?.innerText,
    );
    expect(planText).toBe('Plan: Enterprise Plan');

    await session.close();
  });

  test('Flow 3: Native HTML <select> element interaction via select action', async () => {
    const session = await pool.sessions.create({
      policy: {
        targets: { css: true, semantic: true, elementId: true, point: true },
      },
    });
    await session.goto(`${serverUrl}/dropdown-demo`);

    const actResult = await session.act([
      {
        type: 'select',
        target: { by: 'css', value: '#country-select' },
        values: ['tr'],
      },
    ]);

    expect(actResult.success).toBe(true);

    const countryText = await (session as any).registry.getMain().rawPage.evaluate(
      () => document.getElementById('selected-country-result')?.innerText,
    );
    expect(countryText).toBe('Country: tr');

    await session.close();
  });

  test('Flow 4: Keyboard navigation in dropdown (ArrowDown + Enter)', async () => {
    const session = await pool.sessions.create({
      policy: {
        targets: { css: true, semantic: true, elementId: true, point: true },
      },
    });
    await session.goto(`${serverUrl}/dropdown-demo`);

    const actResult = await session.act([
      {
        type: 'click',
        target: { by: 'css', value: '#kb-dropdown-btn' },
      },
      {
        type: 'press',
        key: 'ArrowDown',
      },
      {
        type: 'press',
        key: 'ArrowDown',
      },
      {
        type: 'press',
        key: 'Enter',
      },
    ]);

    expect(actResult.success).toBe(true);

    const kbResult = await (session as any).registry.getMain().rawPage.evaluate(
      () => document.getElementById('selected-kb-result')?.innerText,
    );
    expect(kbResult).toBe('KB Selected: Item 2');

    await session.close();
  });

  test('Flow 5: Stateful Observe -> Act -> Observe workflow with element IDs', async () => {
    const session = await pool.sessions.create({
      policy: {
        targets: { css: true, semantic: true, elementId: true, point: true },
      },
    });
    await session.goto(`${serverUrl}/dropdown-demo`);

    // Step 1: Initial observation to find dropdown button
    const obs1 = await session.observe();
    expect(obs1.elements.length).toBeGreaterThan(0);
    const fruitBtnEl = obs1.elements.find(
      (el) => el.tag === 'button' && (el.name?.includes('Select a Fruit') || el.text?.includes('Select a Fruit')),
    );
    expect(fruitBtnEl).toBeDefined();

    // Step 2: Act click on button using element-id
    const act1 = await session.act([
      {
        type: 'click',
        target: {
          by: 'element-id',
          value: fruitBtnEl!.id,
          observationId: obs1.id,
        },
      },
    ]);
    expect(act1.success).toBe(true);

    // Step 3: Second observation to discover newly rendered menu options
    const obs2 = await session.observe();
    const strawberryEl = obs2.elements.find(
      (el) => el.tag === 'button' && (el.name?.includes('Strawberry') || el.text?.includes('Strawberry')),
    );
    expect(strawberryEl).toBeDefined();

    // Step 4: Act click on Strawberry option
    const act2 = await session.act([
      {
        type: 'click',
        target: {
          by: 'element-id',
          value: strawberryEl!.id,
          observationId: obs2.id,
        },
      },
    ]);
    expect(act2.success).toBe(true);

    // Step 5: Verify final state
    const resultText = await (session as any).registry.getMain().rawPage.evaluate(
      () => document.getElementById('selected-fruit-result')?.innerText,
    );
    expect(resultText).toBe('Selected: Strawberry');

    await session.close();
  });

  test('Flow 6: Stateless handleRun execution with sequential dropdown actions', async () => {
    const mockMcpConfig: McpServerConfig = {
      defaultPreset: 'fast',
      allowLocalhost: true,
      maxPoolSize: 2,
      minPoolSize: 1,
      maxTtlMs: 60000,
      recordingsDir: '.screenpool/recordings',
      diagnostics: { enabled: false },
      video: { enabled: false },
      policy: { targets: { css: true, semantic: true, elementId: true, point: true } },
    };

    const runResult = await handleRun(
      pool,
      {
        url: `${serverUrl}/dropdown-demo`,
        policy: { targets: { css: true } },
        actions: [
          {
            type: 'click',
            target: { by: 'css', value: '#fruit-dropdown-btn' },
          },
          {
            type: 'click',
            target: { by: 'css', value: '#opt-apple' },
          },
        ],
      },
      mockMcpConfig,
    );

    expect(runResult.success).toBe(true);
    expect(runResult.steps).toHaveLength(2);
    expect(runResult.steps[0]?.status).toBe('success');
    expect(runResult.steps[1]?.status).toBe('success');
  });
});
