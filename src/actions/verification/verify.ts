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
): Promise<{ success: boolean; results: VerificationResult[] }> {
  const results: VerificationResult[] = [];
  let allSuccess = true;

  for (const cond of conditions) {
    let success = false;
    let message: string | undefined;

    try {
      switch (cond.type) {
        case 'url': {
          const currentUrl = page.rawPage.url();
          success = currentUrl.includes(cond.matches);
          if (!success) {
            message = `Expected URL containing "${cond.matches}", got "${currentUrl}"`;
          }
          break;
        }

        case 'title': {
          const currentTitle = await page.rawPage.title().catch(() => '');
          success = currentTitle.includes(cond.matches);
          if (!success) {
            message = `Expected title containing "${cond.matches}", got "${currentTitle}"`;
          }
          break;
        }

        case 'element-visible': {
          try {
            await resolveTarget(page.rawPage, cond.target, policy, observationStore);
            success = true;
          } catch (err) {
            success = false;
            message = err instanceof Error ? err.message : String(err);
          }
          break;
        }

        case 'element-hidden': {
          try {
            await resolveTarget(page.rawPage, cond.target, policy, observationStore);
            success = false;
            message = `Element matched target ${JSON.stringify(cond.target)} but was expected to be hidden.`;
          } catch {
            success = true;
          }
          break;
        }

        case 'text-present': {
          const hasText = await page.rawPage.evaluate((t) => {
            const doc = (globalThis as any).document;
            return doc.body.textContent?.includes(t) ?? false;
          }, cond.text);
          success = hasText;
          if (!success) {
            message = `Page text content does not contain "${cond.text}"`;
          }
          break;
        }
      }
    } catch (err) {
      success = false;
      message = err instanceof Error ? err.message : String(err);
    }

    if (!success) allSuccess = false;
    results.push({ condition: cond, success, message });
  }

  return { success: allSuccess, results };
}
