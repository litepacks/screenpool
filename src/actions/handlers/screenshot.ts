import type { ManagedPage } from '../../pages/types.js';
import type { ScreenshotAction } from '../types.js';

export async function handleScreenshot(params: {
  page: ManagedPage;
  action: ScreenshotAction;
}): Promise<{ buffer: Buffer }> {
  const { page, action } = params;

  const buffer = (await page.rawPage.screenshot({
    fullPage: action.fullPage ?? false,
    type: action.format ?? 'png',
  })) as Buffer;

  return { buffer };
}
