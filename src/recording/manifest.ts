import type { RecordedPageSummary, RecordingArtifact, RecordingManifest, RecordingOptions, VideoMetadata } from './types.js';

export function buildRecordingManifest(params: {
  id: string;
  name?: string;
  sessionId: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  options: Required<RecordingOptions>;
  pages: RecordedPageSummary[];
  artifacts: RecordingArtifact[];
  eventCount: number;
  actionCount: number;
  observationCount: number;
  video?: VideoMetadata;
  recordingWarnings?: string[];
  errors?: Array<{ code: string; message: string }>;
  notes?: string[];
}): RecordingManifest {
  const screenshots = params.artifacts.filter((a) => a.type === 'screenshot').length;
  const htmlSnapshots = params.artifacts.filter((a) => a.type === 'html').length;
  const videos = params.artifacts.filter((a) => a.type === 'video').length;

  return {
    id: params.id,
    name: params.name,
    sessionId: params.sessionId,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    durationMs: params.durationMs,
    success: params.success,
    preset: params.options.preset,
    pages: params.pages,
    counts: {
      events: params.eventCount,
      actions: params.actionCount,
      observations: params.observationCount,
      screenshots,
      htmlSnapshots,
      videos,
    },
    video: params.video,
    recordingWarnings: params.recordingWarnings,
    artifacts: params.artifacts,
    errors: params.errors,
    notes: params.notes,
  };
}
