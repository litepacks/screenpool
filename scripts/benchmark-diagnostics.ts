import { createServer, type Server } from 'node:http';
import { ScreenPool } from '../src/ScreenPool.js';

async function runBenchmark() {
  console.log('=== Screenpool Diagnostics Benchmark ===\n');

  const server: Server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head><title>Benchmark Page</title></head>
      <body>
        <h1>Benchmark</h1>
        <script>
          console.log("bench log");
          console.warn("bench warn");
          console.error("bench error");
        </script>
      </body>
      </html>
    `);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address() as { port: number };
  const url = `http://127.0.0.1:${addr.port}`;

  const pool = new ScreenPool({ poolSize: 2, allowLocalhost: true });
  await pool.start();

  const iterations = 10;
  const modes: Array<{ name: string; options: any }> = [
    { name: 'diagnostics disabled', options: false },
    { name: 'errors preset', options: 'errors' },
    { name: 'standard preset', options: 'standard' },
    { name: 'verbose preset', options: 'verbose' },
  ];

  // Warmup
  await pool.screenshot({ url, diagnostics: false });

  for (const mode of modes) {
    const start = Date.now();
    for (let i = 0; i < iterations; i++) {
      await pool.screenshot({ url, diagnostics: mode.options });
    }
    const elapsed = Date.now() - start;
    const avg = (elapsed / iterations).toFixed(2);
    console.log(`[${mode.name.padEnd(22)}] Total: ${elapsed}ms | Avg: ${avg}ms/job`);
  }

  await pool.stop();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log('\nBenchmark finished successfully.');
}

void runBenchmark().catch((err) => {
  console.error('Benchmark error:', err);
  process.exit(1);
});
