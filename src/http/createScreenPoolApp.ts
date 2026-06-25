import { Hono } from 'hono';
import type { ScreenPool } from '../ScreenPool.js';
import type { PdfOptions, ScreenshotOptions } from '../types.js';
import { handleHttpError } from './errorHandler.js';
import { bodyLimit } from './middleware/bodyLimit.js';

export interface CreateScreenPoolAppOptions {
  /** Optional path prefix for routes. */
  basePath?: string;
  /** Max request body size in bytes. Default: 1MB */
  maxBodyBytes?: number;
}

/** Create a mountable Hono app for ScreenPool render endpoints. */
export function createScreenPoolApp(
  pool: ScreenPool,
  options: CreateScreenPoolAppOptions = {},
): Hono {
  const app = new Hono();
  const maxBody = options.maxBodyBytes ?? 1_048_576;

  app.use('*', bodyLimit(maxBody));

  app.get('/health', (c) => {
    const stats = pool.stats();
    return c.json({ ok: true, started: stats.started });
  });

  app.get('/stats', (c) => c.json(pool.stats()));

  app.post('/screenshot', async (c) => {
    const body = await parseJson<ScreenshotOptions>(c);
    const result = await pool.screenshot(body);
    return new Response(result.buffer, {
      headers: { 'Content-Type': result.contentType, 'X-Job-Id': result.jobId },
    });
  });

  app.post('/pdf', async (c) => {
    const body = await parseJson<PdfOptions>(c);
    const result = await pool.pdf(body);
    return new Response(result.buffer, {
      headers: { 'Content-Type': result.contentType, 'X-Job-Id': result.jobId },
    });
  });

  app.post('/html-to-image', async (c) => {
    const body = await parseJson<ScreenshotOptions>(c);
    const result = await pool.htmlToImage(body);
    return new Response(result.buffer, {
      headers: { 'Content-Type': result.contentType, 'X-Job-Id': result.jobId },
    });
  });

  app.post('/html-to-pdf', async (c) => {
    const body = await parseJson<PdfOptions>(c);
    const result = await pool.htmlToPdf(body);
    return new Response(result.buffer, {
      headers: { 'Content-Type': result.contentType, 'X-Job-Id': result.jobId },
    });
  });

  app.onError((err, c) => handleHttpError(err, c));

  if (options.basePath) {
    const root = new Hono();
    root.route(options.basePath, app);
    return root;
  }

  return app;
}

async function parseJson<T>(c: { req: { json: () => Promise<T> } }): Promise<T> {
  try {
    return await c.req.json();
  } catch {
    throw new Error('Invalid JSON body');
  }
}

export { createScreenPoolApp as default };
