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
  options?: { timeoutMs?: number; intervalMs?: number },
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
      'Target type "css" is disallowed by target policy. Enable "targets.css: true" in target policy.\nExample payload for screenpool_session_create / screenpool_run / screenpool_act:\n{\n  "policy": {\n    "targets": {\n      "css": true,\n      "point": true\n    }\n  }\n}',
    );
  }
  if (target.by === 'point' && !policy.point) {
    throw new ActionError(
      'ACTION_NOT_ALLOWED',
      'Target type "point" is disallowed by target policy. Enable "targets.point: true" in target policy.\nExample payload for screenpool_session_create / screenpool_run / screenpool_act:\n{\n  "policy": {\n    "targets": {\n      "css": true,\n      "point": true\n    }\n  }\n}',
    );
  }

  if (target.by === 'point') {
    return {
      target,
      point: { x: target.x, y: target.y },
      matchCount: 1,
    };
  }

  let fallbackBox: { x: number; y: number; width: number; height: number } | undefined;
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
    fallbackBox = elem.box;
  }

  const timeoutMs = options?.timeoutMs ?? 2_000;
  const intervalMs = options?.intervalMs ?? 50;
  const start = Date.now();

  const serializedTarget = JSON.stringify(target);
  let lastCandidates: TargetCandidate[] = [];
  let lastMatchCount = 0;

  while (true) {
    // Single in-page evaluateHandle: searches elements, traverses Shadow DOM,
    // filters visibility, and formats candidate descriptions in 1 roundtrip.
    const handle = await page.evaluateHandle(
      inPageFindTarget,
      serializedTarget,
      fallbackBox,
    );

    const meta = await handle.evaluate((res: any) => ({
      matchCount: res.matchCount as number,
      candidates: res.candidates as TargetCandidate[],
    }));

    lastMatchCount = meta.matchCount;
    lastCandidates = meta.candidates;

    if (lastMatchCount === 1) {
      const elementProperty = await handle.getProperty('element');
      const elementHandle = elementProperty.asElement() as ElementHandle;
      await handle.dispose();

      return {
        target,
        elementId: target.by === 'element-id' ? target.value : undefined,
        elementHandle,
        matchCount: 1,
      };
    }

    await handle.dispose();

    if (lastMatchCount > 1) {
      throw new ActionError(
        'AMBIGUOUS_TARGET',
        `Target matched ${lastMatchCount} visible elements.`,
        {
          details: { candidates: lastCandidates, matchCount: lastMatchCount },
        },
      );
    }

    if (Date.now() - start >= timeoutMs) {
      break;
    }

    await new Promise((r) =>
      setTimeout(r, Math.min(intervalMs, Math.max(10, timeoutMs - (Date.now() - start)))),
    );
  }

  // Not found within timeout: check closed shadow root if applicable
  const hasClosedShadow = await page
    .evaluate(() => {
      const all = Array.from((globalThis as any).document.querySelectorAll('*')) as any[];
      return all.some((el) => el.tagName.includes('-') && !el.shadowRoot);
    })
    .catch(() => false);

  if (hasClosedShadow && target.by === 'css' && target.value.includes('closed')) {
    throw new ActionError(
      'CLOSED_SHADOW_ROOT_NOT_ACCESSIBLE',
      `Element is inside a closed shadow root which cannot be accessed via standard DOM APIs. (${JSON.stringify(target)})`,
    );
  }

  throw new ActionError(
    'TARGET_NOT_FOUND',
    `Target matched no visible elements on the page. (${JSON.stringify(target)})`,
  );
}

/**
 * Executes inside page context: collects candidate elements across light and shadow DOM,
 * verifies CSS layout visibility, and returns candidates + matched element in a single roundtrip.
 */
