import type { MiddlewareHandler } from 'hono';

/** Limit request body size. */
export function bodyLimit(maxBytes = 1_048_576): MiddlewareHandler {
  return async (c, next) => {
    const contentLength = c.req.header('content-length');
    if (contentLength && Number(contentLength) > maxBytes) {
      return c.json({ error: 'Payload Too Large', message: `Body exceeds ${maxBytes} bytes` }, 413);
    }

    if (c.req.method === 'POST' || c.req.method === 'PUT') {
      const clone = c.req.raw.clone();
      const buffer = await clone.arrayBuffer();
      if (buffer.byteLength > maxBytes) {
        return c.json({ error: 'Payload Too Large', message: `Body exceeds ${maxBytes} bytes` }, 413);
      }
    }

    await next();
  };
}
