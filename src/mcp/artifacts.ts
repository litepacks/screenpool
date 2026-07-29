import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

export interface ArtifactResult {
  id: string;
  path: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export function generateArtifactFilename(type: 'screenshot' | 'pdf' | 'html', ext: string): string {
  const timestamp = Date.now();
  const random = randomBytes(4).toString('hex');
  const prefix = type === 'pdf' ? 'page' : type;
  return `${prefix}-${timestamp}-${random}.${ext}`;
}

export async function saveArtifactBuffer(
  artifactsDir: string,
  type: 'screenshot' | 'pdf',
  buffer: Buffer,
  ext: string,
  mimeType: string,
): Promise<ArtifactResult> {
  const resolvedDir = resolve(process.cwd(), artifactsDir);
  mkdirSync(resolvedDir, { recursive: true });

  const filename = generateArtifactFilename(type, ext);
  const fullPath = join(resolvedDir, filename);

  writeFileSync(fullPath, buffer);

  const createdAt = new Date().toISOString();
  return {
    id: filename,
    path: fullPath,
    mimeType,
    size: buffer.byteLength,
    createdAt,
  };
}
