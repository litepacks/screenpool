import type { ManagedPage } from '../../pages/types.js';
import type { PressAction } from '../types.js';
import type { ResolvedTarget } from '../targets/types.js';

export async function handlePress(params: {
  page: ManagedPage;
  action: PressAction;
  target?: ResolvedTarget;
}): Promise<void> {
  const { page, action, target } = params;

  if (target?.elementHandle) {
    await target.elementHandle.focus();
  }

  await page.rawPage.keyboard.press(action.key);
}
