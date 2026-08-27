import { DEFAULT_CHROMIUM_ARGS, type ResolvedScreenPoolConfig } from '../types.js';

/** Build Chromium launch arguments from config. */
export function buildLaunchArgs(config: ResolvedScreenPoolConfig): string[] {
  let args: string[] = [...DEFAULT_CHROMIUM_ARGS];

  if (config.devtools || config.headless === false) {
    args = args.filter(
      (a) =>
        !a.startsWith('--headless') &&
        a !== '--disable-gpu' &&
        a !== '--hide-scrollbars' &&
        a !== '--metrics-recording-only' &&
        a !== '--aggressive-cache-discard',
    );
    // On macOS, --no-sandbox causes AppKit / Mach port kernel crash in GUI headed mode
    if (process.platform === 'darwin') {
      args = args.filter((a) => a !== '--no-sandbox' && a !== '--disable-setuid-sandbox');
    }
    args.push('--enable-automation', '--no-default-browser-check', '--test-type');
  } else if (config.headless === 'shell') {
    args = args.filter((a) => !a.startsWith('--headless'));
    args.push('--headless=shell');
  }

  if (config.remoteDebuggingPort !== undefined) {
    args = args.filter((a) => !a.startsWith('--remote-debugging-port'));
    args.push(`--remote-debugging-port=${config.remoteDebuggingPort}`);
  }

  if (config.memory.v8HeapMb) {
    args.push(`--js-flags=--max-old-space-size=${config.memory.v8HeapMb}`);
  }

  args.push(...config.launchArgs);
  return args;
}
