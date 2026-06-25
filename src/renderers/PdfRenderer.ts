import type { Page, PDFOptions } from 'puppeteer-core';
import type { RenderResult, ResolvedScreenPoolConfig, PdfOptions } from '../types.js';
import { setupPage } from './PageSetup.js';

/** Render a PDF from URL or HTML. */
export async function renderPdf(
  page: Page,
  options: PdfOptions,
  jobId: string,
  config: ResolvedScreenPoolConfig,
): Promise<RenderResult> {
  const start = Date.now();
  await setupPage(page, options, config);

  const pdfSettings = options.pdf ?? {};
  const pdfOptions: PDFOptions = {
    format: pdfSettings.format,
    width: pdfSettings.width,
    height: pdfSettings.height,
    margin: pdfSettings.margin,
    printBackground: pdfSettings.printBackground ?? true,
    landscape: pdfSettings.landscape,
    preferCSSPageSize: pdfSettings.preferCSSPageSize,
    scale: pdfSettings.scale,
    pageRanges: pdfSettings.pageRanges,
    displayHeaderFooter: pdfSettings.displayHeaderFooter,
    headerTemplate: pdfSettings.headerTemplate,
    footerTemplate: pdfSettings.footerTemplate,
  };

  const buffer = Buffer.from(await page.pdf(pdfOptions));

  return {
    buffer,
    contentType: 'application/pdf',
    durationMs: Date.now() - start,
    jobId,
    type: 'pdf',
  };
}
