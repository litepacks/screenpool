import type { SerializedDiagnosticValue } from './types.js';
import type { Sanitizer } from './sanitizer.js';

export interface SerializerOptions {
  maxDepth?: number;
  maxLength?: number;
  sanitizer?: Sanitizer;
}

export class SafeSerializer {
  private maxDepth: number;
  private maxLength: number;
  private sanitizer?: Sanitizer;

  constructor(options?: SerializerOptions) {
    this.maxDepth = options?.maxDepth ?? 3;
    this.maxLength = options?.maxLength ?? 10_000;
    this.sanitizer = options?.sanitizer;
  }

  serialize(value: unknown): SerializedDiagnosticValue {
    try {
      return this.serializeInternal(value, 0, new Set());
    } catch {
      return {
        type: 'unserializable',
        value: '[Unserializable Value]',
      };
    }
  }

  private serializeInternal(
    val: unknown,
    depth: number,
    seen: Set<unknown>,
  ): SerializedDiagnosticValue {
    if (val === null) {
      return { type: 'null', value: null };
    }
    if (val === undefined) {
      return { type: 'undefined', value: undefined };
    }

    const type = typeof val;

    if (type === 'boolean' || type === 'number') {
      return { type, value: val };
    }

    if (type === 'string') {
      let str = val as string;
      if (this.sanitizer) {
        str = this.sanitizer.sanitizeText(str);
      }
      if (str.length > this.maxLength) {
        return {
          type: 'string',
          value: str.slice(0, this.maxLength) + '...',
          truncated: true,
        };
      }
      return { type: 'string', value: str };
    }

    if (type === 'bigint') {
      return { type: 'bigint', value: (val as bigint).toString() };
    }

    if (type === 'symbol') {
      return { type: 'symbol', value: (val as symbol).toString() };
    }

    if (type === 'function') {
      const fn = val as Function;
      return {
        type: 'function',
        value: `function ${fn.name || 'anonymous'}()`,
      };
    }

    if (val instanceof Error) {
      return {
        type: 'error',
        value: {
          name: val.name,
          message: this.sanitizer ? this.sanitizer.sanitizeText(val.message) : val.message,
          stack: val.stack ? (this.sanitizer ? this.sanitizer.sanitizeText(val.stack) : val.stack) : undefined,
        },
      };
    }

    if (type === 'object') {
      if (seen.has(val)) {
        return { type: 'circular', value: '[Circular Reference]' };
      }

      if (depth >= this.maxDepth) {
        return {
          type: Array.isArray(val) ? 'array' : 'object',
          value: Array.isArray(val) ? '[Array]' : '[Object]',
          truncated: true,
        };
      }

      seen.add(val);

      try {
        if (Array.isArray(val)) {
          const items = val.slice(0, 100).map((item) =>
            this.serializeInternal(item, depth + 1, seen),
          );
          return {
            type: 'array',
            value: items,
            truncated: val.length > 100,
          };
        }

        const obj = val as Record<string, unknown>;
        const keys = Object.keys(obj).slice(0, 100);
        const result: Record<string, unknown> = {};

        for (const k of keys) {
          const v = obj[k];
          const serialized = this.serializeInternal(v, depth + 1, seen);
          result[k] = serialized.value;
        }

        return {
          type: 'object',
          value: this.sanitizer ? this.sanitizer.sanitizeValue(result) : result,
          truncated: Object.keys(obj).length > 100,
        };
      } finally {
        seen.delete(val);
      }
    }

    return { type: 'unknown', value: String(val) };
  }
}
