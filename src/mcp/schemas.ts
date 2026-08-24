import { z } from 'zod';

export const ViewportSchema = z
  .object({
    width: z.number().int().positive().max(7680),
    height: z.number().int().positive().max(4320),
    deviceScaleFactor: z.number().positive().max(4).optional(),
  })
  .optional();

export const WaitUntilSchema = z
  .enum(['load', 'domcontentloaded', 'networkidle0', 'networkidle2', 'networkidle'])
  .optional();

export const DiagnosticsInputSchema = z
  .union([
    z.boolean(),
    z.enum(['errors', 'standard', 'verbose']),
    z.object({
      preset: z.enum(['errors', 'standard', 'verbose']).optional(),
      output: z.enum(['summary', 'inline', 'artifacts']).optional(),
      console: z.union([z.boolean(), z.array(z.enum(['log', 'debug', 'info', 'warn', 'error']))]).optional(),
      pageErrors: z.boolean().optional(),
      network: z.enum(['off', 'failed-only', 'document-and-api', 'all']).optional(),
      httpErrors: z.boolean().optional(),
      slowRequests: z.union([z.boolean(), z.object({ thresholdMs: z.number() })]).optional(),
      pageState: z.boolean().optional(),
      performance: z.boolean().optional(),
      timeline: z.boolean().optional(),
      captureOnError: z
        .array(
          z.enum(['screenshot', 'html', 'page-state', 'console', 'network', 'timeline', 'summary']),
        )
        .optional(),
      captureOnSuccess: z
        .array(
          z.enum(['screenshot', 'html', 'page-state', 'console', 'network', 'timeline', 'summary']),
        )
        .optional(),
    }).passthrough(),
  ])
  .optional();

export const ScreenshotInputSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  fullPage: z.boolean().optional(),
  format: z.enum(['png', 'jpeg', 'webp']).optional(),
  quality: z.number().int().min(0).max(100).optional(),
  timeout: z.number().int().positive().max(300_000).optional(),
  viewport: ViewportSchema,
  waitUntil: WaitUntilSchema,
  omitBackground: z.boolean().optional(),
  selector: z.string().optional(),
  includeElementHtml: z.boolean().optional(),
  includeCode: z.boolean().optional(),
  delay: z.number().int().min(0).max(60_000).optional(),
  diagnostics: DiagnosticsInputSchema,
});

export const PdfMarginSchema = z
  .object({
    top: z.string().optional(),
    right: z.string().optional(),
    bottom: z.string().optional(),
    left: z.string().optional(),
  })
  .optional();

export const PdfInputSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  format: z.enum(['A4', 'Letter', 'Legal', 'Tabloid', 'A3', 'A5']).optional(),
  landscape: z.boolean().optional(),
  printBackground: z.boolean().optional(),
  margin: PdfMarginSchema,
  scale: z.number().positive().max(2).optional(),
  timeout: z.number().int().positive().max(300_000).optional(),
  waitUntil: WaitUntilSchema,
  diagnostics: DiagnosticsInputSchema,
});

export const HtmlInputSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  waitUntil: WaitUntilSchema,
  timeout: z.number().int().positive().max(300_000).optional(),
  maxChars: z.number().int().positive().optional().default(500_000),
  diagnostics: DiagnosticsInputSchema,
});

export const MetadataInputSchema = z.object({
  url: z.string().min(1, 'URL is required'),
  timeout: z.number().int().positive().max(300_000).optional(),
  diagnostics: DiagnosticsInputSchema,
});

export const HealthInputSchema = z.object({});

export const CapabilitiesInputSchema = z.object({});

export const HelpInputSchema = z.object({
  topic: z
    .enum(['all', 'tools', 'sessions', 'actions', 'targets', 'recording', 'auth', 'diagnostics', 'formats', 'examples'])
    .optional()
    .default('all')
    .describe('Topic for documentation: "all", "tools", "sessions", "actions", "targets", "recording", "auth", "diagnostics", "formats", or "examples"'),
});

import { actionSchema } from '../actions/schemas.js';

export const PolicyInputSchema = z
  .object({
    targets: z
      .object({
        elementId: z.boolean().optional(),
        semantic: z.boolean().optional(),
        css: z.boolean().optional(),
        point: z.boolean().optional(),
      })
      .optional(),
  })
  .optional();

export const SessionCreateInputSchema = z.object({
  ttlMs: z.number().optional().describe('Session time-to-live in milliseconds after which session automatically expires.'),
  persistent: z.boolean().optional().describe('Attach to Chromium default persistent profile context preserving cookies/login on disk.'),
  policy: PolicyInputSchema,
  pages: z
    .object({
      maxPages: z.number().optional(),
      onPopup: z.enum(['register', 'register-and-activate', 'close', 'reject']).optional(),
      onActivePageClosed: z.enum(['activate-opener', 'activate-main', 'activate-latest', 'none']).optional(),
      allowCrossOrigin: z.boolean().optional(),
    })
    .optional(),
});

export const SessionPagesInputSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
});

export const SessionCloseInputSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
});

export const ObserveInputSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  page: z.any().optional(),
  screenshot: z.boolean().optional(),
  html: z.enum(['off', 'compact', 'full']).optional(),
  elements: z.boolean().optional(),
});

export const ActInputSchema = z.object({
  sessionId: z.string().min(1, 'sessionId is required'),
  observationId: z.string().optional(),
  defaultPage: z.any().optional(),
  policy: PolicyInputSchema,
  actions: z.array(actionSchema),
});

export const RunInputSchema = z.object({
  url: z.string().optional(),
  policy: PolicyInputSchema,
  actions: z.array(actionSchema),
  recording: z
    .object({
      preset: z.enum(['actions', 'debug', 'visual', 'full']).optional(),
      screenshots: z.enum(['off', 'on-error', 'before-action', 'after-action', 'each-action', 'on-observation']).optional(),
      video: z.boolean().optional(),
      artifactsDir: z.string().optional(),
    })
    .optional(),
});

export const RecordStartInputSchema = z.object({
  sessionId: z.string().optional().describe('Session ID to record. If omitted, a new browser session is created automatically.'),
  url: z.string().optional().describe('Initial URL to navigate to when recording starts (used if auto-creating session).'),
  sessionOptions: z
    .object({
      ttlMs: z.number().optional(),
    })
    .optional(),
  options: z
    .object({
      preset: z.enum(['actions', 'debug', 'visual', 'full']).optional(),
      screenshots: z.enum(['off', 'on-error', 'before-action', 'after-action', 'each-action', 'on-observation']).optional(),
      video: z.boolean().optional(),
      artifactsDir: z.string().optional(),
    })
    .optional(),
});

export const RecordStopInputSchema = z.object({
  sessionId: z.string().optional().describe('Session ID to stop recording for. If omitted, finds active recording automatically.'),
  recordingId: z.string().optional(),
  closeSession: z.boolean().optional().describe('Whether to close the session after stopping recording (default: true if session was auto-created, false otherwise).'),
});

export const RecordGetInputSchema = z.object({
  sessionId: z.string().optional().describe('Session ID to get recording status for. If omitted, finds active recording automatically.'),
});

export type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;
export type PdfInput = z.infer<typeof PdfInputSchema>;
export type HtmlInput = z.infer<typeof HtmlInputSchema>;
export type MetadataInput = z.infer<typeof MetadataInputSchema>;
export type HelpInput = z.infer<typeof HelpInputSchema>;

