import type { SessionEvent } from '../sessions/event-bus.js';
import type { ManagedPageSummary } from '../pages/types.js';

export type RecordingPreset = 'actions' | 'debug' | 'visual' | 'full';

export type ScreenshotRecordingMode =
  | 'off'
  | 'on-error'
  | 'before-action'
  | 'after-action'
  | 'each-action'
  | 'on-observation';

export type HtmlRecordingMode =
  | 'off'
  | 'on-error'
  | 'each-action'
  | 'on-observation';

export interface RecordingOptions {
  name?: string;
  preset?: RecordingPreset;
  events?: boolean;
  actions?: boolean;
  pages?: boolean;
  observations?: boolean;

  console?: boolean;
  pageErrors?: boolean;
  network?: 'off' | 'failed-only' | 'document-and-api' | 'all';

  screenshots?: ScreenshotRecordingMode;
  html?: HtmlRecordingMode;
  video?: boolean | { mode: 'per-page'; format?: 'webm' };

  artifactsDir?: string;
  maxEvents?: number;
  maxScreenshots?: number;
  maxHtmlSnapshots?: number;

  redact?: {
    headers?: string[];
    queryParams?: string[];
    jsonKeys?: string[];
  };
}

export interface RecordingArtifact {
  id: string;
  type: 'screenshot' | 'html' | 'video' | 'events' | 'manifest' | 'actions' | 'pages';
  pageId?: string;
  actionId?: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RecordedPageSummary extends ManagedPageSummary {
  recordings?: {
    videoId?: string;
  };
}

export interface RecordingManifest {
  id: string;
  name?: string;
  sessionId: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  success?: boolean;
  preset?: RecordingPreset;

  pages: RecordedPageSummary[];

  counts: {
    events: number;
    actions: number;
    observations: number;
    screenshots: number;
    htmlSnapshots: number;
    videos: number;
  };

  artifacts: RecordingArtifact[];
  notes?: string[];

  truncated?: {
    events?: boolean;
    screenshots?: boolean;
    htmlSnapshots?: boolean;
  };

  errors?: Array<{
    code: string;
    message: string;
  }>;
}

export interface ActiveRecording {
  id: string;
  name?: string;
  sessionId: string;
  startedAt: string;
  options: RecordingOptions;
  dirPath: string;
  stop: () => Promise<RecordingManifest>;
}

export type { SessionEvent as RecordingEvent };
