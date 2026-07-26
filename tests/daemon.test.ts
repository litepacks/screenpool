import { describe, it, expect, afterEach } from 'vitest';
import { isSystemdSupported, startDaemon, stopDaemon, getDaemonStatus, removeDaemon } from '../src/utils/daemonManager.js';

describe('daemonManager unit tests', () => {
  const testServiceName = 'screenpool-test-service';

  afterEach(async () => {
    try {
      await removeDaemon({ name: testServiceName, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('should correctly check systemd support', async () => {
    const supported = await isSystemdSupported();
    expect(typeof supported).toBe('boolean');
  });

  it('should start and stop daemon gracefully', async () => {
    // Start test daemon process
    await startDaemon({
      name: testServiceName,
      port: 3999,
      host: '127.0.0.1',
      force: true,
    });

    // Verify status output doesn't throw
    await expect(getDaemonStatus({ name: testServiceName })).resolves.not.toThrow();

    // Stop daemon
    await expect(stopDaemon({ name: testServiceName })).resolves.not.toThrow();
  });

  it('should start daemon with random port gracefully', async () => {
    await startDaemon({
      name: testServiceName,
      randomPort: true,
      host: '127.0.0.1',
      force: true,
    });

    await expect(getDaemonStatus({ name: testServiceName })).resolves.not.toThrow();
    await expect(stopDaemon({ name: testServiceName })).resolves.not.toThrow();
  });
});
