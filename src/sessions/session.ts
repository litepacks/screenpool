import type { Browser, BrowserContext } from 'puppeteer-core';
import type { BrowserSessionInfo, SessionOptions, SessionState } from './types.js';
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

export class BrowserSessionImpl {
  readonly id: string;
  readonly contextId: string;
  readonly createdAt: string;
  lastUsedAt: string;
  expiresAt?: string;

  state: SessionState = 'creating';

  readonly eventBus: SessionEventBus;
  readonly pagePolicy: PagePolicy;
  readonly actionPolicy: ActionPolicy;
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
    this.context = await this.browser.createBrowserContext();

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
    return this.registry.getMain()?.id;
  }

  get activePageId(): string | undefined {
    return this.registry.getActive()?.id;
  }

  touch(): void {
    this.lastUsedAt = new Date().toISOString();
  }

  getInfo(): BrowserSessionInfo {
    return {
      id: this.id,
      contextId: this.contextId,
      createdAt: this.createdAt,
      lastUsedAt: this.lastUsedAt,
      expiresAt: this.expiresAt,
      state: this.state,
      mainPageId: this.mainPageId,
      activePageId: this.activePageId,
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

    await target.rawPage.goto(url, {
      waitUntil: options.waitUntil ?? 'domcontentloaded',
      timeout: options.timeoutMs ?? 30_000,
    });

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
        await this.context.close();
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
