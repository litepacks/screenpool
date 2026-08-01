export type ConsoleLevel = 'log' | 'debug' | 'info' | 'warn' | 'error';

export type NetworkDebugMode = 'off' | 'failed-only' | 'document-and-api' | 'all';

export type DiagnosticsPreset = 'errors' | 'standard' | 'verbose';

export type DiagnosticsOutputMode = 'summary' | 'inline' | 'artifacts';

export type DiagnosticArtifactType =
  | 'screenshot'
  | 'html'
  | 'page-state'
  | 'console'
  | 'network'
  | 'timeline'
  | 'summary';

export interface DiagnosticsRedactConfig {
  headers?: string[];
  queryParams?: string[];
  jsonKeys?: string[];
}

export interface DiagnosticsOptions {
  preset?: DiagnosticsPreset;
  output?: DiagnosticsOutputMode;

  console?: boolean | ConsoleLevel[];
  pageErrors?: boolean;
  network?: NetworkDebugMode;
  httpErrors?: boolean;
  slowRequests?:
    | boolean
    | {
        thresholdMs: number;
      };
  pageState?: boolean;
  performance?: boolean;
  timeline?: boolean;

  captureOnError?: DiagnosticArtifactType[];
  captureOnSuccess?: DiagnosticArtifactType[];

  maxConsoleEntries?: number;
  maxPageErrors?: number;
  maxNetworkEntries?: number;
  maxTimelineEntries?: number;

  maxArgumentDepth?: number;
  maxArgumentLength?: number;
  maxHtmlLength?: number;
  maxResponseBodyLength?: number;

  artifactsDir?: string;
  artifactTtlMs?: number;

  includeRequestHeaders?: boolean;
  includeResponseHeaders?: boolean;
  includeResponseBodies?: boolean;

  redact?: DiagnosticsRedactConfig;

  /** Live diagnostic event callback */
  onEvent?: (event: DiagnosticTimelineEntry) => void;
}

export type DiagnosticsInput = boolean | DiagnosticsPreset | DiagnosticsOptions;

export interface SerializedDiagnosticValue {
  type: string;
  value: unknown;
  truncated?: boolean;
}

export interface ConsoleDiagnosticEntry {
  id: string;
  timestamp: string;
  elapsedMs: number;
  level: ConsoleLevel;
  text: string;
  location?: {
    url?: string;
    line?: number;
    column?: number;
  };
  args?: SerializedDiagnosticValue[];
}

export interface PageErrorDiagnosticEntry {
  id: string;
  timestamp: string;
  elapsedMs: number;
  name: string;
  message: string;
  stack?: string;
}

export interface NetworkRequestDiagnosticEntry {
  id: string;
  timestamp: string;
  elapsedMs: number;
  method: string;
  url: string;
  resourceType?: string;
  headers?: Record<string, string>;
}

export interface NetworkResponseDiagnosticEntry {
  requestId: string;
  timestamp: string;
  elapsedMs: number;
  status: number;
  statusText?: string;
  url: string;
  mimeType?: string;
  headers?: Record<string, string>;
  durationMs?: number;
  sizeBytes?: number;
  fromCache?: boolean;
  body?: string;
}

export interface NetworkFailureDiagnosticEntry {
  requestId: string;
  timestamp: string;
  elapsedMs: number;
  method: string;
  url: string;
  resourceType?: string;
  errorText?: string;
}

export type DiagnosticIssueType =
  | 'console-error'
  | 'page-error'
  | 'request-failed'
  | 'http-error'
  | 'slow-request'
  | 'navigation-error';

export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface DiagnosticIssue {
  type: DiagnosticIssueType;
  severity: DiagnosticSeverity;
  message: string;
  url?: string;
  status?: number;
  relatedEntryId?: string;
}

