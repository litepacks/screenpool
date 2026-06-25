import { ScreenPool } from '../src/index.js';
import { writeFile } from 'node:fs/promises';

const pool = new ScreenPool({
  executablePath: process.env.CHROME_PATH ?? '/usr/bin/chromium',
  poolSize: 2,
});

await pool.start();

const html = `<!DOCTYPE html>
<html>
<head><style>body{font-family:sans-serif;padding:40px;background:#1a1a2e;color:#eee;}</style></head>
<body><h1>Hello from HTML</h1><p>Rendered without a URL.</p></body>
</html>`;

const result = await pool.htmlToImage({
  html,
  viewport: { width: 800, height: 400 },
  format: 'png',
});

await writeFile('output/html-to-image.png', result.buffer);
console.log('Saved output/html-to-image.png');

await pool.stop();
