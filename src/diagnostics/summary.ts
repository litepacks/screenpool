import type {
  ConsoleDiagnosticEntry,
  DiagnosticArtifact,
  DiagnosticIssue,
  DiagnosticsSummary,
  NetworkFailureDiagnosticEntry,
  NetworkRequestDiagnosticEntry,
  NetworkResponseDiagnosticEntry,
  PageErrorDiagnosticEntry,
  PageStateDiagnostic,
} from './types.js';

export interface BuildSummaryParams {
  runId: string;
  startTime: number;
  endTime: number;
  success: boolean;
  pageState?: PageStateDiagnostic;
  consoleEntries: ConsoleDiagnosticEntry[];
  pageErrors: PageErrorDiagnosticEntry[];
  requests: NetworkRequestDiagnosticEntry[];
  responses: NetworkResponseDiagnosticEntry[];
  failures: NetworkFailureDiagnosticEntry[];
  issues: DiagnosticIssue[];
  artifacts?: DiagnosticArtifact[];
  truncatedFlags: {
    console?: boolean;
    pageErrors?: boolean;
    network?: boolean;
    timeline?: boolean;
    html?: boolean;
  };
}

export function buildDiagnosticsSummary(params: BuildSummaryParams): DiagnosticsSummary {
  const {
    runId,
    startTime,
    endTime,
    success,
    pageState,
    consoleEntries,
    pageErrors,
    requests,
    responses,
    failures,
    issues,
    artifacts,
    truncatedFlags,
  } = params;

  const durationMs = endTime - startTime;
  const startedAt = new Date(startTime).toISOString();
  const completedAt = new Date(endTime).toISOString();

  const consoleErrorsCount = consoleEntries.filter((c) => c.level === 'error').length;
  const responses4xxCount = responses.filter((r) => r.status >= 400 && r.status < 500).length;
  const responses5xxCount = responses.filter((r) => r.status >= 500).length;
  const slowRequestsCount = issues.filter((i) => i.type === 'slow-request').length;

  // Build top issues (prioritizing errors over warnings)
  const severityScore = (s: string) => (s === 'error' ? 3 : s === 'warning' ? 2 : 1);
  const topIssues = [...issues]
    .sort((a, b) => severityScore(b.severity) - severityScore(a.severity))
    .slice(0, 10);

  // Build top 10 slowest requests
  const slowestRequests = [...responses]
    .filter((r) => r.durationMs !== undefined && r.durationMs > 0)
    .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
    .slice(0, 10)
    .map((r) => ({
      url: r.url,
      status: r.status,
      durationMs: r.durationMs || 0,
    }));

  return {
    runId,
    startedAt,
    completedAt,
    durationMs,
    success,
    finalUrl: pageState?.url,
    title: pageState?.title,
    counts: {
      console: consoleEntries.length,
      consoleErrors: consoleErrorsCount,
      pageErrors: pageErrors.length,
      requests: requests.length,
      failedRequests: failures.length,
      responses4xx: responses4xxCount,
      responses5xx: responses5xxCount,
      slowRequests: slowRequestsCount,
      issues: issues.length,
    },
    topIssues,
    slowestRequests,
    artifacts,
    truncated: truncatedFlags,
  };
}
