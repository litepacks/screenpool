import { ScreenPool } from '../src/index.js';
import { resolveBrowserExecutable } from '../src/utils/resolveBrowserExecutable.js';

async function runBenchmark() {
  console.log('═'.repeat(60));
  console.log('Screenpool Stealth Benchmark');
  console.log('═'.repeat(60));

  let executablePath: string;
  try {
    executablePath = await resolveBrowserExecutable({
      browser: 'chrome@stable',
      executablePath: process.env.CHROME_PATH,
    });
    console.log(`Using Chromium binary: ${executablePath}`);
  } catch (err) {
    console.error('Failed to resolve Chromium:', err);
    process.exit(1);
  }

  console.log('─'.repeat(60));

  // 1. Benchmark Vanilla Pool (stealth: false)
  console.log('\n[1/2] Benchmarking Vanilla Pool (stealth: false)...');
  const t0 = performance.now();
  const vanillaPool = new ScreenPool({
    executablePath,
    poolSize: 2,
    stealth: false,
  });
  await vanillaPool.start();
  const vanillaStartupMs = Math.round(performance.now() - t0);

  // Warmup
  await vanillaPool.screenshot({ html: '<h1>warmup</h1>' });

  const vanillaScreenshots: number[] = [];
  for (let i = 0; i < 10; i++) {
    const s0 = performance.now();
    await vanillaPool.screenshot({
      html: `<html><body><h1>Vanilla Job ${i + 1}</h1><p>Testing render speed</p></body></html>`,
    });
    vanillaScreenshots.push(Math.round(performance.now() - s0));
  }
  await vanillaPool.stop();

  // 2. Benchmark Stealth Pool (stealth: true)
  console.log('[2/2] Benchmarking Stealth Pool (stealth: true)...');
  const t1 = performance.now();
  const stealthPool = new ScreenPool({
    executablePath,
    poolSize: 2,
    stealth: true,
  });
  await stealthPool.start();
  const stealthStartupMs = Math.round(performance.now() - t1);

  // Warmup
  await stealthPool.screenshot({ html: '<h1>warmup</h1>' });

  const stealthScreenshots: number[] = [];
  for (let i = 0; i < 10; i++) {
    const s0 = performance.now();
    await stealthPool.screenshot({
      html: `<html><body><h1>Stealth Job ${i + 1}</h1><p>Testing render speed</p></body></html>`,
    });
    stealthScreenshots.push(Math.round(performance.now() - s0));
  }
  await stealthPool.stop();

  // Helper stats
  const avg = (arr: number[]) => Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  const min = (arr: number[]) => Math.min(...arr);
  const max = (arr: number[]) => Math.max(...arr);

  console.log('\n' + '═'.repeat(60));
  console.log('BENCHMARK RESULTS SUMMARY');
  console.log('═'.repeat(60));
  console.table([
    {
      Metric: 'Browser Startup (ms)',
      Vanilla: `${vanillaStartupMs} ms`,
      Stealth: `${stealthStartupMs} ms`,
      Delta: `${stealthStartupMs - vanillaStartupMs >= 0 ? '+' : ''}${stealthStartupMs - vanillaStartupMs} ms`,
    },
    {
      Metric: 'Avg Screenshot Render (ms)',
      Vanilla: `${avg(vanillaScreenshots)} ms`,
      Stealth: `${avg(stealthScreenshots)} ms`,
      Delta: `${avg(stealthScreenshots) - avg(vanillaScreenshots) >= 0 ? '+' : ''}${avg(stealthScreenshots) - avg(vanillaScreenshots)} ms`,
    },
    {
      Metric: 'Min Screenshot Render (ms)',
      Vanilla: `${min(vanillaScreenshots)} ms`,
      Stealth: `${min(stealthScreenshots)} ms`,
      Delta: `${min(stealthScreenshots) - min(vanillaScreenshots) >= 0 ? '+' : ''}${min(stealthScreenshots) - min(vanillaScreenshots)} ms`,
    },
    {
      Metric: 'Max Screenshot Render (ms)',
      Vanilla: `${max(vanillaScreenshots)} ms`,
      Stealth: `${max(stealthScreenshots)} ms`,
      Delta: `${max(stealthScreenshots) - max(vanillaScreenshots) >= 0 ? '+' : ''}${max(stealthScreenshots) - max(vanillaScreenshots)} ms`,
    },
  ]);
  console.log('═'.repeat(60));
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
