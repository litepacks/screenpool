import { describe, it, expect } from 'vitest';
import puppeteer from 'puppeteer-core';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('remote debugging and custom browser integration', () => {
  it('connects to an existing browser via browserURL', async () => {
    // 1. Launch a separate browser with remote-debugging port
    const port = 9223; // Use 9223 to avoid conflicts
    const externalBrowser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
      args: [`--remote-debugging-port=${port}`],
    });

    const browserURL = `http://localhost:${port}`;

    // 2. Initialize ScreenPool to connect to this browser
    const pool = new ScreenPool({
      browserURL,
      poolSize: 1,
    });

    await pool.start();

    try {
      const html = `<html><body><h1>Hello Remote URL</h1></body></html>`;
      const result = await pool.screenshot({
        html,
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('image/png');
    } finally {
      await pool.stop();
      await externalBrowser.close();
    }
  });

  it('connects to an existing browser via browserWSEndpoint', async () => {
    // 1. Launch a separate browser
    const externalBrowser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
    });

    const browserWSEndpoint = externalBrowser.wsEndpoint();

    // 2. Initialize ScreenPool to connect to this browser
    const pool = new ScreenPool({
      browserWSEndpoint,
      poolSize: 1,
    });

    await pool.start();

    try {
      const html = `<html><body><h1>Hello Remote WS</h1></body></html>`;
      const result = await pool.screenshot({
        html,
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('image/png');
    } finally {
      await pool.stop();
      await externalBrowser.close();
    }
  });

  it('uses a custom browserInstance directly', async () => {
    // 1. Launch a separate browser
    const externalBrowser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
    });

    // 2. Initialize ScreenPool to connect to this browser
    const pool = new ScreenPool({
      browserInstance: externalBrowser,
      poolSize: 1,
    });

    await pool.start();

    try {
      const html = `<html><body><h1>Hello Direct Browser</h1></body></html>`;
      const result = await pool.screenshot({
        html,
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.contentType).toBe('image/png');
    } finally {
      await pool.stop();
      await externalBrowser.close();
    }
  });
});
