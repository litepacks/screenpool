import type { ScreenPool } from '../ScreenPool.js';
import type { ScreenpoolMcpConfig } from './config.js';
import { validateTargetUrl } from './security.js';
import { saveArtifactBuffer } from './artifacts.js';
import type { ScreenshotInput, PdfInput, HtmlInput, MetadataInput, HelpInput } from './schemas.js';
import { VERSION } from '../version.js';

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
  version = VERSION,
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

  const formatsDoc = {
    screenshot: ['png', 'jpeg', 'webp'],
    pdf: ['A4', 'Letter', 'Legal', 'Tabloid', 'A3', 'A5'],
    viewports: { default: '1280x720', max: '7680x4320' },
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

  const shadowDomDoc = {
    support: 'Full recursive scanning of open Shadow DOM roots for observation and target resolution.',
    elements: 'Buttons, textboxes, links, and custom Web Components inside open shadow roots are automatically discovered.',
    resolvers: 'Target resolvers (role, label, text, element-id, css, test-id) cross shadow root boundaries transparently.',
    closedShadowRoots: 'Closed shadow roots cannot be accessed via standard DOM APIs and will return a CLOSED_SHADOW_ROOT_NOT_ACCESSIBLE error.',
  };

  const actionSchemasDoc = {
    click: { type: 'click', target: { by: 'role', role: 'button', name: 'Submit' } },
    fill: { type: 'fill', target: { by: 'role', role: 'textbox', name: 'Search' }, value: 'fetch' },
    press: { type: 'press', key: 'Enter' },
    select: { type: 'select', target: { by: 'role', role: 'combobox' }, values: ['option-1'] },
    scroll: { type: 'scroll', deltaY: 500, behavior: 'smooth' },
    wait: { type: 'wait', durationMs: 2000 },
    screenshot: { type: 'screenshot', fullPage: true, format: 'png' },
    pageActivate: { type: 'page.activate', targetPage: { by: 'alias', value: 'popup1' } },
    pageClose: { type: 'page.close', targetPage: { by: 'active' } },
    pageWait: { type: 'page.wait', condition: { type: 'created', urlMatches: 'https://*' } },
  };

  const policyDoc = {
    default: 'CSS and Point targets are disabled by default for AI safety.',
    enablementExample: {
      policy: {
        targets: {
          css: true,
          point: true,
        },
      },
    },
  };

  if (topic === 'tools') {
    return { topic, tools: toolsDoc, shadowDom: shadowDomDoc, actions: actionSchemasDoc };
  }
  if (topic === 'diagnostics') {
    return { topic, diagnostics: diagnosticsDoc };
  }
  if (topic === 'examples') {
    return { topic, examples: examplesDoc, actions: actionSchemasDoc, policy: policyDoc };
  }
  if (topic === 'formats') {
    return {
      topic,
      formats: formatsDoc,
    };
  }

  return {
    doc: 'Screenpool MCP Documentation',
    topic,
    tools: toolsDoc,
    shadowDom: shadowDomDoc,
    actions: actionSchemasDoc,
    policy: policyDoc,
    diagnostics: diagnosticsDoc,
    formats: formatsDoc,
    examples: examplesDoc,
  };
}

export async function handleSessionCreate(pool: ScreenPool, input: any) {
  const session = await pool.sessions.create(input);
  return session.getInfo();
}

export async function handleSessionPages(pool: ScreenPool, input: any) {
  const session = pool.sessions.require(input.sessionId);
  const pagesList = await session.pages.list();
  return {
    mainPageId: session.mainPageId,
    activePageId: session.activePageId,
    pages: pagesList,
  };
}

export async function handleSessionClose(pool: ScreenPool, input: any) {
  await pool.sessions.close(input.sessionId);
  return { success: true, sessionId: input.sessionId };
}

export async function handleObserve(pool: ScreenPool, input: any) {
  const session = pool.sessions.require(input.sessionId);
  const obs = await session.observe(input);
  return obs;
}

export async function handleAct(pool: ScreenPool, input: any) {
  const session = pool.sessions.require(input.sessionId);
  if (input.policy) {
    Object.assign(session.actionPolicy.targets, input.policy.targets);
  }
  const result = await session.act(input);
  return result;
}

export async function handleRun(pool: ScreenPool, input: any) {
  const sessionOptions = {
    ...input.sessionOptions,
    policy: input.policy ?? input.sessionOptions?.policy,
  };
  const result = await pool.run({
    ...input,
    sessionOptions,
  });
  return result;
}

export async function handleRecordStart(pool: ScreenPool, input: any) {
  let session;
  let autoCreated = false;

  const sessionOpts = {
    ...input.sessionOptions,
    policy: input.policy ?? input.sessionOptions?.policy,
  };

  if (input.sessionId) {
    session = pool.sessions.require(input.sessionId);
  } else {
    session = await pool.sessions.create(sessionOpts);
    autoCreated = true;
    if (input.url) {
      await session.goto(input.url);
    }
  }

  const rec = await session.record.start(input.options);
  return {
    success: true,
    recordingId: rec.id,
    sessionId: session.id,
    autoCreatedSession: autoCreated,
    startedAt: rec.startedAt,
    options: rec.options,
  };
}

export async function handleRecordStop(pool: ScreenPool, input: any) {
  let session;
  if (input.sessionId) {
    session = pool.sessions.get(input.sessionId);
  } else {
    session = pool.sessions.findActiveRecordingSession();
  }

  let manifest;
  let targetSessionId = session?.id ?? input.sessionId ?? 'closed_session';

  if (session && session.record.get()) {
    manifest = await session.record.stop();
    pool.sessions.saveFinishedManifest(session.id, manifest.id, manifest);
  } else {
    manifest = pool.sessions.getFinishedManifest(input.sessionId || input.recordingId);
    if (!manifest) {
      throw new Error('No active or finished recording found to stop.');
    }
  }

  if (input.closeSession && session) {
    await pool.sessions.close(session.id).catch(() => undefined);
  }

  return {
    success: true,
    sessionId: targetSessionId,
    manifest,
    artifacts: manifest.artifacts,
  };
}

export async function handleRecordGet(pool: ScreenPool, input: any) {
  let session;
  if (input.sessionId) {
    session = pool.sessions.get(input.sessionId);
  } else {
    session = pool.sessions.findActiveRecordingSession();
  }

  if (!session) {
    return { success: true, active: null };
  }

  const active = session.record.get();
  return {
    success: true,
    sessionId: session.id,
    active: active ? { id: active.id, startedAt: active.startedAt } : null,
  };
}
