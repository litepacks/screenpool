import type { DiagnosticInteractiveElement, PageStateDiagnostic } from './types.js';
import type { DiagnosticPage } from './page-adapter.js';
import type { Sanitizer } from './sanitizer.js';

export async function capturePageState(
  page: DiagnosticPage,
  sanitizer: Sanitizer,
): Promise<{
  pageState?: PageStateDiagnostic;
  interactiveElements?: DiagnosticInteractiveElement[];
}> {
  if (page.isClosed()) {
    return {};
  }

  try {
    const rawState = await page.evaluate(() => {
      const g = globalThis as any;
      const doc = g.document;
      const win = g.window;

      if (!doc || !win) return null;

      // Active element details
      let activeElement: PageStateDiagnostic['activeElement'] | undefined;
      const active = doc.activeElement;
      if (active && active !== doc.body) {
        const tag = active.tagName.toLowerCase();
        const role = active.getAttribute('role') || undefined;
        const type = active.type || undefined;
        const name = active.name || undefined;
        const id = active.id || undefined;
        let text = active.textContent?.trim().slice(0, 100) || undefined;

        // Never expose input values or password text
        if (type === 'password' || tag === 'input' || tag === 'textarea') {
          text = undefined;
        }

        activeElement = { tag, role, type, name, id, text };
      }

      // Element counts
      const counts = {
        iframes: doc.querySelectorAll('iframe, frame').length,
        dialogs: doc.querySelectorAll('dialog, [role="dialog"], [role="alertdialog"]').length,
        forms: doc.forms.length,
        buttons: doc.querySelectorAll('button, input[type="button"], input[type="submit"], [role="button"]').length,
        inputs: doc.querySelectorAll('input, textarea, select').length,
      };

      // Document & scroll
      const docWidth = Math.max(doc.documentElement.scrollWidth, doc.body ? doc.body.scrollWidth : 0);
      const docHeight = Math.max(doc.documentElement.scrollHeight, doc.body ? doc.body.scrollHeight : 0);

      // Interactive elements snapshot (up to 500)
      const selector = 'a, button, input, textarea, select, summary, [role], [contenteditable], [tabindex]';
      const nodes = Array.from(doc.querySelectorAll(selector)).slice(0, 500);

      const interactiveElements: DiagnosticInteractiveElement[] = nodes.map((node: any) => {
        const rect = node.getBoundingClientRect ? node.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };

        const tag = node.tagName ? node.tagName.toLowerCase() : 'element';
        const role = node.getAttribute ? node.getAttribute('role') || undefined : undefined;
        const name = node.name || (node.getAttribute ? node.getAttribute('aria-label') : undefined) || undefined;
        const type = node.type || undefined;

        let text = node.textContent?.trim().replace(/\s+/g, ' ').slice(0, 100) || undefined;
        if (type === 'password' || tag === 'input' || tag === 'textarea') {
          text = undefined;
        }

        const style = win.getComputedStyle ? win.getComputedStyle(node) : null;
        const visible = rect.width > 0 && rect.height > 0 && (style ? style.visibility !== 'hidden' : true);
        const enabled = !node.disabled;

        return {
          tag,
          role,
          name,
          text,
          type,
          visible,
          enabled,
          box: {
            x: Math.round(rect.x || rect.left || 0),
            y: Math.round(rect.y || rect.top || 0),
            width: Math.round(rect.width || 0),
            height: Math.round(rect.height || 0),
          },
        };
      });

      return {
        url: win.location.href,
        title: doc.title,
        readyState: doc.readyState,
        viewport: {
          width: win.innerWidth,
          height: win.innerHeight,
          deviceScaleFactor: win.devicePixelRatio || 1,
        },
        scroll: {
          x: win.scrollX || win.pageXOffset || 0,
          y: win.scrollY || win.pageYOffset || 0,
        },
        document: {
          width: docWidth,
          height: docHeight,
        },
        activeElement,
        counts,
        visibilityState: doc.visibilityState,
        hasFocus: doc.hasFocus ? doc.hasFocus() : false,
        interactiveElements,
      };
    });

    if (!rawState) {
      return {};
    }

    const pageState: PageStateDiagnostic = {
      timestamp: new Date().toISOString(),
      url: sanitizer.sanitizeUrl(rawState.url),
      title: sanitizer.sanitizeText(rawState.title),
      readyState: rawState.readyState,
      viewport: rawState.viewport,
      scroll: rawState.scroll,
      document: rawState.document,
      activeElement: rawState.activeElement
        ? {
            ...rawState.activeElement,
            text: sanitizer.sanitizeText(rawState.activeElement.text),
          }
        : undefined,
      counts: rawState.counts,
      visibilityState: rawState.visibilityState,
      hasFocus: rawState.hasFocus,
    };

    const interactiveElements: DiagnosticInteractiveElement[] = (
      rawState.interactiveElements || []
    ).map((el: DiagnosticInteractiveElement) => ({
      ...el,
      name: sanitizer.sanitizeText(el.name),
      text: sanitizer.sanitizeText(el.text),
    }));

    return { pageState, interactiveElements };
  } catch {
    // Return graceful fallback if page closed or evaluate failed
    return {
      pageState: {
        timestamp: new Date().toISOString(),
        url: sanitizer.sanitizeUrl(page.url()),
        readyState: 'unknown',
      },
    };
  }
}
