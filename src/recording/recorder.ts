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

    await Promise.all(this.pendingArtifacts).catch(() => undefined);

    let videoMetadata;
    let recordingWarnings;

    if (this.options.video) {
      const stopRes = await this.visualRecorder.stopAll(this.storage);
      for (const art of stopRes.artifacts) {
        this.storage.addArtifact(art);
      }
      videoMetadata = stopRes.videoMetadata;
      recordingWarnings = stopRes.recordingWarnings;
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
      video: videoMetadata,
      recordingWarnings,
    });

    await this.storage.saveManifest(manifest);

    this.activeRecording = null;
    this.storage = null;

    return manifest;
  }

  private pendingArtifacts: Promise<void>[] = [];

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

    const pageId = event.pageId ?? this.registry.getActive()?.id ?? this.registry.getMain()?.id;

    if (pageId && (event.type === 'action.started' || event.type === 'action.completed' || event.type === 'action.failed')) {
      const p = this.handleActionArtifacts(event, pageId);
      this.pendingArtifacts.push(p);
    }
  }

  private async handleActionArtifacts(event: SessionEvent, pageId: string): Promise<void> {
    if (!this.storage || !this.options) return;

    const page = this.registry.get(pageId);
    if (!page || page.state === 'closed') return;

    const screenshotMode = this.options.screenshots;
    const htmlMode = this.options.html;

    let shouldCaptureScreenshot = false;
    let screenshotLabel = 'action';

    if (screenshotMode === 'each-action') {
      if (event.type === 'action.started') {
        shouldCaptureScreenshot = true;
        screenshotLabel = `before-${event.actionId ?? 'action'}`;
      } else if (event.type === 'action.completed') {
        shouldCaptureScreenshot = true;
        screenshotLabel = `after-${event.actionId ?? 'action'}`;
      }
    } else if (screenshotMode === 'before-action' && event.type === 'action.started') {
      shouldCaptureScreenshot = true;
      screenshotLabel = `before-${event.actionId ?? 'action'}`;
    } else if (screenshotMode === 'after-action' && event.type === 'action.completed') {
      shouldCaptureScreenshot = true;
      screenshotLabel = `after-${event.actionId ?? 'action'}`;
    } else if ((screenshotMode === 'on-error' || this.options.preset === 'debug') && event.type === 'action.failed') {
      shouldCaptureScreenshot = true;
      screenshotLabel = `failed-${event.actionId ?? 'action'}`;
    }

    if (shouldCaptureScreenshot) {
      try {
        const buffer = (await Promise.race([
          page.rawPage.screenshot({ fullPage: false, type: 'png' }),
          new Promise<Buffer>((_, reject) => setTimeout(() => reject(new Error('Screenshot timeout')), 2500)),
        ])) as Buffer;
        await this.storage.saveScreenshot({
          pageId: page.id,
          actionId: event.actionId,
          label: screenshotLabel,
          buffer,
        });
      } catch {
        // ignore screenshot error
      }
    }

    let shouldCaptureHtml = false;
    let htmlLabel = 'action-html';

    if ((htmlMode === 'on-error' || this.options.preset === 'debug') && event.type === 'action.failed') {
      shouldCaptureHtml = true;
      htmlLabel = `failed-${event.actionId ?? 'action'}`;
    } else if (htmlMode === 'each-action' && event.type === 'action.completed') {
      shouldCaptureHtml = true;
      htmlLabel = `after-${event.actionId ?? 'action'}`;
    }

    if (shouldCaptureHtml) {
      try {
        const content = await Promise.race([
          page.rawPage.content(),
          new Promise<string>((_, reject) => setTimeout(() => reject(new Error('HTML capture timeout')), 2500)),
        ]);
        await this.storage.saveHtml({
          pageId: page.id,
          actionId: event.actionId,
          label: htmlLabel,
          content,
        });
      } catch {
        // ignore HTML capture error
      }
    }
  }
}
