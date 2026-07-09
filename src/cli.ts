#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ScreenPool } from './ScreenPool.js';
import type { ScreenPoolConfig, BrowserShorthand } from './types.js';
import { DEFAULT_OUTPUT_DIR } from './types.js';
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

async function writeResult(
  pool: ScreenPool,
  result: { buffer: Buffer; jobId: string; contentType: string },
  argv: any,
  ext: string,
): Promise<void> {
  const config = pool.resolvedConfig;
  const out = argv.out;
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

async function runScreenshot(url: string, argv: any): Promise<void> {
  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  try {
    const format = argv.format ?? 'png';
    const result = await pool.screenshot({
      url,
      viewport: {
        width: argv.width ?? 1280,
        height: argv.height ?? 720,
      },
      format,
      quality: argv.quality,
      fullPage: argv['full-page'],
    });
    await writeResult(pool, result, argv, formatToExt(format));
  } finally {
    await pool.stop();
  }
}

async function runPdf(url: string, argv: any): Promise<void> {
  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  try {
    const result = await pool.pdf({
      url,
      viewport: {
        width: argv.width ?? 1280,
        height: argv.height ?? 720,
      },
      pdf: { printBackground: true },
    });
    await writeResult(pool, result, argv, 'pdf');
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

  const pool = new ScreenPool(buildPoolConfig(argv));
  await pool.start();

  try {
    const result = await pool.extract({
      url,
      rules,
      viewport: {
        width: argv.width ?? 1280,
        height: argv.height ?? 720,
      },
    });

    const out = argv.out;
    if (out) {
      await writeResult(pool, result, argv, 'json');
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
    .demandCommand(1, 'You must specify a command (screenshot, pdf, extract, or server)');

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
