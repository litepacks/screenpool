import type { Page } from 'puppeteer-core';
import type { ExtractOptions, RenderResult, ResolvedScreenPoolConfig } from '../types.js';
import { setupPage } from './PageSetup.js';
import { parse, execute } from 'pipsel';

/** Extract structured data using Pipsel DSL from URL or HTML. */
export async function renderExtract(
  page: Page,
  options: ExtractOptions,
  jobId: string,
  config: ResolvedScreenPoolConfig,
): Promise<RenderResult> {
  const start = Date.now();
  await setupPage(page, options, config);

  const html = await page.content();
  const ast = parse(options.rules);
  const data = execute(ast, { html, url: options.url });

  const buffer = Buffer.from(JSON.stringify(data));

  return {
    buffer,
    contentType: 'application/json',
    durationMs: Date.now() - start,
    jobId,
    type: 'extract',
  };
}
