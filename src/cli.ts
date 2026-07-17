#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ScreenPool } from './ScreenPool.js';
import type { ScreenPoolConfig, BrowserShorthand } from './types.js';
import { DEFAULT_OUTPUT_DIR, resolveConfig } from './types.js';
import { ensureOutputDir, formatToExt, resolveOutputPath } from './utils/resolveOutputPath.js';
import { isScreenPoolError } from './errors.js';

function buildPoolConfig(argv: any): ScreenPoolConfig {
  const browser = argv.browser;
  const outputDir = argv['output-dir'] ?? process.env.SCREENPOOL_OUTPUT_DIR ?? DEFAULT_OUTPUT_DIR;

  const config: ScreenPoolConfig = {
    outputDir,
    poolSize: argv['pool-size'] ?? 4,
    maxQueueSize: argv['max-queue-size'] ?? 100,
    jobTimeout: argv['job-timeout'] ?? 15_000,
    executablePath: argv['executable-path'],
    browserWSEndpoint: argv['browser-ws-endpoint'],
    browserURL: argv['browser-url'],
    launchArgs: typeof argv['launch-args'] === 'string'
      ? argv['launch-args'].split(',').filter(Boolean)
      : undefined,
    memory: {
      limitMb: argv['memory-limit'],
      v8HeapMb: argv['v8-heap'],
    },
  };

  if (browser) {
    config.browser = browser as BrowserShorthand;
  }

  return config;
}

async function tryRequestDaemon(
  command: string,
  payload: any,
  argv: any,
): Promise<any | null> {
  if (argv.local) {
    return null;
  }

  const port = argv.port ?? 3000;
  const host = argv.host ?? '127.0.0.1';
  const url = `http://${host}:${port}`;

  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 150);
    const healthRes = await fetch(`${url}/health`, { signal: controller.signal });
    clearTimeout(id);
    if (!healthRes.ok) {
      return null;
    }
  } catch {
    return null;
  }

  const path = command === 'screenshot'
    ? '/screenshot'
    : command === 'pdf'
    ? '/pdf'
    : command === 'extract'
    ? '/extract'
    : null;

  if (!path) return null;

  const res = await fetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errBody = (await res.json().catch(() => ({ message: res.statusText }))) as any;
    throw new Error(`Daemon error: ${errBody.message || res.statusText}`);
  }

  if (command === 'extract') {
    const data = await res.json();
    return { data, jobId: res.headers.get('x-job-id') || 'daemon-job' };
  } else {
    const arrayBuffer = await res.arrayBuffer();
    return {
      buffer: Buffer.from(arrayBuffer),
      jobId: res.headers.get('x-job-id') || 'daemon-job',
      contentType: res.headers.get('content-type') || '',
    };
  }
}

async function writeResult(
  outputDir: string,
  result: { buffer: Buffer; jobId: string; contentType: string },
  argv: any,
  ext: string,
): Promise<void> {
  const out = argv.out;
  const target = resolveOutputPath({
    outputDir,
    out,
    jobId: result.jobId,
    ext,
  });

  await ensureOutputDir(outputDir);
  await writeFile(target, result.buffer);
  console.log(target);
}

async function runScreenshot(url: string, argv: any): Promise<void> {
  const format = argv.format ?? 'png';
  const payload = {
    url,
    viewport: {
      width: argv.width ?? 1280,
      height: argv.height ?? 720,
    },
    format,
    quality: argv.quality,
    fullPage: argv['full-page'],
  };

  const outputDir = resolveConfig(buildPoolConfig(argv)).storage.outputDir;

  const daemonRes = await tryRequestDaemon('screenshot', payload, argv);
  if (daemonRes) {
    await writeResult(outputDir, daemonRes, argv, formatToExt(format));
    return;
  }

  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  try {
    const result = await pool.screenshot(payload);
    await writeResult(outputDir, result, argv, formatToExt(format));
  } finally {
    await pool.stop();
  }
}

