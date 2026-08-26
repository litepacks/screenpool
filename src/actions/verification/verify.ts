import type { ManagedPage } from '../../pages/types.js';
import type { VerificationCondition, VerificationResult } from './types.js';
import type { TargetPolicy } from '../policy/types.js';
import type { ObservationStore } from '../../observations/store.js';
import { resolveTarget } from '../targets/resolver.js';

export async function verifyConditions(
  page: ManagedPage,
  conditions: VerificationCondition[],
  policy: TargetPolicy,
  observationStore: ObservationStore,
  defaultTimeoutMs: number = 3_000,
): Promise<{ success: boolean; results: VerificationResult[] }> {
  const results: VerificationResult[] = [];
  let allSuccess = true;

  for (const cond of conditions) {
    const timeoutMs = cond.timeoutMs ?? defaultTimeoutMs;
    const start = Date.now();
    let condSuccess = false;
    let condMessage: string | undefined;

    while (true) {
      try {
        switch (cond.type) {
          case 'url': {
            const currentUrl = page.rawPage.url();
            condSuccess = currentUrl.includes(cond.matches);
            if (!condSuccess) {
              condMessage = `Expected URL containing "${cond.matches}", got "${currentUrl}"`;
            }
            break;
          }

          case 'title': {
            const currentTitle = await page.rawPage.title().catch(() => '');
            condSuccess = currentTitle.includes(cond.matches);
            if (!condSuccess) {
              condMessage = `Expected title containing "${cond.matches}", got "${currentTitle}"`;
            }
            break;
          }

          case 'element-visible': {
            try {
              await resolveTarget(page.rawPage, cond.target, policy, observationStore, { timeoutMs: 0 });
              condSuccess = true;
            } catch (err) {
              condSuccess = false;
              condMessage = err instanceof Error ? err.message : String(err);
            }
            break;
          }

          case 'element-hidden': {
            try {
              await resolveTarget(page.rawPage, cond.target, policy, observationStore, { timeoutMs: 0 });
              condSuccess = false;
              condMessage = `Element matched target ${JSON.stringify(cond.target)} but was expected to be hidden.`;
            } catch {
              condSuccess = true;
            }
            break;
          }

          case 'text-present': {
            const hasText = await page.rawPage.evaluate((t) => {
              const doc = (globalThis as any).document;
              return doc?.body?.textContent?.includes(t) ?? false;
            }, cond.text).catch(() => false);
            condSuccess = hasText;
            if (!condSuccess) {
              condMessage = `Page text content does not contain "${cond.text}"`;
            }
            break;
          }
        }
      } catch (err) {
        condSuccess = false;
        condMessage = err instanceof Error ? err.message : String(err);
      }

      if (condSuccess) {
        break;
      }

      if (Date.now() - start >= timeoutMs) {
        break;
      }

      await new Promise((r) => setTimeout(r, Math.min(50, Math.max(10, timeoutMs - (Date.now() - start)))));
    }

    if (!condSuccess) allSuccess = false;
    results.push({ condition: cond, success: condSuccess, message: condMessage });
  }

  return { success: allSuccess, results };
}
