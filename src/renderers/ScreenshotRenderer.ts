import type { Page } from 'puppeteer-core';
import type { RenderResult, ResolvedScreenPoolConfig, ScreenshotOptions } from '../types.js';
import { applyDarkMode, setupPage } from './PageSetup.js';

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

/** Render a screenshot from URL or HTML. */
export async function renderScreenshot(
  page: Page,
  options: ScreenshotOptions,
  jobId: string,
  config: ResolvedScreenPoolConfig,
): Promise<RenderResult> {
  const start = Date.now();
  await setupPage(page, options, config);
  await applyDarkMode(page, options.darkMode);

  const format = options.format ?? 'png';
  let buffer: Buffer;

  if (options.selector) {
    const element = await page.$(options.selector);
    if (!element) {
      throw new Error(`Selector not found: ${options.selector}`);
    }
    buffer = Buffer.from(
      (await element.screenshot({
        type: format,
        quality: format === 'png' ? undefined : options.quality,
        omitBackground: options.omitBackground,
      })) as Uint8Array,
    );
  } else {
    buffer = Buffer.from(
      (await page.screenshot({
        type: format,
        quality: format === 'png' ? undefined : options.quality,
        fullPage: options.fullPage ?? false,
        clip: options.clip,
        omitBackground: options.omitBackground,
      })) as Uint8Array,
    );
  }

  return {
    buffer,
    contentType: CONTENT_TYPES[format] ?? 'image/png',
    durationMs: Date.now() - start,
    jobId,
    type: 'screenshot',
  };
}
