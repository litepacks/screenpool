import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import type { RecordingArtifact, RecordingManifest, RecordingOptions } from './types.js';
import type { SessionEvent } from '../sessions/event-bus.js';
import { createJobId } from '../utils/uuid.js';

export class RecordingStorage {
  readonly recordingId: string;
  readonly dirPath: string;
  private eventsStream: WriteStream | null = null;
  private artifacts: RecordingArtifact[] = [];
  private eventCount = 0;

  constructor(
    private readonly sessionId: string,
    options: Required<RecordingOptions>,
  ) {
    const ts = Date.now();
    this.recordingId = `rec_${ts}_${createJobId().slice(0, 6)}`;
    this.dirPath = resolve(options.artifactsDir, this.recordingId);
  }

  async init(): Promise<void> {
    await mkdir(this.dirPath, { recursive: true });
    const eventsPath = join(this.dirPath, 'events.jsonl');
    this.eventsStream = createWriteStream(eventsPath, { flags: 'a', encoding: 'utf8' });
    this.artifacts.push({
      id: `art_events_${createJobId().slice(0, 6)}`,
      type: 'events',
      path: eventsPath,
      mimeType: 'application/x-ndjson',
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
    });
  }

  addArtifact(artifact: RecordingArtifact): void {
    if (!this.artifacts.some((a) => a.id === artifact.id || a.path === artifact.path)) {
      this.artifacts.push(artifact);
    }
  }

  appendEvent(event: SessionEvent): void {
    if (!this.eventsStream) return;
    this.eventCount++;
    const line = JSON.stringify(event) + '\n';
    this.eventsStream.write(line);
  }

  async saveScreenshot(params: {
    pageId: string;
    actionId?: string;
    label: string;
    buffer: Buffer;
  }): Promise<RecordingArtifact> {
    const seq = String(this.artifacts.filter((a) => a.type === 'screenshot').length + 1).padStart(4, '0');
    const fileName = `${seq}-${params.pageId}-${params.label}.png`;
    const fullPath = join(this.dirPath, fileName);

    await writeFile(fullPath, params.buffer);
    const fileStat = await stat(fullPath).catch(() => ({ size: params.buffer.length }));

    const artifact: RecordingArtifact = {
      id: `art_${createJobId()}`,
      type: 'screenshot',
      pageId: params.pageId,
      actionId: params.actionId,
      path: fullPath,
      mimeType: 'image/png',
      sizeBytes: fileStat.size,
      createdAt: new Date().toISOString(),
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  async saveHtml(params: {
    pageId: string;
    actionId?: string;
    label: string;
    content: string;
  }): Promise<RecordingArtifact> {
    const seq = String(this.artifacts.filter((a) => a.type === 'html').length + 1).padStart(4, '0');
    const fileName = `${seq}-${params.pageId}-${params.label}.html`;
    const fullPath = join(this.dirPath, fileName);

    await writeFile(fullPath, params.content, 'utf8');
    const fileStat = await stat(fullPath).catch(() => ({ size: Buffer.byteLength(params.content) }));

    const artifact: RecordingArtifact = {
      id: `art_${createJobId()}`,
      type: 'html',
      pageId: params.pageId,
      actionId: params.actionId,
      path: fullPath,
      mimeType: 'text/html',
      sizeBytes: fileStat.size,
      createdAt: new Date().toISOString(),
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  async saveVideo(params: {
    pageId: string;
    buffer: Buffer;
    mimeType?: string;
    ext?: string;
  }): Promise<RecordingArtifact> {
    const ext = params.ext || (params.mimeType === 'text/html' ? 'html' : 'webm');
    const mimeType = params.mimeType || (ext === 'html' ? 'text/html' : 'video/webm');
    const seq = String(this.artifacts.filter((a) => a.type === 'video').length + 1).padStart(4, '0');
    const fileName = `${seq}-${params.pageId}-recording.${ext}`;
    const fullPath = join(this.dirPath, fileName);

    await writeFile(fullPath, params.buffer);
    const fileStat = await stat(fullPath).catch(() => ({ size: params.buffer.length }));

    const artifact: RecordingArtifact = {
      id: `art_${createJobId()}`,
      type: 'video',
      pageId: params.pageId,
      path: fullPath,
      mimeType,
      sizeBytes: fileStat.size,
      createdAt: new Date().toISOString(),
    };

    this.artifacts.push(artifact);
    return artifact;
  }

  async saveManifest(manifest: RecordingManifest): Promise<string> {
    const manifestPath = join(this.dirPath, 'manifest.json');
    const manifestArtifact: RecordingArtifact = {
      id: `art_manifest`,
      type: 'manifest',
      path: manifestPath,
      mimeType: 'application/json',
      sizeBytes: 0,
      createdAt: new Date().toISOString(),
    };

    if (!manifest.artifacts.some((a) => a.type === 'manifest')) {
      manifest.artifacts.push(manifestArtifact);
    }
    if (!this.artifacts.some((a) => a.type === 'manifest')) {
      this.artifacts.push(manifestArtifact);
    }

    const content = JSON.stringify(manifest, null, 2);
    await writeFile(manifestPath, content, 'utf8');
    const fileStat = await stat(manifestPath).catch(() => ({ size: Buffer.byteLength(content) }));
    manifestArtifact.sizeBytes = fileStat.size;

    return manifestPath;
  }

  getArtifacts(): RecordingArtifact[] {
    return [...this.artifacts];
  }

  getEventCount(): number {
    return this.eventCount;
  }

  async close(): Promise<void> {
    if (this.eventsStream) {
      await new Promise<void>((resolve) => {
        this.eventsStream?.end(() => resolve());
      });
      this.eventsStream = null;
    }
    const eventsArt = this.artifacts.find((a) => a.type === 'events');
    if (eventsArt) {
      const fileStat = await stat(eventsArt.path).catch(() => ({ size: 0 }));
      eventsArt.sizeBytes = fileStat.size;
    }
  }
}
