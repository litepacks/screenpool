import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server } from 'node:http';
import { ScreenPool } from '../../src/ScreenPool.js';
import { getChromiumPath, hasChromium } from '../helpers/chromium.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Stealth Mode Browser Automation Detection Evasion Tests', () => {
  let server: Server;
  let serverUrl: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end(`
        <!DOCTYPE html>
        <html>
          <head><title>Stealth Detection Test</title></head>
          <body>
            <h1>Fingerprint Detection</h1>
            <pre id="fp-data"></pre>
            <script>
              const fp = {
                webdriver: navigator.webdriver,
                hasChrome: typeof window.chrome !== 'undefined',
                pluginsLength: navigator.plugins.length,
                languages: navigator.languages,
              };
              document.getElementById('fp-data').textContent = JSON.stringify(fp);
            </script>
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

  it('evades navigator.webdriver automation indicator when stealth mode is enabled', async () => {
    const stealthPool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      stealth: true,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    try {
      await stealthPool.start();
      const session = await stealthPool.sessions.create();

      try {
        await session.goto(`${serverUrl}/detect`);
        const rawPage = (session as any).registry.getActive()?.rawPage;
        const fp = await rawPage.evaluate(() => {
          return {
            webdriver: (navigator as any).webdriver,
            hasChrome: typeof (window as any).chrome !== 'undefined',
            languages: navigator.languages,
          };
        });

        // In stealth mode, navigator.webdriver is evaded (false or undefined)
        expect(fp.webdriver).toBeFalsy();
        expect(fp.hasChrome).toBe(true);
        expect(fp.languages.length).toBeGreaterThan(0);
      } finally {
        await session.close();
      }
    } finally {
      await stealthPool.stop();
    }
  });

  it('preserves navigator.webdriver when disabledEvasions includes navigator.webdriver', async () => {
    const customStealthPool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      stealth: {
        enabled: true,
        disabledEvasions: ['navigator.webdriver'],
      },
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    try {
      await customStealthPool.start();
      const session = await customStealthPool.sessions.create();

      try {
        await session.goto(`${serverUrl}/detect`);
        const rawPage = (session as any).registry.getActive()?.rawPage;
        const fp = await rawPage.evaluate(() => {
          return {
            webdriver: (navigator as any).webdriver,
          };
        });

        // When navigator.webdriver evasion is disabled, headless Chromium exposes webdriver: true
        expect(fp.webdriver).toBe(true);
      } finally {
        await session.close();
      }
    } finally {
      await customStealthPool.stop();
    }
  });
});
