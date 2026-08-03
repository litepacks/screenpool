import type { PageRegistry } from '../pages/registry.js';
import type { Cleanup, SessionEvent, SessionEventBus } from '../sessions/event-bus.js';
import type { ActiveRecording, RecordingManifest, RecordingOptions } from './types.js';
import { resolveRecordingOptions } from './presets.js';
import { RecordingStorage } from './storage.js';
import { sanitizeRecordingEvent } from './events.js';
import { buildRecordingManifest } from './manifest.js';
import { ActionError } from '../actions/errors.js';
import { toPageSummary } from '../pages/types.js';

import { PuppeteerVisualRecorder } from './visual-recorder.js';

export class SessionRecorder {
  private activeRecording: ActiveRecording | null = null;
  private storage: RecordingStorage | null = null;
  private visualRecorder = new PuppeteerVisualRecorder();
  private cleanupBus?: Cleanup;
  private options?: Required<RecordingOptions>;

  private actionCount = 0;
  private observationCount = 0;

  constructor(
    private readonly sessionId: string,
    private readonly registry: PageRegistry,
    private readonly eventBus: SessionEventBus,
  ) {}

  get isActive(): boolean {
    return this.activeRecording !== null;
  }

  getActive(): ActiveRecording | undefined {
    return this.activeRecording ?? undefined;
  }

  async start(options: RecordingOptions = {}): Promise<ActiveRecording> {
    if (this.isActive) {
      throw new ActionError(
        'RECORDING_ALREADY_ACTIVE',
        `Recording is already active for session ${this.sessionId}.`,
      );
    }

    const resolved = resolveRecordingOptions(options);
    this.options = resolved;

    const storage = new RecordingStorage(this.sessionId, resolved);
    await storage.init();
    this.storage = storage;

    // Attach visual recorder if video option is enabled
    if (resolved.video) {
      for (const page of this.registry.list()) {
        void this.visualRecorder.attach(page, storage);
      }
    }

    const startedAt = new Date().toISOString();

    // Subscribe to session event bus
    this.cleanupBus = this.eventBus.subscribe((evt) => {
      this.handleSessionEvent(evt);
    });

    this.eventBus.emit('recording.started', {
      data: { recordingId: storage.recordingId, preset: resolved.preset },
    });

    const activeRec: ActiveRecording = {
      id: storage.recordingId,
      name: resolved.name,
      sessionId: this.sessionId,
      startedAt,
      options: resolved,
      dirPath: storage.dirPath,
      stop: () => this.stop(),
    };

    this.activeRecording = activeRec;
    return activeRec;
  }

  async stop(): Promise<RecordingManifest> {
    if (!this.isActive || !this.storage || !this.options) {
      throw new ActionError(
        'RECORDING_NOT_ACTIVE',
        `No active recording found to stop for session ${this.sessionId}.`,
      );
    }

    const rec = this.activeRecording!;
    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt).getTime() - new Date(rec.startedAt).getTime();

    if (this.options.video) {
      await this.visualRecorder.stopAll(this.storage);
    }

    this.eventBus.emit('recording.stopped', {
      data: { recordingId: rec.id, durationMs },
    });

    if (this.cleanupBus) {
      this.cleanupBus();
      this.cleanupBus = undefined;
    }

    await this.storage.close();

    const manifest = buildRecordingManifest({
      id: rec.id,
      name: rec.name,
      sessionId: this.sessionId,
      startedAt: rec.startedAt,
      completedAt,
      durationMs,
      success: true,
      options: this.options,
      pages: this.registry.list().map(toPageSummary),
      artifacts: this.storage.getArtifacts(),
      eventCount: this.storage.getEventCount(),
      actionCount: this.actionCount,
      observationCount: this.observationCount,
    });

    await this.storage.saveManifest(manifest);

    this.activeRecording = null;
    this.storage = null;

    return manifest;
  }

  private handleSessionEvent(event: SessionEvent): void {
    if (!this.storage || !this.options) return;

    if (event.type === 'action.started') {
      this.actionCount++;
    } else if (event.type === 'observation.created') {
      this.observationCount++;
    } else if (event.type === 'page.created' && event.pageId && this.options?.video) {
      const page = this.registry.get(event.pageId);
      if (page) void this.visualRecorder.attach(page, this.storage);
    }

    // Sanitize event data before writing
    const sanitized = sanitizeRecordingEvent(event, this.options.redact);
    this.storage.appendEvent(sanitized);

    // Capture screenshots based on mode
    if (event.pageId && (event.type === 'action.started' || event.type === 'action.completed' || event.type === 'action.failed')) {
      void this.handleActionScreenshot(event);
    }
  }

  private async handleActionScreenshot(event: SessionEvent): Promise<void> {
    if (!this.storage || !this.options) return;
    const mode = this.options.screenshots;
    if (mode === 'off') return;

    const page = this.registry.get(event.pageId!);
    if (!page || page.state === 'closed') return;

    let shouldCapture = false;
    let label = 'action';

    if (mode === 'each-action') {
      if (event.type === 'action.started') {
        shouldCapture = true;
        label = `before-${event.actionId ?? 'action'}`;
      } else if (event.type === 'action.completed') {
        shouldCapture = true;
        label = `after-${event.actionId ?? 'action'}`;
      }
    } else if (mode === 'before-action' && event.type === 'action.started') {
      shouldCapture = true;
      label = `before-${event.actionId ?? 'action'}`;
    } else if (mode === 'after-action' && event.type === 'action.completed') {
      shouldCapture = true;
      label = `after-${event.actionId ?? 'action'}`;
    } else if (mode === 'on-error' && event.type === 'action.failed') {
      shouldCapture = true;
      label = `failed-${event.actionId ?? 'action'}`;
    }

    if (shouldCapture) {
      try {
        const buffer = (await page.rawPage.screenshot({ fullPage: false, type: 'png' })) as Buffer;
        await this.storage.saveScreenshot({
          pageId: page.id,
          actionId: event.actionId,
          label,
          buffer,
        });
      } catch {
        // ignore screenshot capture errors during recording
      }
    }
  }
}
