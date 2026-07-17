# Screenpool

Lightweight in-process rendering pool for Node.js. Runs Chromium once, keeps a fixed worker pool alive, queues render jobs, and returns screenshots or PDFs as `Buffer`.

## Install

```bash
npm install screenpool
```

**Requirements:** Node.js 20+ and a Chromium binary (system Chrome/Chromium, or `npx @puppeteer/browsers install chrome@stable`).

`puppeteer-core` and `@puppeteer/browsers` are included — no bundled browser download.

## Quick start

```ts
import { ScreenPool } from "screenpool";

const pool = new ScreenPool({
  browser: "chrome@stable",
  poolSize: 4,
  memory: { limitMb: 512 },
});

await pool.start();

const result = await pool.screenshot({
  url: "https://example.com",
  viewport: { width: 1200, height: 630 },
  format: "webp",
  quality: 80,
});

// Express / Fastify / Hono
res.type(result.contentType).send(result.buffer);

await pool.stop();
```

## Browser options

| Method | Example |
|--------|---------|
| System path | `{ executablePath: "/usr/bin/chromium" }` |
| @puppeteer/browsers | `{ browser: "chrome@stable" }` |
| Env fallback | `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH` |
| Remote WebSockets | `{ browserWSEndpoint: "ws://127.0.0.1:9222/devtools/browser/..." }` |
| Remote URL | `{ browserURL: "http://localhost:9222" }` |
| Custom Instance | `{ browserInstance: existingBrowser }` |

## HTTP server

```ts
import { ScreenPool } from "screenpool";
import { createScreenPoolServer } from "screenpool/http";

const pool = new ScreenPool({ browser: "chrome@stable" });
await pool.start();

const { listen, close } = createScreenPoolServer(pool, { port: 3000 });
await listen();
```

Endpoints: `POST /screenshot`, `POST /pdf`, `POST /html-to-image`, `POST /html-to-pdf`, `POST /extract`, `GET /health`, `GET /stats`

## CLI

```bash
screenpool screenshot https://example.com --out shot.webp --width 1200 --height 630
screenpool pdf https://example.com --output-dir ./output --out page.pdf
screenpool server --port 3000 --pool-size 4 --browser chrome@stable
screenpool screenshot https://example.com --browser-url http://localhost:9222 --out shot.webp
```

Output directory: `--output-dir` / `SCREENPOOL_OUTPUT_DIR` (default: `./output`)

Full page screenshot:

```ts
await pool.screenshot({
  url: "https://example.com",
  viewport: { width: 1280, height: 720 },
  fullPage: true,
});
```

```bash
screenpool screenshot https://example.com --out full.png --full-page --width 1280 --height 720
```

`fullPage` only applies to `screenshot` / `htmlToImage` (not PDF).

## Data Extraction (Pipsel DSL)

Screenpool supports structured data extraction from fully rendered pages (with active JavaScript execution and hydration) using [Pipsel DSL](https://litepacks.github.io/pipsel/) rules.

### Programmatic API

```ts
const result = await pool.extract({
  url: "https://example.com",
  rules: `
    title: "h1" | text | trim
    products[]: ".product-card" {
      name: ".title" | text | trim
      price: ".price" | text | trim | float
    }
  `,
});

console.log(result.data);
// => { title: "Example Domain", products: [...] }
```

### Hacker News Example

Here is a real-world example extracting front page stories from Hacker News:

```ts
const hnResult = await pool.extract({
  url: "https://news.ycombinator.com",
  rules: `
    stories[]: "tr.athing" {
      id: self | attr("id") | int
      title: "span.titleline > a" | text
      url: "span.titleline > a" | attr("href")
    }
  `,
});

console.log(hnResult.data.stories);
/* =>
[
  { id: 40912345, title: "Show HN: Screenpool", url: "https://github.com/..." },
  ...
]
*/
```

### HTTP Endpoint

`POST /extract`

```bash
curl -X POST http://localhost:3000/extract \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "rules": "title: \"h1\" | text | trim"
  }'
```

### CLI

```bash
screenpool extract https://example.com --rules 'title: "h1" | text | trim'
screenpool extract https://example.com --rules-file ./rules.psl --out result.json
```

## Docker

```bash
docker compose up -d --build
curl http://localhost:3000/health
```

One-off screenshot:

```bash
docker run --rm -v screenpool-out:/data -e SCREENPOOL_OUTPUT_DIR=/data screenpool:latest \
  screenshot https://example.com --out shot.webp
```

## Security (SSRF protection)

By default blocks: `file://`, localhost, private IPs, link-local, metadata IPs.

Enable via config:

```ts
{ allowLocalhost: true, allowPrivateNetworks: true, allowFileProtocol: true }
```

## Memory limits

```ts
memory: {
  limitMb: 512,       // RSS cap — rejects new jobs when exceeded
  v8HeapMb: 256,      // Chromium V8 heap launch arg
}
```

## Memory efficiency

Screenpool is designed to keep Chromium memory bounded — not grow with every render.

**Fixed tab budget.** One browser process, `poolSize` workers, each worker holds exactly one tab in an isolated `BrowserContext`. No per-job tab creation; concurrent load queues instead of opening more tabs.

**Cleanup after every job.** `resetPageState` runs when a job succeeds:

- navigates to `about:blank` (releases DOM from URL/HTML renders)
- clears cookies, request listeners, and request interception
- resets extra HTTP headers, user agent, and media features (e.g. dark mode)
- restores the default viewport

**Hard reset on failure.** Crash or timeout recycles the whole worker context (`page.close()` → `context.close()` → new context + tab).

**Startup & shutdown.** Chromium’s default blank tab is closed on launch. `pool.stop()` closes every worker page and context.

**Chromium launch args** (defaults, overridable via `launchArgs`):

- `--disk-cache-size=0`, `--media-cache-size=0`, `--aggressive-cache-discard`

**Optional periodic recycle:**

```ts
{ workerRestartAfterJobs: 500 }  // default; set 0 to disable
```

**Leak checks:**

```ts
const stats = await pool.getPageStats();
// workerPages should equal poolSize; defaultContextPages should stay 0
```

`npm run benchmark` prints a `tabs` section with the same checks after a load run.

## Errors

| Error | When |
|-------|------|
| `ScreenPoolNotStartedError` | Render before `start()` |
| `QueueOverflowError` | Queue full |
| `RenderTimeoutError` | Job timeout |
| `SecurityBlockedUrlError` | SSRF blocked URL |
| `MemoryLimitExceededError` | Memory limit exceeded |

## License

MIT
