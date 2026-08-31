import type { Page } from 'puppeteer-core';
import type { ObservedElement } from './types.js';

export async function extractObservedElements(
  page: Page,
  maxElements = 200,
): Promise<ObservedElement[]> {
  try {
    const rawElements = await page.evaluate((max) => {
      const doc = (globalThis as any).document;
      const win = globalThis as any;

      const selectors = [
        'button',
        'a[href]',
        'input',
        'select',
        'textarea',
        '[role="button"]',
        '[role="link"]',
        '[role="textbox"]',
        '[role="checkbox"]',
        '[role="radio"]',
        '[role="combobox"]',
        '[role="menuitem"]',
        '[role="tab"]',
        '[tabindex]:not([tabindex="-1"])',
      ];
      const selectorString = selectors.join(',');

      const seen = new Set<any>();
      const items: Array<{ el: any; isShadow: boolean }> = [];

      function collect(root: Document | Element | ShadowRoot, isShadow = false) {
        const matches = root.querySelectorAll(selectorString);
        for (let i = 0; i < matches.length; i++) {
          const el = matches[i];
          if (!seen.has(el)) {
            seen.add(el);
            items.push({ el, isShadow });
          }
        }

        // Find nested Shadow DOM roots
        const allNodes = root.querySelectorAll('*');
        for (let i = 0; i < allNodes.length; i++) {
          const el = allNodes[i] as any;
          if (el && el.shadowRoot && !seen.has(el.shadowRoot)) {
            seen.add(el.shadowRoot);
            collect(el.shadowRoot, true);
          }
        }
      }

      collect(doc, false);

      const results: Array<{
        id: string;
        tag: string;
        role?: string;
        name?: string;
        label?: string;
        text?: string;
        type?: string;
        visible: boolean;
        inViewport: boolean;
        interactable: boolean;
        isShadow: boolean;
        enabled: boolean;
        editable: boolean;
        box?: { x: number; y: number; width: number; height: number };
      }> = [];

      let counter = 0;
      const scrollX = Math.round(win.scrollX || 0);
      const scrollY = Math.round(win.scrollY || 0);
      const innerWidth = win.innerWidth;
      const innerHeight = win.innerHeight;

      for (const item of items) {
        if (counter >= max) break;
        const el = item.el;

        const rect = el.getBoundingClientRect();
        const style = win.getComputedStyle(el);

        const hasCssVisibility =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0;

        const inViewport =
          hasCssVisibility &&
          rect.top < innerHeight &&
          rect.bottom > 0 &&
          rect.left < innerWidth &&
          rect.right > 0;

        const visible = hasCssVisibility && inViewport;

        const tag = el.tagName.toLowerCase();
        const enabled = !el.disabled;
        const interactable = visible && enabled;
        const editable =
          enabled &&
          !el.readOnly &&
          (tag === 'input' || tag === 'textarea' || el.isContentEditable || el.getAttribute('role') === 'textbox');

        const role = el.getAttribute('role') || tag;
        const label =
          el.getAttribute('aria-label') ||
          el.placeholder ||
          el.label ||
          undefined;

        const text = el.textContent?.slice(0, 100).trim() || undefined;

        counter++;
        const id = `elem_${counter}`;

        // Set stable data attribute on DOM / Shadow DOM element
        try {
          el.setAttribute('data-screenpool-id', id);
        } catch {
          // ignore setAttribute issues on detached nodes
        }

        results.push({
          id,
          tag,
          role,
          name: label || text,
          label,
          text,
          type: el.type || undefined,
          visible,
          inViewport,
          interactable,
          isShadow: item.isShadow,
          enabled,
          editable,
          box: {
            x: Math.round(rect.left + scrollX),
            y: Math.round(rect.top + scrollY),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
        });
      }

      return results;
    }, maxElements);

    return rawElements as ObservedElement[];
  } catch {
    return [];
  }
}

