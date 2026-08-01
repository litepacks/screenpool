# Screenpool AGENTS.md Integration Guide

When using Screenpool in project codebases with AI coding assistants (Antigravity, Claude Code, Cursor, Windsurf, GitHub Copilot, etc.), adding instructions to `AGENTS.md`, `CLAUDE.md`, or `.cursorrules` helps AI models understand **why**, **when**, and **how** to leverage Screenpool tools.

---

## Copy-Paste Snippet for your project's `AGENTS.md`

```markdown
## Screenpool Web Rendering & Diagnostics Guidelines

When performing web automation, visual inspection, PDF generation, dynamic HTML extraction, or web debugging, use Screenpool MCP tools (`screenpool_*`).

### Tool Capabilities & Usage Matrix

| MCP Tool | Purpose | Key Options |
|----------|---------|-------------|
| `screenpool_screenshot` | Capture web page visual rendering | `url`, `fullPage`, `format` (`png` \| `jpeg` \| `webp`), `viewport`, `diagnostics` |
| `screenpool_pdf` | Convert web page to PDF document | `url`, `format` (`A4` \| `Letter`), `landscape`, `margin`, `diagnostics` |
| `screenpool_html` | Extract JS-rendered HTML DOM | `url`, `waitUntil` (`networkidle2`), `maxChars`, `diagnostics` |
| `screenpool_metadata` | Extract page title & meta tags | `url`, `diagnostics` |
| `screenpool_help` | Discover tool docs & parameter schemas | `topic` (`"all"` \| `"tools"` \| `"diagnostics"`) |
| `screenpool_health` | View worker pool health & queue stats | N/A |

### AI Agent Usage Instructions

1. **Visual Verification**: Use `screenpool_screenshot` to inspect website UI layouts, check responsive viewports, or confirm DOM rendering.
2. **Web Debugging**: When diagnosing broken web pages, network timeouts, or JS exceptions, pass `diagnostics: "standard"` or `diagnostics: "verbose"`. Check `result.diagnostics.summary.counts` for console errors or HTTP 4xx/5xx responses.
3. **Dynamic SPA Applications**: For React, Vue, Angular, or Next.js sites, pass `waitUntil: "networkidle2"` to ensure client-side rendering finishes before capturing output.
4. **Performance & Format**: Prefer `format: "webp"` for low-bandwidth screenshot transmission, or `format: "png"` for exact visual fidelity.
5. **Interactive Help**: Invoke `screenpool_help` to query parameter schemas and usage examples directly from the server.
```
