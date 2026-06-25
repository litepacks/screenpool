import { ScreenPool } from '../src/index.js';

const ITERATIONS = Number(process.env.BENCHMARK_N ?? 20);
const POOL_SIZE = Number(process.env.BENCHMARK_POOL_SIZE ?? 4);
const chromiumPath = process.env.CHROME_PATH ?? '/usr/bin/chromium';

const pool = new ScreenPool({
  executablePath: chromiumPath,
  poolSize: POOL_SIZE,
});

console.log(`Benchmark: ${ITERATIONS} screenshots, poolSize=${POOL_SIZE}`);

await pool.start();
const start = Date.now();
const latencies: number[] = [];

const jobs = Array.from({ length: ITERATIONS }, (_, i) =>
  pool
    .screenshot({
      html: `<html><body><h1>Bench ${i}</h1></body></html>`,
      viewport: { width: 800, height: 600 },
    })
    .then((r) => {
      latencies.push(r.durationMs);
    }),
);

await Promise.all(jobs);
const totalMs = Date.now() - start;

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0;
const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;

console.log({
  totalMs,
  rps: (ITERATIONS / (totalMs / 1000)).toFixed(2),
  p50Ms: p50,
  p95Ms: p95,
  stats: pool.stats(),
});

await pool.stop();
