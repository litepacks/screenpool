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

      const elements = Array.from(doc.querySelectorAll(selectors.join(','))) as any[];
      const results: Array<{
        id: string;
        tag: string;
        role?: string;
        name?: string;
        label?: string;
        text?: string;
        type?: string;
        visible: boolean;
        enabled: boolean;
        editable: boolean;
        box?: { x: number; y: number; width: number; height: number };
      }> = [];

      let counter = 0;

      for (const el of elements) {
        if (counter >= max) break;
        counter++;
        const id = `elem_${counter}`;

        // Set stable data attribute on DOM element
        el.setAttribute('data-screenpool-id', id);

        const rect = el.getBoundingClientRect();
        const style = win.getComputedStyle(el);

        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          rect.width > 0 &&
          rect.height > 0;

        const tag = el.tagName.toLowerCase();
        const enabled = !el.disabled;
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

        results.push({
          id,
          tag,
          role,
          name: label || text,
          label,
          text,
          type: el.type || undefined,
          visible,
          enabled,
          editable,
          box: visible
            ? {
                x: Math.round(rect.left + win.scrollX),
                y: Math.round(rect.top + win.scrollY),
                width: Math.round(rect.width),
                height: Math.round(rect.height),
              }
            : undefined,
        });
      }

      return results;
    }, maxElements);

    return rawElements as ObservedElement[];
  } catch {
    return [];
  }
}
