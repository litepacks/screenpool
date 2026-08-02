import type { ManagedPage } from '../../pages/types.js';
import type { SelectAction } from '../types.js';
import type { ResolvedTarget } from '../targets/types.js';
import { ActionError } from '../errors.js';

export async function handleSelect(params: {
  page: ManagedPage;
  action: SelectAction;
  target?: ResolvedTarget;
}): Promise<void> {
  const { page, action, target } = params;

  if (!target?.elementHandle) {
    throw new ActionError('INVALID_ACTION', 'Select action requires a valid element target.');
  }

  await target.elementHandle.select(...action.values);
}
