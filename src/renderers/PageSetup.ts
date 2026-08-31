import type { BrowserContext, Page, PuppeteerLifeCycleEvent } from 'puppeteer-core';
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

/** Tracks which properties of the worker page were dirtied by the previous job */
export interface PageDirtyState {
  hasRequestInterception?: boolean;
  hasBlockedResources?: boolean;
  hasCookies?: boolean;
  hasExtraHeaders?: boolean;
  hasCustomUserAgent?: boolean;
  hasMediaFeatures?: boolean;
  hasCustomViewport?: boolean;
}

export function createCleanDirtyState(): PageDirtyState {
  return {};
}

function isSameViewport(a?: ViewportConfig, b?: ViewportConfig): boolean {
  if (!a || !b) return false;
  return (
    a.width === b.width &&
    a.height === b.height &&
    (a.deviceScaleFactor ?? 1) === (b.deviceScaleFactor ?? 1) &&
    Boolean(a.isMobile) === Boolean(b.isMobile) &&
    Boolean(a.hasTouch) === Boolean(b.hasTouch)
  );
}

const WAIT_UNTIL_MAP: Record<string, PuppeteerLifeCycleEvent> = {
  load: 'load',
  domcontentloaded: 'domcontentloaded',
  networkidle0: 'networkidle0',
  networkidle2: 'networkidle2',
  networkidle: 'networkidle2',
};

/** Native URL patterns for CDP Network.setBlockedURLs */
export const RESOURCE_BLOCKING_PATTERNS: Record<BlockResourceType, string[]> = {
  image: [
    '*.png',
    '*.png?*',
    '*.jpg',
    '*.jpg?*',
    '*.jpeg',
    '*.jpeg?*',
    '*.gif',
    '*.gif?*',
    '*.webp',
    '*.webp?*',
    '*.svg',
    '*.svg?*',
    '*.ico',
    '*.ico?*',
    '*.avif',
    '*.avif?*',
    '*.bmp',
    '*.bmp?*',
  ],
  stylesheet: ['*.css', '*.css?*'],
  font: [
    '*.woff',
    '*.woff?*',
    '*.woff2',
    '*.woff2?*',
    '*.ttf',
    '*.ttf?*',
    '*.otf',
    '*.otf?*',
    '*.eot',
    '*.eot?*',
  ],
  media: [
    '*.mp4',
    '*.mp4?*',
    '*.webm',
    '*.webm?*',
    '*.mp3',
    '*.mp3?*',
    '*.wav',
    '*.wav?*',
    '*.ogg',
    '*.ogg?*',
    '*.avi',
    '*.avi?*',
    '*.mkv',
    '*.mkv?*',
    '*.m4a',
    '*.m4a?*',
    '*.aac',
    '*.aac?*',
  ],
  script: ['*.js', '*.js?*', '*.mjs', '*.mjs?*'],
  websocket: ['ws://*', 'wss://*'],
  xhr: [],
  fetch: [],
  other: [],
};