export interface PageStateDiagnostic {
  timestamp: string;
  url: string;
  title?: string;
  readyState?: string;
  viewport?: {
    width: number;
    height: number;
    deviceScaleFactor?: number;
  };
  scroll?: {
    x: number;
    y: number;
  };
  document?: {
    width: number;
    height: number;
  };
  activeElement?: {
    tag?: string;
    role?: string;
    type?: string;
    name?: string;
    id?: string;
    text?: string;
  };
  counts?: {
    iframes: number;
    dialogs: number;
    forms: number;
    buttons: number;
    inputs: number;
  };
  visibilityState?: string;
  hasFocus?: boolean;
}

export interface DiagnosticInteractiveElement {
  tag: string;
  role?: string;
  name?: string;
  text?: string;
  type?: string;
  visible?: boolean;
  enabled?: boolean;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type DiagnosticTimelineType =
  | 'run.started'
  | 'navigation.started'
  | 'navigation.completed'
  | 'navigation.failed'
  | 'console'
  | 'page-error'
  | 'request.started'
  | 'response.received'
  | 'request.failed'
  | 'action.started'
  | 'action.completed'
  | 'action.failed'
  | 'artifact.created'
  | 'run.completed'
  | 'run.failed';

export interface DiagnosticTimelineEntry {
  id: string;
  timestamp: string;
  elapsedMs: number;
  type: DiagnosticTimelineType;
  data?: Record<string, unknown>;
}

export interface ActionDiagnosticEntry {
  index: number;
  type: string;
  status: 'started' | 'success' | 'failed';
  startedAt: string;
  durationMs?: number;
  target?: unknown;
  resolution?: {
    matchCount?: number;
    selectedElement?: DiagnosticInteractiveElement;
  };
  error?: {
    code?: string;
    message: string;
  };
}

export interface NavigationPerformanceDiagnostic {
  navigationStart?: number;
  redirectMs?: number;
  dnsMs?: number;
  connectMs?: number;
  tlsMs?: number;
  requestMs?: number;
  ttfbMs?: number;
  responseMs?: number;
  domInteractiveMs?: number;
  domContentLoadedMs?: number;
  loadMs?: number;
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
  paintTiming?: {
    firstPaint?: number;
    firstContentfulPaint?: number;
  };
}

export interface DiagnosticArtifact {
  id: string;
  type: DiagnosticArtifactType;
  path: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface DiagnosticsSummary {
  runId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  finalUrl?: string;
  title?: string;
  counts: {
    console: number;
    consoleErrors: number;
    pageErrors: number;
    requests: number;
    failedRequests: number;
    responses4xx: number;
    responses5xx: number;
    slowRequests: number;
    issues: number;
  };
  topIssues: DiagnosticIssue[];
  slowestRequests: Array<{
    url: string;
    method?: string;
    status?: number;
    durationMs: number;
  }>;
  artifacts?: DiagnosticArtifact[];
  truncated?: {
    console?: boolean;
    pageErrors?: boolean;
    network?: boolean;
    timeline?: boolean;
    html?: boolean;
  };
}

export interface DiagnosticMarker {
  type: DiagnosticTimelineType;
  data?: Record<string, unknown>;
}

export interface FinalizeContext {
  success: boolean;
  error?: Error;
  buffer?: Buffer;
  contentType?: string;
}

export interface DiagnosticsResult {
  id: string;
  preset?: DiagnosticsPreset;
  summary: DiagnosticsSummary;
  console?: ConsoleDiagnosticEntry[];
  pageErrors?: PageErrorDiagnosticEntry[];
  network?: {
    requests: NetworkRequestDiagnosticEntry[];
    responses: NetworkResponseDiagnosticEntry[];
    failures: NetworkFailureDiagnosticEntry[];
  };
  pageState?: PageStateDiagnostic;
  interactiveElements?: DiagnosticInteractiveElement[];
  performance?: NavigationPerformanceDiagnostic;
  timeline?: DiagnosticTimelineEntry[];
  issues?: DiagnosticIssue[];
  artifacts?: DiagnosticArtifact[];
  artifactErrors?: Array<{ type: string; message: string }>;
  error?: {
    code: string;
    message: string;
  };
}
