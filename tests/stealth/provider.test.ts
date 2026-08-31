import { describe, it, expect } from 'vitest';
import { createBrowserProvider } from '../../src/browser/create-browser-provider.js';
import { PuppeteerCoreProvider } from '../../src/browser/providers/puppeteer.js';
import { PuppeteerExtraProvider } from '../../src/browser/providers/puppeteer-extra.js';
import { createStealthPlugin, STEALTH_DEPENDENCY_ERROR_MESSAGE } from '../../src/stealth/create-stealth-plugin.js';
import { resolveConfig } from '../../src/types.js';

describe('Browser Provider & Stealth Plugin Factory', () => {
  it('instantiates PuppeteerCoreProvider when stealth is disabled', () => {
    const config = resolveConfig({ stealth: false });
    const provider = createBrowserProvider(config);

    expect(provider).toBeInstanceOf(PuppeteerCoreProvider);
    expect(provider.name).toBe('puppeteer-core');
    expect(provider.isStealth).toBe(false);
    expect(provider.getDiagnosticsInfo?.()).toEqual({
      provider: 'puppeteer-core',
      stealth: false,
    });
  });

  it('instantiates PuppeteerExtraProvider when stealth is enabled', () => {
    const config = resolveConfig({ stealth: true });
    const provider = createBrowserProvider(config);

    expect(provider).toBeInstanceOf(PuppeteerExtraProvider);
    expect(provider.name).toBe('puppeteer-extra');
    expect(provider.isStealth).toBe(true);
  });

  it('creates stealth plugin and disables specific evasions', async () => {
    const plugin = await createStealthPlugin({
      enabled: true,
      enabledEvasions: null,
      disabledEvasions: ['webgl.vendor'],
    });

    expect(plugin).toBeDefined();
    if (plugin.enabledEvasions instanceof Set) {
      expect(plugin.enabledEvasions.has('webgl.vendor')).toBe(false);
      expect(plugin.enabledEvasions.has('navigator.webdriver')).toBe(true);
    }
  });

  it('creates stealth plugin with explicit whitelist of enabled evasions', async () => {
    const plugin = await createStealthPlugin({
      enabled: true,
      enabledEvasions: ['navigator.webdriver'],
      disabledEvasions: [],
    });

    expect(plugin).toBeDefined();
    if (plugin.enabledEvasions instanceof Set) {
      expect(plugin.enabledEvasions.has('navigator.webdriver')).toBe(true);
      expect(plugin.enabledEvasions.size).toBe(1);
    }
  });

  it('provides descriptive missing dependency error message format', () => {
    expect(STEALTH_DEPENDENCY_ERROR_MESSAGE).toContain('Screenpool stealth mode requires');
    expect(STEALTH_DEPENDENCY_ERROR_MESSAGE).toContain('npm install puppeteer-extra puppeteer-extra-plugin-stealth');
  });
});
