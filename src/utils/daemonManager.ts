import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync } from 'node:fs';
import { createServer } from 'node:net';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as unitup from 'unitup';

export interface DaemonOptions {
  name?: string;
  port?: number;
  randomPort?: boolean;
  host?: string;
  poolSize?: number;
  maxQueueSize?: number;
  jobTimeout?: number;
  browser?: string;
  executablePath?: string;
  browserWsEndpoint?: string;
  browserUrl?: string;
  launchArgs?: string;
  memoryLimit?: number;
  v8Heap?: number;
  outputDir?: string;
  follow?: boolean;
  lines?: number;
  force?: boolean;
}

export async function getRandomPort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, host, () => {
      const addr = srv.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

const DEFAULT_SERVICE_NAME = 'screenpool';

function getDaemonDir(): string {
  const dir = join(homedir(), '.screenpool', 'daemons');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getPidFilePath(name: string): string {
  return join(getDaemonDir(), `${name}.pid`);
}

function getLogFilePath(name: string): string {
  return join(getDaemonDir(), `${name}.log`);
}

function getCliScriptPath(): string {
  // If running from compiled dist/cli.js or dist/src/cli.js
  const currentFile = fileURLToPath(import.meta.url);
  const distCli = resolve(currentFile, '../../cli.js');
  if (existsSync(distCli)) {
    return distCli;
  }
  const rootCli = resolve(currentFile, '../../../dist/cli.js');
  if (existsSync(rootCli)) {
    return rootCli;
  }
  return process.argv[1] || '';
}

function buildServerArgs(options: DaemonOptions): string[] {
  const cliPath = getCliScriptPath();
  const args: string[] = [cliPath, 'server'];

  if (options.port) args.push('--port', String(options.port));
  if (options.host) args.push('--host', options.host);
  if (options.poolSize) args.push('--pool-size', String(options.poolSize));
  if (options.maxQueueSize) args.push('--max-queue-size', String(options.maxQueueSize));
  if (options.jobTimeout) args.push('--job-timeout', String(options.jobTimeout));
  if (options.browser) args.push('--browser', options.browser);
  if (options.executablePath) args.push('--executable-path', options.executablePath);
  if (options.browserWsEndpoint) args.push('--browser-ws-endpoint', options.browserWsEndpoint);
  if (options.browserUrl) args.push('--browser-url', options.browserUrl);
  if (options.launchArgs) args.push('--launch-args', options.launchArgs);
  if (options.memoryLimit) args.push('--memory-limit', String(options.memoryLimit));
  if (options.v8Heap) args.push('--v8-heap', String(options.v8Heap));
  if (options.outputDir) args.push('--output-dir', options.outputDir);

  return args;
}

export async function isSystemdSupported(): Promise<boolean> {
  try {
    if (typeof unitup.isSystemdAvailable === 'function') {
      return await unitup.isSystemdAvailable();
    }
  } catch {
    // ignore error
  }
  return false;
}

export async function startDaemon(options: DaemonOptions = {}): Promise<void> {
  if (options.randomPort || options.port === 0) {
    options.port = await getRandomPort(options.host ?? '127.0.0.1');
  }

  const name = options.name || DEFAULT_SERVICE_NAME;
  const useSystemd = await isSystemdSupported();

  if (useSystemd) {
    const args = buildServerArgs(options).slice(1); // omit cliPath for unitup script/command model
    const cliPath = getCliScriptPath();

    console.log(`Starting background server service "${name}" via unitup (systemd)...`);
    await unitup.createService({
      name,
      command: process.execPath,
      args: [cliPath, ...args],
      cwd: process.cwd(),
      restart: 'on-failure',
      start: true,
      force: options.force ?? true,
    });
    console.log(`✓ ScreenPool server running in background via systemd user unit: unitup-${name}.service`);
    const port = options.port ?? 3000;
    const host = options.host ?? '0.0.0.0';
    console.log(`  Listening on http://${host}:${port}`);
    return;
  }

  // Fallback for non-systemd environments (macOS, containers without systemd)
  const pidFile = getPidFilePath(name);
  const logFile = getLogFilePath(name);

  if (existsSync(pidFile)) {
    const oldPid = parseInt(readFileSync(pidFile, 'utf8').trim(), 10);
    if (!isNaN(oldPid)) {
      try {
        process.kill(oldPid, 0);
        if (!options.force) {
          throw new Error(`ScreenPool server "${name}" is already running in background (PID ${oldPid}). Use --force to restart.`);
        }
        try { process.kill(oldPid, 'SIGTERM'); } catch {}
      } catch (err: any) {
        if (err.message.includes('already running')) throw err;
        // Process no longer exists, clean up pid file
      }
    }
  }

  const serverArgs = buildServerArgs(options);
  const outLog = openSync(logFile, 'a');

  const child = spawn(process.execPath, serverArgs, {
    detached: true,
    stdio: ['ignore', outLog, outLog],
    cwd: process.cwd(),
  });

  child.unref();

  if (child.pid) {
    writeFileSync(pidFile, String(child.pid), 'utf8');
    console.log(`✓ ScreenPool server running in background (PID: ${child.pid})`);
    const port = options.port ?? 3000;
    const host = options.host ?? '0.0.0.0';
    console.log(`  Listening on http://${host}:${port}`);
    console.log(`  Log file: ${logFile}`);
  } else {
    throw new Error('Failed to spawn background process');
  }
}

export async function stopDaemon(options: DaemonOptions = {}): Promise<void> {
  const name = options.name || DEFAULT_SERVICE_NAME;
  const useSystemd = await isSystemdSupported();

  if (useSystemd) {
    try {
      await unitup.stopService(name);
      console.log(`✓ ScreenPool service "${name}" stopped.`);
      return;
    } catch (err: any) {
      if (!existsSync(getPidFilePath(name))) {
        throw err;
      }
    }
  }

  const pidFile = getPidFilePath(name);
  if (!existsSync(pidFile)) {
    console.log(`No active background process found for "${name}".`);
    return;
  }

  const pidStr = readFileSync(pidFile, 'utf8').trim();
  const pid = parseInt(pidStr, 10);

  if (!isNaN(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      console.log(`✓ Stopped background process (PID ${pid}).`);
    } catch {
      console.log(`Process PID ${pid} was not running.`);
    }
  }

  try { unlinkSync(pidFile); } catch {}
}

export async function restartDaemon(options: DaemonOptions = {}): Promise<void> {
  const name = options.name || DEFAULT_SERVICE_NAME;
  const useSystemd = await isSystemdSupported();

  if (useSystemd) {
    try {
      await unitup.restartService(name);
      console.log(`✓ ScreenPool service "${name}" restarted via unitup.`);
      return;
    } catch {
      // Fallback if service doesn't exist
    }
  }

  await stopDaemon(options);
  await startDaemon(options);
}

export async function getDaemonStatus(options: DaemonOptions = {}): Promise<void> {
  const name = options.name || DEFAULT_SERVICE_NAME;
  const useSystemd = await isSystemdSupported();

  if (useSystemd) {
    try {
      const info = await unitup.getServiceStatus(name);
      let memory = '-';
      try {
        const mem = await unitup.getServiceMemoryUsage(name);
        memory = mem.memory || '-';
      } catch {}
      console.log(`Service:   ${info.name}`);
      console.log(`Unit:      ${info.unitFile}`);
      console.log(`Status:    ${info.status}`);
      console.log(`PID:       ${info.pid}`);
      console.log(`Started:   ${info.started}`);
      console.log(`Restarts:  ${info.restarts}`);
      console.log(`Memory:    ${memory}`);
      console.log(`Command:   ${info.command} ${info.arguments}`);
      return;
    } catch {
      // Fall through to check PID file fallback
    }
  }

  const pidFile = getPidFilePath(name);
  const logFile = getLogFilePath(name);

  if (!existsSync(pidFile)) {
    console.log(`Status for "${name}": stopped`);
    return;
  }

  const pidStr = readFileSync(pidFile, 'utf8').trim();
  const pid = parseInt(pidStr, 10);
  let isRunning = false;

  if (!isNaN(pid)) {
    try {
      process.kill(pid, 0);
      isRunning = true;
    } catch {
      isRunning = false;
    }
  }

  console.log(`Service:   ${name}`);
  console.log(`Status:    ${isRunning ? 'running' : 'stopped (stale pid)'}`);
  console.log(`PID:       ${pid}`);
  console.log(`Log File:  ${logFile}`);
}

export async function getDaemonLogs(options: DaemonOptions = {}): Promise<void> {
  const name = options.name || DEFAULT_SERVICE_NAME;
  const useSystemd = await isSystemdSupported();

  if (useSystemd) {
    try {
      await unitup.getServiceLogs(name, {
        follow: options.follow,
        lines: options.lines ?? 50,
      });
      return;
    } catch {
      // Fallback to log file
    }
  }

  const logFile = getLogFilePath(name);
  if (!existsSync(logFile)) {
    console.log(`No log file found for service "${name}" at ${logFile}`);
    return;
  }

  const content = readFileSync(logFile, 'utf8');
  const lines = content.split('\n');
  const count = options.lines ?? 50;
  const tail = lines.slice(-count).join('\n');
  console.log(tail);
}

export async function removeDaemon(options: DaemonOptions = {}): Promise<void> {
  const name = options.name || DEFAULT_SERVICE_NAME;
  const useSystemd = await isSystemdSupported();

  if (useSystemd) {
    try {
      await unitup.removeService(name, { force: options.force ?? true });
      console.log(`✓ ScreenPool unit service "${name}" removed via unitup.`);
    } catch (err: any) {
      console.log(`Unit service notice: ${err.message || err}`);
    }
  }

  await stopDaemon(options);

  const pidFile = getPidFilePath(name);
  const logFile = getLogFilePath(name);
  if (existsSync(pidFile)) { try { unlinkSync(pidFile); } catch {} }
  if (existsSync(logFile)) { try { unlinkSync(logFile); } catch {} }
  console.log(`✓ Daemon files cleaned for "${name}".`);
}
