import { DEFAULT_CHROMIUM_ARGS, type ResolvedScreenPoolConfig } from '../types.js';

/** Build Chromium launch arguments from config. */
export function buildLaunchArgs(config: ResolvedScreenPoolConfig): string[] {
  const args: string[] = [...DEFAULT_CHROMIUM_ARGS];

  if (config.memory.v8HeapMb) {
    args.push(`--js-flags=--max-old-space-size=${config.memory.v8HeapMb}`);
  }

  args.push(...config.launchArgs);
  return args;
}
