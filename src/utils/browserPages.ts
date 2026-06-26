import type { Browser } from 'puppeteer-core';

export interface BrowserPageStats {
  contexts: number;
  pages: number;
  /** Pages in worker contexts (excludes default Chromium tab). */
  workerPages: number;
  /** Pages outside isolated worker contexts (should stay 0). */
  defaultContextPages: number;
}

/** Count open browser contexts and pages across the shared Chromium instance. */
export async function countBrowserPages(browser: Browser): Promise<BrowserPageStats> {
  const contexts = browser.browserContexts();
  let pages = 0;
  let defaultContextPages = 0;

  for (const context of contexts) {
    const contextPages = await context.pages();
    pages += contextPages.length;
    if (context === browser.defaultBrowserContext()) {
      defaultContextPages = contextPages.length;
    }
  }

  return {
    contexts: contexts.length,
    pages,
    workerPages: pages - defaultContextPages,
    defaultContextPages,
  };
}
