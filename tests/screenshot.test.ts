import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('screenshot', () => {
  it('returns PNG buffer with correct magic bytes', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
    });

    await pool.start();

    try {
      const result = await pool.screenshot({
        url: 'https://example.com',
        viewport: { width: 800, height: 600 },
        format: 'png',
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.buffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      expect(result.contentType).toBe('image/png');
      expect(result.type).toBe('screenshot');
      expect(result.jobId).toBeTruthy();
    } finally {
      await pool.stop();
    }
  });

  it('extracts element code when selector and includeElementHtml are provided', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
    });

    await pool.start();

    try {
      const result = await pool.screenshot({
        html: '<div id="target" style="padding:20px;background:red;"><h1>Hello Element</h1></div>',
        selector: '#target',
        includeElementHtml: true,
      });

      expect(result.buffer).toBeInstanceOf(Buffer);
      expect(result.buffer.length).toBeGreaterThan(0);
      expect(result.elementHtml).toContain('id="target"');
      expect(result.elementHtml).toContain('Hello Element');
    } finally {
      await pool.stop();
    }
  });
});
