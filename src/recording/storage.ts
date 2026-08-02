import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
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
    this.dirPath = join(options.artifactsDir, this.recordingId);
  }

  async init(): Promise<void> {
    await mkdir(this.dirPath, { recursive: true });
    await mkdir(join(this.dirPath, 'screenshots'), { recursive: true });
    await mkdir(join(this.dirPath, 'html'), { recursive: true });
    await mkdir(join(this.dirPath, 'videos'), { recursive: true });
    await mkdir(join(this.dirPath, 'observations'), { recursive: true });

    const eventsPath = join(this.dirPath, 'events.jsonl');
    this.eventsStream = createWriteStream(eventsPath, { flags: 'a', encoding: 'utf8' });
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
    const pageDir = join(this.dirPath, 'screenshots', params.pageId);
    await mkdir(pageDir, { recursive: true });

    const seq = String(this.artifacts.filter((a) => a.type === 'screenshot').length + 1).padStart(4, '0');
    const fileName = `${seq}-${params.label}.png`;
    const fullPath = join(pageDir, fileName);

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
    const pageDir = join(this.dirPath, 'html', params.pageId);
    await mkdir(pageDir, { recursive: true });

    const seq = String(this.artifacts.filter((a) => a.type === 'html').length + 1).padStart(4, '0');
    const fileName = `${seq}-${params.label}.html`;
    const fullPath = join(pageDir, fileName);

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

  async saveManifest(manifest: RecordingManifest): Promise<string> {
    const manifestPath = join(this.dirPath, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    const fileStat = await stat(manifestPath).catch(() => ({ size: 0 }));

    this.artifacts.push({
      id: `art_manifest`,
      type: 'manifest',
      path: manifestPath,
      mimeType: 'application/json',
      sizeBytes: fileStat.size,
      createdAt: new Date().toISOString(),
    });

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
  }
}
