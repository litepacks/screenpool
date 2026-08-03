import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
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
} from './handlers.js';
import { randomBytes } from 'node:crypto';

export function registerMcpTools(
  server: McpServer,
  pool: ScreenPool,
  config: ScreenpoolMcpConfig,
  logger: McpLogger,
  ensureStarted?: () => Promise<void>,
): void {
  const enabled = new Set(
    config.mcp?.enabledTools || [
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
    ],
  );

  // 1. screenpool_screenshot
  if (enabled.has('screenpool_screenshot')) {
    server.registerTool(
      'screenpool_screenshot',
      {
        description:
          'Capture a screenshot of a web page using the Screenpool browser pool. Supports full-page screenshots, custom viewport settings, configurable page load waiting behavior, and optional diagnostics ("errors" | "standard" | "verbose") for console logs, JS errors, failed network requests, and page state snapshots.',
        inputSchema: ScreenshotInputSchema,
      },
      async (args) => {
        const requestId = randomBytes(4).toString('hex');
        const start = Date.now();
        try {
          if (ensureStarted) await ensureStarted();
          logger.debug(`[${requestId}] Tool screenpool_screenshot called for URL: ${args.url}`);
          const res = await handleScreenshot(pool, args, config);
          logger.logRequest(requestId, 'screenpool_screenshot', 'success', Date.now() - start, args.url);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          };
        } catch (err) {
          const errRes = formatErrorResponse(err);
          logger.logRequest(requestId, 'screenpool_screenshot', 'error', Date.now() - start, errRes.error.message);
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
      },
    );
  }

  // 2. screenpool_pdf
  if (enabled.has('screenpool_pdf')) {
    server.registerTool(
      'screenpool_pdf',
      {
        description:
          'Render a web page as a PDF file using the Screenpool browser pool. Supports page formats (A4, Letter, etc.), margins, landscape mode, background graphics rendering, and optional diagnostics ("errors" | "standard" | "verbose") for page debugging.',
        inputSchema: PdfInputSchema,
      },
      async (args) => {
        const requestId = randomBytes(4).toString('hex');
        const start = Date.now();
        try {
          if (ensureStarted) await ensureStarted();
          logger.debug(`[${requestId}] Tool screenpool_pdf called for URL: ${args.url}`);
          const res = await handlePdf(pool, args, config);
          logger.logRequest(requestId, 'screenpool_pdf', 'success', Date.now() - start, args.url);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          };
        } catch (err) {
          const errRes = formatErrorResponse(err);
          logger.logRequest(requestId, 'screenpool_pdf', 'error', Date.now() - start, errRes.error.message);
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
      },
    );
  }

  // 3. screenpool_html
  if (enabled.has('screenpool_html')) {
    server.registerTool(
      'screenpool_html',
      {
        description:
          'Fetch fully rendered HTML content of a web page after JavaScript execution. Supports truncation for very large pages and optional diagnostics ("errors" | "standard" | "verbose") for inspecting page execution issues.',
        inputSchema: HtmlInputSchema,
      },
      async (args) => {
        const requestId = randomBytes(4).toString('hex');
        const start = Date.now();
        try {
          if (ensureStarted) await ensureStarted();
          logger.debug(`[${requestId}] Tool screenpool_html called for URL: ${args.url}`);
          const res = await handleHtml(pool, args, config);
          logger.logRequest(requestId, 'screenpool_html', 'success', Date.now() - start, args.url);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          };
        } catch (err) {
          const errRes = formatErrorResponse(err);
          logger.logRequest(requestId, 'screenpool_html', 'error', Date.now() - start, errRes.error.message);
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
      },
    );
  }

  // 4. screenpool_metadata
  if (enabled.has('screenpool_metadata')) {
    server.registerTool(
      'screenpool_metadata',
      {
        description:
          'Extract basic page metadata (title, description meta tag, canonical link, final URL) from a web page using Screenpool. Supports optional diagnostics ("errors" | "standard" | "verbose").',
        inputSchema: MetadataInputSchema,
      },
      async (args) => {
        const requestId = randomBytes(4).toString('hex');
        const start = Date.now();
        try {
          if (ensureStarted) await ensureStarted();
          logger.debug(`[${requestId}] Tool screenpool_metadata called for URL: ${args.url}`);
          const res = await handleMetadata(pool, args, config);
          logger.logRequest(requestId, 'screenpool_metadata', 'success', Date.now() - start, args.url);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          };
        } catch (err) {
          const errRes = formatErrorResponse(err);
          logger.logRequest(requestId, 'screenpool_metadata', 'error', Date.now() - start, errRes.error.message);
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
      },
    );
  }

  // 5. screenpool_health
  if (enabled.has('screenpool_health')) {
    server.registerTool(
      'screenpool_health',
      {
        description:
          'Check status, active workers, queue size, and uptime of the Screenpool browser worker pool.',
        inputSchema: HealthInputSchema,
      },
      async () => {
        const requestId = randomBytes(4).toString('hex');
        const start = Date.now();
        try {
          const res = await handleHealth(pool, config);
          logger.logRequest(requestId, 'screenpool_health', 'success', Date.now() - start);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          };
        } catch (err) {
          const errRes = formatErrorResponse(err);
          logger.logRequest(requestId, 'screenpool_health', 'error', Date.now() - start, errRes.error.message);
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
      },
    );
  }

  // 6. screenpool_capabilities
  if (enabled.has('screenpool_capabilities')) {
    server.registerTool(
      'screenpool_capabilities',
      {
        description:
          'Retrieve supported features, formats, and available tool names for this Screenpool MCP server version.',
        inputSchema: CapabilitiesInputSchema,
      },
      async () => {
        const requestId = randomBytes(4).toString('hex');
        const start = Date.now();
        try {
          const res = await handleCapabilities(config);
          logger.logRequest(requestId, 'screenpool_capabilities', 'success', Date.now() - start);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          };
        } catch (err) {
          const errRes = formatErrorResponse(err);
          logger.logRequest(requestId, 'screenpool_capabilities', 'error', Date.now() - start, errRes.error.message);
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
      },
    );
  }

  // 7. screenpool_help
  if (enabled.has('screenpool_help')) {
    server.registerTool(
      'screenpool_help',
      {
        description:
          'Get structured documentation, usage instructions, diagnostics presets guide, and example payloads for all Screenpool MCP tools.',
        inputSchema: HelpInputSchema,
      },
      async (args) => {
        const requestId = randomBytes(4).toString('hex');
        const start = Date.now();
        try {
          const res = await handleHelp(args);
          logger.logRequest(requestId, 'screenpool_help', 'success', Date.now() - start);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(res, null, 2),
              },
            ],
          };
        } catch (err) {
          const errRes = formatErrorResponse(err);
          logger.logRequest(requestId, 'screenpool_help', 'error', Date.now() - start, errRes.error.message);
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
      },
    );
  }

  // 8. screenpool_session_create
  server.registerTool('screenpool_session_create', { description: 'Create an isolated browser session with multi-page lifecycle tracking.', inputSchema: SessionCreateInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleSessionCreate(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 9. screenpool_session_pages
  server.registerTool('screenpool_session_pages', { description: 'List managed pages and active/main page state in a session.', inputSchema: SessionPagesInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleSessionPages(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 10. screenpool_session_close
  server.registerTool('screenpool_session_close', { description: 'Close an active browser session and release its isolated context.', inputSchema: SessionCloseInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleSessionClose(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 11. screenpool_observe
  server.registerTool('screenpool_observe', { description: 'Capture page observation state including interactive element IDs, viewport, scroll, and compact HTML.', inputSchema: ObserveInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleObserve(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 12. screenpool_act
  server.registerTool('screenpool_act', { description: 'Execute strict, verifiable browser actions (click, fill, press, select, scroll, wait, page actions) on a session.', inputSchema: ActInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleAct(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 13. screenpool_run
  server.registerTool('screenpool_run', { description: 'Execute a sequence of browser actions in a temporary session. Supports optional recording preset, video, and action screenshots, returning the full recording manifest and artifact paths.', inputSchema: RunInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleRun(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 14. screenpool_record_start
  server.registerTool('screenpool_record_start', { description: 'Start session recording (events JSONL, action step screenshots, and video). Can auto-create a browser session if sessionId is omitted and optional url is provided.', inputSchema: RecordStartInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleRecordStart(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 15. screenpool_record_stop
  server.registerTool('screenpool_record_stop', { description: 'Stop session recording and return complete recording manifest and artifact file paths. Automatically locates active recording if sessionId is omitted, and supports closeSession: true.', inputSchema: RecordStopInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleRecordStop(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });

  // 16. screenpool_record_get
  server.registerTool('screenpool_record_get', { description: 'Get active session recording status. Automatically checks active session recording if sessionId is omitted.', inputSchema: RecordGetInputSchema }, async (args) => {
    if (ensureStarted) await ensureStarted();
    const res = await handleRecordGet(pool, args);
    return { content: [{ type: 'text', text: JSON.stringify(res, null, 2) }] };
  });
}
