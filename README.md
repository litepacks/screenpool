# Screenpool

Lightweight in-process rendering pool for Node.js. Runs Chromium once, keeps a fixed worker pool alive, queues render jobs, and returns screenshots or PDFs as `Buffer`.

## Install

```bash
npm install screenpool

# Download Chromium binary into ~/.screenpool/browser
npx screenpool setup
```

**Requirements:** Node.js 20+.

Screenpool automatically discovers installed Chrome/Chromium binaries on **macOS**, **Linux**, **Windows**, and `PATH`. If no binary is found on your system, Screenpool automatically downloads `chrome@stable` into `~/.screenpool/browser` on first run (zero-config setup).

`puppeteer-core` and `@puppeteer/browsers` are included out of the box.

## Quick start

```ts
import { ScreenPool } from "screenpool";

const pool = new ScreenPool({
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

// Element Screenshot & HTML Code Extraction
const elementResult = await pool.screenshot({
  url: "https://example.com",
  selector: "h1",
  includeElementHtml: true,
});
console.log(elementResult.elementHtml); // "<h1>Example Domain</h1>"

await pool.stop();
```

## Browser options

| Method | Example | Description |
|--------|---------|-------------|
| Auto-discovery (default) | `{}` | Automatically detects system Chrome/Chromium, PATH, or auto-downloads `chrome@stable` |
| System path | `{ executablePath: "/usr/bin/chromium" }` | Explicit path to a browser binary |
| @puppeteer/browsers | `{ browser: "chrome@stable" }` | Downloads or resolves specified browser channel |
| Env fallback | `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH` | Environment variable overrides |
| Remote WebSockets | `{ browserWSEndpoint: "ws://127.0.0.1:9222/devtools/browser/..." }` | Connects to existing browser process |
| Remote URL | `{ browserURL: "http://localhost:9222" }` | Connects via local debugging HTTP URL |
| Custom Instance | `{ browserInstance: existingBrowser }` | Reuses existing Puppeteer `Browser` instance |

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
# Setup / download browser into ~/.screenpool/browser
screenpool setup
screenpool setup --browser chrome@stable --dir ~/.screenpool/browser

screenpool screenshot https://example.com --out shot.webp --width 1200 --height 630
screenpool pdf https://example.com --output-dir ./output --out page.pdf
screenpool server --port 3000 --pool-size 4 --browser chrome@stable
screenpool run flow.json
```

## Browser Action Architecture & Session Management

Screenpool features an observation-based, strict **Browser Action Architecture** and **Record API** designed to execute multi-step interactive flows (popups, OAuth logins, new tabs via `target="_blank"` or `window.open()`, form fills, element resolution, and step verification) safely over isolated browser contexts.

The execution loop follows:
```text
Observe → Resolve → Validate → Execute → Stabilize → Verify → Record → Observe
```

### Key Features
- **Isolated Browser Contexts**: Each session runs in an isolated `BrowserContext` (`browser.createBrowserContext()`). Cookies, storage, and sessions never leak across sessions.
- **Page Registry & Popup Tracking**: Listens to context level target events (`targetcreated`/`targetdestroyed`) to track `target="_blank"`, `window.open()`, and OAuth popups automatically.
- **Active Page Fallback**: When an active page closes, Screenpool falls back to its opener page (`activate-opener`), main page, or latest open page.
- **Strict Target Resolution**: Supports `element-id`, `role`, `label`, `text`, `test-id`, `css`, and `point`. Ambiguous targets matching multiple visible elements throw `AMBIGUOUS_TARGET` errors rather than guessing.
- **Sensitive Data Masking**: Passwords, tokens, cookies, authorization headers, and sensitive form values are automatically redacted as `[REDACTED]`.

### Code Example: Session API

```ts
import { ScreenPool } from "screenpool";

const pool = new ScreenPool({ poolSize: 2 });
await pool.start();

// 1. Create an isolated session
const session = await pool.sessions.create({
  pages: { maxPages: 5, onPopup: "register", onActivePageClosed: "activate-opener" },
});

// 2. Start session recording
const recording = await session.record.start({
  preset: "debug",
  screenshots: "each-action",
});

// 3. Navigate & Observe main page
await session.goto("https://example.com");
const obs = await session.observe({ screenshot: true, elements: true });

// 4. Execute action opening a popup window
const actResult = await session.act({
  observationId: obs.id,
  actions: [
    {
      type: "click",
      target: { by: "role", role: "button", name: "Login with GitHub" },
      expect: {
        page: {
          event: "popup",
          alias: "github-login",
          activate: true,
          timeoutMs: 10_000,
        },
      },
    },
  ],
});

