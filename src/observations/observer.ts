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
    const url = rawPage.url() || 'about:blank';
    const htmlMode = options.html ?? 'compact';

    // Single CDP roundtrip to extract scroll coordinates, document title,
    // and in-page truncated HTML (avoiding transfer of megabytes over CDP).
    const pageMeta = await rawPage
      .evaluate((mode: string) => {
        const win = globalThis as any;
        const doc = win?.document;
        const scroll = {
          x: Math.round(win?.scrollX || 0),
          y: Math.round(win?.scrollY || 0),
        };
        const title = doc?.title || '';

        let compactContent = '';
        let isTruncated = false;

        if (mode === 'compact' && doc?.documentElement) {
          const outer = doc.documentElement.outerHTML || '';
          isTruncated = outer.length > 50_000;
          compactContent = isTruncated ? outer.slice(0, 50_000) : outer;
        }

        return { scroll, title, compactContent, isTruncated };
      }, htmlMode)
      .catch(() => ({
        scroll: { x: 0, y: 0 },
        title: '',
        compactContent: '',
        isTruncated: false,
      }));

    let elements: ObservedElement[] | undefined;
    if (options.elements !== false) {
      elements = await extractObservedElements(rawPage, options.maxElements ?? 200);
    }

    let html;
    if (htmlMode !== 'off') {
      if (htmlMode === 'compact') {
        html = {
          mode: htmlMode,
          content: pageMeta.compactContent,
          truncated: pageMeta.isTruncated,
        };
      } else {
        const content = await rawPage.content().catch(() => '');
        html = {
          mode: htmlMode,
          content,
          truncated: false,
        };
      }
    }

    const fingerprint = computePageFingerprint({
      url,
      title: pageMeta.title,
      viewport: { width: viewport.width, height: viewport.height },
      scroll: pageMeta.scroll,
      elementCount: elements?.length,
    });

    const observation: Observation = {
      id: obsId,
      sessionId: this.sessionId,
      pageId: page.id,
      createdAt: new Date().toISOString(),
      page: {
        url,
        title: pageMeta.title,
        viewport: {
          width: viewport.width,
          height: viewport.height,
          deviceScaleFactor: viewport.deviceScaleFactor,
        },
        scroll: pageMeta.scroll,
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
