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
} from './schemas.js';
import {
  handleScreenshot,
  handlePdf,
  handleHtml,
  handleMetadata,
  handleHealth,
  handleCapabilities,
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
      'screenpool_health',
      'screenpool_capabilities',
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
}
