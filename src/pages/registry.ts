import type { BrowserContext, Page, Target } from 'puppeteer-core';
import type {
  ManagedPage,
  PagePolicy,
  PageReference,
  RegisterPageMetadata,
} from './types.js';
import { resolvePageReference } from './resolver.js';
import { ActionError } from '../actions/errors.js';
import type { SessionEventBus } from '../sessions/event-bus.js';

export class PageRegistry {
  private pages = new Map<string, ManagedPage>();
  private pageByRaw = new WeakMap<Page, ManagedPage>();
  private targetByRaw = new WeakMap<Target, string>();
  private counter = 0;

  private mainPageIdInternal?: string;
  private activePageIdInternal?: string;

  private targetCreatedListener?: (target: Target) => Promise<void>;
  private targetDestroyedListener?: (target: Target) => Promise<void>;

  constructor(
    private readonly context: BrowserContext,
    private readonly policy: PagePolicy,
    private readonly eventBus: SessionEventBus,
  ) {}

  /** Attach browser context level target listeners */
  attachListeners(): void {
    this.targetCreatedListener = async (target: Target) => {
      if (target.type() !== 'page') return;

      // Check if target already tracked
      if (this.targetByRaw.has(target)) return;

      try {
        const page = await target.page();
        if (!page || this.pageByRaw.has(page)) return;

        // Determine opener page ID if target has an opener
        let openerPageId: string | undefined;
        try {
          const openerTarget = target.opener();
          if (openerTarget) {
            openerPageId = this.targetByRaw.get(openerTarget);
          }
        } catch {
          // ignore
        }

        // Domain restriction checks
        const url = target.url();
        if (url && url !== 'about:blank') {
          this.validateDomainPolicy(url);
        }

        await this.register(page, { openerPageId });
      } catch (err) {
        if (err instanceof ActionError) {
          // Emitting page creation blocked or limit exceeded event
          this.eventBus.emit('page.failed', {
            data: { error: err.message, code: err.code },
          });
        }
      }
    };

    this.targetDestroyedListener = async (target: Target) => {
      if (target.type() !== 'page') return;
      const pageId = this.targetByRaw.get(target);
      if (pageId) {
        this.handlePageClosed(pageId);
      }
    };

    this.context.on('targetcreated', this.targetCreatedListener);
    this.context.on('targetdestroyed', this.targetDestroyedListener);
  }

  /** Clean up listeners */
  detachListeners(): void {
    if (this.targetCreatedListener) {
      this.context.off('targetcreated', this.targetCreatedListener);
    }
    if (this.targetDestroyedListener) {
      this.context.off('targetdestroyed', this.targetDestroyedListener);
    }
  }

  async register(
    rawPage: Page,
    metadata: RegisterPageMetadata = {},
  ): Promise<ManagedPage> {
    if (this.pageByRaw.has(rawPage)) {
      return this.pageByRaw.get(rawPage)!;
    }

    const openPagesCount = this.list().filter((p) => p.state !== 'closed').length;
    if (openPagesCount >= this.policy.maxPages) {
      throw new ActionError(
        'PAGE_LIMIT_EXCEEDED',
        `Maximum pages limit (${this.policy.maxPages}) reached.`,
        { retryable: false },
      );
    }

    this.counter++;
    const id = `page_${String(this.counter).padStart(2, '0')}`;
    const now = new Date().toISOString();

    const managed: ManagedPage = {
      id,
      alias: metadata.alias,
      openerPageId: metadata.openerPageId,
      url: 'about:blank',
      title: '',
      state: 'opening',
      createdAt: now,
      updatedAt: now,
      rawPage,
    };

    // Store synchronously before any await
    this.pages.set(id, managed);
    this.pageByRaw.set(rawPage, managed);

    const target = rawPage.target();
    if (target) {
      this.targetByRaw.set(target, id);
    }

    if (metadata.isMain || !this.mainPageIdInternal) {
      this.mainPageIdInternal = id;
    }

    try {
      managed.url = rawPage.url() || 'about:blank';
      managed.title = await rawPage.title().catch(() => '');
    } catch {
      // ignore
    }

    // Attach listeners on page navigation/framenavigated and close
    rawPage.on('framenavigated', (frame) => {
      if (frame === rawPage.mainFrame()) {
        managed.url = rawPage.url();
        managed.updatedAt = new Date().toISOString();
        void rawPage.title().then((t) => {
          managed.title = t;
        }).catch(() => undefined);

        this.eventBus.emit('page.navigated', {
          pageId: id,
          data: { url: managed.url, title: managed.title },
        });
      }
    });

    rawPage.on('close', () => {
      this.handlePageClosed(id);
    });

    managed.state = 'ready';
    managed.updatedAt = new Date().toISOString();

    this.eventBus.emit('page.created', {
      pageId: id,
      data: {
        alias: managed.alias,
        openerPageId: managed.openerPageId,
        url: managed.url,
        title: managed.title,
        state: managed.state,
      },
    });

    // Apply policy on new popup activation
    if (!this.activePageIdInternal) {
      await this.activate({ by: 'id', value: id });
    } else if (metadata.openerPageId && this.policy.onPopup === 'register-and-activate') {
      await this.activate({ by: 'id', value: id });
    } else {
      managed.state = 'background';
    }

    return managed;
  }

