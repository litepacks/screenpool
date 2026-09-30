import type { CoreWebVitalsDiagnostic, WebVitalsRating } from './types.js';
import type { DiagnosticPage } from './page-adapter.js';

/**
 * Google Core Web Vitals threshold boundaries.
 */
export const WEB_VITALS_THRESHOLDS = {
  lcp: { good: 2500, poor: 4000 },
  cls: { good: 0.1, poor: 0.25 },
  fcp: { good: 1800, poor: 3000 },
  ttfb: { good: 800, poor: 1800 },
  inp: { good: 200, poor: 500 },
} as const;

export function rateMetric(
  value: number | undefined | null,
  goodMax: number,
  poorMin: number,
): WebVitalsRating | undefined {
  if (value === undefined || value === null || Number.isNaN(value)) return undefined;
  if (value <= goodMax) return 'good';
  if (value <= poorMin) return 'needs-improvement';
  return 'poor';
}

/**
 * Calculates a weighted overall performance score (0-100) aligned with Core Web Vitals principles.
 * Weights: LCP (40%), CLS (30%), FCP (15%), TTFB (15%).
 */
export function computeWebVitalsScore(vitals: Partial<CoreWebVitalsDiagnostic>): number {
  let totalWeight = 0;
  let scoreSum = 0;

  function scoreSingle(value: number | undefined, goodMax: number, poorMin: number, weight: number) {
    if (value === undefined || value === null || Number.isNaN(value)) return;
    totalWeight += weight;
    if (value <= goodMax) {
      // Linear mapping from 100 to 90
      const ratio = Math.max(0, value) / goodMax;
      scoreSum += (100 - ratio * 10) * weight;
    } else if (value <= poorMin) {
      // Linear mapping from 89 to 50
      const ratio = (value - goodMax) / (poorMin - goodMax);
      scoreSum += (89 - ratio * 39) * weight;
    } else {
      // Linear mapping from 49 down to 0
      const excess = value - poorMin;
      const ratio = Math.min(1, excess / poorMin);
      scoreSum += Math.max(0, 49 - ratio * 49) * weight;
    }
  }

  scoreSingle(vitals.lcpMs, WEB_VITALS_THRESHOLDS.lcp.good, WEB_VITALS_THRESHOLDS.lcp.poor, 0.4);
  scoreSingle(vitals.cls, WEB_VITALS_THRESHOLDS.cls.good, WEB_VITALS_THRESHOLDS.cls.poor, 0.3);
  scoreSingle(vitals.fcpMs, WEB_VITALS_THRESHOLDS.fcp.good, WEB_VITALS_THRESHOLDS.fcp.poor, 0.15);
  scoreSingle(vitals.ttfbMs, WEB_VITALS_THRESHOLDS.ttfb.good, WEB_VITALS_THRESHOLDS.ttfb.poor, 0.15);

  if (totalWeight === 0) return 100;
  return Math.round(scoreSum / totalWeight);
}

/**
 * Collects Core Web Vitals (LCP, CLS, FCP, TTFB, INP) from the page using native W3C PerformanceObserver with buffered entries.
 */
