import type { PagePolicy, PageReference, ManagedPageSummary } from '../pages/types.js';
import type { ActionPolicy } from '../actions/policy/types.js';
import type { CDPSession } from 'puppeteer-core';
import type { Observation, ObservationOptions } from '../observations/types.js';
import type { Action, ActionRunResult, ActRequest } from '../actions/types.js';
import type { ActiveRecording, RecordingManifest, RecordingOptions } from '../recording/types.js';

export type SessionState =
  | 'creating'
  | 'ready'
  | 'busy'
  | 'closing'
  | 'closed'
  | 'expired';

export interface SessionOptions {
  ttlMs?: number;
  /** Whether to attach to the default persistent browser context (preserving cookies/login). */
  persistent?: boolean;
  pages?: Partial<PagePolicy>;
  policy?: Partial<ActionPolicy>;
}

export interface BrowserSessionInfo {
  id: string;
  contextId: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt?: string;
  state: SessionState;
  mainPageId?: string;
  activePageId?: string;
  persistent?: boolean;
  devtools?: {
    wsEndpoint?: string;
    inspectUrl?: string;
  };
}

export interface DevToolsInfo {
  wsEndpoint: string;
  inspectUrl: string;
  targetId: string;
  pageId: string;
  url?: string;
}

export interface SessionCookieState {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  size?: number;
  httpOnly?: boolean;
  secure?: boolean;
  session?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None' | string;
  priority?: string;
  sameParty?: boolean;
  sourceScheme?: string;
  sourcePort?: number;
  partitionKey?: any;
  [key: string]: any;
}

export interface SessionStateExport {
  cookies: SessionCookieState[];
  localStorage?: Record<string, string>;
  sessionStorage?: Record<string, string>;
  exportedAt: string;
  url?: string;
}

export interface HeadedHandoffController {
  browser: any;
  page: any;
  close: () => Promise<SessionStateExport>;
  waitClosed: () => Promise<SessionStateExport>;
}

export interface BrowserSession {
  readonly id: string;
  readonly contextId: string;
  readonly createdAt: string;
  lastUsedAt: string;
  expiresAt?: string;
  state: SessionState;
  mainPageId?: string;
  activePageId?: string;
  isPersistent: boolean;

  getInfo(): BrowserSessionInfo;
  goto(
    url: string,
    options?: { page?: PageReference; waitUntil?: 'load' | 'domcontentloaded' | 'networkidle0' | 'networkidle2'; timeoutMs?: number },
  ): Promise<ManagedPageSummary>;
  observe(options?: ObservationOptions): Promise<Observation>;
  act(request: ActRequest | Action[] | Action): Promise<ActionRunResult>;
  pages: {
    list: () => Promise<ManagedPageSummary[]>;
    get: (reference: PageReference) => Promise<ManagedPageSummary | undefined>;
    activate: (reference: PageReference) => Promise<ManagedPageSummary>;
    close: (reference: PageReference) => Promise<void>;
  };
  record: {
    start: (options?: RecordingOptions) => Promise<ActiveRecording>;
    stop: () => Promise<RecordingManifest>;
    get: () => ActiveRecording | undefined;
  };
  close(): Promise<void>;

  /** Create a direct Chrome DevTools Protocol (CDP) session for low-level automation. */
  createCDPSession(pageRef?: PageReference): Promise<CDPSession>;

  /** Send a Chrome DevTools Protocol (CDP) command to the target page. */
  sendCDP<T = any>(method: string, params?: Record<string, any>, pageRef?: PageReference): Promise<T>;

  /** Get Chrome DevTools inspection URLs and WebSocket target details. */
  getDevTools(pageRef?: PageReference): Promise<DevToolsInfo>;

  /** Export all session cookies and storage to a portable state object. */
  exportState(pageRef?: PageReference): Promise<SessionStateExport>;

  /** Import cookies and storage into the active session. */
  importState(state: Partial<SessionStateExport>, pageRef?: PageReference): Promise<{ importedCookies: number; importedStorageKeys: number }>;

  /** Open a temporary headed (visible) browser window synchronized with this session's state for user interaction. */
  openHeadedHandoff(options?: { url?: string; autoSyncOnClose?: boolean }): Promise<HeadedHandoffController>;
}