/** Reset page to clean state after a job. Selectively resets only dirtied state for high throughput. */
export async function resetPageState(
  page: Page,
  context: BrowserContext,
  defaultViewport: ViewportConfig,
  dirtyState?: PageDirtyState,
): Promise<void> {
  const isFullReset = !dirtyState;

  if (isFullReset || dirtyState.hasBlockedResources) {
    try {
      const getClient = (page as any)._client;
      const client = typeof getClient === 'function' ? getClient.call(page) : getClient;
      if (client) {
        await client.send('Network.setBlockedURLs', { urls: [] });
      }
    } catch {
      // ignore
    }
    if (dirtyState) dirtyState.hasBlockedResources = false;
  }

  if (isFullReset || dirtyState.hasRequestInterception) {
    page.removeAllListeners('request');
    try {
      await page.setRequestInterception(false);
    } catch {
      // ignore
    }
    if (dirtyState) dirtyState.hasRequestInterception = false;
  }

  if (isFullReset || dirtyState.hasCookies) {
    try {
      const cookies = await context.cookies();
      if (cookies.length > 0) {
        await context.deleteCookie(...cookies);
      }
    } catch {
      // ignore
    }
    if (dirtyState) dirtyState.hasCookies = false;
  }

  if (isFullReset || dirtyState.hasExtraHeaders) {
    try {
      await page.setExtraHTTPHeaders({});
    } catch {
      // ignore
    }
    if (dirtyState) dirtyState.hasExtraHeaders = false;
  }

  if (isFullReset || dirtyState.hasCustomUserAgent) {
    try {
      const browser = page.browser();
      if (browser) {
        await page.setUserAgent(await browser.userAgent());
      }
    } catch {
      // ignore
    }
    if (dirtyState) dirtyState.hasCustomUserAgent = false;
  }

  if (isFullReset || dirtyState.hasMediaFeatures) {
    try {
      await page.emulateMediaFeatures([]);
    } catch {
      // ignore
    }
    if (dirtyState) dirtyState.hasMediaFeatures = false;
  }

  if (isFullReset || dirtyState.hasCustomViewport) {
    try {
      await page.setViewport({
        width: defaultViewport.width,
        height: defaultViewport.height,
        deviceScaleFactor: defaultViewport.deviceScaleFactor ?? 1,
        isMobile: defaultViewport.isMobile ?? false,
        hasTouch: defaultViewport.hasTouch ?? false,
      });
    } catch {
      // ignore
    }
    if (dirtyState) dirtyState.hasCustomViewport = false;
  }

  await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 10_000 });
}

/** Configure page and load content for rendering. Tracks dirtied state for selective reset. */
export async function setupPage(
  page: Page,
  options: RenderOptions,
  config: ResolvedScreenPoolConfig,
  dirtyState?: PageDirtyState,
): Promise<void> {
  const targetViewport = options.viewport ?? config.defaultViewport;
  const isDefault = !options.viewport || isSameViewport(options.viewport, config.defaultViewport);

  // If a custom viewport is requested, or if the page was dirtied with non-default viewport, apply it
  if (!isDefault || dirtyState?.hasCustomViewport) {
    await page.setViewport({
      width: targetViewport.width,
      height: targetViewport.height,
      deviceScaleFactor: targetViewport.deviceScaleFactor ?? 1,
      isMobile: 'isMobile' in targetViewport ? targetViewport.isMobile ?? false : false,
      hasTouch: 'hasTouch' in targetViewport ? targetViewport.hasTouch ?? false : false,
    });
    if (dirtyState) {
      dirtyState.hasCustomViewport = !isDefault;
    }
  }

  if (options.userAgent) {
    await page.setUserAgent(options.userAgent);
    if (dirtyState) dirtyState.hasCustomUserAgent = true;
  }

  if (options.headers) {
    await page.setExtraHTTPHeaders(options.headers);
    if (dirtyState) dirtyState.hasExtraHeaders = true;
  }

  if (options.cookies?.length) {
    const cookies = options.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? '/',
    }));
    await page.setCookie(...cookies);
    if (dirtyState) dirtyState.hasCookies = true;
  }

  const screenshotOpts = options as ScreenshotOptions;
  if (screenshotOpts.blockResources?.length) {
    await setupResourceBlocking(page, screenshotOpts.blockResources);
    if (dirtyState) dirtyState.hasBlockedResources = true;
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

/** Native CDP URL blocking (zero IPC overhead) */
async function setupResourceBlocking(
  page: Page,
  blockResources: BlockResourceType[],
): Promise<void> {
  const urls: string[] = [];
  for (const resType of blockResources) {
    const patterns = RESOURCE_BLOCKING_PATTERNS[resType];
    if (patterns?.length) {
      urls.push(...patterns);
    }
  }

  if (urls.length > 0) {
    const getClient = (page as any)._client;
    const client = typeof getClient === 'function' ? getClient.call(page) : getClient;
    if (client) {
      await client.send('Network.enable').catch(() => undefined);
      await client.send('Network.setBlockedURLs', { urls });
    }
  }
}

/** Apply dark mode emulation if requested. */
export async function applyDarkMode(
  page: Page,
  enabled?: boolean,
  dirtyState?: PageDirtyState,
): Promise<void> {
  if (!enabled) return;
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  if (dirtyState) {
    dirtyState.hasMediaFeatures = true;
  }
}


