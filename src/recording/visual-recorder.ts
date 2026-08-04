import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { CDPSession } from 'puppeteer-core';
import type { ManagedPage } from '../pages/types.js';
import type { RecordingArtifact, VideoMetadata } from './types.js';
import type { RecordingStorage } from './storage.js';
import { createJobId } from '../utils/uuid.js';

export interface ScreencastFrame {
  data: string; // base64 JPEG
  timestamp: number;
  wallTime: number;
  pageId: string;
  url: string;
  frameId: number;
  segmentId: number;
}

export interface StopAllResult {
  artifacts: RecordingArtifact[];
  videoMetadata?: VideoMetadata;
  recordingWarnings?: string[];
}

interface PageRecorder {
  page: ManagedPage;
  screencast?: any; // Puppeteer page.screencast handle
  webmPath?: string;
  client?: CDPSession | null;
  frames: ScreencastFrame[];
  startTime: number;
  currentUrl: string;
  navigationMarkers: Array<{ url: string; timestamp: number }>;
  currentSegmentId: number;
  frameCounter: number;
  onFrameNavigated?: (frame: any) => void;
}

export class PuppeteerVisualRecorder {
  private pageRecorders = new Map<string, PageRecorder>();

  async attach(page: ManagedPage, storage?: RecordingStorage): Promise<void> {
    if (this.pageRecorders.has(page.id)) return;

    const rawPage = page.rawPage as any;
    const initialUrl = page.url || (typeof rawPage.url === 'function' ? rawPage.url() : '');
    const startTime = Date.now();

    const rec: PageRecorder = {
      page,
      frames: [],
      startTime,
      currentUrl: initialUrl,
      navigationMarkers: [{ url: initialUrl, timestamp: startTime }],
      currentSegmentId: 1,
      frameCounter: 0,
    };
    this.pageRecorders.set(page.id, rec);

    // Track navigation events on page to update segment markers
    const onFrameNavigated = (frame: any) => {
      try {
        if (!frame || typeof frame.url !== 'function') return;
        if (typeof rawPage.mainFrame === 'function' && frame === rawPage.mainFrame()) {
          const newUrl = frame.url();
          const now = Date.now();
          rec.currentSegmentId++;
          rec.currentUrl = newUrl;
          rec.navigationMarkers.push({ url: newUrl, timestamp: now });
        }
      } catch {
        // ignore navigation listener error
      }
    };

    if (typeof rawPage.on === 'function') {
      rawPage.on('framenavigated', onFrameNavigated);
      rec.onFrameNavigated = onFrameNavigated;
    }

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
        try {
          await client.send('Page.screencastFrameAck', { sessionId });
        } catch {
          // ignore ACK error
        }

        const wallTime = Date.now();
        rec.frameCounter++;

        let frameTime = wallTime;
        if (typeof metadata?.timestamp === 'number' && metadata.timestamp > 0) {
          frameTime = metadata.timestamp < 10000000000 ? metadata.timestamp * 1000 : metadata.timestamp;
        }

        let frameUrl = rec.currentUrl;
        let frameSegmentId = rec.currentSegmentId;
        for (let i = rec.navigationMarkers.length - 1; i >= 0; i--) {
          const marker = rec.navigationMarkers[i];
          if (marker && wallTime >= marker.timestamp) {
            frameUrl = marker.url;
            frameSegmentId = i + 1;
            break;
          }
        }

        rec.frames.push({
          data,
          timestamp: frameTime,
          wallTime,
          pageId: page.id,
          url: frameUrl,
          frameId: rec.frameCounter,
          segmentId: frameSegmentId,
        });
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
    if (!rec) return;

    if (rec.screencast) {
      try {
        await rec.screencast.stop().catch(() => undefined);
      } catch {}
    }
    if (rec.client) {
      try {
        await rec.client.send('Page.stopScreencast').catch(() => undefined);
        // Wait 150ms flush window for in-flight CDP screencast frames
        await new Promise((r) => setTimeout(r, 150));
        await rec.client.detach().catch(() => undefined);
      } catch {}
    }
    if (rec.onFrameNavigated) {
      try {
        (rec.page.rawPage as any).off('framenavigated', rec.onFrameNavigated);
      } catch {}
    }
    this.pageRecorders.delete(pageId);
  }

