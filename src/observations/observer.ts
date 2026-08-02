import type { ManagedPage } from '../pages/types.js';
import type { Observation, ObservationOptions, ObservedElement } from './types.js';
import type { ObservationStore } from './store.js';
import type { SessionEventBus } from '../sessions/event-bus.js';
import { extractObservedElements } from './elements.js';
import { computePageFingerprint } from './fingerprint.js';
import { createJobId } from '../utils/uuid.js';

export class Observer {
  constructor(
    private readonly sessionId: string,
    private readonly store: ObservationStore,
    private readonly eventBus: SessionEventBus,
  ) {}

  async capture(
    page: ManagedPage,
    options: ObservationOptions = {},
  ): Promise<Observation> {
    const obsId = `obs_${createJobId()}`;
    const rawPage = page.rawPage;

    const viewport = rawPage.viewport() ?? { width: 1280, height: 720 };
    const scroll = await rawPage.evaluate(() => {
      const win = globalThis as any;
      return {
        x: Math.round(win.scrollX || 0),
        y: Math.round(win.scrollY || 0),
      };
    }).catch(() => ({ x: 0, y: 0 }));

    const url = rawPage.url() || 'about:blank';
    const title = await rawPage.title().catch(() => '');

    let elements: ObservedElement[] | undefined;
    if (options.elements !== false) {
      elements = await extractObservedElements(rawPage, options.maxElements ?? 200);
    }

    let html;
    const htmlMode = options.html ?? 'compact';
    if (htmlMode !== 'off') {
      const content = await rawPage.content().catch(() => '');
      const isCompact = htmlMode === 'compact';
      const truncatedContent = isCompact && content.length > 50_000
        ? content.slice(0, 50_000)
        : content;

      html = {
        mode: htmlMode,
        content: truncatedContent,
        truncated: isCompact && content.length > 50_000,
      };
    }

    const fingerprint = computePageFingerprint({
      url,
      title,
      viewport: { width: viewport.width, height: viewport.height },
      scroll,
      elementCount: elements?.length,
    });

    const observation: Observation = {
      id: obsId,
      sessionId: this.sessionId,
      pageId: page.id,
      createdAt: new Date().toISOString(),
      page: {
        url,
        title,
        viewport: {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: viewport.deviceScaleFactor,
        },
        scroll,
      },
      html,
      elements,
      fingerprint,
    };

    this.store.set(observation);

    this.eventBus.emit('observation.created', {
      observationId: obsId,
      pageId: page.id,
      data: {
        url,
        fingerprint,
        elementCount: elements?.length ?? 0,
      },
    });

    return observation;
  }
}
