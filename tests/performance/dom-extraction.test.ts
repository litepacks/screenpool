import { describe, it, expect } from 'vitest';
import { ScreenPool } from '../../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('DOM Extraction & Observation Optimization', () => {
  it('extracts interactive elements rapidly across deeply nested DOM and Shadow DOM trees', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    await pool.start();

    try {
      const session = await pool.sessions.create();

      try {
        const html = `
          <!DOCTYPE html>
          <html>
            <body>
              <div id="container">
                ${Array.from({ length: 50 }, (_, i) => `
                  <div class="card" id="card_${i}">
                    <button id="btn_${i}">Button ${i}</button>
                    <a href="#link_${i}" role="link">Link ${i}</a>
                    <input type="text" id="input_${i}" placeholder="Input ${i}" />
                  </div>
                `).join('')}
                <div id="shadow-host"></div>
              </div>
              <script>
                const host = document.getElementById('shadow-host');
                const root = host.attachShadow({ mode: 'open' });
                root.innerHTML = '<button id="shadow-btn">Shadow Button</button><input type="text" id="shadow-input" placeholder="Shadow Input" />';
              </script>
            </body>
          </html>
        `;

        const rawPage = (session as any).registry.getActive()?.rawPage;
        await rawPage.setContent(html);

        const t0 = performance.now();
        const obs = await session.observe({ maxElements: 200 });
        const duration = performance.now() - t0;

        expect(obs.elements).toBeDefined();
        expect(obs.elements!.length).toBeGreaterThanOrEqual(150);

        // Verify shadow element discovery
        const shadowElements = obs.elements!.filter((e) => e.isShadow);
        expect(shadowElements.length).toBe(2);
        expect(shadowElements.some((e) => e.name === 'Shadow Button')).toBe(true);

        // Verify bounding boxes and roles are properly extracted
        const firstBtn = obs.elements!.find((e) => e.name === 'Button 0');
        expect(firstBtn).toBeDefined();
        expect(firstBtn!.tag).toBe('button');
        expect(firstBtn!.interactable).toBe(true);
        expect(firstBtn!.box).toBeDefined();
        expect(firstBtn!.box!.width).toBeGreaterThan(0);
      } finally {
        await session.close();
      }
    } finally {
      await pool.stop();
    }
  });
});
