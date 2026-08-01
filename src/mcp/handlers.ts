import type { ScreenPool } from '../ScreenPool.js';
import type { ScreenpoolMcpConfig } from './config.js';
import { validateTargetUrl } from './security.js';
import { saveArtifactBuffer } from './artifacts.js';
import type { ScreenshotInput, PdfInput, HtmlInput, MetadataInput, HelpInput } from './schemas.js';

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
    'screenpool_help',
  ];

  return {
    version,
    tools: enabledTools,
    formats: {
      screenshot: ['png', 'jpeg', 'webp'],
      pdf: ['A4', 'Letter', 'Legal', 'Tabloid', 'A3', 'A5'],
    },
    diagnostics: {
      supported: true,
      presets: ['errors', 'standard', 'verbose'],
      outputs: ['summary', 'inline', 'artifacts'],
      features: [
        'console',
        'pageErrors',
        'network',
        'pageState',
        'performance',
        'timeline',
        'artifacts',
        'sanitizer',
      ],
    },
  };
}

export async function handleHelp(input: HelpInput) {
  const topic = input.topic || 'all';

  const toolsDoc = {
    screenpool_screenshot: {
      description: 'Capture web page screenshot in png, jpeg, or webp formats with full-page, element selector, and optional diagnostics.',
      parameters: {
        url: 'string (required)',
        fullPage: 'boolean (optional)',
        format: 'png | jpeg | webp (default: png)',
        quality: 'number 0-100 (for jpeg/webp)',
        viewport: '{ width: number, height: number, deviceScaleFactor?: number }',
        waitUntil: 'load | domcontentloaded | networkidle0 | networkidle2',
        selector: 'string (CSS selector for specific element screenshot)',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_pdf: {
      description: 'Render web page as PDF document with custom margins, landscape mode, and optional diagnostics.',
      parameters: {
        url: 'string (required)',
        format: 'A4 | Letter | Legal | Tabloid | A3 | A5 (default: A4)',
        landscape: 'boolean (optional)',
        printBackground: 'boolean (default: true)',
        margin: '{ top?: string, right?: string, bottom?: string, left?: string }',
        scale: 'number (0.1 to 2)',
        waitUntil: 'load | domcontentloaded | networkidle0 | networkidle2',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_html: {
      description: 'Extract fully rendered HTML content after JavaScript execution.',
      parameters: {
        url: 'string (required)',
        waitUntil: 'load | domcontentloaded | networkidle0 | networkidle2',
        maxChars: 'number (max HTML character truncation limit, default 500,000)',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_metadata: {
      description: 'Extract page title, description meta tag, canonical link, and final URL.',
      parameters: {
        url: 'string (required)',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_health: {
      description: 'Inspect worker pool status, active worker count, queue length, and uptime.',
      parameters: {},
    },
    screenpool_capabilities: {
      description: 'List supported features, tool list, formats, and diagnostics presets/outputs.',
      parameters: {},
    },
    screenpool_help: {
      description: 'Get structured documentation, usage instructions, diagnostics presets guide, and example payloads.',
      parameters: {
        topic: 'all | tools | diagnostics | formats | examples',
      },
    },
  };

  const diagnosticsDoc = {
    presets: {
      errors: 'Captures critical JS errors, console error logs, network failures, HTTP 4xx/5xx status codes, and error page state snapshots.',
      standard: 'Default for true. Captures warnings, errors, failed network requests, slow requests (>2000ms), sayfa durumu, hata anında screenshot, HTML ve page-state.',
      verbose: 'Detailed tracing. Captures all console levels, all network requests/responses, timeline events, navigation/paint performance metrics, and artifact bundles.',
    },
    outputs: {
      summary: 'Returns summary object containing issue counts, top issues, slowest requests, and artifact references.',
      inline: 'Returns full arrays of console logs, network entries, page error stack traces, and timeline entries directly in response.',
      artifacts: 'Saves raw diagnostic records and assets to disk artifact bundle folder (.screenpool/diagnostics/run_...).',
    },
    sanitization: 'Redacts sensitive headers (Authorization, Cookie, X-API-Key), query parameters (token, secret, apiKey), JSON payload keys, and URL credentials automatically with [REDACTED].',
  };

  const examplesDoc = {
    screenshotWithDiagnostics: {
      url: 'https://example.com',
      fullPage: true,
      format: 'webp',
      diagnostics: {
        preset: 'standard',
        output: 'summary',
      },
    },
    pdfWithCustomOptions: {
      url: 'https://example.com',
      format: 'A4',
      landscape: true,
      margin: { top: '1cm', bottom: '1cm' },
    },
    htmlExtraction: {
      url: 'https://example.com',
      waitUntil: 'networkidle2',
      maxChars: 100000,
    },
  };

  if (topic === 'tools') {
    return { topic, tools: toolsDoc };
  }
  if (topic === 'diagnostics') {
    return { topic, diagnostics: diagnosticsDoc };
  }
  if (topic === 'examples') {
    return { topic, examples: examplesDoc };
  }
  if (topic === 'formats') {
    return {
      topic,
      formats: {
        screenshot: ['png', 'jpeg', 'webp'],
        pdf: ['A4', 'Letter', 'Legal', 'Tabloid', 'A3', 'A5'],
        viewports: { default: '1280x720', max: '7680x4320' },
      },
    };
  }

  return {
    topic: 'all',
    overview: 'Screenpool is a lightweight in-process browser pool for Node.js providing screenshot, PDF, HTML extraction, metadata, health monitoring, and advanced diagnostics.',
    tools: toolsDoc,
    diagnostics: diagnosticsDoc,
    examples: examplesDoc,
  };
}
