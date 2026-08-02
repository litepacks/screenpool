import type { PageActivateAction } from '../types.js';
import type { PageRegistry } from '../../pages/registry.js';
import type { ManagedPage } from '../../pages/types.js';

export async function handlePageActivate(params: {
  action: PageActivateAction;
  registry: PageRegistry;
}): Promise<{ activatedPage: ManagedPage }> {
  const { action, registry } = params;
  const activatedPage = await registry.activate(action.targetPage);
  return { activatedPage };
}
