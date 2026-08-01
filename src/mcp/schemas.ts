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

export type ScreenshotInput = z.infer<typeof ScreenshotInputSchema>;
export type PdfInput = z.infer<typeof PdfInputSchema>;
export type HtmlInput = z.infer<typeof HtmlInputSchema>;
export type MetadataInput = z.infer<typeof MetadataInputSchema>;
