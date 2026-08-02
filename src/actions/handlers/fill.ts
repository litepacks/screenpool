import type { ManagedPage } from '../../pages/types.js';
import type { FillAction } from '../types.js';
import type { ResolvedTarget } from '../targets/types.js';
import { ActionError } from '../errors.js';

export async function handleFill(params: {
  page: ManagedPage;
  action: FillAction;
  target?: ResolvedTarget;
}): Promise<void> {
  const { page, action, target } = params;

  if (!target?.elementHandle) {
    throw new ActionError('INVALID_ACTION', 'Fill action requires a valid element target.');
  }

  const isEditable = await target.elementHandle.evaluate((el: any) => {
    if (el.disabled || el.readOnly) return false;
    const tag = el.tagName.toLowerCase();
    return (
      tag === 'input' ||
      tag === 'textarea' ||
      el.isContentEditable ||
      el.getAttribute('role') === 'textbox'
    );
  });

  if (!isEditable) {
    throw new ActionError(
      'TARGET_NOT_EDITABLE',
      'Target element is disabled, read-only, or not an editable field.',
    );
  }

  if (action.clear !== false) {
    await target.elementHandle.click({ clickCount: 3 });
    await page.rawPage.keyboard.press('Backspace');
  }

  await target.elementHandle.type(action.value);
}
