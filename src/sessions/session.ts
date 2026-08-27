import type { Browser, BrowserContext, CDPSession } from 'puppeteer-core';
import type {
  BrowserSession,
  BrowserSessionInfo,
  DevToolsInfo,
  SessionOptions,
  SessionState,
  SessionCookieState,
  SessionStateExport,
  HeadedHandoffController,
} from './types.js';
import type { ManagedPageSummary, PagePolicy, PageReference } from '../pages/types.js';
import { PageRegistry } from '../pages/registry.js';
import { SessionEventBus } from './event-bus.js';
import { resolvePagePolicy } from '../actions/policy/defaults.js';
import { ActionOrchestrator } from '../actions/orchestrator.js';
import type { Action, ActionRunResult, ActRequest } from '../actions/types.js';
import type { Observation, ObservationOptions } from '../observations/types.js';
import { Observer } from '../observations/observer.js';
import { ObservationStore } from '../observations/store.js';
import type { ActiveRecording, RecordingManifest, RecordingOptions } from '../recording/types.js';
import { SessionRecorder } from '../recording/recorder.js';
import { ActionPolicy } from '../actions/policy/types.js';
import { resolveActionPolicy } from '../actions/policy/defaults.js';
import { ActionError } from '../actions/errors.js';
import { toPageSummary } from '../pages/types.js';

export class BrowserSessionImpl implements BrowserSession {
  readonly id: string;
  readonly contextId: string;
  readonly createdAt: string;
  lastUsedAt: string;
  expiresAt?: string;

  state: SessionState = 'creating';

  readonly eventBus: SessionEventBus;
  readonly pagePolicy: PagePolicy;
  readonly actionPolicy: ActionPolicy;
  readonly isPersistent: boolean;
  readonly registry!: PageRegistry;
  readonly observer!: Observer;
  readonly observationStore: ObservationStore;
  readonly orchestrator!: ActionOrchestrator;
  readonly recorder!: SessionRecorder;

  private context: BrowserContext | null = null;
  private ttlTimer?: ReturnType<typeof setTimeout>;

  constructor(
    id: string,
    private readonly browser: Browser,
    options: SessionOptions = {},
  ) {
    this.id = id;
    this.contextId = `ctx_${id}`;
    this.isPersistent = Boolean(options.persistent);
    const now = new Date();
    this.createdAt = now.toISOString();
    this.lastUsedAt = this.createdAt;

    if (options.ttlMs) {
      this.expiresAt = new Date(now.getTime() + options.ttlMs).toISOString();
      this.ttlTimer = setTimeout(() => void this.handleExpired(), options.ttlMs);
    }

    this.pagePolicy = resolvePagePolicy(options.pages);
    this.actionPolicy = resolveActionPolicy(options.policy);
    this.eventBus = new SessionEventBus(this.id);
    this.observationStore = new ObservationStore();
  }

  async init(): Promise<void> {
    if (this.isPersistent) {
      this.context = this.browser.defaultBrowserContext();
    } else {
      this.context = await this.browser.createBrowserContext();
    }

    (this as any).registry = new PageRegistry(
      this.context,
      this.pagePolicy,
      this.eventBus,
    );
    (this as any).observer = new Observer(this.id, this.observationStore, this.eventBus);
    (this as any).orchestrator = new ActionOrchestrator(
      this.id,
      this.registry,
      this.observationStore,
      this.pagePolicy,
      this.actionPolicy,
      this.eventBus,
    );
    (this as any).recorder = new SessionRecorder(this.id, this.registry, this.eventBus);

    this.registry.attachListeners();

    // Create main page
    const mainRawPage = await this.context.newPage();
    await this.registry.register(mainRawPage, { isMain: true });

    this.state = 'ready';
    this.eventBus.emit('session.started', {
      data: { mainPageId: this.mainPageId, activePageId: this.activePageId },
    });

    if (this.expiresAt) {
      const ttlMs = new Date(this.expiresAt).getTime() - Date.now();
      if (ttlMs > 0) {
        this.ttlTimer = setTimeout(() => {
          void this.handleExpired();
        }, ttlMs);
      }
    }
  }

  get mainPageId(): string | undefined {
    return this.registry?.getMain()?.id;
  }

  get activePageId(): string | undefined {
    return this.registry?.getActive()?.id;
  }

  private touch(): void {
    this.lastUsedAt = new Date().toISOString();
  }

