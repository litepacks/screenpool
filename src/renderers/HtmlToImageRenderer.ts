import type { Page } from 'puppeteer-core';
import type { RenderResult, ResolvedScreenPoolConfig, ScreenshotOptions } from '../types.js';
import { InvalidRenderInputError } from '../errors.js';
import { renderScreenshot } from './ScreenshotRenderer.js';
import type { PageDirtyState } from './PageSetup.js';

/** Render HTML string to image. */
export async function renderHtmlToImage(
  page: Page,
  options: ScreenshotOptions,
  jobId: string,
  config: ResolvedScreenPoolConfig,
  dirtyState?: PageDirtyState,
): Promise<RenderResult> {
  if (!options.html) {
    throw new InvalidRenderInputError('html is required for htmlToImage.');
  }

  const result = await renderScreenshot(page, { ...options, url: undefined }, jobId, config, dirtyState);
  return { ...result, type: 'htmlToImage' };
}
