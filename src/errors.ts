/** Base class for typed ScreenPool errors. */
export class ScreenPoolError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ScreenPoolNotStartedError extends ScreenPoolError {
  constructor(message = 'ScreenPool is not started. Call start() first.') {
    super(message);
  }
}

export class ScreenPoolStoppingError extends ScreenPoolError {
  constructor(message = 'ScreenPool is stopping and cannot accept new jobs.') {
    super(message);
  }
}

export class QueueOverflowError extends ScreenPoolError {
  constructor(
    public readonly queuedJobs: number,
    public readonly maxQueueSize: number,
    message?: string,
  ) {
    super(
      message ??
        `Job queue is full (${queuedJobs}/${maxQueueSize}). Try again later.`,
    );
  }
}

export class RenderTimeoutError extends ScreenPoolError {
  constructor(
    public readonly jobId: string,
    public readonly timeoutMs: number,
    message?: string,
  ) {
    super(message ?? `Render job ${jobId} timed out after ${timeoutMs}ms.`);
  }
}

export class NavigationError extends ScreenPoolError {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export class BrowserCrashedError extends ScreenPoolError {
  constructor(message = 'Browser process crashed.') {
    super(message);
  }
}

export class WorkerCrashedError extends ScreenPoolError {
  constructor(
    public readonly workerId: number,
    message?: string,
  ) {
    super(message ?? `Worker ${workerId} crashed.`);
  }
}

export class InvalidRenderInputError extends ScreenPoolError {
  constructor(message: string) {
    super(message);
  }
}

export class SecurityBlockedUrlError extends ScreenPoolError {
  constructor(
    public readonly url: string,
    message?: string,
  ) {
    super(message ?? `URL blocked by security policy: ${url}`);
  }
}

export class MemoryLimitExceededError extends ScreenPoolError {
  constructor(
    public readonly memoryUsageMb: number,
    public readonly limitMb: number,
    message?: string,
  ) {
    super(
      message ??
        `Memory limit exceeded (${memoryUsageMb}MB / ${limitMb}MB). New jobs are rejected.`,
    );
  }
}

export class BrowserNotInstalledError extends ScreenPoolError {
  constructor(
    public readonly browserSpec: string,
    public readonly installCommand: string,
    message?: string,
  ) {
    super(
      message ??
        `Browser ${browserSpec} not found in cache.\nInstall with: ${installCommand}`,
    );
  }
}

export class BrowserNotFoundError extends ScreenPoolError {
  constructor(message = 'No Chromium executable found. Set executablePath or browser config.') {
    super(message);
  }
}

export class BrowserResolveError extends ScreenPoolError {
  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
  }
}

export class InvalidOutputPathError extends ScreenPoolError {
  constructor(
    public readonly path: string,
    message?: string,
  ) {
    super(message ?? `Invalid output path: ${path}`);
  }
}

/** Check whether an error is a ScreenPool typed error. */
export function isScreenPoolError(error: unknown): error is ScreenPoolError {
  return error instanceof ScreenPoolError;
}
