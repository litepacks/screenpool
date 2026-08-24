# Screenpool AGENTS.md Integration Guide

When using Screenpool in project codebases with AI coding assistants (Antigravity, Claude Code, Cursor, Windsurf, GitHub Copilot, etc.), adding instructions to `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` helps AI models understand **why**, **when**, and **how** to leverage Screenpool tools.

---

## Copy-Paste Snippet for your project's `AGENTS.md`

```markdown
## Screenpool Web Rendering, Actions & Recording Guidelines

When performing web automation, visual inspection, PDF generation, browser action flows, session management, or web debugging, use Screenpool MCP tools (`screenpool_*`).

### Tool Capabilities & Usage Matrix

| MCP Tool | Purpose | Key Options |
|----------|---------|-------------|
| `screenpool_screenshot` | Capture web page visual rendering | `url`, `fullPage`, `format` (`png` \| `jpeg` \| `webp`), `viewport`, `diagnostics` |
| `screenpool_pdf` | Convert web page to PDF document | `url`, `format` (`A4` \| `Letter`), `landscape`, `margin`, `scale`, `diagnostics` |
| `screenpool_html` | Extract JS-rendered HTML DOM | `url`, `waitUntil` (`networkidle2`), `maxChars`, `diagnostics` |
| `screenpool_metadata` | Extract page title & meta tags | `url`, `diagnostics` |
| `screenpool_session_create` | Create an isolated or persistent browser session | `ttlMs`, `persistent` (`boolean`), `policy`, `pages` |
| `screenpool_session_pages` | List managed pages in session | `sessionId` |
| `screenpool_session_close` | Close session and release context/pages | `sessionId` |
| `screenpool_observe` | Capture page state & element IDs | `sessionId`, `page`, `screenshot`, `html`, `elements` |
| `screenpool_act` | Execute strict browser actions | `sessionId`, `observationId`, `actions` (`click`, `fill`, `press`, `select`, `scroll`, `wait`, `page.*`) |
| `screenpool_run` | Stateless action flow execution | `url`, `actions`, `recording` (`preset`, `video`, `screenshots`) |
| `screenpool_record_start` | Start event & step recording | `sessionId`, `url`, `options` (`preset`, `video`, `screenshots`) |
| `screenpool_record_stop` | Stop recording & get manifest | `sessionId`, `recordingId`, `closeSession` |
| `screenpool_record_get` | Check active recording status | `sessionId` |
| `screenpool_capabilities` | Inspect server capabilities & tools | N/A |
| `screenpool_help` | Discover tool docs & schemas | `topic` (`"all"` \| `"tools"` \| `"sessions"` \| `"auth"` \| `"actions"` \| `"targets"` \| `"recording"` \| `"diagnostics"` \| `"formats"` \| `"examples"`) |
| `screenpool_health` | View worker pool health & queue | N/A |

### AI Agent Usage Instructions

1. **Visual Verification**: Use `screenpool_screenshot` to inspect website UI layouts, check responsive viewports, or confirm DOM rendering.
2. **Interactive Browser Flows & Auth**: Create a session via `screenpool_session_create` (pass `persistent: true` to reuse disk-backed login cookies and localStorage), observe page elements using `screenpool_observe`, and execute action sequences using `screenpool_act`.
3. **Stateless Action Flows**: For one-off action sequences, invoke `screenpool_run` with an array of actions and optional recording settings.
4. **Popup & OAuth Handling**: Popups opened via `target="_blank"` or `window.open()` are automatically registered in the session page registry with opener page tracking.
5. **Session Recording**: Start recording via `screenpool_record_start` to log event streams (`events.jsonl`), video capture (`video: true`), step screenshots (`each-action`), and manifest artifacts.
6. **Web Debugging**: Pass `diagnostics: "standard"` or `diagnostics: "verbose"`. Check `result.diagnostics.summary.counts` for console errors or HTTP 4xx/5xx responses.
7. **Dynamic SPA Applications**: For React, Vue, Angular, or Next.js sites, pass `waitUntil: "networkidle2"` to ensure client-side rendering finishes before capturing output.
8. **Interactive Help**: Invoke `screenpool_help` (with `topic: "auth"`, `"tools"`, or `"actions"`) to query parameter schemas and usage examples directly from the server.
```
