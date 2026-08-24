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
    includeElementHtml: input.includeElementHtml,
    includeCode: input.includeCode,
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
    elementHtml: res.elementHtml,
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
    'screenpool_session_create',
    'screenpool_session_pages',
    'screenpool_session_close',
    'screenpool_observe',
    'screenpool_act',
    'screenpool_run',
    'screenpool_record_start',
    'screenpool_record_stop',
    'screenpool_record_get',
    'screenpool_health',
    'screenpool_capabilities',
    'screenpool_help',
  ];

  return {
    version,
    tools: enabledTools,
    userDataDir: config.userDataDir,
    formats: {
      screenshot: ['png', 'jpeg', 'webp'],
      pdf: ['A4', 'Letter', 'Legal', 'Tabloid', 'A3', 'A5'],
    },
    sessions: {
      persistentProfileSupported: true,
      multiPageSupported: true,
      shadowDomSupported: true,
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
        url: 'string (required) - Web page URL to capture',
        fullPage: 'boolean (optional) - Capture full scrollable page height',
        format: 'png | jpeg | webp (default: png)',
        quality: 'number 0-100 (for jpeg/webp)',
        viewport: '{ width: number, height: number, deviceScaleFactor?: number }',
        waitUntil: 'load | domcontentloaded | networkidle0 | networkidle2',
        selector: 'string (optional) - CSS selector for specific element screenshot',
        includeElementHtml: 'boolean (optional) - Include HTML snippet of target element',
        includeCode: 'boolean (optional) - Include code snippet representation',
        delay: 'number (optional) - Extra delay in ms before capturing',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_pdf: {
      description: 'Render web page as PDF document with custom margins, landscape mode, scaling, and optional diagnostics.',
      parameters: {
        url: 'string (required) - Web page URL to render',
        format: 'A4 | Letter | Legal | Tabloid | A3 | A5 (default: A4)',
        landscape: 'boolean (optional) - Render in landscape orientation',
        printBackground: 'boolean (default: true) - Print background graphics and colors',
        margin: '{ top?: string, right?: string, bottom?: string, left?: string }',
        scale: 'number 0.1 to 2.0 (default: 1)',
        waitUntil: 'load | domcontentloaded | networkidle0 | networkidle2',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_html: {
      description: 'Extract fully rendered HTML content after JavaScript execution and hydration.',
      parameters: {
        url: 'string (required) - Web page URL to extract',
        waitUntil: 'load | domcontentloaded | networkidle0 | networkidle2',
        maxChars: 'number (default: 500,000) - Maximum HTML character limit',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_metadata: {
      description: 'Extract structured page metadata: title, meta description, canonical link, and resolved URL.',
      parameters: {
        url: 'string (required) - Web page URL',
        diagnostics: 'boolean | "errors" | "standard" | "verbose" | DiagnosticsOptions',
      },
    },
    screenpool_session_create: {
      description: 'Create an isolated or persistent browser session with multi-page lifecycle tracking.',
      parameters: {
        ttlMs: 'number (optional) - Time-to-live in ms before auto-expiry',
        persistent: 'boolean (optional) - Attach to Chromium default profile context preserving cookies/login on disk',
        policy: '{ targets?: { css?: boolean, point?: boolean } } - Target policy overrides',
        pages: '{ maxPages?: number, onPopup?: "register" | "register-and-activate" | "close" | "reject" }',
      },
    },
    screenpool_session_pages: {
      description: 'List managed pages and active/main page state in a session.',
      parameters: {
        sessionId: 'string (required) - Target browser session ID',
      },
    },
    screenpool_session_close: {
      description: 'Close an active browser session and release its isolated context (or pages if persistent).',
      parameters: {
        sessionId: 'string (required) - Session ID to close',
      },
    },
    screenpool_observe: {
      description: 'Capture page observation state including interactive element IDs, viewport, scroll, and compact HTML.',
      parameters: {
        sessionId: 'string (required) - Target session ID',
        screenshot: 'boolean (optional) - Include base64 screenshot in observation',
        html: '"off" | "compact" | "full" (optional, default: "compact") - Level of DOM structure returned',
        elements: 'boolean (optional, default: true) - Discover and index interactive elements',
      },
    },
    screenpool_act: {
      description: 'Execute strict, verifiable browser actions (click, fill, press, select, scroll, wait, page actions) on a session.',
      parameters: {
        sessionId: 'string (required) - Target session ID',
        actions: 'Action[] (required) - Array of action steps to execute sequentially',
        observationId: 'string (optional) - ID of preceding observation for validation',
        policy: '{ targets?: { css?: boolean, point?: boolean } } (optional)',
      },
    },
    screenpool_run: {
      description: 'Execute a sequence of browser actions in a temporary session with optional recording preset and artifact generation.',
      parameters: {
        url: 'string (optional) - Initial URL to open before executing actions',
        actions: 'Action[] (required) - Array of actions to execute',
        recording: '{ preset?: "actions" | "debug" | "visual" | "full", video?: boolean, screenshots?: string }',
        policy: '{ targets?: { css?: boolean, point?: boolean } }',
      },
    },
    screenpool_record_start: {
      description: 'Start action recording and optional video capture on an existing or auto-created session.',
      parameters: {
        sessionId: 'string (optional) - Target session ID (auto-created if omitted)',
        url: 'string (optional) - Initial URL to navigate to when auto-creating session',
        options: '{ preset?: "actions" | "debug" | "visual" | "full", video?: boolean, screenshots?: string }',
      },
    },
    screenpool_record_stop: {
      description: 'Stop active recording and produce complete execution manifest, video, and action screenshots.',
      parameters: {
        sessionId: 'string (optional) - Session ID to stop recording for',
        recordingId: 'string (optional) - Recording ID',
        closeSession: 'boolean (optional) - Whether to close session after stopping recording',
      },
    },
    screenpool_record_get: {
      description: 'Get current recording status and start timestamp for a session.',
      parameters: {
        sessionId: 'string (optional) - Session ID to query',
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
      description: 'Get structured documentation, usage instructions, action schemas, and authentication guides.',
      parameters: {
        topic: '"all" | "tools" | "sessions" | "auth" | "actions" | "targets" | "recording" | "diagnostics" | "formats" | "examples"',
      },
    },
  };

  const authAndSessionsDoc = {
    overview: 'ScreenPool supports both isolated (ephemeral) sessions and persistent authenticated profiles.',
    persistentProfiles: {
      howItWorks: 'When --user-data-dir is configured on ScreenPool or persistent: true is passed to screenpool_session_create, Chromium attaches to the disk-backed profile directory.',
      benefits: [
        'Persistent Login: Cookies, localStorage, session tokens, and IndexedDB persist across tool calls and server restarts.',
        'Zero-Credential AI Interaction: Users can log into web applications manually once, allowing AI agents to interact with protected dashboards without needing credentials or solving 2FA/captchas.',
        'Safe Cleanup: Closing a persistent session closes only the session tabs while keeping profile data and saved credentials intact.',
      ],
      mcpConfiguration: {
        command: 'screenpool',
        args: ['mcp', '--user-data-dir', './.screenpool-profile'],
        environmentVariable: 'SCREENPOOL_USER_DATA_DIR="./.screenpool-profile"',
      },
    },
    workflowExample: [
      '1. Start MCP with persistent profile directory (e.g. SCREENPOOL_USER_DATA_DIR="./.my-profile").',
      '2. Call screenpool_session_create with { persistent: true }.',
      '3. Navigate to application URL and execute actions; all session state and cookies are automatically preserved.',
    ],
  };

  const actionSchemasDoc = {
    click: {
      type: 'click',
      target: { by: 'role', role: 'button', name: 'Submit' },
      clickCount: 1,
      button: 'left',
      delayMs: 0,
      description: 'Click on interactive element resolved by target',
    },
    fill: {
      type: 'fill',
      target: { by: 'role', role: 'textbox', name: 'Email' },
      value: 'user@example.com',
      clearFirst: true,
      description: 'Clear input and type specified text',
    },
    press: {
      type: 'press',
      key: 'Enter',
      description: 'Press keyboard key (e.g. Enter, Tab, Escape, ArrowDown)',
    },
    select: {
      type: 'select',
      target: { by: 'role', role: 'combobox', name: 'Country' },
      values: ['US'],
      description: 'Select option(s) in dropdown or multi-select',
    },
    scroll: {
      type: 'scroll',
      deltaX: 0,
      deltaY: 500,
      behavior: 'smooth',
      description: 'Scroll window or scrollable container',
    },
    hover: {
      type: 'hover',
      target: { by: 'role', role: 'menuitem', name: 'Settings' },
      description: 'Move mouse cursor over target element to trigger hover states or tooltips',
    },
    wait: {
      type: 'wait',
      durationMs: 1500,
      description: 'Wait for specified duration in milliseconds',
    },
    screenshot: {
      type: 'screenshot',
      fullPage: true,
      format: 'png',
      description: 'Capture screenshot during action execution sequence',
    },
    pageActivate: {
      type: 'page.activate',
      targetPage: { by: 'alias', value: 'popup1' },
      description: 'Switch active tab focus within session',
    },
    pageClose: {
      type: 'page.close',
      targetPage: { by: 'active' },
      description: 'Close specified or currently active page in session',
    },
    pageWait: {
      type: 'page.wait',
      condition: { type: 'created', urlMatches: 'https://*' },
      description: 'Wait for new tab/popup creation or navigation condition',
    },
  };

  const targetsDoc = {
    overview: 'Targets identify DOM elements across standard DOM and open Shadow DOM boundaries.',
    types: {
      role: '{ by: "role", role: "button" | "textbox" | "link" | "combobox" | "checkbox" | "radio", name?: string } (Recommended for accessibility & AI robustness)',
      label: '{ by: "label", text: "Password", exact?: boolean }',
      text: '{ by: "text", text: "Sign In", exact?: boolean }',
      elementId: '{ by: "element-id", elementId: "e12" } (Obtained from screenpool_observe output)',
      css: '{ by: "css", selector: "#submit-btn" } (Requires policy.targets.css = true)',
      point: '{ by: "point", x: 100, y: 250 } (Requires policy.targets.point = true)',
    },
    policy: {
      defaultSafety: 'css and point targets are disabled by default for AI safety to prevent fragile selectors.',
      enablingPolicies: 'Pass policy: { targets: { css: true, point: true } } in session create, act, or run calls.',
    },
  };

  const recordingDoc = {
    presets: {
      actions: 'Records action steps and manifest summary without video.',
      debug: 'Captures action steps, plus auto-generates error screenshots and error HTML snapshots on failure.',
      visual: 'Captures full video (.webm) with interactive HTML5 video presentation player artifact and step screenshots.',
      full: 'Complete forensic capture: video, step screenshots, full console logs, network entries, and DOM snapshots.',
    },
    artifacts: {
      manifest: 'manifest.json containing step timings, errors, and artifact file links.',
      video: 'Full session video recording (.webm) and interactive player (.html).',
      screenshots: 'Individual action before/after image captures.',
    },
  };

  const diagnosticsDoc = {
    presets: {
      errors: 'Captures critical JS errors, console error logs, network failures, HTTP 4xx/5xx status codes, and error page state snapshots.',
      standard: 'Default for true. Captures warnings, errors, failed network requests, slow requests (>2000ms), and error artifacts.',
      verbose: 'Detailed tracing: all console levels, all network requests/responses, timeline events, navigation/paint metrics, and artifact bundles.',
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
    persistentSessionWorkflow: {
      step1_createSession: {
        tool: 'screenpool_session_create',
        args: {
          persistent: true,
          ttlMs: 3600000,
        },
      },
      step2_observe: {
        tool: 'screenpool_observe',
        args: {
          sessionId: 'session_xyz',
          screenshot: true,
        },
      },
      step3_act: {
        tool: 'screenpool_act',
        args: {
          sessionId: 'session_xyz',
          actions: [
            { type: 'fill', target: { by: 'role', role: 'textbox', name: 'Search' }, value: 'ScreenPool MCP' },
            { type: 'press', key: 'Enter' },
            { type: 'wait', durationMs: 1000 },
          ],
        },
      },
    },
    screenshotWithDiagnostics: {
      tool: 'screenpool_screenshot',
      args: {
        url: 'https://example.com',
        fullPage: true,
        format: 'webp',
        diagnostics: { preset: 'standard', output: 'summary' },
      },
    },
    statelessRunRecording: {
      tool: 'screenpool_run',
      args: {
        url: 'https://example.com',
        actions: [
          { type: 'click', target: { by: 'role', role: 'button', name: 'Get Started' } },
          { type: 'wait', durationMs: 500 },
        ],
        recording: { preset: 'visual', video: true },
      },
    },
  };

  const shadowDomDoc = {
    support: 'Full recursive scanning of open Shadow DOM roots for observation and target resolution.',
    elements: 'Buttons, textboxes, links, and custom Web Components inside open shadow roots are automatically discovered.',
    resolvers: 'Target resolvers (role, label, text, element-id, css, test-id) cross shadow root boundaries transparently.',
    closedShadowRoots: 'Closed shadow roots cannot be accessed via standard DOM APIs and will return a CLOSED_SHADOW_ROOT_NOT_ACCESSIBLE error.',
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
  if (topic === 'sessions' || topic === 'auth') {
    return { topic, authAndSessions: authAndSessionsDoc, tools: {
      screenpool_session_create: toolsDoc.screenpool_session_create,
      screenpool_session_pages: toolsDoc.screenpool_session_pages,
      screenpool_session_close: toolsDoc.screenpool_session_close,
      screenpool_observe: toolsDoc.screenpool_observe,
      screenpool_act: toolsDoc.screenpool_act,
    } };
  }
  if (topic === 'actions') {
    return { topic, actions: actionSchemasDoc, targets: targetsDoc, policy: policyDoc };
  }
  if (topic === 'targets') {
    return { topic, targets: targetsDoc, policy: policyDoc, shadowDom: shadowDomDoc };
  }
  if (topic === 'recording') {
    return { topic, recording: recordingDoc };
  }
  if (topic === 'diagnostics') {
    return { topic, diagnostics: diagnosticsDoc };
  }
  if (topic === 'examples') {
    return { topic, examples: examplesDoc, policy: policyDoc };
  }
  if (topic === 'formats') {
    return { topic, formats: formatsDoc };
  }

  return {
    doc: 'ScreenPool MCP Comprehensive Documentation',
    topic,
    tools: toolsDoc,
    authAndSessions: authAndSessionsDoc,
    actions: actionSchemasDoc,
    targets: targetsDoc,
    policy: policyDoc,
    shadowDom: shadowDomDoc,
    recording: recordingDoc,
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
