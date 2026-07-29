export type LogLevel = 'silent' | 'error' | 'warn' | 'info' | 'debug';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4,
};

/**
 * Mask sensitive values in headers, tokens, credentials, and query params.
 */
export function maskSensitiveData(input: string): string {
  if (!input) return input;
  return input
    .replace(/(authorization|cookie|set-cookie|token|api_key|apikey|password|secret|key)=([^&\s;]+)/gi, '$1=***MASKED***')
    .replace(/(bearer\s+)[a-zA-Z0-9._~+/-]+=*/gi, '$1***MASKED***');
}

export class McpLogger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(targetLevel: LogLevel): boolean {
    if (this.level === 'silent') return false;
    return LOG_LEVEL_PRIORITY[targetLevel] <= LOG_LEVEL_PRIORITY[this.level];
  }

  error(message: string, ...args: any[]): void {
    if (this.shouldLog('error')) {
      const formatted = this.format('error', message, args);
      process.stderr.write(`${formatted}\n`);
    }
  }

  warn(message: string, ...args: any[]): void {
    if (this.shouldLog('warn')) {
      const formatted = this.format('warn', message, args);
      process.stderr.write(`${formatted}\n`);
    }
  }

  info(message: string, ...args: any[]): void {
    if (this.shouldLog('info')) {
      const formatted = this.format('info', message, args);
      process.stderr.write(`${formatted}\n`);
    }
  }

  debug(message: string, ...args: any[]): void {
    if (this.shouldLog('debug')) {
      const formatted = this.format('debug', message, args);
      process.stderr.write(`${formatted}\n`);
    }
  }

  logRequest(requestId: string, tool: string, status: string, durationMs: number, extra?: string): void {
    if (this.shouldLog('info')) {
      const extraInfo = extra ? ` ${maskSensitiveData(extra)}` : '';
      this.info(`request=${requestId} tool=${tool} status=${status} duration=${durationMs}ms${extraInfo}`);
    }
  }

  private format(level: LogLevel, message: string, args: any[]): string {
    const timestamp = new Date().toISOString();
    const prefix = `[screenpool:mcp] [${level.toUpperCase()}] [${timestamp}]`;
    const formattedMsg = maskSensitiveData(message);
    if (args.length === 0) {
      return `${prefix} ${formattedMsg}`;
    }
    const formattedArgs = args.map((a) => (typeof a === 'string' ? maskSensitiveData(a) : JSON.stringify(a))).join(' ');
    return `${prefix} ${formattedMsg} ${formattedArgs}`;
  }
}

export const defaultLogger = new McpLogger('info');
