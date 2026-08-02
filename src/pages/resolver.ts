import type { ManagedPage, PageReference } from './types.js';
import type { PageRegistry } from './registry.js';
import { ActionError } from '../actions/errors.js';

export function resolvePageReference(
  registry: PageRegistry,
  reference: PageReference,
): ManagedPage {
  let found: ManagedPage | undefined;

  switch (reference.by) {
    case 'id':
      found = registry.get(reference.value);
      break;

    case 'alias':
      found = registry.list().find((p) => p.alias === reference.value && p.state !== 'closed');
      break;

    case 'active':
      found = registry.getActive();
      break;

    case 'main':
      found = registry.getMain();
      break;

    case 'latest':
      found = registry.getLatest();
      break;

    case 'opener-of': {
      const targetPage = registry.get(reference.value);
      if (targetPage?.openerPageId) {
        found = registry.get(targetPage.openerPageId);
      }
      break;
    }
  }

  if (!found || found.state === 'closed') {
    throw new ActionError(
      'PAGE_NOT_RESOLVED',
      `No target page could be resolved for reference: ${JSON.stringify(reference)}`,
      { retryable: false },
    );
  }

  return found;
}
