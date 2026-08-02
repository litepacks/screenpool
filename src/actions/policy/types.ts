import type { Action } from '../types.js';

export interface TargetPolicy {
  elementId: boolean;
  semantic: boolean;
  css: boolean;
  point: boolean;
}

export interface InputPolicy {
  allowSensitiveValues: boolean;
  maxValueLength: number;
}

export interface RecordingPolicy {
  allowVideo: boolean;
  maxDurationMs: number;
  maxArtifactBytes?: number;
}

export interface ActionPolicy {
  allowedActions: Action['type'][];
  maxActionsPerRun: number;
  maxRunDurationMs: number;
  pages: {
    maxPages: number;
    allowCrossOrigin: boolean;
    allowedDomains?: string[];
    deniedDomains?: string[];
  };
  targets: TargetPolicy;
  input: InputPolicy;
  recording: RecordingPolicy;
}
