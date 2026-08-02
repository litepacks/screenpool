import type { ElementHandle, Page } from 'puppeteer-core';
import type { ResolvedTarget, Target, TargetCandidate } from './types.js';
import type { TargetPolicy } from '../policy/types.js';
import { ActionError } from '../errors.js';
import type { ObservationStore } from '../../observations/store.js';

export async function resolveTarget(
  page: Page,
  target: Target,
  policy: TargetPolicy,
  observationStore: ObservationStore,
): Promise<ResolvedTarget> {
  // Policy checks
  if (target.by === 'element-id' && !policy.elementId) {
    throw new ActionError(
      'ACTION_NOT_ALLOWED',
      'Target type "element-id" is disallowed by target policy.',
    );
  }
  if (
    (target.by === 'role' || target.by === 'label' || target.by === 'text' || target.by === 'test-id') &&
    !policy.semantic
  ) {
    throw new ActionError(
      'ACTION_NOT_ALLOWED',
      'Semantic target types are disallowed by target policy.',
    );
  }
  if (target.by === 'css' && !policy.css) {
    throw new ActionError(
      'ACTION_NOT_ALLOWED',
      'Target type "css" is disallowed by target policy. Enable targets.css in policy to allow.',
    );
  }
  if (target.by === 'point' && !policy.point) {
    throw new ActionError(
      'ACTION_NOT_ALLOWED',
      'Target type "point" is disallowed by target policy. Enable targets.point in policy to allow.',
    );
  }

  if (target.by === 'point') {
    return {
      target,
      point: { x: target.x, y: target.y },
      matchCount: 1,
    };
  }

  let elementHandles: ElementHandle[] = [];

  if (target.by === 'element-id') {
    const obs = observationStore.get(target.observationId);
    if (!obs) {
      throw new ActionError(
        'OBSERVATION_NOT_FOUND',
        `Observation ${target.observationId} was not found.`,
      );
    }
    const elem = obs.elements?.find((e) => e.id === target.value);
    if (!elem) {
      throw new ActionError(
        'TARGET_NOT_FOUND',
        `Element ${target.value} was not found in observation ${target.observationId}.`,
      );
    }

    // Try finding by data-screenpool-id attribute
    elementHandles = await page.$$(`[data-screenpool-id="${target.value}"]`);

    if (elementHandles.length === 0 && elem.box) {
      // Fallback: point in center of element box
      const cx = elem.box.x + elem.box.width / 2;
      const cy = elem.box.y + elem.box.height / 2;
      const handle = await page.evaluateHandle(
        (x, y) => (globalThis as any).document.elementFromPoint(x, y),
        cx,
        cy,
      );
      const asElement = handle.asElement() as ElementHandle | null;
      if (asElement) {
        elementHandles = [asElement];
      }
    }
  } else if (target.by === 'css') {
    elementHandles = await page.$$(target.value);
  } else if (target.by === 'test-id') {
    const val = target.value;
    elementHandles = await page.$$(
      `[data-testid="${val}"], [data-test-id="${val}"], [data-qa="${val}"]`,
    );
  } else {
    // Semantic query in page context
    const handles = await querySemanticElements(page, target);
    elementHandles = handles;
  }

  // Filter for visible elements
  const visibleHandles: ElementHandle[] = [];
  const candidates: TargetCandidate[] = [];

  for (const handle of elementHandles) {
    const isVis = await isElementVisible(handle);
    if (isVis) {
      visibleHandles.push(handle);
      const cand = await describeElement(handle);
      candidates.push(cand);
    }
  }

  if (visibleHandles.length === 0) {
    throw new ActionError(
      'TARGET_NOT_FOUND',
      `Target matched no visible elements on the page. (${JSON.stringify(target)})`,
    );
  }

  if (visibleHandles.length > 1) {
    throw new ActionError(
      'AMBIGUOUS_TARGET',
      `Target matched ${visibleHandles.length} visible elements.`,
      {
        details: { candidates, matchCount: visibleHandles.length },
      },
    );
  }

  const selectedHandle = visibleHandles[0];
  const elementId = target.by === 'element-id' ? target.value : undefined;

  return {
    target,
    elementId,
    elementHandle: selectedHandle,
    matchCount: 1,
  };
}

