import { mkdir } from 'node:fs/promises';
import { isAbsolute, resolve, relative, sep } from 'node:path';
import { InvalidOutputPathError } from '../errors.js';

export interface ResolveOutputPathOptions {
  outputDir: string;
  out?: string;
  jobId: string;
  ext: string;
}

/** Ensure output directory exists. */
export async function ensureOutputDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/**
 * Resolve output file path.
 * - Absolute `out` → used as-is
 * - Relative `out` → resolved under outputDir
 * - No `out` → outputDir/jobId.ext
 */
export function resolveOutputPath(options: ResolveOutputPathOptions): string {
  const { outputDir, out, jobId, ext } = options;
  const resolvedOutputDir = resolve(outputDir);

  let targetPath: string;

  if (!out) {
    targetPath = resolve(resolvedOutputDir, `${jobId}.${ext}`);
  } else if (isAbsolute(out)) {
    targetPath = resolve(out);
  } else {
    targetPath = resolve(resolvedOutputDir, out);
  }

  assertWithinOutputDir(resolvedOutputDir, targetPath, out);
  return targetPath;
}

function assertWithinOutputDir(
  outputDir: string,
  targetPath: string,
  out?: string,
): void {
  // Absolute paths outside outputDir are allowed (explicit user choice)
  if (out && isAbsolute(out)) {
    return;
  }

  const rel = relative(outputDir, targetPath);
  if (rel.startsWith('..') || rel.includes(`..${sep}`)) {
    throw new InvalidOutputPathError(
      targetPath,
      `Output path escapes outputDir (${outputDir}).`,
    );
  }
}

/** Map screenshot format to file extension. */
export function formatToExt(format?: string): string {
  switch (format) {
    case 'jpeg':
      return 'jpg';
    case 'webp':
      return 'webp';
    default:
      return 'png';
  }
}
