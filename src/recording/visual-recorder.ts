import type { ManagedPage } from '../pages/types.js';
import type { RecordingArtifact } from './types.js';

export class PuppeteerVisualRecorder {
  private pageRecorders = new Map<string, { page: ManagedPage; frames: Buffer[] }>();

  async attach(page: ManagedPage): Promise<void> {
    if (this.pageRecorders.has(page.id)) return;
    this.pageRecorders.set(page.id, { page, frames: [] });
  }

  async detach(pageId: string): Promise<void> {
    this.pageRecorders.delete(pageId);
  }

  async stopPage(_pageId: string): Promise<RecordingArtifact | undefined> {
    // If video encoding is not available in puppeteer-core without external ffmpeg:
    // We return undefined or artifact if frames captured.
    return undefined;
  }

  async stopAll(): Promise<RecordingArtifact[]> {
    this.pageRecorders.clear();
    return [];
  }
}
