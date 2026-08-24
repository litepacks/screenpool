import type { PagePolicy } from '../pages/types.js';
import type { ActionPolicy } from '../actions/policy/types.js';

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
}
