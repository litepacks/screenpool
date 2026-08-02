import type { PageReference } from '../pages/types.js';

export interface ObservedElement {
  id: string;
  tag: string;
  role?: string;
  name?: string;
  label?: string;
  text?: string;
  type?: string;
  visible: boolean;
  enabled: boolean;
  editable: boolean;
  box?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export interface ObservationArtifact {
  id: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
}

export interface Observation {
  id: string;
  sessionId: string;
  pageId: string;
  createdAt: string;

  page: {
    url: string;
    title: string;
    viewport: {
      width: number;
      height: number;
      deviceScaleFactor?: number;
    };
    scroll: {
      x: number;
      y: number;
    };
  };

  screenshot?: ObservationArtifact;

  html?: {
    mode: 'compact' | 'full';
    content?: string;
    artifact?: ObservationArtifact;
    truncated: boolean;
  };

  elements?: ObservedElement[];

  fingerprint: string;
}

export interface ObservationOptions {
  page?: PageReference;
  screenshot?: boolean;
  html?: 'off' | 'compact' | 'full';
  elements?: boolean;
  maxElements?: number;
}