// 5. Fill credentials on popup page using alias reference
await session.act({
  page: { by: "alias", value: "github-login" },
  actions: [
    {
      type: "fill",
      target: { by: "label", value: "Username" },
      value: "demo-user",
      sensitive: true,
    },
  ],
});

// 6. Stop recording & finalize session
const manifest = await recording.stop();
console.log("Recording Manifest:", manifest);

await session.close();
await pool.stop();
```

### Stateless Run API

For simple one-off e2e action flows, use `pool.run()`:

```ts
const result = await pool.run({
  url: "https://news.ycombinator.com",
  actions: [
    {
      type: "click",
      target: { by: "role", role: "link", name: "new" },
    },
    {
      type: "screenshot",
      fullPage: true,
    },
  ],
  recording: {
    preset: "actions",
    screenshots: "each-action",
  },
});
```

### Record API & Artifacts

Recordings are written to `.screenpool/recordings/rec_<timestamp>_<id>/`:
- `manifest.json`: Execution metadata, step counts, duration, and artifact paths.
- `events.jsonl`: Chronological monotonic event stream (`recording.started`, `page.created`, `action.started`, `action.completed`, etc.).
- `screenshots/`: Pre/post action screenshots (`0001-before-click.png`, `0002-after-click.png`).

---

## Diagnostics and Debugging

Screenpool includes a powerful, lightweight, and zero-overhead diagnostics and debugging subsystem. When enabled, it captures page console logs, uncaught JavaScript errors, failed network requests, HTTP 4xx/5xx responses, slow requests, DOM page state, performance metrics, and unified event timelines.

When disabled (default), diagnostics introduces **zero performance overhead**, registers no page listeners, and creates no disk files.

### Presets

Screenpool offers preset levels for convenient debugging:

* **`errors`**: Captures only critical page errors, console error logs, network failures, HTTP 4xx/5xx status codes, and error state snapshots.
* **`standard`**: Standard debug mode. Captures warnings, errors, failed network requests, slow requests (> 2000ms), and error HTML/screenshots.
* **`verbose`**: Detailed tracing. Captures all console levels, all network requests/responses, timeline events, navigation/paint performance metrics, and artifact bundles.

### Usage Examples

#### Quick Preset Usage

```ts
// Using standard preset shorthand
const result = await pool.screenshot({
  url: "https://example.com",
  diagnostics: "standard"
});

console.log("Summary:", result.diagnostics?.summary);
```

#### Custom Options

```ts
const result = await pool.screenshot({
  url: "https://example.com",
  diagnostics: {
    preset: "verbose",
    output: "artifacts",
    includeRequestHeaders: true,
    slowRequests: { thresholdMs: 1500 },
    captureOnError: ["screenshot", "html", "page-state", "console", "network", "timeline", "summary"],
    onEvent(event) {
      console.log(`[Diagnostic Timeline Event] ${event.type}:`, event.data);
    }
  }
});
```

### Data Sanitization & Security

Diagnostics automatically redacts sensitive data (`[REDACTED]`) across console entries, network headers, query strings, JSON payloads, and timeline outputs:

* **Sensitive Headers**: `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, `X-API-Key`, `X-Auth-Token`, `X-Access-Token`
* **Sensitive Query Params**: `token`, `access_token`, `refresh_token`, `api_key`, `secret`, `password`, `session`, `code`, `sig`
* **Sensitive JSON Keys**: `password`, `secret`, `token`, `accessToken`, `apiKey`, `creditCard`, `cvv`
* **URL Credentials**: Passwords in HTTP URLs (e.g., `https://user:pass@host`)

### CLI Diagnostics Flags

```bash
screenpool screenshot https://example.com \
  --diagnostics standard \
  --diagnostics-dir .screenpool/debug \
  --diagnostics-output summary
```

### MCP Diagnostics Integration

Pass `diagnostics` in MCP tool calls:

```json
{
  "url": "https://example.com",
  "fullPage": true,
  "diagnostics": {
    "preset": "standard",
    "output": "summary"
  }
}
```

---

## Model Context Protocol (MCP) Server

Screenpool provides built-in Model Context Protocol (MCP) server support, allowing AI coding assistants (Claude Code, Cursor, VS Code MCP clients, Antigravity, etc.) to perform web rendering, screenshot capture, PDF generation, HTML extraction, and health checks over standard input/output (stdio).

### Quick Run

```bash
# Run MCP server using npx
npx screenpool mcp

# Or using installed binary
screenpool mcp

# Standalone binary
screenpool-mcp
```

### Options

