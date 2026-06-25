import { ScreenPool } from '../src/index.js';

const pool = new ScreenPool({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  poolSize: 2,
});

await pool.start();
console.log('Pool started');

const shutdown = async (signal: string) => {
  console.log(`Received ${signal}, shutting down gracefully...`);
  await pool.stop();
  console.log('Pool stopped');
  process.exit(0);
};

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Keep process alive
setInterval(() => {
  console.log('stats:', pool.stats());
}, 30_000);
