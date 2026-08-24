import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';
import type { ResolvedScreenPoolConfig } from '../types.js';
import { resolveBrowserExecutable } from './resolveBrowserExecutable.js';
import { buildLaunchArgs } from './buildLaunchArgs.js';
import { reapOrphanProcesses } from './orphanReaper.js';

export interface SharedDaemonInfo {
  pid: number;
  wsEndpoint: string;
  httpUrl?: string;
  startedAt: number;
  lastActiveAt: number;
  executablePath?: string;
  version?: string;
}

export function getSharedDaemonDir(): string {
  const dir = join(homedir(), '.screenpool');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getSharedDaemonStateFile(): string {
  return join(getSharedDaemonDir(), 'daemon.json');
}

export function getSharedDaemonLockFile(): string {
  return join(getSharedDaemonDir(), 'daemon.lock');
}

/**
 * Check if the daemon process is running and responsive.
 */
export async function isSharedDaemonAlive(info: SharedDaemonInfo): Promise<boolean> {
  if (!info || !info.pid || !info.wsEndpoint) return false;

  // Check if PID is running
  try {
    process.kill(info.pid, 0);
  } catch {
    return false;
  }

  // Check if wsEndpoint is responding
  try {
    const url = new URL(info.wsEndpoint);
    const checkUrl = `http://${url.host}/json/version`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 800);

    const res = await fetch(checkUrl, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const body = (await res.json()) as any;
      return Boolean(body?.webSocketDebuggerUrl);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Read current shared daemon info if exists and valid.
 */
export async function getActiveSharedDaemonInfo(): Promise<SharedDaemonInfo | null> {
  const stateFile = getSharedDaemonStateFile();
  if (!existsSync(stateFile)) return null;

  try {
    const raw = readFileSync(stateFile, 'utf8');
    const info: SharedDaemonInfo = JSON.parse(raw);
    const alive = await isSharedDaemonAlive(info);
    if (alive) {
      return info;
    }
    // Stale state file: remove it
    try { unlinkSync(stateFile); } catch {}
    return null;
  } catch {
    return null;
  }
}

/**
 * Update timestamp in daemon.json to keep it active.
 */
export function touchSharedDaemon(): void {
  const stateFile = getSharedDaemonStateFile();
  if (!existsSync(stateFile)) return;

  try {
    const raw = readFileSync(stateFile, 'utf8');
    const info: SharedDaemonInfo = JSON.parse(raw);
    info.lastActiveAt = Date.now();
    writeFileSync(stateFile, JSON.stringify(info, null, 2), 'utf8');
  } catch {
    // ignore touch errors
  }
}

/**
 * Acquire file lock with retry loop.
 */
async function acquireLock(lockFile: string, maxWaitMs = 10000): Promise<() => void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const fd = openSync(lockFile, 'wx');
      return () => {
        try { closeSync(fd); } catch {}
        try { unlinkSync(lockFile); } catch {}
      };
    } catch (err: any) {
      if (err.code === 'EEXIST') {
        // Lock exists: wait and retry
        await new Promise((r) => setTimeout(r, 100));
      } else {
        throw err;
      }
    }
  }
  // Lock timed out: force remove stale lock and proceed
  try { unlinkSync(lockFile); } catch {}
  const fd = openSync(lockFile, 'wx');
  return () => {
    try { closeSync(fd); } catch {}
    try { unlinkSync(lockFile); } catch {}
  };
}

/**
 * Acquires a connection to the singleton shared Chromium browser, or starts one.
 */
export async function acquireSharedBrowser(
  config: ResolvedScreenPoolConfig,
): Promise<{ wsEndpoint: string; isNew: boolean; browser?: Browser }> {
  // 1. Check if already active
  const existing = await getActiveSharedDaemonInfo();
  if (existing) {
    touchSharedDaemon();
    return { wsEndpoint: existing.wsEndpoint, isNew: false };
  }

  // 2. Acquire lock to prevent race condition when multiple MCP instances start
  const lockFile = getSharedDaemonLockFile();
  const releaseLock = await acquireLock(lockFile);

  try {
    // Re-check inside critical section
    const recheck = await getActiveSharedDaemonInfo();
    if (recheck) {
      touchSharedDaemon();
      return { wsEndpoint: recheck.wsEndpoint, isNew: false };
    }

    // Clean any dead orphan chrome processes before launching
    reapOrphanProcesses({ forceAll: false });

    // Launch singleton shared browser
    const executablePath = await resolveBrowserExecutable(config);
    const args = buildLaunchArgs(config);

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args,
      userDataDir: config.userDataDir,
    });

    const wsEndpoint = browser.wsEndpoint();
    const pid = browser.process()?.pid;

    if (!pid || !wsEndpoint) {
      await browser.close().catch(() => undefined);
      throw new Error('Failed to obtain shared browser process PID or WebSocket endpoint.');
    }

    // Close blank tab to conserve memory
    const defaultPages = await browser.defaultBrowserContext().pages();
    await Promise.all(defaultPages.map((p) => p.close().catch(() => undefined)));

    const info: SharedDaemonInfo = {
      pid,
      wsEndpoint,
      startedAt: Date.now(),
      lastActiveAt: Date.now(),
      executablePath,
    };

    writeFileSync(getSharedDaemonStateFile(), JSON.stringify(info, null, 2), 'utf8');

    // Register process exit hook to cleanup state file
    const cleanupHook = () => {
      try {
        const sf = getSharedDaemonStateFile();
        if (existsSync(sf)) {
          const cur = JSON.parse(readFileSync(sf, 'utf8'));
          if (cur.pid === pid) {
            unlinkSync(sf);
          }
        }
      } catch {}
    };

    browser.on('disconnected', cleanupHook);

    return { wsEndpoint, isNew: true, browser };
  } finally {
    releaseLock();
  }
}

/**
 * Remove shared daemon state file and optionally kill its PID.
 */
export async function stopSharedDaemon(): Promise<boolean> {
  const stateFile = getSharedDaemonStateFile();
  if (!existsSync(stateFile)) return false;

  try {
    const raw = readFileSync(stateFile, 'utf8');
    const info: SharedDaemonInfo = JSON.parse(raw);
    try { unlinkSync(stateFile); } catch {}

    if (info.pid) {
      try {
        process.kill(info.pid, 'SIGTERM');
        setTimeout(() => {
          try { process.kill(info.pid, 'SIGKILL'); } catch {}
        }, 1000);
      } catch {}
    }
    return true;
  } catch {
    try { unlinkSync(stateFile); } catch {}
    return false;
  }
}
