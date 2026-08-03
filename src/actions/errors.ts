export type ActionErrorCode =
  | 'SESSION_NOT_FOUND'
  | 'SESSION_CLOSED'
  | 'SESSION_EXPIRED'
  | 'PAGE_NOT_FOUND'
  | 'PAGE_NOT_RESOLVED'
  | 'PAGE_CLOSED'
  | 'PAGE_LIMIT_EXCEEDED'
  | 'PAGE_REGISTRATION_FAILED'
  | 'PAGE_ACTIVATION_FAILED'
  | 'EXPECTED_PAGE_NOT_OPENED'
  | 'AMBIGUOUS_NEW_PAGE'
  | 'UNEXPECTED_PAGE_BLOCKED'
  | 'CROSS_ORIGIN_PAGE_BLOCKED'
  | 'OBSERVATION_NOT_FOUND'
  | 'OBSERVATION_PAGE_MISMATCH'
  | 'OBSERVATION_PAGE_CLOSED'
  | 'STALE_OBSERVATION'
  | 'INVALID_OBSERVATION'
  | 'INVALID_ACTION'
  | 'ACTION_NOT_ALLOWED'
  | 'ACTION_TIMEOUT'
  | 'ACTION_LIMIT_EXCEEDED'
  | 'CLOSED_SHADOW_ROOT_NOT_ACCESSIBLE'
  | 'TARGET_NOT_FOUND'
  | 'AMBIGUOUS_TARGET'
  | 'TARGET_NOT_VISIBLE'
  | 'TARGET_DISABLED'
  | 'TARGET_NOT_EDITABLE'
  | 'PRECONDITION_FAILED'
  | 'VERIFICATION_FAILED'
  | 'RECORDING_ALREADY_ACTIVE'
  | 'RECORDING_NOT_ACTIVE'
  | 'RECORDING_START_FAILED'
  | 'RECORDING_STOP_FAILED'
  | 'RECORDING_ARTIFACT_WRITE_FAILED'
  | 'VIDEO_RECORDING_NOT_SUPPORTED'
  | 'RECORDING_LIMIT_EXCEEDED';

export class ActionError extends Error {
  readonly code: ActionErrorCode;
  readonly retryable: boolean;
  readonly suggestedAction?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ActionErrorCode,
    message: string,
    options: {
      retryable?: boolean;
      suggestedAction?: string;
      details?: Record<string, unknown>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = 'ActionError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.suggestedAction = options.suggestedAction;
    this.details = options.details;
  }
}
