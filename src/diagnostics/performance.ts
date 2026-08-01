import type { NavigationPerformanceDiagnostic } from './types.js';
import type { DiagnosticPage } from './page-adapter.js';

export async function capturePerformance(
  page: DiagnosticPage,
): Promise<NavigationPerformanceDiagnostic | undefined> {
  if (page.isClosed()) return undefined;

  try {
    const perfData = await page.evaluate(() => {
      const g = globalThis as any;
      const perf = g.window?.performance ?? g.performance;
      if (!perf) return null;

      const navEntries = perf.getEntriesByType?.('navigation');
      const nav = navEntries && navEntries.length > 0 ? navEntries[0] : null;

      const paintEntries = perf.getEntriesByType?.('paint');
      let firstPaint: number | undefined;
      let firstContentfulPaint: number | undefined;

      if (paintEntries) {
        for (const entry of paintEntries) {
          if (entry.name === 'first-paint') firstPaint = Math.round(entry.startTime);
          if (entry.name === 'first-contentful-paint') firstContentfulPaint = Math.round(entry.startTime);
        }
      }

      if (nav) {
        return {
          navigationStart: Math.round(nav.startTime),
          redirectMs: Math.round(nav.redirectEnd - nav.redirectStart),
          dnsMs: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
          connectMs: Math.round(nav.connectEnd - nav.connectStart),
          tlsMs: nav.secureConnectionStart ? Math.round(nav.connectEnd - nav.secureConnectionStart) : undefined,
          requestMs: Math.round(nav.responseStart - nav.requestStart),
          ttfbMs: Math.round(nav.responseStart - nav.startTime),
          responseMs: Math.round(nav.responseEnd - nav.responseStart),
          domInteractiveMs: Math.round(nav.domInteractive - nav.startTime),
          domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          loadMs: Math.round(nav.loadEventEnd - nav.startTime),
          transferSize: nav.transferSize,
          encodedBodySize: nav.encodedBodySize,
          decodedBodySize: nav.decodedBodySize,
          paintTiming:
            firstPaint || firstContentfulPaint
              ? { firstPaint, firstContentfulPaint }
              : undefined,
        };
      }

      // Legacy window.performance.timing fallback
      const timing = perf.timing;
      if (timing) {
        const start = timing.navigationStart;
        return {
          navigationStart: start,
          redirectMs: timing.redirectEnd - timing.redirectStart,
          dnsMs: timing.domainLookupEnd - timing.domainLookupStart,
          connectMs: timing.connectEnd - timing.connectStart,
          requestMs: timing.responseStart - timing.requestStart,
          ttfbMs: timing.responseStart - start,
          responseMs: timing.responseEnd - timing.responseStart,
          domInteractiveMs: timing.domInteractive - start,
          domContentLoadedMs: timing.domContentLoadedEventEnd - start,
          loadMs: timing.loadEventEnd - start,
          paintTiming:
            firstPaint || firstContentfulPaint
              ? { firstPaint, firstContentfulPaint }
              : undefined,
        };
      }

      return null;
    });

    return perfData ?? undefined;
  } catch {
    return undefined;
  }
}
