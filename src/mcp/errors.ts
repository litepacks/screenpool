import {
  isScreenPoolError,
  RenderTimeoutError,
  NavigationError,
  BrowserCrashedError,
  WorkerCrashedError,
  QueueOverflowError,
  SecurityBlockedUrlError,
  InvalidRenderInputError,
  MemoryLimitExceededError,
  BrowserNotInstalledError,
  BrowserNotFoundError,
  InvalidOutputPathError,
} from '../errors.js';

export type McpErrorCode =
  | 'INVALID_INPUT'
  | 'INVALID_URL'
  | 'DOMAIN_NOT_ALLOWED'
  | 'PRIVATE_NETWORK_BLOCKED'
  | 'NAVIGATION_FAILED'
  | 'TIMEOUT'
  | 'BROWSER_LAUNCH_FAILED'
  | 'SCREENSHOT_FAILED'
  | 'PDF_FAILED'
  | 'HTML_FAILED'
  | 'POOL_EXHAUSTED'
  | 'ARTIFACT_WRITE_FAILED'
  | 'INTERNAL_ERROR';

export interface McpErrorDetails {
  code: McpErrorCode;
  message: string;
  retryable?: boolean;
}

export class ScreenpoolMcpError extends Error {
  readonly code: McpErrorCode;
  readonly retryable: boolean;

  constructor(code: McpErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'ScreenpoolMcpError';
    this.code = code;
    this.retryable = retryable;
  }
}

export function toMcpError(err: unknown): ScreenpoolMcpError {
  if (err instanceof ScreenpoolMcpError) {
    return err;
  }

  if (isScreenPoolError(err)) {
    if (err instanceof RenderTimeoutError) {
      return new ScreenpoolMcpError('TIMEOUT', err.message, true);
    }
    if (err instanceof NavigationError) {
      return new ScreenpoolMcpError('NAVIGATION_FAILED', err.message, true);
    }
    if (err instanceof QueueOverflowError) {
      return new ScreenpoolMcpError('POOL_EXHAUSTED', err.message, true);
    }
    if (err instanceof SecurityBlockedUrlError) {
      return new ScreenpoolMcpError('PRIVATE_NETWORK_BLOCKED', err.message, false);
    }
    if (err instanceof InvalidRenderInputError) {
      return new ScreenpoolMcpError('INVALID_INPUT', err.message, false);
    }
    if (err instanceof MemoryLimitExceededError) {
      return new ScreenpoolMcpError('POOL_EXHAUSTED', err.message, true);
    }
    if (err instanceof BrowserCrashedError || err instanceof WorkerCrashedError) {
      return new ScreenpoolMcpError('BROWSER_LAUNCH_FAILED', err.message, true);
    }
    if (err instanceof BrowserNotInstalledError || err instanceof BrowserNotFoundError) {
      return new ScreenpoolMcpError('BROWSER_LAUNCH_FAILED', err.message, false);
    }
    if (err instanceof InvalidOutputPathError) {
      return new ScreenpoolMcpError('ARTIFACT_WRITE_FAILED', err.message, false);
    }
    return new ScreenpoolMcpError('INTERNAL_ERROR', err.message, false);
  }

  if (err instanceof Error) {
    const msg = err.message;
    if (msg.includes('invalid URL') || msg.includes('Invalid URL')) {
      return new ScreenpoolMcpError('INVALID_URL', msg, false);
    }
    if (msg.includes('timeout') || msg.includes('Timeout')) {
      return new ScreenpoolMcpError('TIMEOUT', msg, true);
    }
    return new ScreenpoolMcpError('INTERNAL_ERROR', msg, false);
  }

  return new ScreenpoolMcpError('INTERNAL_ERROR', String(err), false);
}

export function formatErrorResponse(err: unknown): {
  success: false;
  error: McpErrorDetails;
} {
  const mcpErr = toMcpError(err);
  return {
    success: false,
    error: {
      code: mcpErr.code,
      message: mcpErr.message,
      retryable: mcpErr.retryable,
    },
  };
}
