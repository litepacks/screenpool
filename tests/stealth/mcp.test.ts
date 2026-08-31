import { describe, it, expect, afterEach } from 'vitest';
import { resolveMcpConfig } from '../../src/mcp/config.js';
import { ScreenpoolMcpServer } from '../../src/mcp/server.js';

describe('Stealth MCP Configuration & Server Integration', () => {
  const originalEnv = process.env.SCREENPOOL_STEALTH;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.SCREENPOOL_STEALTH = originalEnv;
    } else {
      delete process.env.SCREENPOOL_STEALTH;
    }
  });

  it('resolves stealth as false by default in MCP config', () => {
    delete process.env.SCREENPOOL_STEALTH;
    const config = resolveMcpConfig({});
    expect(config.stealth).toBe(false);
  });

  it('resolves stealth from cliOptions', () => {
    const config = resolveMcpConfig({ stealth: true });
    expect(config.stealth).toBe(true);
  });

  it('resolves stealth from environment variable', () => {
    process.env.SCREENPOOL_STEALTH = 'true';
    const config = resolveMcpConfig({});
    expect(config.stealth).toBe(true);
  });

  it('resolves advanced stealth object from cliOptions', () => {
    const config = resolveMcpConfig({
      stealth: {
        enabled: true,
        disabledEvasions: ['webgl.vendor'],
      },
    });
    expect(config.stealth).toEqual({
      enabled: true,
      disabledEvasions: ['webgl.vendor'],
    });
  });

  it('initializes ScreenpoolMcpServer with stealth enabled without crashing', async () => {
    const server = new ScreenpoolMcpServer({
      config: {
        stealth: true,
        poolSize: 1,
        logLevel: 'silent',
      },
    });

    await server.init();
    await server.close();
  });
});
