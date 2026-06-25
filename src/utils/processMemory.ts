import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { platform } from 'node:os';

const execFileAsync = promisify(execFile);

/** Read RSS memory usage in MB for a process PID. Returns 0 if unavailable. */
export async function getProcessMemoryMb(pid: number): Promise<number> {
  if (!pid || pid <= 0) {
    return 0;
  }

  try {
    if (platform() === 'linux') {
      const content = await readFile(`/proc/${pid}/status`, 'utf8');
      const match = content.match(/^VmRSS:\s+(\d+)\s+kB/m);
      if (match?.[1]) {
        return Math.round(Number(match[1]) / 1024);
      }
    }

    if (platform() === 'darwin') {
      const { stdout } = await execFileAsync('ps', ['-o', 'rss=', '-p', String(pid)]);
      const kb = Number(stdout.trim());
      if (!Number.isNaN(kb)) {
        return Math.round(kb / 1024);
      }
    }
  } catch {
    return 0;
  }

  return 0;
}

/** Sum RSS for process tree (browser + child processes on Linux). */
export async function getBrowserMemoryMb(rootPid: number): Promise<number> {
  if (!rootPid) return 0;

  if (platform() === 'linux') {
    try {
      const { stdout } = await execFileAsync('ps', ['-o', 'pid=', '--ppid', String(rootPid)]);
      const childPids = stdout
        .split('\n')
        .map((s) => Number(s.trim()))
        .filter((n) => n > 0);

      const pids = [rootPid, ...childPids];
      let total = 0;
      for (const pid of pids) {
        total += await getProcessMemoryMb(pid);
      }
      return total;
    } catch {
      return getProcessMemoryMb(rootPid);
    }
  }

  return getProcessMemoryMb(rootPid);
}
