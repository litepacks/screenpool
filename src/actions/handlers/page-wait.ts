import type { PageWaitAction } from '../types.js';
import type { PageRegistry } from '../../pages/registry.js';
import { ActionError } from '../errors.js';

export async function handlePageWait(params: {
  action: PageWaitAction;
  registry: PageRegistry;
}): Promise<void> {
  const { action, registry } = params;
  const timeoutMs = action.timeoutMs ?? 10_000;
  const cond = action.condition;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (cond.type === 'created') {
      const currentPages = registry.list().filter((p) => p.state !== 'closed');
      const match = currentPages.find((p) => {
        if (cond.urlMatches && !p.url.includes(cond.urlMatches)) return false;
        if (cond.titleMatches && !p.title?.includes(cond.titleMatches)) return false;
        return true;
      });
      if (match) return;
    } else if (cond.type === 'closed') {
      try {
        const page = registry.resolve(cond.page);
        if (page.state === 'closed') return;
      } catch {
        // resolved page doesn't exist or is closed
        return;
      }
    } else if (cond.type === 'url') {
      try {
        const page = registry.resolve(cond.page);
        if (page.url.includes(cond.matches)) return;
      } catch {
        // ignore
      }
    }

    await new Promise((r) => setTimeout(r, 100));
  }

  throw new ActionError(
    'ACTION_TIMEOUT',
    `Page wait condition was not satisfied within ${timeoutMs}ms.`,
  );
}
