import type { ManagedPage } from '../../pages/types.js';
import type { ClickAction } from '../types.js';
import type { ResolvedTarget } from '../targets/types.js';
import type { PageRegistry } from '../../pages/registry.js';
import type { SessionEventBus } from '../../sessions/event-bus.js';
import { ActionError } from '../errors.js';

export async function handleClick(params: {
  page: ManagedPage;
  action: ClickAction;
  target?: ResolvedTarget;
  registry: PageRegistry;
  eventBus: SessionEventBus;
}): Promise<{ openedPages?: ManagedPage[] }> {
  const { page, action, target, registry } = params;

  // Track pages before click
  const pagesBefore = new Set(registry.list().map((p) => p.id));
  const expectedPopup = action.expect?.page;

  try {
    if (target?.point) {
      await page.rawPage.mouse.click(target.point.x, target.point.y, {
        button: action.button ?? 'left',
        clickCount: action.count ?? 1,
      });
    } else if (target?.elementHandle) {
      if (action.count === 2) {
        await target.elementHandle.click({
          button: action.button ?? 'left',
          clickCount: 2,
        });
      } else {
        await target.elementHandle.click({
          button: action.button ?? 'left',
        });
      }
    } else {
      throw new ActionError('INVALID_ACTION', 'Click action requires a valid target.');
    }
  } catch (err: any) {
    if (err instanceof ActionError) throw err;
    if (
      err?.message?.includes('Execution context was destroyed') ||
      err?.message?.includes('navigating') ||
      err?.message?.includes('Target closed')
    ) {
      // Navigation occurred during click, wait for new page context to stabilize
      await page.rawPage.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5_000 }).catch(() => undefined);
    } else {
      throw new ActionError('INVALID_ACTION', err?.message || 'Click action failed.', {
        cause: err,
      });
    }
  }

  // Handle expected popup / newly opened pages
  const openedPages: ManagedPage[] = [];

  if (expectedPopup) {
    const timeoutMs = expectedPopup.timeoutMs ?? 10_000;
    const start = Date.now();

    let newMatchingPages: ManagedPage[] = [];
    while (Date.now() - start < timeoutMs) {
      const currentPages = registry.list().filter((p) => p.state !== 'closed' && !pagesBefore.has(p.id));
      if (currentPages.length > 0) {
        newMatchingPages = currentPages.filter((p) => {
          if (expectedPopup.urlMatches && !p.url.includes(expectedPopup.urlMatches)) {
            return false;
          }
          if (expectedPopup.titleMatches && !p.title?.includes(expectedPopup.titleMatches)) {
            return false;
          }
          return true;
        });

        if (newMatchingPages.length > 0) {
          break;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    if (newMatchingPages.length === 0) {
      throw new ActionError(
        'EXPECTED_PAGE_NOT_OPENED',
        `Expected popup was not opened within ${timeoutMs}ms.`,
        { retryable: true },
      );
    }

    if (newMatchingPages.length > 1) {
      throw new ActionError(
        'AMBIGUOUS_NEW_PAGE',
        'The action opened multiple pages.',
        {
          details: {
            pages: newMatchingPages.map((p) => ({ id: p.id, url: p.url })),
          },
        },
      );
    }

    const popupPage = newMatchingPages[0];
    if (!popupPage) {
      throw new ActionError(
        'EXPECTED_PAGE_NOT_OPENED',
        'Expected popup page was not found.',
      );
    }
    popupPage.openerPageId = page.id;
    if (expectedPopup.alias) {
      popupPage.alias = expectedPopup.alias;
    }

    if (expectedPopup.activate !== false) {
      await registry.activate({ by: 'id', value: popupPage.id });
    }

    openedPages.push(popupPage);
  } else {
    // Collect any unexpected pages opened during click
    const newPages = registry.list().filter((p) => p.state !== 'closed' && !pagesBefore.has(p.id));
    openedPages.push(...newPages);
  }

  // Handle waitAfter strategy
  if (action.waitAfter) {
    if (typeof action.waitAfter === 'number') {
      await new Promise((r) => setTimeout(r, action.waitAfter as number));
    } else {
      await page.rawPage.waitForNetworkIdle({
        idleTime: 500,
        timeout: 10_000,
      }).catch(() => undefined);
    }
  }

  return { openedPages: openedPages.length > 0 ? openedPages : undefined };
}
