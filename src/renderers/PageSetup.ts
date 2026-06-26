import type { BrowserContext, HTTPRequest, Page, PuppeteerLifeCycleEvent } from 'puppeteer-core';
import type {
  BlockResourceType,
  PdfOptions,
  ResolvedScreenPoolConfig,
  ScreenshotOptions,
  ViewportConfig,
  WaitUntil,
} from '../types.js';
import { NavigationError } from '../errors.js';

type RenderOptions = ScreenshotOptions | PdfOptions;

const WAIT_UNTIL_MAP: Record<WaitUntil, PuppeteerLifeCycleEvent> = {
  load: 'load',
  domcontentloaded: 'domcontentloaded',
  networkidle0: 'networkidle0',
  networkidle2: 'networkidle2',
};

const RESOURCE_TYPE_MAP: Record<BlockResourceType, string> = {
  image: 'image',
  stylesheet: 'stylesheet',
  font: 'font',
  media: 'media',
  script: 'script',
  xhr: 'xhr',
  fetch: 'fetch',
  websocket: 'websocket',
  other: 'other',
};

/** Reset page to clean state after a job. */
export async function resetPageState(
  page: Page,
  context: BrowserContext,
  defaultViewport: ViewportConfig,
): Promise<void> {
  page.removeAllListeners('request');

  try {
    await page.setRequestInterception(false);
  } catch {
    // ignore
  }

  try {
    const cookies = await context.cookies();
    if (cookies.length > 0) {
      await context.deleteCookie(...cookies);
    }
  } catch {
    // ignore
  }

  try {
    await page.setExtraHTTPHeaders({});
  } catch {
    // ignore
  }

  try {
    const browser = page.browser();
    if (browser) {
      await page.setUserAgent(await browser.userAgent());
    }
  } catch {
    // ignore
  }

  try {
    await page.emulateMediaFeatures([]);
  } catch {
    // ignore
  }

  await page.setViewport({
    width: defaultViewport.width,
    height: defaultViewport.height,
    deviceScaleFactor: defaultViewport.deviceScaleFactor ?? 1,
    isMobile: defaultViewport.isMobile ?? false,
    hasTouch: defaultViewport.hasTouch ?? false,
  });

  await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10_000 });
}

/** Configure page and load content for rendering. */
export async function setupPage(
  page: Page,
  options: RenderOptions,
  config: ResolvedScreenPoolConfig,
): Promise<void> {
  const viewport = options.viewport ?? config.defaultViewport;

  await page.setViewport({
    width: viewport.width,
    height: viewport.height,
    deviceScaleFactor: viewport.deviceScaleFactor ?? 1,
    isMobile: 'isMobile' in viewport ? viewport.isMobile ?? false : false,
    hasTouch: 'hasTouch' in viewport ? viewport.hasTouch ?? false : false,
  });

  if (options.userAgent) {
    await page.setUserAgent(options.userAgent);
  }

  if (options.headers) {
    await page.setExtraHTTPHeaders(options.headers);
  }

  if (options.cookies?.length) {
    const cookies = options.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? '/',
    }));
    await page.setCookie(...cookies);
  }

  const screenshotOpts = options as ScreenshotOptions;
  if (screenshotOpts.blockResources?.length) {
    await setupResourceBlocking(page, screenshotOpts.blockResources);
  }

  const waitUntil = WAIT_UNTIL_MAP[options.waitUntil ?? 'load'];
  const contentWaitUntil =
    waitUntil === 'networkidle0' || waitUntil === 'networkidle2'
      ? 'load'
      : waitUntil;

  try {
    if (options.url) {
      await page.goto(options.url, { waitUntil, timeout: 60_000 });
    } else if (options.html) {
      await page.setContent(options.html, {
        waitUntil: contentWaitUntil,
        timeout: 60_000,
      });
    }
  } catch (error) {
    throw new NavigationError(
      options.url ? `Failed to navigate to ${options.url}` : 'Failed to set HTML content',
      error,
    );
  }

  if (options.injectCSS) {
    await page.addStyleTag({ content: options.injectCSS });
  }

  if (options.injectJS) {
    await page.evaluate(options.injectJS);
  }

  if (options.waitForSelector) {
    await page.waitForSelector(options.waitForSelector, { timeout: 30_000 });
  }

  if (options.waitForTimeout) {
    await new Promise((r) => setTimeout(r, options.waitForTimeout));
  }
}

async function setupResourceBlocking(
  page: Page,
  blockResources: BlockResourceType[],
): Promise<void> {
  const blocked = new Set(blockResources.map((r) => RESOURCE_TYPE_MAP[r]));

  await page.setRequestInterception(true);
  page.on('request', (req: HTTPRequest) => {
    const type = req.resourceType();
    if (blocked.has(type)) {
      void req.abort();
    } else {
      void req.continue();
    }
  });
}

/** Apply dark mode emulation if requested. */
export async function applyDarkMode(page: Page, enabled?: boolean): Promise<void> {
  if (!enabled) return;
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
}