```text
--browser <chromium|chrome>        Browser shorthand or executable name
--executable-path <path>           Explicit path to Chromium executable
--pool-size <number>               Number of worker pages in pool (default: 3)
--timeout <milliseconds>          Render and navigation timeout in ms (default: 30000)
--headless / --no-headless         Run browser in headless mode (default: true)
--max-pages <number>               Maximum queue size for render jobs
--artifacts-dir <path>             Directory to save screenshot/PDF outputs (default: .screenpool/artifacts)
--log-level <level>                Stderr logging level (silent|error|warn|info|debug)
--config <path>                    Path to custom configuration file
--allow-private-network            Allow navigation to localhost & private network IPs (SSRF bypass)
```

### Client Configuration Examples

#### Standard MCP Stdio Config (Claude Code, Cursor, VS Code)

```json
{
  "mcpServers": {
    "screenpool": {
      "command": "npx",
      "args": [
        "-y",
        "screenpool",
        "mcp"
      ]
    }
  }
}
```

#### Global Installation Config

```json
{
  "mcpServers": {
    "screenpool": {
      "command": "screenpool",
      "args": [
        "mcp",
        "--pool-size",
        "4",
        "--timeout",
        "30000"
      ]
    }
  }
}
```

#### Local Repository Config

```json
{
  "mcpServers": {
    "screenpool": {
      "command": "node",
      "args": [
        "/absolute/path/to/screenpool/dist/cli.js",
        "mcp"
      ],
      "env": {
        "SCREENPOOL_POOL_SIZE": "3",
        "SCREENPOOL_HEADLESS": "true",
        "SCREENPOOL_LOG_LEVEL": "info"
      }
    }
  }
}
```

### MCP Tools List

| Tool Name | Description |
|-----------|-------------|
| `screenpool_screenshot` | Capture web page or element screenshot (png, jpeg, webp, fullPage, viewport, selector, includeElementHtml, diagnostics). |
| `screenpool_pdf` | Render web page as PDF (A4, Letter, landscape, margins, background, diagnostics). |
| `screenpool_html` | Extract fully rendered HTML after JavaScript execution (with truncation and diagnostics). |
| `screenpool_metadata` | Extract page metadata (title, meta description, canonical URL, diagnostics). |
| `screenpool_session_create` | Create an isolated browser session with multi-page lifecycle tracking. |
| `screenpool_session_pages` | List managed pages in session and active/main page status. |
| `screenpool_session_close` | Close an active browser session and release its isolated context. |
| `screenpool_observe` | Capture page observation state including interactive element IDs, viewport, scroll, and compact HTML. |
| `screenpool_act` | Execute strict, verifiable browser actions (click, fill, press, select, scroll, wait, page actions) on a session. |
| `screenpool_run` | Stateless browser action run in a temporary session. |
| `screenpool_record_start` | Start session recording (events jsonl, action step screenshots, and video). |
| `screenpool_record_stop` | Stop session recording and return recording manifest. |
| `screenpool_record_get` | Get active session recording status. |
| `screenpool_health` | View worker pool health status, active jobs, uptime, and queue length. |
| `screenpool_capabilities` | Inspect supported features, tool list, formats, and diagnostics presets/outputs. |
| `screenpool_help` | Structured documentation, parameter guides, diagnostics presets, and example payloads. |

#### MCP Tool Request with Diagnostics Example

```json
{
  "url": "https://example.com",
  "fullPage": true,
  "format": "webp",
  "diagnostics": {
    "preset": "standard",
    "output": "summary"
  }
```

#### Element Screenshot & HTML Extraction MCP Example

```json
{
  "url": "https://example.com",
  "selector": ".hero-banner",
  "includeElementHtml": true
}
```

Response:
```json
{
  "success": true,
  "mimeType": "image/png",
  "path": "/path/to/.screenpool/artifacts/screenshot_3f9a.png",
  "width": 1280,
  "height": 720,
  "size": 18450,
  "elementHtml": "<div class=\"hero-banner\"><h1>Welcome</h1></div>",
  "durationMs": 284
}
```

#### MCP Tool Response with Diagnostics Output Example

```json
{
  "success": true,
  "mimeType": "image/webp",
  "path": "/path/to/.screenpool/artifacts/screenshot_8f1a.webp",
  "width": 1280,
  "height": 720,
  "size": 45210,
  "durationMs": 412,
  "diagnostics": {
    "id": "run_a1b2c3d4",
    "preset": "standard",
    "summary": {
      "runId": "run_a1b2c3d4",
      "startedAt": "2026-08-01T10:10:00.000Z",
      "completedAt": "2026-08-01T10:10:00.412Z",
      "durationMs": 412,
      "success": true,
      "finalUrl": "https://example.com/",
      "title": "Example Domain",
      "counts": {
        "console": 0,
        "consoleErrors": 0,
        "pageErrors": 0,
        "requests": 5,
        "failedRequests": 0,
        "responses4xx": 0,
        "responses5xx": 0,
        "slowRequests": 0,
        "issues": 0
      },
      "topIssues": [],
      "slowestRequests": []
    }
  }
}
```