async function runPdf(url: string, argv: any): Promise<void> {
  const payload = {
    url,
    viewport: {
      width: argv.width ?? 1280,
      height: argv.height ?? 720,
    },
    pdf: { printBackground: true },
  };

  const outputDir = resolveConfig(buildPoolConfig(argv)).storage.outputDir;

  const daemonRes = await tryRequestDaemon('pdf', payload, argv);
  if (daemonRes) {
    await writeResult(outputDir, daemonRes, argv, 'pdf');
    return;
  }

  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  try {
    const result = await pool.pdf(payload);
    await writeResult(outputDir, result, argv, 'pdf');
  } finally {
    await pool.stop();
  }
}

async function runExtract(url: string, argv: any): Promise<void> {
  let rules = argv.rules;
  const rulesFile = argv['rules-file'];

  if (rulesFile) {
    const { readFile } = await import('node:fs/promises');
    rules = await readFile(rulesFile, 'utf8');
  }

  if (!rules) {
    console.error('Error: Either --rules or --rules-file is required.');
    process.exit(1);
  }

  const payload = {
    url,
    rules,
    viewport: {
      width: argv.width ?? 1280,
      height: argv.height ?? 720,
    },
  };

  const outputDir = resolveConfig(buildPoolConfig(argv)).storage.outputDir;

  const daemonRes = await tryRequestDaemon('extract', payload, argv);
  if (daemonRes) {
    const out = argv.out;
    if (out) {
      await writeResult(outputDir, daemonRes, argv, 'json');
    } else {
      console.log(JSON.stringify(daemonRes.data, null, 2));
    }
    return;
  }

  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  try {
    const result = await pool.extract(payload);

    const out = argv.out;
    if (out) {
      await writeResult(outputDir, result, argv, 'json');
    } else {
      console.log(JSON.stringify(result.data, null, 2));
    }
  } finally {
    await pool.stop();
  }
}

