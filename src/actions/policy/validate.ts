import type { ActionPolicy } from './types.js';
import type { Action } from '../types.js';
import { ActionError } from '../errors.js';

export function validateActionPolicy(policy: ActionPolicy, action: Action): void {
  if (!policy.allowedActions.includes(action.type)) {
    throw new ActionError(
      'ACTION_NOT_ALLOWED',
      `Action type '${action.type}' is disallowed by policy.`,
    );
  }

  // Validate fill action input limits and sensitivity policy
  if (action.type === 'fill') {
    if (action.value.length > policy.input.maxValueLength) {
      throw new ActionError(
        'INVALID_ACTION',
        `Fill action value length (${action.value.length}) exceeds policy max limit (${policy.input.maxValueLength}).`,
      );
    }
  }
}
