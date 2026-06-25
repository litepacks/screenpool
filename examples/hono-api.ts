import { ScreenPool } from '../src/index.js';
import { createScreenPoolServer } from '../src/http/createScreenPoolServer.js';

const pool = new ScreenPool({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  poolSize: 4,
  memory: { limitMb: 512 },
});

await pool.start();

const { listen, close } = createScreenPoolServer(pool, { port: 3000, host: '0.0.0.0' });
await listen();

console.log('Hono API server on http://localhost:3000');

const shutdown = async () => {
  await close();
  await pool.stop();
  process.exit(0);
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