async function runServer(argv: any): Promise<void> {
  const { createScreenPoolServer } = await import('./http/createScreenPoolServer.js');
  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  const port = argv.port ?? 3000;
  const host = argv.host ?? '0.0.0.0';

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

async function runUi(argv: any): Promise<void> {
  const { createScreenPoolServer } = await import('./http/createScreenPoolServer.js');
  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  const port = argv.port ?? 3000;
  const host = argv.host ?? '127.0.0.1';

  const server = createScreenPoolServer(pool, { port, host });
  await server.listen();

  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;
  console.log(`screenpool server with UI console listening on ${url}`);
  console.log('Opening UI console in browser...');

  const shutdown = async () => {
    console.log('\nShutting down gracefully...');
    await server.close();
    await pool.stop();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    const { exec } = await import('node:child_process');
    const start = process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
      ? 'start'
      : 'xdg-open';
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : `${start} "${url}"`;
    exec(cmd, () => {});
  } catch {
    // Ignore opening errors
  }
}

async function main(): Promise<void> {
  const parser = yargs(hideBin(process.argv))
    .scriptName('screenpool')
    .usage('Usage: $0 <command> [options]')
    .strict()
    .help('h')
    .alias('h', 'help')
    .option('browser', {
      type: 'string',
      describe: 'Browser shorthand e.g. chrome@stable',
    })
    .option('executable-path', {
      type: 'string',
      describe: 'Chromium executable path',
    })
    .option('browser-ws-endpoint', {
      type: 'string',
      describe: 'Connect to an existing Chromium instance via WebSocket debugger URL',
    })
    .option('browser-url', {
      type: 'string',
      describe: 'Connect to an existing Chromium instance via HTTP URL (e.g. http://localhost:9222)',
    })
    .option('pool-size', {
      type: 'number',
      describe: 'Worker pool size (default: 4)',
    })
    .option('max-queue-size', {
      type: 'number',
      describe: 'Max queue size (default: 100)',
    })
    .option('job-timeout', {
      type: 'number',
      describe: 'Job timeout in ms (default: 15_000)',
    })
    .option('launch-args', {
      type: 'string',
      describe: 'Comma-separated launch arguments',
    })
    .option('memory-limit', {
      type: 'number',
      describe: 'Browser RSS limit in MB',
    })
    .option('v8-heap', {
      type: 'number',
      describe: 'V8 heap limit in MB',
    })
    .option('output-dir', {
      alias: 'O',
      type: 'string',
      describe: 'Output directory (default: ./output)',
    })
    .option('local', {
      type: 'boolean',
      describe: 'Force local execution in-process (bypass any running local daemon)',
    })
    .command(
      'screenshot <url>',
      'Capture screenshot from URL',
      (y) => y
        .positional('url', { type: 'string', demandOption: true })
        .option('out', { type: 'string', describe: 'Output file path' })
        .option('width', { type: 'number', describe: 'Viewport width (default: 1280)' })
        .option('height', { type: 'number', describe: 'Viewport height (default: 720)' })
        .option('format', { type: 'string', choices: ['png', 'jpeg', 'webp'], describe: 'Screenshot format (default: png)' })
        .option('quality', { type: 'number', describe: 'JPEG/WebP quality' })
        .option('full-page', { type: 'boolean', describe: 'Full page screenshot' }),
      async (argv) => {
        try {
          await runScreenshot(argv.url, argv);
        } catch (error) {
          handleError(error);
        }
      }
    )
    .command(
      'pdf <url>',
      'Render PDF from URL',
      (y) => y
        .positional('url', { type: 'string', demandOption: true })
        .option('out', { type: 'string', describe: 'Output file path' })
        .option('width', { type: 'number', describe: 'Viewport width (default: 1280)' })
        .option('height', { type: 'number', describe: 'Viewport height (default: 720)' }),
      async (argv) => {
        try {
          await runPdf(argv.url, argv);
        } catch (error) {
          handleError(error);
        }
      }
    )
    .command(
      'extract <url>',
      'Extract structured data using Pipsel DSL',
      (y) => y
        .positional('url', { type: 'string', demandOption: true })
        .option('rules', { type: 'string', describe: 'Pipsel DSL rules string' })
        .option('rules-file', { type: 'string', describe: 'Path to file containing Pipsel DSL rules' })
        .option('out', { type: 'string', describe: 'Output file path' })
        .option('width', { type: 'number', describe: 'Viewport width (default: 1280)' })
        .option('height', { type: 'number', describe: 'Viewport height (default: 720)' }),
      async (argv) => {
        try {
          await runExtract(argv.url, argv);
        } catch (error) {
          handleError(error);
        }
      }
    )
    .command(
      'server',
      'Start HTTP server',
      (y) => y
        .option('port', { type: 'number', describe: 'HTTP port (default: 3000)' })
        .option('host', { type: 'string', describe: 'Bind host (default: 0.0.0.0)' }),
      async (argv) => {
        try {
          await runServer(argv);
        } catch (error) {
          handleError(error);
        }
      }
    )
    .command(
      'ui',
      'Start HTTP server with UI console',
      (y) => y
        .option('port', { type: 'number', describe: 'HTTP port (default: 3000)' })
        .option('host', { type: 'string', describe: 'Bind host (default: 127.0.0.1)' }),
      async (argv) => {
        try {
          await runUi(argv);
        } catch (error) {
          handleError(error);
        }
      }
    )
    .demandCommand(1, 'You must specify a command (screenshot, pdf, extract, server, or ui)');

  await parser.parse();
}

function handleError(error: unknown): void {
  if (isScreenPoolError(error)) {
    console.error(`${error.name}: ${error.message}`);
  } else if (error instanceof Error) {
    console.error(error.message);
  } else {
    console.error(String(error));
  }
  process.exit(1);
}

void main().catch((error) => {
  handleError(error);
});
