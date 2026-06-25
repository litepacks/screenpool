import type { Context } from 'hono';
import { isScreenPoolError } from '../errors.js';
import {
  BrowserCrashedError,
  BrowserNotInstalledError,
  BrowserNotFoundError,
  BrowserResolveError,
  InvalidRenderInputError,
  InvalidOutputPathError,
  MemoryLimitExceededError,
  NavigationError,
  QueueOverflowError,
  RenderTimeoutError,
  ScreenPoolNotStartedError,
  ScreenPoolStoppingError,
  SecurityBlockedUrlError,
  WorkerCrashedError,
} from '../errors.js';

/** Map ScreenPool errors to HTTP status codes. */
export function errorToStatus(error: unknown): number {
  if (!isScreenPoolError(error)) {
    return 500;
  }

  if (
    error instanceof SecurityBlockedUrlError ||
    error instanceof InvalidRenderInputError ||
    error instanceof InvalidOutputPathError
  ) {
    return 400;
  }

  if (error instanceof QueueOverflowError || error instanceof MemoryLimitExceededError) {
    return 429;
  }

  if (
    error instanceof ScreenPoolNotStartedError ||
    error instanceof ScreenPoolStoppingError ||
    error instanceof BrowserNotInstalledError ||
    error instanceof BrowserNotFoundError ||
    error instanceof BrowserResolveError
  ) {
    return 503;
  }

  if (error instanceof RenderTimeoutError) {
    return 504;
  }

  if (
    error instanceof NavigationError ||
    error instanceof WorkerCrashedError ||
    error instanceof BrowserCrashedError
  ) {
    return 502;
  }

  return 500;
}

/** Hono error handler for ScreenPool HTTP app. */
export function handleHttpError(error: Error, c: Context): Response {
  const status = errorToStatus(error);
  const message = error.message ?? 'Internal Server Error';

  return c.json(
    {
      error: error.name ?? 'Error',
      message,
    },
    status as 400,
  );
}
