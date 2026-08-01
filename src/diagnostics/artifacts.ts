import { mkdir, writeFile, readdir, stat, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import type {
  ConsoleDiagnosticEntry,
  DiagnosticArtifact,
  DiagnosticArtifactType,
  DiagnosticInteractiveElement,
  DiagnosticsOptions,
  DiagnosticsSummary,
  NetworkFailureDiagnosticEntry,
  NetworkRequestDiagnosticEntry,
  NetworkResponseDiagnosticEntry,
  PageErrorDiagnosticEntry,
  PageStateDiagnostic,
  DiagnosticTimelineEntry,
} from './types.js';

export interface SaveArtifactsOptions {
  runId: string;
  options: DiagnosticsOptions;
  summary: DiagnosticsSummary;
  consoleEntries?: ConsoleDiagnosticEntry[];
  pageErrors?: PageErrorDiagnosticEntry[];
  requests?: NetworkRequestDiagnosticEntry[];
  responses?: NetworkResponseDiagnosticEntry[];
  failures?: NetworkFailureDiagnosticEntry[];
  timelineEntries?: DiagnosticTimelineEntry[];
  pageState?: PageStateDiagnostic;
  interactiveElements?: DiagnosticInteractiveElement[];
  htmlContent?: string;
  screenshotBuffer?: Buffer;
}

export async function writeDiagnosticArtifacts(
  params: SaveArtifactsOptions,
): Promise<{ artifacts: DiagnosticArtifact[]; artifactErrors: Array<{ type: string; message: string }> }> {
  const artifacts: DiagnosticArtifact[] = [];
  const artifactErrors: Array<{ type: string; message: string }> = [];

  const rootDir = resolve(params.options.artifactsDir ?? '.screenpool/diagnostics');
  const timestamp = Date.now();
  const randomSuffix = randomBytes(4).toString('hex');
  const folderName = `run_${timestamp}_${randomSuffix}`;
  const runDir = join(rootDir, folderName);

  try {
    await mkdir(runDir, { recursive: true });
  } catch (err) {
    artifactErrors.push({
      type: 'directory',
      message: `Failed to create artifact directory ${runDir}: ${String(err)}`,
    });
    return { artifacts, artifactErrors };
  }

  const writeJsonArtifact = async (
    type: DiagnosticArtifactType,
    fileName: string,
    data: unknown,
  ) => {
    if (!data) return;
    const path = join(runDir, fileName);
    try {
      const content = JSON.stringify(data, null, 2);
      await writeFile(path, content, 'utf8');
      const fileStat = await stat(path);
      artifacts.push({
        id: `art_${artifacts.length + 1}`,
        type,
        path,
        mimeType: 'application/json',
        sizeBytes: fileStat.size,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      artifactErrors.push({
        type,
        message: `Failed to write artifact ${fileName}: ${String(err)}`,
      });
    }
  };

  const typesToSave = new Set(
    params.summary.success
      ? params.options.captureOnSuccess ?? []
      : params.options.captureOnError ?? ['screenshot', 'html', 'page-state'],
  );

  // Always write summary.json if artifacts directory is created
  await writeJsonArtifact('summary', 'summary.json', params.summary);

  if (typesToSave.has('console') && params.consoleEntries?.length) {
    await writeJsonArtifact('console', 'console.json', params.consoleEntries);
  }

  if (typesToSave.has('page-state')) {
    if (params.pageState) {
      await writeJsonArtifact('page-state', 'page-state.json', params.pageState);
    }
    if (params.interactiveElements?.length) {
      await writeJsonArtifact(
        'page-state',
        'interactive-elements.json',
        params.interactiveElements,
      );
    }
  }

  if (typesToSave.has('network')) {
    await writeJsonArtifact('network', 'network.json', {
      requests: params.requests ?? [],
      responses: params.responses ?? [],
      failures: params.failures ?? [],
    });
  }

  if (typesToSave.has('timeline') && params.timelineEntries?.length) {
    await writeJsonArtifact('timeline', 'timeline.json', params.timelineEntries);
  }

  if (typesToSave.has('html') && params.htmlContent) {
    const path = join(runDir, 'page.html');
    try {
      let html = params.htmlContent;
      const maxLen = params.options.maxHtmlLength ?? 1_000_000;
      if (html.length > maxLen) {
        html = html.slice(0, maxLen);
      }
      await writeFile(path, html, 'utf8');
      const fileStat = await stat(path);
      artifacts.push({
        id: `art_${artifacts.length + 1}`,
        type: 'html',
        path,
        mimeType: 'text/html',
        sizeBytes: fileStat.size,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      artifactErrors.push({
        type: 'html',
        message: `Failed to write page.html: ${String(err)}`,
      });
    }
  }

  if (typesToSave.has('screenshot') && params.screenshotBuffer) {
    const path = join(runDir, 'screenshot.png');
    try {
      await writeFile(path, params.screenshotBuffer);
      const fileStat = await stat(path);
      artifacts.push({
        id: `art_${artifacts.length + 1}`,
        type: 'screenshot',
        path,
        mimeType: 'image/png',
        sizeBytes: fileStat.size,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      artifactErrors.push({
        type: 'screenshot',
        message: `Failed to write screenshot.png: ${String(err)}`,
      });
    }
  }

  return { artifacts, artifactErrors };
}

/** Safely clean old diagnostic run folders older than TTL */
export async function cleanExpiredArtifacts(
  artifactsDir: string,
  ttlMs: number,
): Promise<void> {
  if (ttlMs <= 0) return;
  const rootDir = resolve(artifactsDir);

  try {
    const entries = await readdir(rootDir, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('run_')) {
        const folderPath = join(rootDir, entry.name);
        try {
          const match = entry.name.match(/^run_(\d+)_/);
          const timestampStr = match?.[1];
          const folderTime = timestampStr ? Number.parseInt(timestampStr, 10) : (await stat(folderPath)).mtimeMs;
          const ageMs = now - folderTime;
          if (ageMs > ttlMs) {
            await rm(folderPath, { recursive: true, force: true });
          }
        } catch {
          // ignore individual folder deletion errors
        }
      }
    }
  } catch {
    // ignore missing root directory or permission issues during cleanup
  }
}