  getInfo(): BrowserSessionInfo {
    let wsEndpoint: string | undefined;
    let inspectUrl: string | undefined;
    try {
      const active = this.registry.getActive() ?? this.registry.getMain();
      wsEndpoint = this.browser.wsEndpoint();
      if (active && wsEndpoint) {
        const rawTarget = active.rawPage.target();
        const targetId = (rawTarget as any)._targetId || (rawTarget as any).targetId || active.id;
        const parsed = new URL(wsEndpoint);
        inspectUrl = `devtools://devtools/bundled/inspector.html?ws=${parsed.host}/devtools/page/${targetId}`;
      }
    } catch {}

    return {
      id: this.id,
      contextId: this.contextId,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      expiresAt: this.expiresAt,
      state: this.state,
      mainPageId: this.mainPageId,
      activePageId: this.activePageId,
      persistent: this.isPersistent,
      devtools: wsEndpoint ? { wsEndpoint, inspectUrl } : undefined,
    };
  }

  async goto(
    url: string,
    options: { page?: PageReference; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'; timeoutMs?: number } = {},
  ): Promise<ManagedPageSummary> {
    this.assertOpen();
    this.touch();

    const target = options.page
      ? this.registry.resolve(options.page)
      : (this.registry.getActive() ?? this.registry.getMain());

    if (!target) {
      throw new ActionError('PAGE_NOT_FOUND', 'No target page available to navigate.');
    }

    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await target.rawPage.goto(url, {
          waitUntil: options.waitUntil ?? 'domcontentloaded',
          timeout: options.timeoutMs ?? 30_000,
        });
        break;
      } catch (err: any) {
        const msg = String(err?.message || '');
        if ((msg.includes('main frame too early') || msg.includes('Target closed') || msg.includes('Session closed')) && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 150 * attempt));
          continue;
        }
        throw err;
      }
    }

    target.url = target.rawPage.url();
    target.title = await target.rawPage.title().catch(() => '');

    return toPageSummary(target);
  }

  async observe(options: ObservationOptions = {}): Promise<Observation> {
    this.assertOpen();
    this.touch();

    const target = options.page
      ? this.registry.resolve(options.page)
      : (this.registry.getActive() ?? this.registry.getMain());

    if (!target) {
      throw new ActionError('PAGE_NOT_FOUND', 'No target page available to observe.');
    }

    return this.observer.capture(target, options);
  }

  async act(request: ActRequest | Action[] | Action): Promise<ActionRunResult> {
    this.assertOpen();
    this.touch();
    this.state = 'busy';

    try {
      const normalizedRequest: ActRequest = Array.isArray(request)
        ? { actions: request }
        : 'actions' in request
          ? request
          : { actions: [request] };

      const result = await this.orchestrator.run(normalizedRequest);
      return result;
    } finally {
      if (this.state === 'busy') {
        this.state = 'ready';
      }
    }
  }

  get pages() {
    return {
      list: async (): Promise<ManagedPageSummary[]> => {
        this.assertOpen();
        return this.registry.list().map(toPageSummary);
      },
      get: async (reference: PageReference): Promise<ManagedPageSummary | undefined> => {
        this.assertOpen();
        try {
          const page = this.registry.resolve(reference);
          return toPageSummary(page);
        } catch {
          return undefined;
        }
      },
      activate: async (reference: PageReference): Promise<ManagedPageSummary> => {
        this.assertOpen();
        this.touch();
        const page = await this.registry.activate(reference);
        return toPageSummary(page);
      },
      close: async (reference: PageReference): Promise<void> => {
        this.assertOpen();
        this.touch();
        await this.registry.close(reference);
      },
    };
  }

  get record() {
    return {
      start: async (options?: RecordingOptions): Promise<ActiveRecording> => {
        this.assertOpen();
        return this.recorder.start(options);
      },
      stop: async (): Promise<RecordingManifest> => {
        return this.recorder.stop();
      },
      get: (): ActiveRecording | undefined => {
        return this.recorder.getActive();
      },
    };
  }

  /** Create a direct Chrome DevTools Protocol (CDP) session for low-level automation. */
  async createCDPSession(pageRef?: PageReference): Promise<CDPSession> {
    this.assertOpen();
    this.touch();

    const target = pageRef
      ? this.registry.resolve(pageRef)
      : (this.registry.getActive() ?? this.registry.getMain());

    if (!target) {
      throw new ActionError('PAGE_NOT_FOUND', 'Target page not found for CDP session.');
    }

    return target.rawPage.createCDPSession();
  }

  /** Send a Chrome DevTools Protocol (CDP) command to the target page. */
  async sendCDP<T = any>(
    method: string,
    params?: Record<string, any>,
    pageRef?: PageReference,
  ): Promise<T> {
    const client = await this.createCDPSession(pageRef);
    try {
      return (await (client as any).send(method, params)) as T;
    } finally {
      await client.detach().catch(() => undefined);
    }
  }

  /** Get Chrome DevTools inspection URLs and WebSocket target details. */
  async getDevTools(pageRef?: PageReference): Promise<DevToolsInfo> {
    this.assertOpen();
    this.touch();

    const target = pageRef
      ? this.registry.resolve(pageRef)
      : (this.registry.getActive() ?? this.registry.getMain());

    if (!target) {
      throw new ActionError('PAGE_NOT_FOUND', 'Target page not found for DevTools.');
    }

    const wsEndpoint = this.browser.wsEndpoint();
    const rawTarget = target.rawPage.target();
    const targetId = (rawTarget as any)._targetId || (rawTarget as any).targetId || target.id;

    let host = '127.0.0.1';
    let port = '9222';
    try {
      if (wsEndpoint) {
        const parsed = new URL(wsEndpoint);
        host = parsed.hostname;
        port = parsed.port;
      }
    } catch {}

    const inspectUrl = `devtools://devtools/bundled/inspector.html?ws=${host}:${port}/devtools/page/${targetId}`;

    return {
      wsEndpoint: wsEndpoint || `ws://${host}:${port}`,
      inspectUrl,
      targetId,
      pageId: target.id,
      url: target.url,
    };
  }

  /** Export all session cookies and storage to a portable state object. */
  async exportState(pageRef?: PageReference): Promise<SessionStateExport> {
    this.assertOpen();
    this.touch();

    const target = pageRef
      ? this.registry.resolve(pageRef)
      : (this.registry.getActive() ?? this.registry.getMain());

    if (!target) {
      throw new ActionError('PAGE_NOT_FOUND', 'Target page not found to export state.');
    }

    const cdp = await target.rawPage.createCDPSession();
    let cookies: SessionCookieState[] = [];
    try {
      const cookiesRes = await (cdp as any).send('Network.getCookies');
      cookies = cookiesRes.cookies || [];
    } finally {
      await cdp.detach().catch(() => undefined);
    }

    let localStorageData: Record<string, string> = {};
    let sessionStorageData: Record<string, string> = {};
    try {
      const storage = await target.rawPage.evaluate(() => {
        const win = globalThis as any;
        const local: Record<string, string> = {};
        const session: Record<string, string> = {};
        try {
          for (let i = 0; i < win.localStorage.length; i++) {
            const k = win.localStorage.key(i);
            if (k) local[k] = win.localStorage.getItem(k) ?? '';
          }
        } catch {}
        try {
          for (let i = 0; i < win.sessionStorage.length; i++) {
            const k = win.sessionStorage.key(i);
            if (k) session[k] = win.sessionStorage.getItem(k) ?? '';
          }
        } catch {}
        return { local, session };
      });
      localStorageData = storage.local;
      sessionStorageData = storage.session;
    } catch {}

    return {
      cookies,
      localStorage: localStorageData,
      sessionStorage: sessionStorageData,
      exportedAt: new Date().toISOString(),
      url: target.url,
    };
  }

  /** Import cookies and storage into the active session. */
  async importState(
    state: Partial<SessionStateExport>,
    pageRef?: PageReference,
  ): Promise<{ importedCookies: number; importedStorageKeys: number }> {
    this.assertOpen();
    this.touch();

    const target = pageRef
      ? this.registry.resolve(pageRef)
      : (this.registry.getActive() ?? this.registry.getMain());

    if (!target) {
      throw new ActionError('PAGE_NOT_FOUND', 'Target page not found to import state.');
    }

    let importedCookies = 0;
    if (state.cookies && state.cookies.length > 0) {
      const cdp = await target.rawPage.createCDPSession();
      try {
        await (cdp as any).send('Network.setCookies', {
          cookies: state.cookies,
        });
        importedCookies = state.cookies.length;
      } finally {
        await cdp.detach().catch(() => undefined);
      }
    }

    let importedStorageKeys = 0;
    if (state.localStorage || state.sessionStorage) {
      try {
        importedStorageKeys = await target.rawPage.evaluate(
          (local, sess) => {
            const win = globalThis as any;
            let count = 0;
            if (local) {
              for (const [k, v] of Object.entries(local)) {
                try {
                  win.localStorage.setItem(k, v as string);
                  count++;
                } catch {}
              }
            }
            if (sess) {
              for (const [k, v] of Object.entries(sess)) {
                try {
                  win.sessionStorage.setItem(k, v as string);
                  count++;
                } catch {}
              }
            }
            return count;
          },
          state.localStorage,
          state.sessionStorage,
        );
      } catch {}
    }

    return { importedCookies, importedStorageKeys };
  }

  /** Open a temporary headed (visible) browser window synchronized with this session's state for user interaction. */
  async openHeadedHandoff(options: { url?: string; autoSyncOnClose?: boolean } = {}): Promise<HeadedHandoffController> {
    this.assertOpen();
    this.touch();

    const puppeteerModule = await import('puppeteer-core');
    const puppeteer = (puppeteerModule as any).default || puppeteerModule;
    const { resolveBrowserExecutable } = await import('../utils/resolveBrowserExecutable.js');
    const { buildLaunchArgs } = await import('../utils/buildLaunchArgs.js');

    const target = this.registry.getActive() ?? this.registry.getMain();
    const targetUrl = options.url || target?.url || 'about:blank';
    const autoSync = options.autoSyncOnClose ?? true;

    // Export current state
    const currentState = await this.exportState();

    // Launch temporary visible browser
    let executablePath: string;
    try {
      executablePath = (this.browser as any)._process?.spawnfile;
      if (!executablePath) {
        executablePath = await resolveBrowserExecutable({});
      }
    } catch {
      executablePath = await resolveBrowserExecutable({});
    }

    const headedArgs = buildLaunchArgs({
      headless: false,
      devtools: false,
      memory: {},
      launchArgs: [],
    } as any);

    const headedBrowser = await puppeteer.launch({
      executablePath,
      headless: false,
      args: headedArgs,
      defaultViewport: null,
    });

    const [headedPage] = await headedBrowser.pages();
    if (currentState.cookies.length > 0) {
      const cdp = await headedPage.createCDPSession();
      try {
        await (cdp as any).send('Network.setCookies', { cookies: currentState.cookies });
      } finally {
        await cdp.detach().catch(() => undefined);
      }
    }

    if (targetUrl && targetUrl !== 'about:blank') {
      await headedPage.goto(targetUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    }

    let closed = false;
    const captureState = async (): Promise<SessionStateExport> => {
      let finalCookies: SessionCookieState[] = [];
      try {
        const cdp = await headedPage.createCDPSession();
        const res = await (cdp as any).send('Network.getCookies');
        finalCookies = res.cookies || [];
        await cdp.detach().catch(() => undefined);
      } catch {}

      const exported: SessionStateExport = {
        cookies: finalCookies,
        exportedAt: new Date().toISOString(),
        url: headedPage.url(),
      };

      if (autoSync && finalCookies.length > 0) {
        await this.importState(exported).catch(() => undefined);
      }
      return exported;
    };

    const closeHandler = async (): Promise<SessionStateExport> => {
      if (closed) return { cookies: [], exportedAt: new Date().toISOString() };
      closed = true;
      const state = await captureState();
      await headedBrowser.close().catch(() => undefined);
      return state;
    };

    const waitClosed = (): Promise<SessionStateExport> => {
      return new Promise<SessionStateExport>((resolve) => {
        headedBrowser.on('disconnected', async () => {
          if (!closed) {
            closed = true;
            resolve({ cookies: [], exportedAt: new Date().toISOString() });
          }
        });
      });
    };

    return {
      browser: headedBrowser,
      page: headedPage,
      close: closeHandler,
      waitClosed,
    };
  }

  async close(): Promise<void> {
    if (this.state === 'closed' || this.state === 'closing') return;

    const previousState = this.state;
    this.state = 'closing';
    if (this.ttlTimer) clearTimeout(this.ttlTimer);

    // Finalize recording if active
    if (this.recorder.isActive) {
      const manifest = await this.recorder.stop().catch(() => undefined);
      if (manifest) {
        if (previousState === 'expired') {
          manifest.errors = manifest.errors ?? [];
          manifest.errors.push({
            code: 'SESSION_EXPIRED_TTL',
            message: `Session ${this.id} expired due to TTL limit.`,
          });
        }
        (this as any).finishedManifest = manifest;
      }
    }

    this.registry.detachListeners();

    if (this.context) {
      try {
        if (!this.isPersistent) {
          await this.context.close();
        } else {
          // Default context: close only the pages managed by this session registry
          const managedPages = this.registry.list().filter((p) => p.state !== 'closed');
          await Promise.all(
            managedPages.map((p) => p.rawPage.close({ runBeforeUnload: false }).catch(() => undefined)),
          );
        }
      } catch {
        // ignore close error
      }
    }

    this.state = 'closed';
    this.eventBus.emit('session.closed');
    this.eventBus.removeAllListeners();
  }

  private async handleExpired(): Promise<void> {
    this.state = 'expired';
    await this.close();
  }

  private assertOpen(): void {
    if (this.state === 'closed' || this.state === 'closing') {
      throw new ActionError('SESSION_CLOSED', `Session ${this.id} is closed.`);
    }
    if (this.state === 'expired') {
      throw new ActionError('SESSION_EXPIRED', `Session ${this.id} has expired.`);
    }
  }
}
