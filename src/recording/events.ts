import type { SessionEvent } from '../sessions/event-bus.js';
import type { RecordingOptions } from './types.js';

export function sanitizeRecordingEvent(
  event: SessionEvent,
  redactConfig: NonNullable<RecordingOptions['redact']>,
): SessionEvent {
  if (!event.data) return event;

  const sanitizedData = sanitizeObject(event.data, redactConfig);

  return {
    ...event,
    data: sanitizedData,
  };
}

function sanitizeObject(
  obj: Record<string, unknown>,
  redactConfig: NonNullable<RecordingOptions['redact']>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  const keysToMask = new Set(
    (redactConfig.jsonKeys ?? []).map((k) => k.toLowerCase()),
  );

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (
      keysToMask.has(lowerKey) ||
      lowerKey.includes('password') ||
      lowerKey.includes('secret') ||
      lowerKey.includes('token') ||
      lowerKey.includes('cookie') ||
      lowerKey.includes('auth') ||
      lowerKey.includes('cvv')
    ) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeObject(value as Record<string, unknown>, redactConfig);
    } else if (typeof value === 'string') {
      result[key] = sanitizeUrlOrText(value, redactConfig);
    } else {
      result[key] = value;
    }
  }

  return result;
}

function sanitizeUrlOrText(
  text: string,
  redactConfig: NonNullable<RecordingOptions['redact']>,
): string {
  if (text.startsWith('http://') || text.startsWith('https://')) {
    try {
      const url = new URL(text);
      const queryParamsToMask = new Set(
        (redactConfig.queryParams ?? []).map((q) => q.toLowerCase()),
      );

      for (const paramKey of Array.from(url.searchParams.keys())) {
        if (
          queryParamsToMask.has(paramKey.toLowerCase()) ||
          paramKey.toLowerCase().includes('token') ||
          paramKey.toLowerCase().includes('key') ||
          paramKey.toLowerCase().includes('secret')
        ) {
          url.searchParams.set(paramKey, '[REDACTED]');
        }
      }
      return url.toString();
    } catch {
      // not a valid URL, return text
    }
  }

  return text;
}