export async function captureWebVitals(
  page: DiagnosticPage,
  cdpSession?: any,
): Promise<CoreWebVitalsDiagnostic | undefined> {
  if (page.isClosed()) return undefined;

  try {
    const rawVitals = await page.evaluate(async () => {
      const g = globalThis as any;
      const perf = g.window?.performance ?? g.performance;
      if (!perf) return null;

      return new Promise<any>((resolve) => {
        let lcp: number | undefined;
        let lcpElement: string | undefined;
        let lcpSize: number | undefined;
        let cls = 0;
        let clsEntriesCount = 0;
        let fid: number | undefined;
        let inp: number | undefined;

        // 1. FCP (First Contentful Paint)
        let fcp: number | undefined;
        const paintEntries = perf.getEntriesByType?.('paint') ?? [];
        for (const entry of paintEntries) {
          if (entry.name === 'first-contentful-paint') {
            fcp = Math.round(entry.startTime);
          }
        }

        // 2. Navigation Timings (TTFB, DOMContentLoaded, Load)
        const navEntries = perf.getEntriesByType?.('navigation') ?? [];
        const nav = navEntries && navEntries.length > 0 ? navEntries[0] : null;
        let ttfb: number | undefined;
        let domContentLoaded: number | undefined;
        let load: number | undefined;

        if (nav) {
          ttfb = Math.round(nav.responseStart - nav.startTime);
          domContentLoaded = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
          load = Math.round(nav.loadEventEnd - nav.startTime);
        } else if (perf.timing) {
          const start = perf.timing.navigationStart;
          ttfb = Math.round(perf.timing.responseStart - start);
          domContentLoaded = Math.round(perf.timing.domContentLoadedEventEnd - start);
          load = Math.round(perf.timing.loadEventEnd - start);
        }

        // 3. PerformanceObserver for LCP, CLS, and Interactions
        const Obs = g.PerformanceObserver;
        if (typeof Obs === 'function') {
          try {
            const observer = new Obs((list: any) => {
              for (const entry of list.getEntries()) {
                if (entry.entryType === 'largest-contentful-paint') {
                  lcp = Math.round(entry.startTime);
                  lcpSize = entry.size;
                  const el = entry.element;
                  if (el && typeof el.tagName === 'string') {
                    const idPart = el.id ? `#${el.id}` : '';
                    let classPart = '';
                    if (el.className && typeof el.className === 'string') {
                      const classes = el.className.trim().split(/\s+/).filter(Boolean);
                      if (classes.length > 0) {
                        classPart = `.${classes.slice(0, 2).join('.')}`;
                      }
                    }
                    lcpElement = `${el.tagName.toLowerCase()}${idPart}${classPart}`;
                  }
                } else if (entry.entryType === 'layout-shift') {
                  if (!entry.hadRecentInput) {
                    cls += entry.value || 0;
                    clsEntriesCount++;
                  }
                } else if (entry.entryType === 'first-input') {
                  fid = Math.round(entry.processingStart - entry.startTime);
                } else if (entry.entryType === 'event') {
                  const duration = Math.round(entry.duration || 0);
                  if (inp === undefined || duration > inp) {
                    inp = duration;
                  }
                }
              }
            });

            // Observe buffered types
            try { observer.observe({ type: 'largest-contentful-paint', buffered: true }); } catch {}
            try { observer.observe({ type: 'layout-shift', buffered: true }); } catch {}
            try { observer.observe({ type: 'first-input', buffered: true }); } catch {}

            // Wait a small macrotask for buffered entries to be delivered
            setTimeout(() => {
              try { observer.disconnect(); } catch {}
              resolve({
                lcpMs: lcp,
                lcpElement,
                lcpSize,
                cls: Number(cls.toFixed(4)),
                clsEntriesCount,
                fcpMs: fcp,
                ttfbMs: ttfb,
                fidMs: fid,
                inpMs: inp ?? fid,
                domContentLoadedMs: domContentLoaded,
                loadMs: load,
              });
            }, 30);
            return;
          } catch {
            // fallback if observe throws
          }
        }

        resolve({
          lcpMs: lcp,
          lcpElement,
          lcpSize,
          cls: 0,
          clsEntriesCount: 0,
          fcpMs: fcp,
          ttfbMs: ttfb,
          domContentLoadedMs: domContentLoaded,
          loadMs: load,
        });
      });
    });

    if (!rawVitals) return undefined;

    // 4. Compute Google Ratings
    const ratings = {
      lcp: rateMetric(rawVitals.lcpMs, WEB_VITALS_THRESHOLDS.lcp.good, WEB_VITALS_THRESHOLDS.lcp.poor),
      cls: rateMetric(rawVitals.cls, WEB_VITALS_THRESHOLDS.cls.good, WEB_VITALS_THRESHOLDS.cls.poor),
      fcp: rateMetric(rawVitals.fcpMs, WEB_VITALS_THRESHOLDS.fcp.good, WEB_VITALS_THRESHOLDS.fcp.poor),
      ttfb: rateMetric(rawVitals.ttfbMs, WEB_VITALS_THRESHOLDS.ttfb.good, WEB_VITALS_THRESHOLDS.ttfb.poor),
      inp: rateMetric(rawVitals.inpMs, WEB_VITALS_THRESHOLDS.inp.good, WEB_VITALS_THRESHOLDS.inp.poor),
    };

    // 5. Query CDP Metrics if session available
    let cdpMetrics: CoreWebVitalsDiagnostic['cdpMetrics'];
    if (cdpSession && typeof cdpSession.send === 'function') {
      try {
        await cdpSession.send('Performance.enable').catch(() => undefined);
        const { metrics } = await cdpSession.send('Performance.getMetrics').catch(() => ({ metrics: [] }));
        if (Array.isArray(metrics)) {
          const metricMap = new Map<string, number>();
          for (const m of metrics) {
            metricMap.set(m.name, m.value);
          }
          cdpMetrics = {
            jsHeapUsedBytes: metricMap.get('JSHeapUsedSize'),
            jsHeapTotalBytes: metricMap.get('JSHeapTotalSize'),
            domNodeCount: metricMap.get('Nodes'),
            layoutDurationMs: metricMap.get('LayoutDuration') ? Math.round((metricMap.get('LayoutDuration') as number) * 1000) : undefined,
            recalcStyleDurationMs: metricMap.get('RecalcStyleDuration') ? Math.round((metricMap.get('RecalcStyleDuration') as number) * 1000) : undefined,
            scriptDurationMs: metricMap.get('ScriptDuration') ? Math.round((metricMap.get('ScriptDuration') as number) * 1000) : undefined,
            taskDurationMs: metricMap.get('TaskDuration') ? Math.round((metricMap.get('TaskDuration') as number) * 1000) : undefined,
          };
        }
      } catch {
        // ignore CDP metrics errors
      }
    }

    return {
      ...rawVitals,
      ratings,
      cdpMetrics,
    };
  } catch {
    return undefined;
  }
}
