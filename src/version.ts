import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/**
 * Dynamically resolves the version string from package.json
 */
export function getPackageVersion(): string {
  try {
    const currentFilePath = fileURLToPath(import.meta.url);
    const currentDir = dirname(currentFilePath);

    const candidatePaths = [
      resolve(currentDir, '../package.json'),
      resolve(currentDir, '../../package.json'),
      resolve(process.cwd(), 'package.json'),
    ];

    for (const pkgPath of candidatePaths) {
      if (existsSync(pkgPath)) {
        const raw = readFileSync(pkgPath, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.version === 'string') {
          return parsed.version;
        }
      }
    }
  } catch {
    // fallback to default if resolution fails
  }

  return '0.4.6';
}

export const VERSION = getPackageVersion();
