import { describe, it, expect } from 'vitest';
import { resolveOutputPath, formatToExt } from '../src/utils/resolveOutputPath.js';
import { InvalidOutputPathError } from '../src/errors.js';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

describe('resolveOutputPath', () => {
  const outputDir = join(tmpdir(), 'screenpool-test-output');

  it('resolves relative out under outputDir', () => {
    const path = resolveOutputPath({
      outputDir,
      out: 'shot.webp',
      jobId: 'abc',
      ext: 'webp',
    });
    expect(path).toBe(resolve(outputDir, 'shot.webp'));
  });

  it('uses absolute out as-is', () => {
    const abs = join(tmpdir(), 'absolute.webp');
    const path = resolveOutputPath({
      outputDir,
      out: abs,
      jobId: 'abc',
      ext: 'webp',
    });
    expect(path).toBe(resolve(abs));
  });

  it('auto-generates filename when out is missing', () => {
    const path = resolveOutputPath({
      outputDir,
      jobId: 'job-123',
      ext: 'png',
    });
    expect(path).toBe(resolve(outputDir, 'job-123.png'));
  });

  it('blocks path traversal', () => {
    expect(() =>
      resolveOutputPath({
        outputDir,
        out: '../../etc/passwd',
        jobId: 'abc',
        ext: 'png',
      }),
    ).toThrow(InvalidOutputPathError);
  });

  it('maps format to extension', () => {
    expect(formatToExt('jpeg')).toBe('jpg');
    expect(formatToExt('webp')).toBe('webp');
    expect(formatToExt('png')).toBe('png');
  });
});