  async stopAll(storage?: RecordingStorage): Promise<StopAllResult> {
    const artifacts: RecordingArtifact[] = [];
    const pageIds = Array.from(this.pageRecorders.keys());
    const allFrames: ScreencastFrame[] = [];
    let nativeWebmArt: RecordingArtifact | undefined;

    let finalUrlFromRec: string | undefined;

    for (const pageId of pageIds) {
      const rec = this.pageRecorders.get(pageId);
      if (rec) {
        finalUrlFromRec = rec.currentUrl || rec.page.url;
        allFrames.push(...rec.frames);
        if (rec.webmPath) {
          const fileStat = await stat(rec.webmPath).catch(() => undefined);
          if (fileStat && fileStat.size > 0) {
            nativeWebmArt = {
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
      }
      await this.detach(pageId);
    }

    if (nativeWebmArt) {
      artifacts.push(nativeWebmArt);
      return {
        artifacts,
        videoMetadata: {
          durationMs: 0,
          frameCount: 0,
          segments: 1,
          finalUrl: finalUrlFromRec,
          timestampsMonotonic: true,
        },
      };
    }

    // Sort frames strictly by monotonic timeline order: segmentId -> wallTime -> frameId
    allFrames.sort((a, b) => {
      if (a.segmentId !== b.segmentId) {
        return a.segmentId - b.segmentId;
      }
      if (a.wallTime !== b.wallTime) {
        return a.wallTime - b.wallTime;
      }
      return a.frameId - b.frameId;
    });

    let rawTimestampsMonotonic = true;
    for (let i = 1; i < allFrames.length; i++) {
      const curr = allFrames[i];
      const prev = allFrames[i - 1];
      if (curr && prev && curr.wallTime <= prev.wallTime) {
        rawTimestampsMonotonic = false;
        curr.wallTime = prev.wallTime + 33;
      }
    }

    const frameCount = allFrames.length;
    const segmentsCount = Math.max(1, new Set(allFrames.map((f) => f.segmentId)).size);
    const firstFrame = allFrames[0];
    const lastFrame = allFrames[frameCount - 1];
    const firstFrameAt = firstFrame ? new Date(firstFrame.wallTime).toISOString() : undefined;
    const lastFrameAt = lastFrame ? new Date(lastFrame.wallTime).toISOString() : undefined;
    const durationMs = firstFrame && lastFrame ? Math.max(0, lastFrame.wallTime - firstFrame.wallTime) : 0;
    const finalUrl = lastFrame ? lastFrame.url : finalUrlFromRec;

    const videoMetadata: VideoMetadata = {
      durationMs,
      frameCount,
      segments: segmentsCount,
      firstFrameAt,
      lastFrameAt,
      finalUrl,
      timestampsMonotonic: true,
    };

    const recordingWarnings: string[] = [];
    if (frameCount === 0) {
      recordingWarnings.push('No video frames were captured during recording.');
    }
    if (!rawTimestampsMonotonic) {
      recordingWarnings.push('Raw frame timestamps had minor overlaps across page boundaries and were normalized.');
    }

    if (storage) {
      const htmlContent = generateInteractiveVideoPlayerHtml(allFrames, videoMetadata);
      const buffer = Buffer.from(htmlContent, 'utf8');

      // 1. Save HTML player artifact for easy double-click browser playback
      await storage.saveHtml({
        pageId: pageIds[0] ?? 'main',
        label: 'video-player',
        content: htmlContent,
      });

      // 2. Save video artifact for compatibility
      const videoArt = await storage.saveVideo({
        pageId: pageIds[0] ?? 'main',
        buffer,
        mimeType: 'video/webm',
        ext: 'webm',
      });
      artifacts.push(videoArt);
    }

    return {
      artifacts,
      videoMetadata,
      recordingWarnings: recordingWarnings.length > 0 ? recordingWarnings : undefined,
    };
  }
}

/**
 * Generates an offline HTML5 Video Presentation Player containing embedded base64 frames.
 */
function generateInteractiveVideoPlayerHtml(frames: ScreencastFrame[], metadata: VideoMetadata): string {
  const jsonFrames = JSON.stringify(frames.map((f) => ({ data: f.data, url: f.url, t: f.wallTime })));
  const jsonMeta = JSON.stringify(metadata);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Screenpool Video Recording</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .player-container { background: #1e293b; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); overflow: hidden; width: 100%; max-width: 1000px; display: flex; flex-direction: column; }
    .url-bar { background: #0f172a; padding: 10px 16px; font-family: monospace; font-size: 0.85rem; color: #38bdf8; border-bottom: 1px solid #334155; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
    <div id="urlBar" class="url-bar">Loading...</div>
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
    const metadata = ${jsonMeta};
    const canvas = document.getElementById('screenCanvas');
    const ctx = canvas.getContext('2d');
    const playBtn = document.getElementById('playBtn');
    const scrubber = document.getElementById('scrubber');
    const timeDisplay = document.getElementById('timeDisplay');
    const speedSelect = document.getElementById('speedSelect');
    const urlBar = document.getElementById('urlBar');

    let currentIndex = 0;
    let isPlaying = true;
    let intervalId = null;
    let speed = 1;

    scrubber.max = Math.max(0, frames.length - 1);

    const images = frames.map((f) => {
      const img = new Image();
      img.src = 'data:image/jpeg;base64,' + f.data;
      return img;
    });

    function renderFrame(index) {
      if (index < 0 || index >= frames.length) return;
      const frame = frames[index];
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
      urlBar.textContent = frame.url || metadata.finalUrl || '';
    }

    function play() {
      if (intervalId) clearInterval(intervalId);
      isPlaying = true;
      playBtn.textContent = 'Pause';
      intervalId = setInterval(() => {
        if (frames.length === 0) return;
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

    if (frames.length > 0) {
      renderFrame(0);
      play();
    }
  </script>
</body>
</html>`;
}
