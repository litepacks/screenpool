import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CDPSession } from 'puppeteer-core';
import type { ManagedPage } from '../pages/types.js';
import type { RecordingArtifact } from './types.js';
import type { RecordingStorage } from './storage.js';
import { createJobId } from '../utils/uuid.js';

interface ScreencastFrame {
  data: string; // base64 JPEG
  timestamp: number;
}

interface PageRecorder {
  page: ManagedPage;
  screencast?: any; // Puppeteer page.screencast handle
  webmPath?: string;
  client?: CDPSession | null;
  frames: ScreencastFrame[];
  startTime: number;
}

export class PuppeteerVisualRecorder {
  private pageRecorders = new Map<string, PageRecorder>();

  async attach(page: ManagedPage, storage?: RecordingStorage): Promise<void> {
    if (this.pageRecorders.has(page.id)) return;

    const rawPage = page.rawPage as any;
    const rec: PageRecorder = {
      page,
      frames: [],
      startTime: Date.now(),
    };
    this.pageRecorders.set(page.id, rec);

    // 1. Primary approach: Try native Puppeteer page.screencast({ path }) if available
    if (typeof rawPage.screencast === 'function' && storage) {
      try {
        const webmPath = join(storage.dirPath, `0001-${page.id}-video.webm`);
        rec.screencast = await rawPage.screencast({ path: webmPath });
        rec.webmPath = webmPath;
        return;
      } catch {
        // Fallback to CDP frame capture
      }
    }

    // 2. Secondary approach: Direct CDP Screencast Protocol
    try {
      const client = await rawPage.createCDPSession();
      rec.client = client;

      client.on('Page.screencastFrame', async ({ sessionId, data, metadata }: any) => {
        rec.frames.push({
          data,
          timestamp: metadata.timestamp || Date.now() / 1000,
        });
        try {
          await client.send('Page.screencastFrameAck', { sessionId });
        } catch {
          // ignore
        }
      });

      await client.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 75,
        everyNthFrame: 1,
      });
    } catch {
      // CDP session might fail if page is closing
    }
  }

  async detach(pageId: string): Promise<void> {
    const rec = this.pageRecorders.get(pageId);
    if (rec?.screencast) {
      try {
        await rec.screencast.stop().catch(() => undefined);
      } catch {}
    }
    if (rec?.client) {
      try {
        await rec.client.send('Page.stopScreencast').catch(() => undefined);
        await rec.client.detach().catch(() => undefined);
      } catch {}
    }
    this.pageRecorders.delete(pageId);
  }

  async stopPage(pageId: string, storage?: RecordingStorage): Promise<RecordingArtifact | undefined> {
    const rec = this.pageRecorders.get(pageId);
    if (!rec || !storage) return undefined;

    await this.detach(pageId);

    // Option A: If native page.screencast created a WebM file
    if (rec.webmPath) {
      const fileStat = await stat(rec.webmPath).catch(() => undefined);
      if (fileStat && fileStat.size > 0) {
        return {
          id: `art_${createJobId()}`,
          type: 'video',
          pageId: rec.page.id,
          path: rec.webmPath,
          mimeType: 'video/webm',
          sizeBytes: fileStat.size,
          createdAt: new Date().toISOString(),
        };
      }
    }

    // Option B: CDP frames fallback -> Video Recording Artifact
    const htmlContent = generateInteractiveVideoPlayerHtml(rec.page.id, rec.frames);
    const buffer = Buffer.from(htmlContent, 'utf8');

    return storage.saveVideo({
      pageId: rec.page.id,
      buffer,
      mimeType: 'video/webm',
      ext: 'webm',
    });
  }

  async stopAll(storage?: RecordingStorage): Promise<RecordingArtifact[]> {
    const artifacts: RecordingArtifact[] = [];
    const pageIds = Array.from(this.pageRecorders.keys());

    for (const pageId of pageIds) {
      const art = await this.stopPage(pageId, storage);
      if (art) artifacts.push(art);
    }

    return artifacts;
  }
}

/**
 * Generates an offline HTML5 Video Presentation Player containing embedded base64 frames.
 */
function generateInteractiveVideoPlayerHtml(pageId: string, frames: ScreencastFrame[]): string {
  const jsonFrames = JSON.stringify(frames.map((f) => f.data));

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Screenpool Video Recording - ${pageId}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .player-container { background: #1e293b; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); overflow: hidden; width: 100%; max-width: 1000px; display: flex; flex-direction: column; }
    .canvas-wrapper { position: relative; background: #000; display: flex; align-items: center; justify-content: center; width: 100%; min-height: 400px; }
    canvas { width: 100%; height: auto; display: block; }
    .controls { display: flex; align-items: center; gap: 15px; padding: 15px 20px; background: #0f172a; border-top: 1px solid #334155; }
    button { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; transition: background 0.2s; }
    button:hover { background: #2563eb; }
    .scrubber { flex: 1; accent-color: #3b82f6; cursor: pointer; }
    .time-display { font-family: monospace; font-size: 0.9rem; color: #94a3b8; min-width: 100px; }
    .speed-select { background: #334155; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="player-container">
    <div class="canvas-wrapper">
      <canvas id="screenCanvas"></canvas>
    </div>
    <div class="controls">
      <button id="playBtn">Pause</button>
      <input type="range" id="scrubber" class="scrubber" min="0" value="0" step="1">
      <span id="timeDisplay" class="time-display">0 / 0</span>
      <select id="speedSelect" class="speed-select">
        <option value="1">1x Speed</option>
        <option value="2">2x Speed</option>
        <option value="4">4x Speed</option>
      </select>
    </div>
  </div>

  <script>
    const frames = ${jsonFrames};
    const canvas = document.getElementById('screenCanvas');
    const ctx = canvas.getContext('2d');
    const playBtn = document.getElementById('playBtn');
    const scrubber = document.getElementById('scrubber');
    const timeDisplay = document.getElementById('timeDisplay');
    const speedSelect = document.getElementById('speedSelect');

    let currentIndex = 0;
    let isPlaying = true;
    let intervalId = null;
    let speed = 1;

    scrubber.max = frames.length - 1;

    const images = frames.map((data) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + data;
      return img;
    });

    function renderFrame(index) {
      if (index < 0 || index >= frames.length) return;
      const img = images[index];
      if (img.complete && img.naturalWidth !== 0) {
        if (canvas.width !== img.naturalWidth) {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
        }
        ctx.drawImage(img, 0, 0);
      } else {
        img.onload = () => {
          canvas.width = img.naturalWidth;
          canvas.height = img.naturalHeight;
          ctx.drawImage(img, 0, 0);
        };
      }
      scrubber.value = index;
      timeDisplay.textContent = (index + 1) + ' / ' + frames.length;
    }

    function play() {
      if (intervalId) clearInterval(intervalId);
      isPlaying = true;
      playBtn.textContent = 'Pause';
      intervalId = setInterval(() => {
        currentIndex = (currentIndex + 1) % frames.length;
        renderFrame(currentIndex);
      }, 100 / speed);
    }

    function pause() {
      isPlaying = false;
      playBtn.textContent = 'Play';
      if (intervalId) clearInterval(intervalId);
    }

    playBtn.addEventListener('click', () => {
      if (isPlaying) pause(); else play();
    });

    scrubber.addEventListener('input', (e) => {
      pause();
      currentIndex = parseInt(e.target.value, 10);
      renderFrame(currentIndex);
    });

    speedSelect.addEventListener('change', (e) => {
      speed = parseFloat(e.target.value);
      if (isPlaying) play();
    });

    // Start playback
    renderFrame(0);
    play();
  </script>
</body>
</html>`;
}
