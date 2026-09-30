import type { ToolDefinition, McpApp } from 'mcponce';
import type { ScreenPool } from '../ScreenPool.js';
import type { ScreenpoolMcpConfig } from './config.js';
import type { McpLogger } from './logger.js';
import { formatErrorResponse } from './errors.js';
import {
  ScreenshotInputSchema,
  PdfInputSchema,
  HtmlInputSchema,
  MetadataInputSchema,
  HealthInputSchema,
  CapabilitiesInputSchema,
  HelpInputSchema,
  SessionCreateInputSchema,
  SessionPagesInputSchema,
  SessionCloseInputSchema,
  ObserveInputSchema,
  ActInputSchema,
  RunInputSchema,
  RecordStartInputSchema,
  RecordStopInputSchema,
  RecordGetInputSchema,
  CdpSendInputSchema,
  ModeSwitchInputSchema,
  StateExportInputSchema,
  StateImportInputSchema,
  PageSpeedInputSchema,
} from './schemas.js';
import {
  handleScreenshot,
  handlePdf,
  handleHtml,
  handleMetadata,
  handleHealth,
  handleCapabilities,
  handleHelp,
  handleSessionCreate,
  handleSessionPages,
  handleSessionClose,
  handleObserve,
  handleAct,
  handleRun,
  handleRecordStart,
  handleRecordStop,
  handleRecordGet,
  handleCdpSend,
  handleModeSwitch,
  handleStateExport,
  handleStateImport,
  handlePageSpeed,
} from './handlers.js';
import { randomBytes } from 'node:crypto';

export interface ScreenpoolMcpContext {
  pool: ScreenPool;
  config: ScreenpoolMcpConfig;
  logger: McpLogger;
  ensureStarted?: () => Promise<void>;
}

function toShape(schema: any): any {
  if (schema && typeof schema === 'object' && 'shape' in schema) {
    return typeof schema.shape === 'function' ? schema.shape() : schema.shape;
  }
  return schema;
}

async function executeToolHandler<TArgs, TRes>(
  toolName: string,
  args: TArgs,
  ctx: ScreenpoolMcpContext | undefined,
  fallbackPool: ScreenPool,
  fallbackConfig: ScreenpoolMcpConfig,
  fallbackLogger: McpLogger,
  fallbackEnsureStarted: (() => Promise<void>) | undefined,
  action: (pool: ScreenPool, args: TArgs, config: ScreenpoolMcpConfig) => Promise<TRes>,
  getUrl?: (args: TArgs) => string | undefined,
  needsPool: boolean = true,
) {
  const pool = ctx?.pool || fallbackPool;
  const config = ctx?.config || fallbackConfig;
  const logger = ctx?.logger || fallbackLogger;
  const ensureStarted = needsPool ? (ctx?.ensureStarted || fallbackEnsureStarted) : undefined;

  const requestId = randomBytes(4).toString('hex');
  const start = Date.now();
  const targetUrl = getUrl ? getUrl(args) : (args as any)?.url;
  try {
    if (ensureStarted) await ensureStarted();
    if (targetUrl) {
      logger.debug(`[${requestId}] Tool ${toolName} called for URL: ${targetUrl}`);
    } else {
      logger.debug(`[${requestId}] Tool ${toolName} called`);
    }
    const res = await action(pool, args, config);
    logger.logRequest(requestId, toolName, 'success', Date.now() - start, targetUrl);
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(res, null, 2),
        },
      ],
    };
  } catch (err: any) {
    const errRes = formatErrorResponse(err);
    logger.logRequest(requestId, toolName, 'error', Date.now() - start, errRes.error?.message || String(err));
    return {
      isError: true,
      content: [
        {
          type: 'text',
          text: JSON.stringify(errRes, null, 2),
        },
      ],
    };
  }
}

