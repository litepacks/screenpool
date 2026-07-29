import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveMcpConfig } from '../src/mcp/config.js';

describe('MCP Config Resolution Unit Tests', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.SCREENPOOL_BROWSER;
    delete process.env.SCREENPOOL_POOL_SIZE;
    delete process.env.SCREENPOOL_TIMEOUT;
    delete process.env.SCREENPOOL_HEADLESS;
    delete process.env.SCREENPOOL_ARTIFACTS_DIR;
    delete process.env.SCREENPOOL_ALLOW_PRIVATE_NETWORK;
    delete process.env.SCREENPOOL_LOG_LEVEL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('resolves default config values when no CLI or env vars specified', () => {
    const config = resolveMcpConfig({});
    expect(config.browser).toBe('chromium');
    expect(config.poolSize).toBe(3);
    expect(config.timeout).toBe(30000);
    expect(config.headless).toBe(true);
    expect(config.artifactsDir).toBe('.screenpool/artifacts');
    expect(config.logLevel).toBe('info');
    expect(config.security.allowPrivateNetwork).toBe(false);
  });

  it('allows environment variable overrides', () => {
    process.env.SCREENPOOL_POOL_SIZE = '5';
    process.env.SCREENPOOL_TIMEOUT = '45000';
    process.env.SCREENPOOL_ALLOW_PRIVATE_NETWORK = 'true';

    const config = resolveMcpConfig({});
    expect(config.poolSize).toBe(5);
    expect(config.timeout).toBe(45000);
    expect(config.security.allowPrivateNetwork).toBe(true);
  });

  it('gives CLI arguments highest precedence over env vars and defaults', () => {
    process.env.SCREENPOOL_POOL_SIZE = '5';

    const config = resolveMcpConfig({
      poolSize: 10,
      timeout: 12000,
      security: { allowPrivateNetwork: true },
    });

    expect(config.poolSize).toBe(10);
    expect(config.timeout).toBe(12000);
    expect(config.security.allowPrivateNetwork).toBe(true);
  });
});
