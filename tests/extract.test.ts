import { describe, it, expect } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { InvalidRenderInputError } from '../src/errors.js';

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

  it('handles flat lists, optional fields, fallbacks, and string/number transformations', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
    });

    await pool.start();

    try {
      const html = `
        <html>
          <body>
            <div class="badge"> SPECIAL OFFER! </div>
            <ul class="tags">
              <li>Electronics</li>
              <li>Gadgets</li>
            </ul>
            <div class="score"> 8.5 </div>
          </body>
        </html>
      `;

      const rules = `
        badge: ".badge" | text | trim | lowercase
        badge_slug: ".badge" | text | trim | slugify
        missing_opt?: ".non-existent" | text
        fallback_val: ".non-existent" | text | fallback("Default Fallback")
        tags[]: ".tags li" | text | trim | uppercase
        score: ".score" | text | trim | float | multiply(10) | round
      `;

      const result = await pool.extract({
        html,
        rules,
      });

      expect(result.data).toEqual({
        badge: 'special offer!',
        badge_slug: 'special-offer',
        fallback_val: 'Default Fallback',
        tags: ['ELECTRONICS', 'GADGETS'],
        score: 85,
      });
      expect(result.data.missing_opt).toBeUndefined();
    } finally {
      await pool.stop();
    }
  });

  it('extracts meta variables such as @url and @timestamp', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
    });

    await pool.start();

    try {
      const html = `<html><body><h1 class="title">Screenpool</h1></body></html>`;
      const rules = `
        title: "h1.title" | text | trim
        page_url: @url
        extracted_at: @timestamp
      `;

      const result = await pool.extract({
        html,
        rules,
      });

      expect(result.data.title).toBe('Screenpool');
      expect(result.data.page_url).toBeDefined();
      expect(result.data.extracted_at).toBeDefined();
    } finally {
      await pool.stop();
    }
  });

  it('rejects invalid Pipsel DSL rules immediately during option validation', async () => {
    const pool = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
    });

    await pool.start();

    try {
      await expect(
        pool.extract({
          html: '<html></html>',
          rules: 'invalid dsl syntax {{{',
        }),
      ).rejects.toThrow(InvalidRenderInputError);
    } finally {
      await pool.stop();
    }
  });
});
