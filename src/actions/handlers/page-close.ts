import type { PageCloseAction } from '../types.js';
import type { PageRegistry } from '../../pages/registry.js';
import type { ManagedPage } from '../../pages/types.js';

export async function handlePageClose(params: {
  action: PageCloseAction;
  currentPage: ManagedPage;
  registry: PageRegistry;
}): Promise<{ closedPages: ManagedPage[] }> {
  const { action, currentPage, registry } = params;

  const target = action.targetPage
    ? registry.resolve(action.targetPage)
    : currentPage;

  const closedList = [target];
  await registry.close({ by: 'id', value: target.id });

  return { closedPages: closedList };
}
