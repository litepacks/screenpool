import { ScreenPool } from '../src/index.js';
import type { ScreenPoolConfig } from '../src/index.js';
import { resolveBrowserExecutable } from '../src/utils/resolveBrowserExecutable.js';

const ITERATIONS = Number(process.env.BENCHMARK_N ?? 10);
const POOL_SIZE = Number(process.env.BENCHMARK_POOL_SIZE ?? 4);
/** batched | all | sequential */
const MODE = process.env.BENCHMARK_MODE ?? 'batched';
const USE_URL = process.env.BENCHMARK_URL === '1';

interface MemorySample {
  label: string;
  nodeRssMb: number;
  nodeHeapMb: number;
  browserMb: number;
  totalMb: number;
}

function nodeMemoryMb(): { rssMb: number; heapMb: number } {
  const mem = process.memoryUsage();
  return {
    rssMb: Math.round(mem.rss / 1024 / 1024),
    heapMb: Math.round(mem.heapUsed / 1024 / 1024),
  };
}

async function sampleMemory(
  pool: ScreenPool | null,
  label: string,
): Promise<MemorySample> {
  const node = nodeMemoryMb();
  const browserMb = pool ? await pool.getBrowserMemoryMb() : 0;
  return {
    label,
    nodeRssMb: node.rssMb,
    nodeHeapMb: node.heapMb,
    browserMb,
    totalMb: node.rssMb + browserMb,
  };
}

function printSample(sample: MemorySample): void {
  console.log(
    `  ${sample.label.padEnd(14)} node=${String(sample.nodeRssMb).padStart(4)}MB (heap ${String(sample.nodeHeapMb).padStart(3)}MB)  browser=${String(sample.browserMb).padStart(4)}MB  total=${String(sample.totalMb).padStart(4)}MB`,
  );
}

const browserConfig: ScreenPoolConfig = {
  poolSize: POOL_SIZE,
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : { browser: 'chrome@stable' }),
};

let executablePath: string;
try {
  executablePath = await resolveBrowserExecutable(browserConfig);
} catch (err) {
  console.error('Chromium not found:', err instanceof Error ? err.message : err);
  process.exit(1);
}

const pool = new ScreenPool({
  ...browserConfig,
  jobTimeout: Number(process.env.BENCHMARK_JOB_TIMEOUT ?? 30_000),
  workerRestartAfterJobs: 0,
});

console.log('═'.repeat(60));
console.log('screenpool benchmark');
console.log('═'.repeat(60));
console.log(`  iterations : ${ITERATIONS}`);
console.log(`  poolSize   : ${POOL_SIZE}`);
console.log(`  mode       : ${MODE}`);
console.log(`  source     : ${USE_URL ? 'url (example.com)' : 'html (fullPage)'}`);
console.log(`  chromium   : ${executablePath}`);
console.log('─'.repeat(60));

const memorySamples: MemorySample[] = [];
let failed = 0;
let started = false;

try {
  await pool.start();
  started = true;

  memorySamples.push(await sampleMemory(pool, 'after start'));
  printSample(memorySamples[0]!);

  // warmup
  await pool.screenshot({
    html: '<html><body><p>warmup</p></body></html>',
    viewport: { width: 800, height: 600 },
  });

  const start = Date.now();
  const latencies: number[] = [];

  const renderOptions = (i: number) =>
    USE_URL
      ? {
          url: 'https://example.com',
          viewport: { width: 1200, height: 630 },
          format: 'webp' as const,
          quality: 80,
          waitUntil: 'load' as const,
        }
      : {
          html: `<!DOCTYPE html><html><head><style>
            body{font-family:system-ui;margin:0;padding:40px;background:#1a1a2e;color:#eee}
            .card{background:#16213e;border-radius:12px;padding:24px;margin:16px 0}
          </style></head><body>
            <h1>Benchmark #${i}</h1>
            ${Array.from({ length: 8 }, (_, j) => `<div class="card"><h2>Block ${j}</h2><p>Lorem ipsum dolor sit amet, consectetur adipiscing elit.</p></div>`).join('')}
          </body></html>`,
          viewport: { width: 1280, height: 720 },
          format: 'png' as const,
          fullPage: true,
        };

  const runJob = async (i: number): Promise<number> => {
    try {
      const result = await pool.screenshot(renderOptions(i));
      latencies.push(result.durationMs);
      return result.durationMs;
    } catch (err) {
      failed++;
      console.error(`  job ${i + 1} failed:`, err instanceof Error ? err.message : err);
      return -1;
    }
  };

  if (MODE === 'sequential') {
    for (let i = 0; i < ITERATIONS; i++) {
      const ms = await runJob(i);
      if (ms >= 0) process.stdout.write(`  job ${i + 1}/${ITERATIONS} ${ms}ms\r`);
      if (i === Math.floor(ITERATIONS / 2)) {
        memorySamples.push(await sampleMemory(pool, 'mid-run'));
        printSample(memorySamples.at(-1)!);
      }
    }
    console.log('');
  } else if (MODE === 'all') {
    await Promise.all(Array.from({ length: ITERATIONS }, (_, i) => runJob(i)));
    console.log(`  dispatched ${ITERATIONS} jobs concurrently`);
  } else {
    // batched — poolSize jobs at a time (realistic load)
    for (let offset = 0; offset < ITERATIONS; offset += POOL_SIZE) {
      const end = Math.min(offset + POOL_SIZE, ITERATIONS);
      const batch = Array.from({ length: end - offset }, (_, j) => runJob(offset + j));
      const results = await Promise.all(batch);
      const batchMs = results.filter((ms) => ms >= 0);
      process.stdout.write(
        `  batch ${Math.floor(offset / POOL_SIZE) + 1}/${Math.ceil(ITERATIONS / POOL_SIZE)} (${batchMs.length}/${batch.length} ok)\r`,
      );
      if (offset === Math.floor(ITERATIONS / 2)) {
        memorySamples.push(await sampleMemory(pool, 'mid-run'));
        printSample(memorySamples.at(-1)!);
      }
    }
    console.log('');
  }

  memorySamples.push(await sampleMemory(pool, 'after jobs'));
  printSample(memorySamples.at(-1)!);

  const totalMs = Date.now() - start;
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

  console.log('─'.repeat(60));
  console.log('throughput');
  console.log(`  completed    ${latencies.length}/${ITERATIONS}`);
  console.log(`  failed       ${failed}`);
  console.log(`  total        ${totalMs}ms`);
  console.log(`  rps          ${latencies.length > 0 ? (latencies.length / (totalMs / 1000)).toFixed(2) : '0'}`);
  console.log(`  p50          ${p50}ms`);
  console.log(`  p95          ${p95}ms`);
  console.log('─'.repeat(60));
  console.log('memory peak');
  console.log(`  browser      ${Math.max(...memorySamples.map((s) => s.browserMb))}MB`);
  console.log(`  node rss     ${Math.max(...memorySamples.map((s) => s.nodeRssMb))}MB`);
  console.log(`  combined     ${Math.max(...memorySamples.map((s) => s.totalMb))}MB`);
  console.log('─'.repeat(60));
  console.log('pool stats', pool.stats());
} catch (err) {
  console.error('Benchmark crashed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  if (started) {
    await pool.stop().catch(() => undefined);
  }
  printSample(await sampleMemory(null, 'after stop'));
  console.log('═'.repeat(60));
}
