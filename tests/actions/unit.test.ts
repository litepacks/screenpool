import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ScreenPool } from '../../src/ScreenPool.js';
import { resolveRecordingOptions } from '../../src/recording/presets.js';
import { sanitizeRecordingEvent } from '../../src/recording/events.js';
import { buildRecordingManifest } from '../../src/recording/manifest.js';
import { ActionError } from '../../src/actions/errors.js';

describe('Actions & Recording Unit Tests', () => {
  let pool: ScreenPool;

  beforeEach(() => {
    pool = new ScreenPool({ poolSize: 1 });
  });

  afterEach(async () => {
    await pool.stop().catch(() => undefined);
  });

  test('Recorder preset resolution works correctly', () => {
    const actionsPreset = resolveRecordingOptions({ preset: 'actions' });
    expect(actionsPreset.preset).toBe('actions');
    expect(actionsPreset.screenshots).toBe('off');

    const debugPreset = resolveRecordingOptions({ preset: 'debug' });
    expect(debugPreset.preset).toBe('debug');
    expect(debugPreset.screenshots).toBe('on-error');

    const visualPreset = resolveRecordingOptions({ preset: 'visual' });
    expect(visualPreset.preset).toBe('visual');
    expect(visualPreset.screenshots).toBe('each-action');
  });

  test('Secret masking redacts passwords and tokens from events', () => {
    const event = {
      sequence: 1,
      id: 'evt_1',
      timestamp: new Date().toISOString(),
      elapsedMs: 10,
      sessionId: 'session_1',
      type: 'action.started' as const,
      data: {
        actionType: 'fill',
        value: 'super-secret-password',
        password: 'my-password',
        token: 'secret-token-123',
      },
    };

    const sanitized = sanitizeRecordingEvent(event, {
      jsonKeys: ['password', 'token'],
    });

    expect(sanitized.data?.password).toBe('[REDACTED]');
    expect(sanitized.data?.token).toBe('[REDACTED]');
  });

  test('Recording manifest generation computes correct counts', () => {
    const manifest = buildRecordingManifest({
      id: 'rec_1',
      name: 'test-flow',
      sessionId: 'session_1',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: 100,
      success: true,
      options: resolveRecordingOptions({ preset: 'actions' }),
      pages: [],
      artifacts: [
        {
          id: 'art_1',
          type: 'screenshot',
          path: '/path/to/shot.png',
          mimeType: 'image/png',
          sizeBytes: 100,
          createdAt: new Date().toISOString(),
        },
      ],
      eventCount: 5,
      actionCount: 2,
      observationCount: 1,
    });

    expect(manifest.id).toBe('rec_1');
    expect(manifest.counts.events).toBe(5);
    expect(manifest.counts.actions).toBe(2);
    expect(manifest.counts.screenshots).toBe(1);
  });

  test('ActionError contains correct error code and details', () => {
    const err = new ActionError('AMBIGUOUS_TARGET', 'Target matched 3 visible elements.', {
      retryable: false,
      details: { matchCount: 3 },
    });

    expect(err.code).toBe('AMBIGUOUS_TARGET');
    expect(err.retryable).toBe(false);
    expect(err.details?.matchCount).toBe(3);
  });

  test('RecordingStorage does not pre-create empty subdirectories on init', async () => {
    const { RecordingStorage } = await import('../../src/recording/storage.js');
    const { existsSync } = await import('node:fs');
    const { rm } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const storage = new RecordingStorage('session_test', resolveRecordingOptions({ preset: 'actions' }));
    await storage.init();

    expect(existsSync(storage.dirPath)).toBe(true);
    expect(existsSync(join(storage.dirPath, 'screenshots'))).toBe(false);
    expect(existsSync(join(storage.dirPath, 'html'))).toBe(false);
    expect(existsSync(join(storage.dirPath, 'videos'))).toBe(false);

    await storage.close();
    try {
      await rm(storage.dirPath, { recursive: true, force: true });
    } catch {}
  });
});