async function querySemanticElements(
  page: Page,
  target: Target,
): Promise<ElementHandle[]> {
  const serializedTarget = JSON.stringify(target);
  const handleArray = await page.evaluateHandle((tStr: string) => {
    const doc = (globalThis as any).document;
    const t = JSON.parse(tStr);
    const results: any[] = [];
    const all = Array.from(doc.querySelectorAll('*')) as any[];

    function matchText(text: string | null | undefined, query: string, exact?: boolean): boolean {
      if (!text) return false;
      const normalized = text.trim();
      return exact ? normalized === query : normalized.toLowerCase().includes(query.toLowerCase());
    }

    if (t.by === 'role') {
      const roleName = t.role;
      const queryName = t.name;
      const exact = t.exact;

      for (const el of all) {
        const computedRole = el.getAttribute('role') || el.tagName.toLowerCase();
        let matchesRole = false;

        if (roleName === 'button' && (computedRole === 'button' || el.tagName === 'BUTTON' || (el.tagName === 'INPUT' && ['button', 'submit', 'reset'].includes(el.type)))) {
          matchesRole = true;
        } else if (roleName === 'link' && (computedRole === 'link' || el.tagName === 'A')) {
          matchesRole = true;
        } else if (roleName === 'textbox' && (computedRole === 'textbox' || (el.tagName === 'INPUT' && ['text', 'password', 'email', 'search', 'tel', 'url'].includes(el.type)) || el.tagName === 'TEXTAREA')) {
          matchesRole = true;
        } else if (roleName === 'checkbox' && (computedRole === 'checkbox' || (el.tagName === 'INPUT' && el.type === 'checkbox'))) {
          matchesRole = true;
        } else if (roleName === 'radio' && (computedRole === 'radio' || (el.tagName === 'INPUT' && el.type === 'radio'))) {
          matchesRole = true;
        } else if (roleName === 'combobox' && (computedRole === 'combobox' || el.tagName === 'SELECT')) {
          matchesRole = true;
        } else if (roleName === 'option' && (computedRole === 'option' || el.tagName === 'OPTION')) {
          matchesRole = true;
        } else if (roleName === 'menuitem' && computedRole === 'menuitem') {
          matchesRole = true;
        } else if (roleName === 'tab' && computedRole === 'tab') {
          matchesRole = true;
        }

        if (matchesRole) {
          if (!queryName) {
            results.push(el);
          } else {
            const accessibleName = el.getAttribute('aria-label') || el.placeholder || el.value || el.textContent || '';
            if (matchText(accessibleName, queryName, exact)) {
              results.push(el);
            }
          }
        }
      }
    } else if (t.by === 'label') {
      const queryVal = t.value;
      const exact = t.exact;

      // Check labels
      const labels = Array.from(doc.querySelectorAll('label')) as any[];
      for (const lbl of labels) {
        if (matchText(lbl.textContent, queryVal, exact)) {
          const forId = lbl.getAttribute('for');
          if (forId) {
            const targetEl = doc.getElementById(forId);
            if (targetEl) results.push(targetEl);
          } else {
            const inputInside = lbl.querySelector('input, select, textarea');
            if (inputInside) results.push(inputInside);
          }
        }
      }

      // Check aria-label / placeholder
      for (const el of all) {
        const ariaLabel = el.getAttribute('aria-label');
        const placeholder = el.getAttribute('placeholder');
        if (matchText(ariaLabel, queryVal, exact) || matchText(placeholder, queryVal, exact)) {
          if (!results.includes(el)) results.push(el);
        }
      }
    } else if (t.by === 'text') {
      const queryVal = t.value;
      const exact = t.exact;

      for (const el of all) {
        const tag = el.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'head' || tag === 'option') continue;

        let directText = '';
        for (const child of Array.from(el.childNodes) as any[]) {
          if (child.nodeType === 3 /* Node.TEXT_NODE */) {
            directText += child.textContent || '';
          }
        }

        const textToCompare = directText.trim() || el.textContent?.trim() || '';
        if (matchText(textToCompare, queryVal, exact)) {
          const childMatches = (Array.from(el.children) as any[]).some((child: any) =>
            matchText(child.textContent, queryVal, exact),
          );
          if (!childMatches) {
            results.push(el);
          }
        }
      }
    }

    return results;
  }, serializedTarget);

  const lengthHandle = await page.evaluateHandle((arr: any) => arr.length, handleArray);
  const length = (await lengthHandle.jsonValue()) as number;

  const resultHandles: ElementHandle[] = [];
  for (let i = 0; i < length; i++) {
    const itemHandle = await page.evaluateHandle((arr: any, index: number) => arr[index], handleArray, i);
    const elementHandle = itemHandle.asElement() as ElementHandle | null;
    if (elementHandle) {
      resultHandles.push(elementHandle);
    }
  }

  return resultHandles;
}

async function isElementVisible(handle: ElementHandle): Promise<boolean> {
  try {
    return await handle.evaluate((el: any) => {
      if (!el) return false;
      const win = globalThis as any;
      const style = win.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
      }
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
  } catch {
    return false;
  }
}

async function describeElement(handle: ElementHandle): Promise<TargetCandidate> {
  try {
    return await handle.evaluate((el: any) => {
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role') || undefined,
        text: el.textContent?.slice(0, 50).trim() || undefined,
        label: el.getAttribute('aria-label') || undefined,
        id: el.id || undefined,
      };
    });
  } catch {
    return { tag: 'unknown' };
  }
}
