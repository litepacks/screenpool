import type { ActionPolicy } from './types.js';
import type { PagePolicy } from '../../pages/types.js';

export function resolvePagePolicy(override?: Partial<PagePolicy>): PagePolicy {
  return {
    maxPages: override?.maxPages ?? 5,
    onPopup: override?.onPopup ?? 'register',
    onActivePageClosed: override?.onActivePageClosed ?? 'activate-opener',
    allowCrossOrigin: override?.allowCrossOrigin ?? true,
    allowedDomains: override?.allowedDomains,
    deniedDomains: override?.deniedDomains,
  };
}

export function resolveActionPolicy(override?: Partial<ActionPolicy>): ActionPolicy {
  return {
    allowedActions: override?.allowedActions ?? [
      'click',
      'fill',
      'press',
      'select',
      'scroll',
      'wait',
      'screenshot',
      'page.activate',
      'page.close',
      'page.wait',
    ],
    maxActionsPerRun: override?.maxActionsPerRun ?? 20,
    maxRunDurationMs: override?.maxRunDurationMs ?? 60_000,
    pages: resolvePagePolicy(override?.pages),
    targets: {
      elementId: override?.targets?.elementId ?? true,
      semantic: override?.targets?.semantic ?? true,
      css: override?.targets?.css ?? false,
      point: override?.targets?.point ?? false,
    },
    input: {
      allowSensitiveValues: override?.input?.allowSensitiveValues ?? false,
      maxValueLength: override?.input?.maxValueLength ?? 10_000,
    },
    recording: {
      allowVideo: override?.recording?.allowVideo ?? false,
      maxDurationMs: override?.recording?.maxDurationMs ?? 10 * 60_000,
      maxArtifactBytes: override?.recording?.maxArtifactBytes,
    },
  };
}
