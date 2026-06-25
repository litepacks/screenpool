import { ScreenPool } from '../src/index.js';
import { writeFile } from 'node:fs/promises';

const pool = new ScreenPool({
  browser: process.env.CHROME_PATH ? { type: 'chrome', channel: 'stable' } : undefined,
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  poolSize: 2,
});

await pool.start();

const result = await pool.screenshot({
  url: 'https://example.com',
  viewport: { width: 1200, height: 630 },
  format: 'png',
});

await writeFile('output/basic-screenshot.png', result.buffer);
console.log('Saved output/basic-screenshot.png');

await pool.stop();