function inPageFindTarget(
  targetJson: string,
  fallbackBox?: { x: number; y: number; width: number; height: number },
) {
  const win = globalThis as any;
  const doc = win.document;
  const t = JSON.parse(targetJson);

  function searchShadowRoots(
    root: Document | Element | ShadowRoot,
    predicate: (r: Document | Element | ShadowRoot) => Element[],
  ): Element[] {
    const results: Element[] = [];
    const seen = new Set<Element>();

    function traverse(current: Document | Element | ShadowRoot) {
      try {
        const found = predicate(current);
        for (let i = 0; i < found.length; i++) {
          const el = found[i]!;
          if (!seen.has(el)) {
            seen.add(el);
            results.push(el);
          }
        }
      } catch {}

      const allNodes = current.querySelectorAll('*');
      for (let i = 0; i < allNodes.length; i++) {
        const node = allNodes[i] as Element;
        if (node && (node as any).shadowRoot) {
          traverse((node as any).shadowRoot);
        }
      }
    }

    traverse(root);
    return results;
  }

  let matchingElements: Element[] = [];

  if (t.by === 'element-id') {
    matchingElements = searchShadowRoots(doc, (r) =>
      Array.from(r.querySelectorAll(`[data-screenpool-id="${t.value}"]`)),
    );
    if (matchingElements.length === 0 && fallbackBox) {
      const cx = fallbackBox.x + fallbackBox.width / 2;
      const cy = fallbackBox.y + fallbackBox.height / 2;
      const el = doc.elementFromPoint(cx, cy);
      if (el) matchingElements.push(el);
    }
  } else if (t.by === 'css') {
    matchingElements = searchShadowRoots(doc, (r) => {
      try {
        return Array.from(r.querySelectorAll(t.value));
      } catch {
        return [];
      }
    });
  } else if (t.by === 'test-id') {
    const val = t.value;
    const selector = `[data-testid="${val}"], [data-test-id="${val}"], [data-qa="${val}"]`;
    matchingElements = searchShadowRoots(doc, (r) =>
      Array.from(r.querySelectorAll(selector)),
    );
  } else {
    // Semantic queries: role, label, text
    function collectAllElements(
      root: Document | Element | ShadowRoot,
      list: Element[] = [],
    ): Element[] {
      const nodes = root.querySelectorAll('*');
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i] as Element;
        list.push(el);
        if ((el as any).shadowRoot) {
          collectAllElements((el as any).shadowRoot, list);
        }
      }
      return list;
    }

    const all = collectAllElements(doc);

    function matchText(
      text: string | null | undefined,
      query: string,
      exact?: boolean,
    ): boolean {
      if (!text) return false;
      const normalized = text.trim();
      return exact
        ? normalized === query
        : normalized.toLowerCase().includes(query.toLowerCase());
    }

    if (t.by === 'role') {
      const roleName = t.role;
      const queryName = t.name;
      const exact = t.exact;

      for (let i = 0; i < all.length; i++) {
        const el = all[i]!;
        const computedRole = el.getAttribute('role') || el.tagName.toLowerCase();
        let matchesRole = false;

        if (
          roleName === 'button' &&
          (computedRole === 'button' ||
            el.tagName === 'BUTTON' ||
            (el.tagName === 'INPUT' &&
              ['button', 'submit', 'reset'].includes((el as HTMLInputElement).type)))
        ) {
          matchesRole = true;
        } else if (roleName === 'link' && (computedRole === 'link' || el.tagName === 'A')) {
          matchesRole = true;
        } else if (
          roleName === 'textbox' &&
          (computedRole === 'textbox' ||
            (el.tagName === 'INPUT' &&
              ['text', 'password', 'email', 'search', 'tel', 'url'].includes(
                (el as HTMLInputElement).type,
              )) ||
            el.tagName === 'TEXTAREA')
        ) {
          matchesRole = true;
        } else if (
          roleName === 'checkbox' &&
          (computedRole === 'checkbox' ||
            (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox'))
        ) {
          matchesRole = true;
        } else if (
          roleName === 'radio' &&
          (computedRole === 'radio' ||
            (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'radio'))
        ) {
          matchesRole = true;
        } else if (
          roleName === 'combobox' &&
          (computedRole === 'combobox' || el.tagName === 'SELECT')
        ) {
          matchesRole = true;
        } else if (
          roleName === 'option' &&
          (computedRole === 'option' || el.tagName === 'OPTION')
        ) {
          matchesRole = true;
        } else if (roleName === 'menuitem' && computedRole === 'menuitem') {
          matchesRole = true;
        } else if (roleName === 'tab' && computedRole === 'tab') {
          matchesRole = true;
        }

        if (matchesRole) {
          if (!queryName) {
            matchingElements.push(el);
          } else {
            const accessibleName =
              el.getAttribute('aria-label') ||
              (el as any).placeholder ||
              (el as any).value ||
              el.textContent ||
              '';
            if (matchText(accessibleName, queryName, exact)) {
              matchingElements.push(el);
            }
          }
        }
      }
    } else if (t.by === 'label') {
      const queryVal = t.value;
      const exact = t.exact;

      for (let i = 0; i < all.length; i++) {
        const el = all[i]!;
        if (el.tagName === 'LABEL' && matchText(el.textContent, queryVal, exact)) {
          const forId = el.getAttribute('for');
          if (forId) {
            const targetEl = doc.getElementById(forId);
            if (targetEl) matchingElements.push(targetEl);
          } else {
            const inputInside = el.querySelector('input, select, textarea');
            if (inputInside) matchingElements.push(inputInside);
          }
        }
        const ariaLabel = el.getAttribute('aria-label');
        const placeholder = (el as any).placeholder;
        if (
          matchText(ariaLabel, queryVal, exact) ||
          matchText(placeholder, queryVal, exact)
        ) {
          if (!matchingElements.includes(el)) matchingElements.push(el);
        }
      }
    } else if (t.by === 'text') {
      const queryVal = t.value;
      const exact = t.exact;

      for (let i = 0; i < all.length; i++) {
        const el = all[i]!;
        const tag = el.tagName.toLowerCase();
        if (
          tag === 'script' ||
          tag === 'style' ||
          tag === 'head' ||
          tag === 'option'
        )
          continue;

        let directText = '';
        const childNodes = el.childNodes;
        for (let j = 0; j < childNodes.length; j++) {
          const child = childNodes[j]!;
          if (child.nodeType === 3 /* Node.TEXT_NODE */) {
            directText += child.textContent || '';
          }
        }

        const textToCompare =
          directText.trim() || el.textContent?.trim() || '';
        if (matchText(textToCompare, queryVal, exact)) {
          const children = el.children;
          let childMatches = false;
          for (let k = 0; k < children.length; k++) {
            if (matchText(children[k]?.textContent, queryVal, exact)) {
              childMatches = true;
              break;
            }
          }
          if (!childMatches) {
            matchingElements.push(el);
          }
        }
      }
    }
  }

  // Filter visible elements and describe candidates in-page
  const visibleElements: Element[] = [];
  const candidates: TargetCandidate[] = [];

  for (let i = 0; i < matchingElements.length; i++) {
    const el = matchingElements[i]!;
    const rect = el.getBoundingClientRect();

    // Fast check: element must have non-zero dimensions to be visible
    if (rect.width > 0 && rect.height > 0) {
      const style = win.getComputedStyle(el);
      if (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        style.opacity !== '0'
      ) {
        visibleElements.push(el);
        candidates.push({
          tag: el.tagName.toLowerCase(),
          role: el.getAttribute('role') || undefined,
          text: el.textContent?.slice(0, 50).trim() || undefined,
          label: el.getAttribute('aria-label') || undefined,
          id: el.id || undefined,
        });
      }
    }
  }

  return {
    element: visibleElements.length === 1 ? visibleElements[0] : null,
    matchCount: visibleElements.length,
    candidates,
  };
}
