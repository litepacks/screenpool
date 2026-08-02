import { createHash } from 'node:crypto';

export function computePageFingerprint(params: {
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scroll: { x: number; y: number };
  elementCount?: number;
}): string {
  const payload = `${params.url}|${params.title}|${params.viewport.width}x${params.viewport.height}|${params.scroll.x},${params.scroll.y}|${params.elementCount ?? 0}`;
  return createHash('sha256').update(payload).digest('hex').slice(0, 16);
}
