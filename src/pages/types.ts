import type { Page } from 'puppeteer-core';

export type PageState =
  | 'opening'
  | 'ready'
  | 'active'
  | 'background'
  | 'closing'
  | 'closed'
  | 'failed';

export interface ManagedPage {
  id: string;
  alias?: string;
  openerPageId?: string;
  url: string;
  title?: string;
  state: PageState;
  createdAt: string;
  updatedAt: string;
  lastActiveAt?: string;
  closedAt?: string;

  /** Underlying Puppeteer page reference (internal) */
  rawPage: Page;
}

export interface ManagedPageSummary {
  id: string;
  alias?: string;
  openerPageId?: string;
  url: string;
  title?: string;
  state: PageState;
  createdAt: string;
  updatedAt?: string;
  lastActiveAt?: string;
  closedAt?: string;
}

export type PageReference =
  | { by: 'id'; value: string }
  | { by: 'alias'; value: string }
  | { by: 'active' }
  | { by: 'main' }
  | { by: 'latest' }
  | { by: 'opener-of'; value: string };

export interface RegisterPageMetadata {
  alias?: string;
  openerPageId?: string;
  isMain?: boolean;
}

export type UnexpectedPageBehavior =
  | 'register'
  | 'register-and-activate'
  | 'close'
  | 'reject';

export type OnActivePageClosedBehavior =
  | 'activate-opener'
  | 'activate-main'
  | 'activate-latest'
  | 'none';

export interface PagePolicy {
  maxPages: number;
  onPopup: UnexpectedPageBehavior;
  onActivePageClosed: OnActivePageClosedBehavior;
  allowCrossOrigin: boolean;
  allowedDomains?: string[];
  deniedDomains?: string[];
}

export function toPageSummary(managed: ManagedPage): ManagedPageSummary {
  return {
    id: managed.id,
    alias: managed.alias,
    openerPageId: managed.openerPageId,
    url: managed.url,
    title: managed.title,
    state: managed.state,
    createdAt: managed.createdAt,
    updatedAt: managed.updatedAt,
    lastActiveAt: managed.lastActiveAt,
    closedAt: managed.closedAt,
  };
}
