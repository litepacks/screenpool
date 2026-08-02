import type { ManagedPage } from '../../pages/types.js';
import type { WaitAction } from '../types.js';
import type { TargetPolicy } from '../policy/types.js';
import type { ObservationStore } from '../../observations/store.js';
import { resolveTarget } from '../targets/resolver.js';

export async function handleWait(params: {
  page: ManagedPage;
  action: WaitAction;
  policy: TargetPolicy;
  observationStore: ObservationStore;
}): Promise<void> {
  const { page, action, policy, observationStore } = params;

  if (action.durationMs) {
    await new Promise((r) => setTimeout(r, action.durationMs));
    return;
  }

  if (action.selector) {
    const timeoutMs = action.timeoutMs ?? 10_000;
    const expectedState = action.state ?? 'visible';
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        const resolved = await resolveTarget(page.rawPage, action.selector, policy, observationStore);
        if (expectedState === 'attached' || expectedState === 'visible') {
          if (resolved.elementHandle) return;
        }
      } catch {
        if (expectedState === 'detached' || expectedState === 'hidden') {
          return;
        }
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
}
