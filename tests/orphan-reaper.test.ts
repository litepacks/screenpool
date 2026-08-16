import { describe, it, expect } from 'vitest';
import {
  findScreenpoolChromeProcesses,
  cleanStaleProfileDirs,
  reapOrphanProcesses,
} from '../src/utils/orphanReaper.js';

describe('Orphan Reaper Tests', () => {
  it('identifies screenpool chrome processes without errors', () => {
    const list = findScreenpoolChromeProcesses();
    expect(Array.isArray(list)).toBe(true);
  });

  it('scans and cleans stale profile directories safely', () => {
    const count = cleanStaleProfileDirs();
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it('runs reapOrphanProcesses without throwing', () => {
    const res = reapOrphanProcesses();
    expect(res).toHaveProperty('killedCount');
    expect(res).toHaveProperty('pids');
    expect(res).toHaveProperty('cleanedProfilesCount');
    expect(typeof res.killedCount).toBe('number');
  });
});
