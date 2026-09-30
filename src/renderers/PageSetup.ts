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

async function getPageCdpClient(page: Page) {
  try {
    const getClient = (page as any)._client;
    const client = typeof getClient === 'function' ? getClient.call(page) : getClient;
    if (client) return client;
    if (typeof (page as any).createCDPSession === 'function') {
      return await (page as any).createCDPSession();
    }
  } catch {
    return null;
  }
  return null;
}

/** Reset page to clean state after a job. Selectively resets only dirtied state for high throughput. */
export async function resetPageState(
  page: Page,
  context: BrowserContext,
  defaultViewport?: ViewportConfig,
  dirtyState?: PageDirtyState,
): Promise<void> {
  if (page.isClosed()) return;

  const isFullReset = !dirtyState;

  if (isFullReset || dirtyState.hasBlockedResources) {
    try {
      const client = await getPageCdpClient(page);
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
      if (defaultViewport) {
        await page.setViewport({
          width: defaultViewport.width,
          height: defaultViewport.height,
          deviceScaleFactor: defaultViewport.deviceScaleFactor ?? 1,
          isMobile: defaultViewport.isMobile ?? false,
          hasTouch: defaultViewport.hasTouch ?? false,
        });
      }
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
  const opts = options || ({} as RenderOptions);
  const conf = config || ({} as ResolvedScreenPoolConfig);
  const defaultVp = conf.defaultViewport || { width: 1280, height: 800 };
  const targetViewport = opts.viewport ?? defaultVp;
  const isDefault = !opts.viewport || isSameViewport(opts.viewport, defaultVp);

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

  if (opts.userAgent) {
    await page.setUserAgent(opts.userAgent);
    if (dirtyState) dirtyState.hasCustomUserAgent = true;
  }

  if (opts.headers) {
    await page.setExtraHTTPHeaders(opts.headers);
    if (dirtyState) dirtyState.hasExtraHeaders = true;
  }

  if (opts.cookies?.length) {
    const cookies = opts.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path ?? '/',
    }));
    await page.setCookie(...cookies);
    if (dirtyState) dirtyState.hasCookies = true;
  }

  const screenshotOpts = opts as ScreenshotOptions;
  if (screenshotOpts.blockResources?.length) {
    await setupResourceBlocking(page, screenshotOpts.blockResources);
    if (dirtyState) dirtyState.hasBlockedResources = true;
  }

  const waitUntil = WAIT_UNTIL_MAP[opts.waitUntil ?? 'load'];
  const contentWaitUntil =
    waitUntil === 'networkidle0' || waitUntil === 'networkidle2'
      ? 'load'
      : waitUntil;

  try {
    if (opts.url) {
      await page.goto(opts.url, { waitUntil, timeout: 60_000 });
    } else if (opts.html) {
      await page.setContent(opts.html, {
        waitUntil: contentWaitUntil,
        timeout: 60_000,
      });
    }
  } catch (error) {
    throw new NavigationError(
      opts.url ? `Failed to navigate to ${opts.url}` : 'Failed to set HTML content',
      error,
    );
  }

  if (opts.injectCSS) {
    await page.addStyleTag({ content: opts.injectCSS });
  }

  if (opts.injectJS) {
    await page.evaluate(opts.injectJS);
  }

  if (opts.waitForSelector) {
    await page.waitForSelector(opts.waitForSelector, { timeout: 30_000 });
  }

  if (opts.waitForTimeout) {
    await new Promise((r) => setTimeout(r, opts.waitForTimeout));
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
    const client = await getPageCdpClient(page);
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


