import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('pdf', () => {
  it('returns PDF buffer with %PDF header', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
    });

    await pool.start();

    try {
      const result = await pool.pdf({
        url: 'https://example.com',
        viewport: { width: 800, height: 600 },
        pdf: { format: 'A4', printBackground: true },
      });

      expect(Buffer.isBuffer(result.buffer) || result.buffer instanceof Uint8Array).toBe(true);
      const buf = Buffer.from(result.buffer);
      expect(buf.length).toBeGreaterThan(0);
      expect(buf.subarray(0, 4).toString()).toBe('%PDF');
      expect(result.contentType).toBe('application/pdf');
      expect(result.type).toBe('pdf');
    } finally {
      await pool.stop();
    }
  });
});
