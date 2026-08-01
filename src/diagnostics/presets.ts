import type {
  DiagnosticsInput,
  DiagnosticsOptions,
  DiagnosticsPreset,
} from './types.js';

export const PRESETS: Record<DiagnosticsPreset, Partial<DiagnosticsOptions>> = {
  errors: {
    console: ['error'],
    pageErrors: true,
    network: 'failed-only',
    httpErrors: true,
    captureOnError: ['screenshot', 'page-state'],
  },
  standard: {
    console: ['warn', 'error'],
    pageErrors: true,
    network: 'failed-only',
    httpErrors: true,
    slowRequests: true,
    pageState: true,
    captureOnError: ['screenshot', 'html', 'page-state'],
  },
  verbose: {
    console: true,
    pageErrors: true,
    network: 'all',
    httpErrors: true,
    slowRequests: true,
    pageState: true,
    performance: true,
    timeline: true,
    captureOnError: [
      'screenshot',
      'html',
      'page-state',
      'console',
      'network',
      'timeline',
    ],
  },
};

export const DEFAULT_DIAGNOSTICS_OPTIONS: Required<
  Omit<
    DiagnosticsOptions,
    'preset' | 'captureOnSuccess' | 'redact' | 'onEvent'
  >
> = {
  output: 'summary',
  console: ['warn', 'error'],
  pageErrors: true,
  network: 'failed-only',
  httpErrors: true,
  slowRequests: { thresholdMs: 2000 },
  pageState: true,
  performance: false,
  timeline: true,
  captureOnError: ['screenshot', 'html', 'page-state'],
  maxConsoleEntries: 500,
  maxPageErrors: 100,
  maxNetworkEntries: 1000,
  maxTimelineEntries: 2000,
  maxArgumentDepth: 3,
  maxArgumentLength: 10_000,
  maxHtmlLength: 1_000_000,
  maxResponseBodyLength: 100_000,
  artifactsDir: '.screenpool/diagnostics',
  artifactTtlMs: 3_600_000,
  includeRequestHeaders: false,
  includeResponseHeaders: false,
  includeResponseBodies: false,
};

/**
 * Resolves raw diagnostics input into a fully formed DiagnosticsOptions object.
 * Returns null if diagnostics is explicitly disabled (false or undefined).
 */
export function resolveDiagnosticsOptions(
  input?: DiagnosticsInput | null,
  globalDefaults?: Partial<DiagnosticsOptions>,
): DiagnosticsOptions | null {
  if (input === false || input === null || input === undefined) {
    return null;
  }

  let userOpts: DiagnosticsOptions = {};

  if (input === true) {
    userOpts = { preset: 'standard' };
  } else if (typeof input === 'string') {
    if (input in PRESETS) {
      userOpts = { preset: input as DiagnosticsPreset };
    } else {
      userOpts = { preset: 'standard' };
    }
  } else if (typeof input === 'object') {
    userOpts = { ...input };
  }

  const presetName = userOpts.preset ?? globalDefaults?.preset ?? 'standard';
  const presetConfig = PRESETS[presetName] ?? PRESETS.standard;

  const merged: DiagnosticsOptions = {
    ...DEFAULT_DIAGNOSTICS_OPTIONS,
    ...presetConfig,
    ...globalDefaults,
    ...userOpts,
    preset: presetName,
  };

  // Handle slowRequests normalize
  if (merged.slowRequests === true) {
    merged.slowRequests = { thresholdMs: 2000 };
  } else if (merged.slowRequests === false) {
    merged.slowRequests = undefined;
  }

  return merged;
}
