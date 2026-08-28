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

  // 1. Ensure element is actively focused
  await target.elementHandle.focus().catch(() => undefined);

  // 2. Set value with native prototype setter to update React / Vue / Svelte controlled state
  await target.elementHandle.evaluate(
    (el: any, val: string, shouldClear: boolean) => {
      if (el.isContentEditable) {
        if (shouldClear) {
          el.textContent = val;
        } else {
          el.textContent = (el.textContent || '') + val;
        }
        el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
        return;
      }

      const proto = Object.getPrototypeOf(el);
      const descriptor =
        Object.getOwnPropertyDescriptor(proto, 'value') ||
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

      const finalVal = shouldClear ? val : (el.value || '') + val;

      if (descriptor?.set) {
        descriptor.set.call(el, finalVal);
      } else {
        el.value = finalVal;
      }

      // Reset React's internal value tracker so React detects the change
      if (el._valueTracker) {
        el._valueTracker.setValue('');
      }

      el.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    },
    action.value,
    action.clear !== false,
  );
}