export function getScreenpoolTools(
  pool: ScreenPool,
  config: ScreenpoolMcpConfig,
  logger: McpLogger,
  ensureStarted?: () => Promise<void>,
): ToolDefinition<any, ScreenpoolMcpContext>[] {
  return [
    {
      name: 'screenpool_screenshot',
      description:
        'Capture a screenshot of a web page using the Screenpool browser pool. Supports full-page screenshots, custom viewport settings, configurable page load waiting behavior, and optional diagnostics ("errors" | "standard" | "verbose") for console logs, JS errors, failed network requests, and page state snapshots.',
      inputSchema: toShape(ScreenshotInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_screenshot',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          handleScreenshot,
        ),
    },
    {
      name: 'screenpool_pdf',
      description:
        'Render a web page as a PDF file using the Screenpool browser pool. Supports page formats (A4, Letter, etc.), margins, landscape mode, background graphics rendering, and optional diagnostics ("errors" | "standard" | "verbose") for page debugging.',
      inputSchema: toShape(PdfInputSchema),
      handler: (args, ctx) =>
        executeToolHandler('screenpool_pdf', args, ctx, pool, config, logger, ensureStarted, handlePdf),
    },
    {
      name: 'screenpool_html',
      description:
        'Fetch fully rendered HTML content of a web page after JavaScript execution. Supports truncation for very large pages and optional diagnostics ("errors" | "standard" | "verbose") for inspecting page execution issues.',
      inputSchema: toShape(HtmlInputSchema),
      handler: (args, ctx) =>
        executeToolHandler('screenpool_html', args, ctx, pool, config, logger, ensureStarted, handleHtml),
    },
    {
      name: 'screenpool_metadata',
      description:
        'Extract basic page metadata (title, description meta tag, canonical link, final URL) from a web page using Screenpool. Supports optional diagnostics ("errors" | "standard" | "verbose").',
      inputSchema: toShape(MetadataInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_metadata',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          handleMetadata,
        ),
    },
    {
      name: 'screenpool_health',
      description:
        'Check status, active workers, queue size, and uptime of the Screenpool browser worker pool.',
      inputSchema: toShape(HealthInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_health',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, _a, c) => handleHealth(p, c),
          undefined,
          false,
        ),
    },
    {
      name: 'screenpool_capabilities',
      description:
        'Retrieve supported features, formats, and available tool names for this Screenpool MCP server version.',
      inputSchema: toShape(CapabilitiesInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_capabilities',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (_p, _a, c) => handleCapabilities(c),
          undefined,
          false,
        ),
    },
    {
      name: 'screenpool_help',
      description:
        'Get structured documentation, usage instructions, diagnostics presets guide, and example payloads for all Screenpool MCP tools.',
      inputSchema: toShape(HelpInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_help',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (_p, a) => handleHelp(a),
          (a) => a?.topic,
          false,
        ),
    },
    {
      name: 'screenpool_session_create',
      description: 'Create an isolated browser session with multi-page lifecycle tracking.',
      inputSchema: toShape(SessionCreateInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_session_create',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleSessionCreate(p, a),
          (a) => a?.url,
        ),
    },
    {
      name: 'screenpool_session_pages',
      description: 'List managed pages and active/main page state in a session.',
      inputSchema: toShape(SessionPagesInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_session_pages',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleSessionPages(p, a),
        ),
    },
    {
      name: 'screenpool_session_close',
      description: 'Close an active browser session and release its isolated context.',
      inputSchema: toShape(SessionCloseInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_session_close',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleSessionClose(p, a),
        ),
    },
    {
      name: 'screenpool_observe',
      description:
        'Capture page observation state including interactive element IDs, viewport, scroll, and compact HTML.',
      inputSchema: toShape(ObserveInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_observe',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleObserve(p, a),
        ),
    },
    {
      name: 'screenpool_act',
      description:
        'Execute strict, verifiable browser actions (click, fill, press, select, scroll, wait, page actions) on a session.',
      inputSchema: toShape(ActInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_act',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          handleAct,
        ),
    },
    {
      name: 'screenpool_run',
      description:
        'Execute a sequence of browser actions in a temporary session. Supports optional recording preset, video, and action screenshots, returning the full recording manifest and artifact paths.',
      inputSchema: toShape(RunInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_run',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          handleRun,
          (a) => a?.url,
        ),
    },
    {
      name: 'screenpool_record_start',
      description:
        'Start session recording (events JSONL, action step screenshots, and video). Can auto-create a browser session if sessionId is omitted and optional url is provided.',
      inputSchema: toShape(RecordStartInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_record_start',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          handleRecordStart,
          (a) => a?.url,
        ),
    },
    {
      name: 'screenpool_record_stop',
      description:
        'Stop session recording and return complete recording manifest and artifact file paths. Automatically locates active recording if sessionId is omitted, and supports closeSession: true.',
      inputSchema: toShape(RecordStopInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_record_stop',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          handleRecordStop,
        ),
    },
    {
      name: 'screenpool_record_get',
      description:
        'Get active session recording status. Automatically checks active session recording if sessionId is omitted.',
      inputSchema: toShape(RecordGetInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_record_get',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          handleRecordGet,
        ),
    },
    {
      name: 'screenpool_cdp_send',
      description:
        'Send a raw Chrome DevTools Protocol (CDP) command to an active browser session (e.g. Network.emulateNetworkConditions, Emulation.setDeviceMetricsOverride, Page.captureSnapshot).',
      inputSchema: toShape(CdpSendInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_cdp_send',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleCdpSend(p, a),
        ),
    },
    {
      name: 'screenpool_mode_switch',
      description:
        'Dynamically switch the running browser pool between headless and headed (visible window) modes on the fly while preserving persistent profile data.',
      inputSchema: toShape(ModeSwitchInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_mode_switch',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleModeSwitch(p, a),
        ),
    },
    {
      name: 'screenpool_state_export',
      description:
        'Export all authentication cookies, localStorage, and sessionStorage from an active browser session to portable JSON format.',
      inputSchema: toShape(StateExportInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_state_export',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleStateExport(p, a),
        ),
    },
    {
      name: 'screenpool_state_import',
      description:
        'Import authentication cookies and localStorage into an active browser session.',
      inputSchema: toShape(StateImportInputSchema),
      sequential: 'browser',
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_state_import',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a) => handleStateImport(p, a),
        ),
    },
    {
      name: 'screenpool_pagespeed',
      description:
        'Audit a URL for Google Core Web Vitals (LCP, CLS, FCP, TTFB, INP) and PageSpeed performance metrics with zero overhead.',
      inputSchema: toShape(PageSpeedInputSchema),
      handler: (args, ctx) =>
        executeToolHandler(
          'screenpool_pagespeed',
          args,
          ctx,
          pool,
          config,
          logger,
          ensureStarted,
          (p, a, c) => handlePageSpeed(p, a, c),
          (a) => a.url,
        ),
    },
  ];
}

export function registerMcpTools(
  app: McpApp<ScreenpoolMcpContext> | any,
  pool: ScreenPool,
  config: ScreenpoolMcpConfig,
  logger: McpLogger,
  ensureStarted?: () => Promise<void>,
): void {
  if (!app || typeof app !== 'object') return;
  const conf = config || {};
  const enabled = new Set(
    conf.mcp?.enabledTools || [
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
      'screenpool_cdp_send',
      'screenpool_mode_switch',
      'screenpool_state_export',
      'screenpool_state_import',
      'screenpool_pagespeed',
      'screenpool_health',
      'screenpool_capabilities',
      'screenpool_help',
    ],
  );

  const tools = getScreenpoolTools(pool, conf, logger, ensureStarted);

  for (const tool of tools) {
    if (enabled.has(tool.name)) {
      if (typeof app.tool === 'function') {
        app.tool(tool);
      } else if (typeof app.registerTool === 'function') {
        app.registerTool(
          tool.name,
          {
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
          tool.handler,
        );
      }
    }
  }
}
