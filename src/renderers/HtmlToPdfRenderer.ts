import type { Page } from 'puppeteer-core';
import type { RenderResult, ResolvedScreenPoolConfig, PdfOptions } from '../types.js';
import { InvalidRenderInputError } from '../errors.js';
import { renderPdf } from './PdfRenderer.js';

/** Render HTML string to PDF. */
export async function renderHtmlToPdf(
  page: Page,
  options: PdfOptions,
  jobId: string,
  config: ResolvedScreenPoolConfig,
): Promise<RenderResult> {
  if (!options.html) {
    throw new InvalidRenderInputError('html is required for htmlToPdf.');
  }

  const result = await renderPdf(page, { ...options, url: undefined }, jobId, config);
  return { ...result, type: 'htmlToPdf' };
}
