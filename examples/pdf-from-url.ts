import { ScreenPool } from '../src/index.js';
import { writeFile } from 'node:fs/promises';

const pool = new ScreenPool({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  poolSize: 2,
});

await pool.start();

const result = await pool.pdf({
  url: 'https://example.com',
  viewport: { width: 1280, height: 720 },
  pdf: { format: 'A4', printBackground: true },
});

await writeFile('output/page.pdf', result.buffer);
console.log('Saved output/page.pdf');

await pool.stop();
