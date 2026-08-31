import type { Page } from 'puppeteer-core';
import type { ExtractOptions, RenderResult, ResolvedScreenPoolConfig } from '../types.js';
import { setupPage, type PageDirtyState } from './PageSetup.js';
import { parse, execute } from 'pipsel';

/** Extract structured data using Pipsel DSL from URL or HTML. */
export async function renderExtract(
  page: Page,
  options: ExtractOptions,
  jobId: string,
  config: ResolvedScreenPoolConfig,
  dirtyState?: PageDirtyState,
): Promise<RenderResult> {
  const start = Date.now();
  await setupPage(page, options, config, dirtyState);

  const html = await page.content();
  const pageUrl = page.url();
  const currentUrl = pageUrl && pageUrl !== 'about:blank' ? pageUrl : options.url;

  const ast = parse(options.rules);
  const data = execute(ast, { html, url: currentUrl });

  const buffer = Buffer.from(JSON.stringify(data));

  return {
    buffer,
    contentType: 'application/json',
    durationMs: Date.now() - start,
    jobId,
    type: 'extract',
  };
}
