import { execSync } from 'node:child_process';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';

export interface OrphanProcessInfo {
  pid: number;
  ppid: number;
  command: string;
  isOrphan: boolean;
}

export interface ReapResult {
  killedCount: number;
  pids: number[];
  cleanedProfilesCount: number;
}

/**
 * Identify Chrome/Chromium processes spawned by ScreenPool or Puppeteer.
 */
export function findScreenpoolChromeProcesses(): OrphanProcessInfo[] {
  const isWindows = process.platform === 'win32';
  if (isWindows) {
    // Windows fallback: not standard POSIX ps
    return [];
  }

  try {
    const stdout = execSync('ps -eo pid,ppid,command', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });

    const lines = stdout.split('\n');
    const results: OrphanProcessInfo[] = [];

    // Map all active PIDs in the system
    const allPids = new Set<number>();
    const parsedLines: Array<{ pid: number; ppid: number; command: string }> = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('PID')) continue;

      const match = trimmed.match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (match && match[1] && match[2] && match[3]) {
        const pid = parseInt(match[1], 10);
        const ppid = parseInt(match[2], 10);
        const command = match[3];
        allPids.add(pid);
        parsedLines.push({ pid, ppid, command });
      }
    }

    for (const item of parsedLines) {
      const isScreenpoolChrome =
        (item.command.includes('Google Chrome for Testing') ||
          item.command.includes('.screenpool/browser') ||
          item.command.includes('puppeteer_dev_chrome_profile') ||
          item.command.includes('chrome-headless-shell')) &&
        !item.command.includes('grep') &&
        item.pid !== process.pid;

      if (isScreenpoolChrome) {
        // An orphan is a process whose parent is launchd/init (PID 1) or whose parent PID is not running
        const isOrphan = item.ppid === 1 || !allPids.has(item.ppid);
        results.push({
          pid: item.pid,
          ppid: item.ppid,
          command: item.command,
          isOrphan,
        });
      }
    }

    return results;
  } catch {
    return [];
  }
}

/**
 * Kill a list of PIDs safely.
 */
export function killProcessPids(pids: number[], signal: NodeJS.Signals = 'SIGKILL'): number {
  let count = 0;
  for (const pid of pids) {
    if (pid === process.pid) continue;
    try {
      process.kill(pid, 0); // Check if running
      process.kill(pid, signal);
      count++;
    } catch {
      // Process might already have exited
    }
  }
  return count;
}

/**
 * Remove stale puppeteer temporary chrome profile folders.
 */
export function cleanStaleProfileDirs(): number {
  let cleaned = 0;
  const candidateDirs = [os.tmpdir()];

  // On macOS, add /var/folders paths if known
  if (process.platform === 'darwin') {
    try {
      const darwinTmp = execSync('getconf DARWIN_USER_TEMP_DIR 2>/dev/null', {
        encoding: 'utf8',
      }).trim();
      if (darwinTmp && existsSync(darwinTmp) && !candidateDirs.includes(darwinTmp)) {
        candidateDirs.push(darwinTmp);
      }
    } catch {
      // ignore
    }
  }

  for (const dir of candidateDirs) {
    try {
      if (!existsSync(dir)) continue;
      const entries = readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith('puppeteer_dev_chrome_profile-')) {
          const fullPath = join(dir, entry);
          try {
            rmSync(fullPath, { recursive: true, force: true });
            cleaned++;
          } catch {
            // In use or permission denied
          }
        }
      }
    } catch {
      // ignore readdir errors
    }
  }

  return cleaned;
}

/**
 * Reap all orphaned Chrome processes and clean stale temp profiles.
 */
export function reapOrphanProcesses(options: { forceAll?: boolean } = {}): ReapResult {
  const processes = findScreenpoolChromeProcesses();
  const targetProcesses = options.forceAll
    ? processes
    : processes.filter((p) => p.isOrphan);

  const pids = targetProcesses.map((p) => p.pid);
  const killedCount = killProcessPids(pids, 'SIGKILL');
  const cleanedProfilesCount = cleanStaleProfileDirs();

  return {
    killedCount,
    pids,
    cleanedProfilesCount,
  };
}
