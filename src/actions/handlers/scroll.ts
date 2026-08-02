import type { ManagedPage } from '../../pages/types.js';
import type { ScrollAction } from '../types.js';
import type { ResolvedTarget } from '../targets/types.js';

export async function handleScroll(params: {
  page: ManagedPage;
  action: ScrollAction;
  target?: ResolvedTarget;
}): Promise<void> {
  const { page, action, target } = params;

  if (target?.elementHandle) {
    await target.elementHandle.evaluate((el: any, x, y, dx, dy, behavior) => {
      const b = (behavior as string) || 'auto';
      if (typeof x === 'number' || typeof y === 'number') {
        el.scrollTo({ left: x ?? el.scrollLeft, top: y ?? el.scrollTop, behavior: b });
      } else if (typeof dx === 'number' || typeof dy === 'number') {
        el.scrollBy({ left: dx ?? 0, top: dy ?? 0, behavior: b });
      }
    }, action.x, action.y, action.deltaX, action.deltaY, action.behavior);
  } else {
    await page.rawPage.evaluate((x, y, dx, dy, behavior) => {
      const win = globalThis as any;
      const b = (behavior as string) || 'auto';
      if (typeof x === 'number' || typeof y === 'number') {
        win.scrollTo({ left: x ?? win.scrollX, top: y ?? win.scrollY, behavior: b });
      } else if (typeof dx === 'number' || typeof dy === 'number') {
        win.scrollBy({ left: dx ?? 0, top: dy ?? 0, behavior: b });
      }
    }, action.x, action.y, action.deltaX, action.deltaY, action.behavior);
  }
}