  unregister(pageId: string): void {
    const page = this.pages.get(pageId);
    if (page) {
      page.state = 'closed';
      page.closedAt = new Date().toISOString();
    }
  }

  list(): ManagedPage[] {
    return Array.from(this.pages.values());
  }

  get(pageId: string): ManagedPage | undefined {
    return this.pages.get(pageId);
  }

  getByRawPage(rawPage: Page): ManagedPage | undefined {
    return this.pageByRaw.get(rawPage);
  }

  resolve(reference: PageReference): ManagedPage {
    return resolvePageReference(this, reference);
  }

  async activate(reference: PageReference): Promise<ManagedPage> {
    const target = this.resolve(reference);
    if (target.state === 'closed') {
      throw new ActionError(
        'PAGE_ACTIVATION_FAILED',
        `Cannot activate closed page ${target.id}`,
      );
    }

    if (this.activePageIdInternal && this.activePageIdInternal !== target.id) {
      const prevActive = this.pages.get(this.activePageIdInternal);
      if (prevActive && prevActive.state === 'active') {
        prevActive.state = 'background';
      }
    }

    try {
      await target.rawPage.bringToFront();
    } catch {
      // bringToFront might fail if window closed, ignore
    }

    target.state = 'active';
    target.lastActiveAt = new Date().toISOString();
    target.updatedAt = target.lastActiveAt;
    this.activePageIdInternal = target.id;

    this.eventBus.emit('page.activated', {
      pageId: target.id,
      data: { url: target.url, title: target.title },
    });

    return target;
  }

  async close(reference: PageReference): Promise<void> {
    const target = this.resolve(reference);
    if (target.state === 'closed') return;

    target.state = 'closing';
    try {
      await target.rawPage.close({ runBeforeUnload: false });
    } catch {
      // ignore page close error
    } finally {
      this.handlePageClosed(target.id);
    }
  }

  getMain(): ManagedPage | undefined {
    if (!this.mainPageIdInternal) return undefined;
    const page = this.pages.get(this.mainPageIdInternal);
    if (page && page.state !== 'closed') return page;

    // Fallback: first non-closed page
    return this.list().find((p) => p.state !== 'closed');
  }

  getActive(): ManagedPage | undefined {
    if (this.activePageIdInternal) {
      const page = this.pages.get(this.activePageIdInternal);
      if (page && page.state !== 'closed') return page;
    }
    return this.getMain() ?? this.getLatest();
  }

  getLatest(): ManagedPage | undefined {
    const openPages = this.list().filter((p) => p.state !== 'closed');
    return openPages[openPages.length - 1];
  }

  private handlePageClosed(pageId: string): void {
    const page = this.pages.get(pageId);
    if (!page || page.state === 'closed') return;

    page.state = 'closed';
    page.closedAt = new Date().toISOString();
    page.updatedAt = page.closedAt;

    this.eventBus.emit('page.closed', {
      pageId: page.id,
      data: { openerPageId: page.openerPageId, url: page.url },
    });

    // Check if the closed page was active
    if (this.activePageIdInternal === pageId) {
      this.activePageIdInternal = undefined;
      this.fallbackActivePage(page);
    }
  }

  private fallbackActivePage(closedPage: ManagedPage): void {
    const behavior = this.policy.onActivePageClosed;
    let nextActive: ManagedPage | undefined;

    if (behavior === 'activate-opener' && closedPage.openerPageId) {
      const opener = this.get(closedPage.openerPageId);
      if (opener && opener.state !== 'closed') {
        nextActive = opener;
      }
    }

    if (!nextActive && (behavior === 'activate-main' || behavior === 'activate-opener')) {
      const main = this.getMain();
      if (main && main.state !== 'closed') {
        nextActive = main;
      }
    }

    if (!nextActive && behavior !== 'none') {
      nextActive = this.getLatest();
    }

    if (nextActive) {
      void this.activate({ by: 'id', value: nextActive.id }).catch(() => undefined);
    }
  }

  private validateDomainPolicy(urlStr: string): void {
    try {
      const parsed = new URL(urlStr);
      const host = parsed.hostname;

      if (this.policy.deniedDomains && this.policy.deniedDomains.length > 0) {
        if (this.policy.deniedDomains.some((d) => host.includes(d))) {
          throw new ActionError(
            'UNEXPECTED_PAGE_BLOCKED',
            `Access to domain ${host} is denied by policy.`,
          );
        }
      }

      if (this.policy.allowedDomains && this.policy.allowedDomains.length > 0) {
        if (!this.policy.allowedDomains.some((d) => host.includes(d))) {
          throw new ActionError(
            'UNEXPECTED_PAGE_BLOCKED',
            `Access to domain ${host} is not allowed by policy.`,
          );
        }
      }
    } catch (err) {
      if (err instanceof ActionError) throw err;
      // invalid URL, ignore
    }
  }
}
