import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { ScreenPool } from '../src/index.js';
import { createScreenPoolApp } from '../src/http/createScreenPoolApp.js';

const pool = new ScreenPool({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  poolSize: 4,
});

await pool.start();

const app = new Hono();
app.get('/', (c) => c.json({ service: 'screenpool-mount-example' }));
app.route('/render', createScreenPoolApp(pool));

serve({ fetch: app.fetch, port: 3000 }, () => {
  console.log('Mounted at http://localhost:3000/render/*');
});

process.on('SIGTERM', async () => {
  await pool.stop();
  process.exit(0);
});
