import { describe, it, expect, afterAll } from 'vitest';
import { getChromiumPath, hasChromium } from './helpers/chromium.js';
import { ScreenPool } from '../src/ScreenPool.js';
import { getActiveSharedDaemonInfo, stopSharedDaemon } from '../src/utils/sharedDaemon.js';

const chromiumPath = getChromiumPath();

describe.skipIf(!hasChromium())('Shared Daemon & Single Process Reuse Tests', () => {
  afterAll(async () => {
    await stopSharedDaemon();
  });

  it('reuses the same Chromium process across multiple ScreenPool instances when shared is true', async () => {
    // Stop any existing daemon first
    await stopSharedDaemon();

    const pool1 = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      shared: true,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    const pool2 = new ScreenPool({
      executablePath: chromiumPath,
      poolSize: 1,
      shared: true,
      allowLocalhost: true,
      allowPrivateNetworks: true,
    });

    try {
      await pool1.start();
      const daemonInfo1 = await getActiveSharedDaemonInfo();
      expect(daemonInfo1).not.toBeNull();
      expect(daemonInfo1?.pid).toBeGreaterThan(0);
      expect(daemonInfo1?.wsEndpoint).toContain('ws://');

      await pool2.start();
      const daemonInfo2 = await getActiveSharedDaemonInfo();
      expect(daemonInfo2).not.toBeNull();

      // Both pools must share the exact same daemon PID and WebSocket endpoint
      expect(daemonInfo2?.pid).toBe(daemonInfo1?.pid);
      expect(daemonInfo2?.wsEndpoint).toBe(daemonInfo1?.wsEndpoint);

      // Verify both pools can execute rendering jobs concurrently on the shared browser
      const res1 = await pool1.htmlToImage({ html: '<h1>Pool 1</h1>' });
      const res2 = await pool2.htmlToImage({ html: '<h1>Pool 2</h1>' });

      expect(res1.buffer.length).toBeGreaterThan(0);
      expect(res2.buffer.length).toBeGreaterThan(0);
    } finally {
      // Disconnecting the pools should not crash the shared daemon
      await pool1.stop();
      await pool2.stop();

      const infoAfterStop = await getActiveSharedDaemonInfo();
      expect(infoAfterStop).not.toBeNull();
      expect(infoAfterStop?.pid).toBeGreaterThan(0);

      // Clean up daemon at the end of test
      await stopSharedDaemon();
    }
  }, 60000);
});
