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
}
