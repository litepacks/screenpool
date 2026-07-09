import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('extract', () => {
  it('extracts structured data from HTML content', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
    });

    await pool.start();

    try {
      const html = `
        <html>
          <body>
            <h1>Main Title</h1>
            <div class="product-card">
              <span class="title">Product A</span>
              <span class="price">$19.99</span>
            </div>
            <div class="product-card">
              <span class="title">Product B</span>
              <span class="price">$29.99</span>
            </div>
          </body>
        </html>
      `;

      const rules = `
        heading: "h1" | text | trim
        products[]: ".product-card" {
          name: ".title" | text | trim
          price: ".price" | text | trim | replace("$", "") | float
        }
      `;

      const result = await pool.extract({
        html,
        rules,
      });

      expect(result.data).toEqual({
        heading: 'Main Title',
        products: [
          { name: 'Product A', price: 19.99 },
          { name: 'Product B', price: 29.99 },
        ],
      });
      expect(result.contentType).toBe('application/json');
      expect(result.type).toBe('extract');
      expect(result.jobId).toBeTruthy();
    } finally {
      await pool.stop();
    }
  });
});
