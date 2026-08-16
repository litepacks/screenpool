#!/usr/bin/env node
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { ScreenpoolMcpServer } from './mcp/server.js';
import type { LogLevel } from './mcp/logger.js';

export async function runMcpCli(args: string[] = hideBin(process.argv)): Promise<void> {
  const argv = await yargs(args)
    .scriptName('screenpool-mcp')
    .usage('$0 [options]', 'Start the Screenpool Model Context Protocol (MCP) server over stdio')
    .option('browser', {
      alias: 'b',
      type: 'string',
      describe: 'Browser shorthand or name (chromium | chrome)',
    })
    .option('executable-path', {
      type: 'string',
      describe: 'Explicit path to Chromium browser binary',
    })
    .option('pool-size', {
      alias: 'p',
      type: 'number',
      describe: 'Number of worker pages in pool (default: 3)',
    })
    .option('timeout', {
      alias: 't',
      type: 'number',
      describe: 'Navigation and render timeout in milliseconds (default: 30000)',
    })
    .option('headless', {
      type: 'boolean',
      default: true,
      describe: 'Run browser in headless mode',
    })
    .option('max-pages', {
      type: 'number',
      describe: 'Maximum queue size for render jobs',
    })
    .option('artifacts-dir', {
      type: 'string',
      describe: 'Directory for saving output screenshots/PDFs (default: .screenpool/artifacts)',
    })
    .option('log-level', {
      type: 'string',
      choices: ['silent', 'error', 'warn', 'info', 'debug'],
      describe: 'Stderr logging level (default: info)',
    })
    .option('config', {
      alias: 'c',
      type: 'string',
      describe: 'Path to configuration file (screenpool.config.json)',
    })
    .option('allow-private-network', {
      type: 'boolean',
      describe: 'Allow navigation to localhost and private network addresses (SSRF bypass)',
    })
    .option('shared', {
      type: 'boolean',
      default: true,
      describe: 'Share singleton browser daemon across MCP instances to minimize CPU/RAM (default: true)',
    })
    .option('isolated', {
      type: 'boolean',
      describe: 'Force isolated local browser process instead of shared daemon',
    })
    .option('idle-timeout', {
      type: 'number',
      describe: 'Idle timeout in ms before auto-closing browser (default: 600000)',
    })
    .help()
    .alias('help', 'h')
    .parse();

  const isShared = argv.isolated ? false : argv.shared;

  const server = new ScreenpoolMcpServer({
    configFilePath: argv.config,
    config: {
      browser: argv.browser,
      executablePath: argv['executable-path'],
      poolSize: argv['pool-size'],
      maxQueueSize: argv['max-pages'],
      timeout: argv.timeout,
      headless: argv.headless,
      artifactsDir: argv['artifacts-dir'],
      logLevel: argv['log-level'] as LogLevel | undefined,
      shared: isShared,
      idleTimeout: argv['idle-timeout'],
      security: {
        allowPrivateNetwork: Boolean(argv['allow-private-network']),
      },
    },
  });

  await server.startStdio();
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('mcp-cli.js')) {
  runMcpCli().catch((err) => {
    process.stderr.write(`[screenpool-mcp] Fatal error: ${err?.message || err}\n`);
    process.exit(1);
  });
}