### AGENTS.md / AI Guidelines Template

To teach AI coding assistants (Antigravity, Claude Code, Cursor, Windsurf, Copilot) how and when to use Screenpool in your project, copy and paste this snippet into your repository's `AGENTS.md` or `CLAUDE.md` file (see full guide in [docs/AGENTS.md](/docs/AGENTS.md)):

```markdown
## Screenpool Web Rendering & Diagnostics Guidelines

When performing web automation, visual inspection, PDF generation, dynamic HTML extraction, or web debugging, use Screenpool MCP tools (`screenpool_*`).

- **Visual Inspection**: Use `screenpool_screenshot` (`url`, `fullPage`, `format`, `viewport`) to verify UI layout or visual output.
- **Web Debugging**: Pass `diagnostics: "standard"` or `"verbose"` when troubleshooting broken web pages or network errors. Check `summary.counts` for console error logs or HTTP 4xx/5xx failures.
- **Dynamic SPAs**: Pass `waitUntil: "networkidle2"` for React, Vue, or Next.js sites to ensure JS execution completes.
- **Interactive Help**: Invoke `screenpool_help` to query parameter schemas and usage examples.
```

### Configuration & Environment Variables

Screenpool loads options in order of precedence: **CLI Arguments > Environment Variables > Config File > Default Values**.

Config file candidates: `screenpool.config.json`, `.screenpoolrc`, `.screenpoolrc.json` or `--config <path>`.

Example `screenpool.config.json`:

```json
{
  "browser": "chromium",
  "poolSize": 3,
  "timeout": 30000,
  "headless": true,
  "artifactsDir": ".screenpool/artifacts",
  "security": {
    "allowPrivateNetwork": false,
    "allowedDomains": ["example.com", "*.example.com"],
    "deniedDomains": ["admin.example.com"]
  },
  "mcp": {
    "enabledTools": [
      "screenpool_screenshot",
      "screenpool_pdf",
      "screenpool_html",
      "screenpool_health",
      "screenpool_capabilities"
    ]
  }
}
```

Environment variables:
- `SCREENPOOL_BROWSER=chromium`
- `SCREENPOOL_POOL_SIZE=3`
- `SCREENPOOL_TIMEOUT=30000`
- `SCREENPOOL_HEADLESS=true`
- `SCREENPOOL_ARTIFACTS_DIR=.screenpool/artifacts`
- `SCREENPOOL_ALLOW_PRIVATE_NETWORK=false`
- `SCREENPOOL_LOG_LEVEL=info`

### Programmatic Usage

```ts
import { createScreenpoolMcpServer } from "screenpool/mcp";

const server = await createScreenpoolMcpServer({
  config: {
    poolSize: 3,
    headless: true,
  },
});

await server.startStdio();
```

### MCP Troubleshooting

- **Chromium executable not found**: Run `npx screenpool setup` or pass `--executable-path /path/to/chromium`.
- **MCP server does not start / JSON-RPC parsing errors**: Ensure application logs are not written to `stdout`. Screenpool logs exclusively to `stderr`.
- **Private network URL blocked**: Add `--allow-private-network` or `"allowPrivateNetwork": true` in `screenpool.config.json`.
- **Timeout error**: Increase timeout using `--timeout 45000` or adjust job queue sizes.


### Background Server Management (unitup)

Start and supervise the ScreenPool server in the background using systemd native user services via [unitup](https://litepacks.github.io/unitup/):

```bash
# Start HTTP server in background (daemon mode)
screenpool server --daemon --port 3000

# Start background server on a random available port
screenpool server --daemon --random-port
screenpool daemon start --port 0

# Or using the dedicated daemon subcommands:
screenpool daemon start --port 3000 --pool-size 4
screenpool daemon status
screenpool daemon logs --follow
screenpool daemon restart
screenpool daemon stop
screenpool daemon remove
```

> [!NOTE]
> On Linux with systemd, unitup automatically registers and manages systemd user unit files (`~/.config/systemd/user/unitup-screenpool.service`). On systems without systemd, ScreenPool gracefully falls back to background process execution with log files in `~/.screenpool/daemons/`.


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
