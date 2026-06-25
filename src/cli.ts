#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { ScreenPool } from './ScreenPool.js';
import type { ScreenPoolConfig, BrowserShorthand } from './types.js';
import { DEFAULT_OUTPUT_DIR } from './types.js';
import { ensureOutputDir, formatToExt, resolveOutputPath } from './utils/resolveOutputPath.js';
import { isScreenPoolError } from './errors.js';

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2);
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];
  let command = '';

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;

    if (arg === '--help' || arg === '-h') {
      flags.help = true;
      continue;
    }

    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }

    if (arg.startsWith('-') && arg.length === 2) {
      const key = arg.slice(1);
      const next = args[i + 1];
      if (next && !next.startsWith('-')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
      continue;
    }

    if (!command) {
      command = arg;
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function flagStr(flags: Record<string, string | boolean>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const val = flags[key];
    if (typeof val === 'string') return val;
  }
  return undefined;
}

function flagNum(flags: Record<string, string | boolean>, key: string): number | undefined {
  const val = flagStr(flags, key);
  return val ? Number(val) : undefined;
}

function flagBool(flags: Record<string, string | boolean>, key: string): boolean {
  return flags[key] === true || flags[key] === 'true';
}

function buildPoolConfig(flags: Record<string, string | boolean>): ScreenPoolConfig {
  const browser = flagStr(flags, 'browser');
  const outputDir =
    flagStr(flags, 'output-dir', 'O') ??
    process.env.SCREENPOOL_OUTPUT_DIR ??
    DEFAULT_OUTPUT_DIR;

  const config: ScreenPoolConfig = {
    outputDir,
    poolSize: flagNum(flags, 'pool-size') ?? 4,
    maxQueueSize: flagNum(flags, 'max-queue-size') ?? 100,
    jobTimeout: flagNum(flags, 'job-timeout') ?? 15_000,
    executablePath: flagStr(flags, 'executable-path'),
    launchArgs: flagStr(flags, 'launch-args')?.split(',').filter(Boolean),
    memory: {
      limitMb: flagNum(flags, 'memory-limit'),
      v8HeapMb: flagNum(flags, 'v8-heap'),
    },
  };

  if (browser) {
    config.browser = browser as BrowserShorthand;
  }

  return config;
}

function printHelp(command?: string): void {
  if (command === 'server') {
    console.log(`Usage: screenpool server [options]

Options:
  --port <n>              HTTP port (default: 3000)
  --host <host>           Bind host (default: 0.0.0.0)
  --pool-size <n>         Worker pool size (default: 4)
  --browser <spec>        Browser shorthand e.g. chrome@stable
  --executable-path <p>   Chromium executable path
  --memory-limit <mb>     Browser RSS limit in MB
  --v8-heap <mb>          V8 heap limit in MB
  --output-dir, -O <dir>  Output directory (default: ./output)
  --help, -h              Show help
`);
    return;
  }

  console.log(`Usage: screenpool <command> [options]

Commands:
  screenshot <url>   Capture screenshot from URL
  pdf <url>          Render PDF from URL
  server             Start HTTP server

Global options:
  --out <path>            Output file path
  --output-dir, -O <dir>  Output directory (default: ./output)
  --width <n>             Viewport width (default: 1280)
  --height <n>            Viewport height (default: 720)
  --format <fmt>          Screenshot format: png|jpeg|webp
  --quality <n>           JPEG/WebP quality
  --full-page             Full page screenshot
  --browser <spec>        Browser shorthand e.g. chrome@stable
  --executable-path <p>   Chromium executable path
  --memory-limit <mb>     Browser RSS limit
  --pool-size <n>         Pool size (default: 4)
  --help, -h              Show help

Examples:
  screenpool screenshot https://example.com --out shot.webp --width 1200 --height 630
  screenpool pdf https://example.com --out page.pdf
  screenpool server --port 3000 --pool-size 4 --browser chrome@stable
`);
}

async function writeResult(
  pool: ScreenPool,
  result: { buffer: Buffer; jobId: string; contentType: string },
  flags: Record<string, string | boolean>,
  ext: string,
): Promise<void> {
  const config = pool.resolvedConfig;
  const out = flagStr(flags, 'out');
  const target = resolveOutputPath({
    outputDir: config.storage.outputDir,
    out,
    jobId: result.jobId,
    ext,
  });

  await ensureOutputDir(config.storage.outputDir);
  await writeFile(target, result.buffer);
  console.log(target);
}

async function runScreenshot(url: string, flags: Record<string, string | boolean>): Promise<void> {
  const pool = new ScreenPool(buildPoolConfig(flags));
  await pool.start();

  try {
    const format = (flagStr(flags, 'format') as 'png' | 'jpeg' | 'webp') ?? 'png';
    const result = await pool.screenshot({
      url,
      viewport: {
        width: flagNum(flags, 'width') ?? 1280,
        height: flagNum(flags, 'height') ?? 720,
      },
      format,
      quality: flagNum(flags, 'quality'),
      fullPage: flagBool(flags, 'full-page'),
    });
    await writeResult(pool, result, flags, formatToExt(format));
  } finally {
    await pool.stop();
  }
}

async function runPdf(url: string, flags: Record<string, string | boolean>): Promise<void> {
  const pool = new ScreenPool(buildPoolConfig(flags));
  await pool.start();

  try {
    const result = await pool.pdf({
      url,
      viewport: {
        width: flagNum(flags, 'width') ?? 1280,
        height: flagNum(flags, 'height') ?? 720,
      },
      pdf: { printBackground: true },
    });
    await writeResult(pool, result, flags, 'pdf');
  } finally {
    await pool.stop();
  }
}

async function runServer(flags: Record<string, string | boolean>): Promise<void> {
  const { createScreenPoolServer } = await import('./http/createScreenPoolServer.js');
  const pool = new ScreenPool(buildPoolConfig(flags));
  await pool.start();

  const port = flagNum(flags, 'port') ?? 3000;
  const host = flagStr(flags, 'host') ?? '0.0.0.0';

  const server = createScreenPoolServer(pool, { port, host });
  await server.listen();

  console.log(`screenpool server listening on http://${host}:${port}`);

  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    await server.close();
    await pool.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv);

  if (flagBool(parsed.flags, 'help') || parsed.flags.h === true || !parsed.command) {
    printHelp(parsed.command);
    process.exit(parsed.command ? 0 : 1);
  }

  try {
    switch (parsed.command) {
      case 'screenshot': {
        const url = parsed.positional[0];
        if (!url) {
          console.error('Error: URL required');
          printHelp('screenshot');
          process.exit(1);
        }
        await runScreenshot(url, parsed.flags);
        break;
      }
      case 'pdf': {
        const url = parsed.positional[0];
        if (!url) {
          console.error('Error: URL required');
          printHelp('pdf');
          process.exit(1);
        }
        await runPdf(url, parsed.flags);
        break;
      }
      case 'server':
        await runServer(parsed.flags);
        break;
      default:
        console.error(`Unknown command: ${parsed.command}`);
        printHelp();
        process.exit(1);
    }
  } catch (error) {
    if (isScreenPoolError(error)) {
      console.error(`${error.name}: ${error.message}`);
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exit(1);
  }
}

void main();
