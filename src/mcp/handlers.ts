import type { ScreenPool } from '../ScreenPool.js';
import type { ScreenpoolMcpConfig } from './config.js';
import { validateTargetUrl } from './security.js';
import { saveArtifactBuffer } from './artifacts.js';
import type { ScreenshotInput, PdfInput, HtmlInput, MetadataInput } from './schemas.js';

export async function handleScreenshot(
  pool: ScreenPool,
  input: ScreenshotInput,
  config: ScreenpoolMcpConfig,
) {
  const start = Date.now();
  validateTargetUrl(input.url, config.security);

  const format = input.format || 'png';
  const ext = format === 'jpeg' ? 'jpg' : format;
  const mimeType = format === 'png' ? 'image/png' : format === 'jpeg' ? 'image/jpeg' : 'image/webp';

  const res = await pool.screenshot({
    url: input.url,
    fullPage: input.fullPage,
    format: format as any,
    quality: input.quality,
    viewport: input.viewport as any,
    waitUntil: input.waitUntil as any,
    omitBackground: input.omitBackground,
    selector: input.selector,
    waitForTimeout: input.delay,
    diagnostics: input.diagnostics,
  });

  const durationMs = Date.now() - start;
  const artifact = await saveArtifactBuffer(config.artifactsDir || '.screenpool/artifacts', 'screenshot', res.buffer, ext, mimeType);

  return {
    success: true,
    mimeType: artifact.mimeType,
    path: artifact.path,
    width: input.viewport?.width || 1280,
    height: input.viewport?.height || 800,
    size: artifact.size,
    durationMs,
    diagnostics: res.diagnostics,
  };
}

export async function handlePdf(
  pool: ScreenPool,
  input: PdfInput,
  config: ScreenpoolMcpConfig,
) {
  const start = Date.now();
  validateTargetUrl(input.url, config.security);

  const res = await pool.pdf({
    url: input.url,
    waitUntil: input.waitUntil as any,
    pdf: {
      format: input.format as any,
      landscape: input.landscape,
      printBackground: input.printBackground,
      margin: input.margin,
      scale: input.scale,
    },
    diagnostics: input.diagnostics,
  });

  const durationMs = Date.now() - start;
  const artifact = await saveArtifactBuffer(config.artifactsDir || '.screenpool/artifacts', 'pdf', res.buffer, 'pdf', 'application/pdf');

  return {
    success: true,
    mimeType: artifact.mimeType,
    path: artifact.path,
    size: artifact.size,
    durationMs,
    diagnostics: res.diagnostics,
  };
}

export async function handleHtml(
  pool: ScreenPool,
  input: HtmlInput,
  config: ScreenpoolMcpConfig,
) {
  const start = Date.now();
  validateTargetUrl(input.url, config.security);

  const rules = 'raw: "html" | html';
  const res = await pool.extract({
    url: input.url,
    rules,
    waitUntil: input.waitUntil as any,
    diagnostics: input.diagnostics,
  });

  const durationMs = Date.now() - start;
  const rawHtml: string = res.data?.raw || '';
  const originalLength = rawHtml.length;
  const maxChars = input.maxChars || 500_000;
  const truncated = originalLength > maxChars;
  const returnedHtml = truncated ? rawHtml.slice(0, maxChars) : rawHtml;

  return {
    success: true,
    url: input.url,
    html: returnedHtml,
    truncated,
    originalLength,
    returnedLength: returnedHtml.length,
    durationMs,
    diagnostics: res.diagnostics,
  };
}

export async function handleMetadata(
  pool: ScreenPool,
  input: MetadataInput,
  config: ScreenpoolMcpConfig,
) {
  const start = Date.now();
  validateTargetUrl(input.url, config.security);

  const rules = `
    title: "title" | text | trim
    description: "meta[name='description']" | attr("content") | trim
    canonical: "link[rel='canonical']" | attr("href") | trim
  `;

  const res = await pool.extract({
    url: input.url,
    rules,
    waitUntil: 'domcontentloaded',
    diagnostics: input.diagnostics,
  });

  const durationMs = Date.now() - start;
  const data = res.data || {};

  return {
    success: true,
    url: input.url,
    title: data.title || '',
    description: data.description || '',
    canonical: data.canonical || '',
    finalUrl: input.url,
    durationMs,
    diagnostics: res.diagnostics,
  };
}

export async function handleHealth(
  pool: ScreenPool,
  config: ScreenpoolMcpConfig,
) {
  const stats = pool.stats();
  return {
    status: stats.started ? 'ok' : 'stopped',
    browser: config.browser || 'chromium',
    poolSize: stats.poolSize,
    activeJobs: stats.activeJobs,
    idlePages: Math.max(0, stats.poolSize - stats.activeJobs),
    queuedJobs: stats.queuedJobs,
    completedJobs: stats.completedJobs,
    failedJobs: stats.failedJobs,
    uptimeMs: stats.uptimeMs,
  };
}

export async function handleCapabilities(
  config: ScreenpoolMcpConfig,
  version = '0.3.0',
) {
  const enabledTools = config.mcp?.enabledTools || [
    'screenpool_screenshot',
    'screenpool_pdf',
    'screenpool_html',
    'screenpool_metadata',
    'screenpool_health',
    'screenpool_capabilities',
  ];

  return {
    version,
    tools: enabledTools,
    formats: {
      screenshot: ['png', 'jpeg', 'webp'],
      pdf: ['A4', 'Letter', 'Legal', 'Tabloid', 'A3', 'A5'],
    },
  };
}
