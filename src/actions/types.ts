import type { PageReference, ManagedPageSummary } from '../pages/types.js';
import type { Target, ClickTarget, EditableTarget, FocusableTarget } from './targets/types.js';
import type { VerificationCondition, VerificationResult } from './verification/types.js';
import type { ActionErrorCode } from './errors.js';
import type { Observation } from '../observations/types.js';
import type { RecordingManifest } from '../recording/types.js';

export type WaitStrategy = 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2' | number;

export interface ExpectedNavigation {
  urlMatches?: string;
  timeoutMs?: number;
}

export interface ExpectedPage {
  event: 'popup';
  alias?: string;
  urlMatches?: string;
  titleMatches?: string;
  timeoutMs?: number;
  activate?: boolean;
}

export interface ActionPrecondition {
  type: 'element-visible' | 'element-editable' | 'url';
  target?: Target;
  matches?: string;
}

export interface BaseAction {
  id?: string;
  type: string;
  page?: PageReference;
  timeoutMs?: number;
  before?: ActionPrecondition[];
  verify?: VerificationCondition[];
  onFailure?: 'stop' | 'continue';
}

export interface ClickAction extends BaseAction {
  type: 'click';
  target: ClickTarget;
  button?: 'left';
  count?: 1 | 2;
  expect?: {
    page?: ExpectedPage;
    navigation?: ExpectedNavigation;
  };
  waitAfter?: WaitStrategy;
}

export interface FillAction extends BaseAction {
  type: 'fill';
  target: EditableTarget;
  value: string;
  clear?: boolean;
  sensitive?: boolean;
}

export interface PressAction extends BaseAction {
  type: 'press';
  target?: FocusableTarget;
  key:
    | 'Enter'
    | 'Tab'
    | 'Escape'
    | 'ArrowUp'
    | 'ArrowDown'
    | 'ArrowLeft'
    | 'ArrowRight'
    | 'Backspace'
    | 'Delete';
}

export interface SelectAction extends BaseAction {
  type: 'select';
  target: Target;
  values: string[];
}

export interface ScrollAction extends BaseAction {
  type: 'scroll';
  target?: Target;
  x?: number;
  y?: number;
  deltaX?: number;
  deltaY?: number;
  behavior?: 'auto' | 'smooth';
}

export interface WaitAction extends BaseAction {
  type: 'wait';
  durationMs?: number;
  selector?: Target;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
}

export interface ScreenshotAction extends BaseAction {
  type: 'screenshot';
  fullPage?: boolean;
  format?: 'png' | 'jpeg' | 'webp';
}

export interface PageActivateAction extends BaseAction {
  type: 'page.activate';
  targetPage: PageReference;
}

export interface PageCloseAction extends BaseAction {
  type: 'page.close';
  targetPage?: PageReference;
}

export interface PageWaitAction extends BaseAction {
  type: 'page.wait';
  condition:
    | {
        type: 'created';
        urlMatches?: string;
        titleMatches?: string;
      }
    | {
        type: 'closed';
        page: PageReference;
      }
    | {
        type: 'url';
        page: PageReference;
        matches: string;
      };
}

export type Action =
  | ClickAction
  | FillAction
  | PressAction
  | SelectAction
  | ScrollAction
  | WaitAction
  | ScreenshotAction
  | PageActivateAction
  | PageCloseAction
  | PageWaitAction;

export interface ActRequest {
  observationId?: string;
  defaultPage?: PageReference;
  actions: Action[];
}

export interface ActionStepResult {
  index: number;
  id: string;
  type: Action['type'];
  pageId?: string;
  status: 'success' | 'failed' | 'skipped' | 'verification-failed';
  startedAt: string;
  durationMs: number;
  resolution?: {
    elementId?: string;
    matchCount?: number;
  };
  openedPages?: ManagedPageSummary[];
  closedPages?: ManagedPageSummary[];
  verification?: {
    success: boolean;
    results: VerificationResult[];
  };
  error?: {
    code: ActionErrorCode;
    message: string;
    retryable: boolean;
    suggestedAction?: string;
  };
}


export interface ActionRunResult {
  id: string;
  sessionId: string;
  success: boolean;
  startedAt: string;
  durationMs: number;
  initialPageId?: string;
  finalActivePageId?: string;
  pages: ManagedPageSummary[];
  steps: ActionStepResult[];
  observation?: Observation;
  recordingId?: string;
  recording?: RecordingManifest;
  diagnostics?: {
    id: string;
    artifacts?: unknown[];
  };
}
