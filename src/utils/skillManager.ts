import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

export interface SkillInstallOptions {
  subcommand?: 'install' | 'show' | 'path';
  global?: boolean;
  workspace?: boolean;
  cursor?: boolean;
  claude?: boolean;
  all?: boolean;
  target?: string;
}

export interface SkillTargetResult {
  name: string;
  path: string;
}

const EMBEDDED_SKILL_CONTENT = `---
name: screenpool
description: >-
  Comprehensive guide and runbook for Screenpool, the high-performance intelligent Chromium browser pool,
  session manager, and automation engine. Use when capturing screenshots or PDFs, rendering dynamic web pages,
  executing multi-step browser automations (observe, act, record), managing stateful sessions with persistent profiles,
  auditing Core Web Vitals and PageSpeed (LCP, CLS, FCP, TTFB, INP), interacting with Chrome DevTools Protocol (CDP),
  handling headed hand-off, or using the 21 Screenpool MCP tools.
---

# Screenpool: Definitive Runbook & Agent Skill Guide

Screenpool is a high-performance, intelligent Chromium browser pool, session manager, and automation engine for Node.js, CLI, HTTP, and Model Context Protocol (MCP).

---

## ⚡ 1. Core Architecture & Execution Modes

Screenpool manages a fixed pool of recycled Chromium workers to guarantee sub-millisecond tab allocation, zero memory leaks, and high throughput.

### Two Primary Execution Paradigms

| Feature | Stateless Jobs (\`render\`, \`screenshot\`, \`pdf\`, \`extract\`, \`run\`) | Stateful Sessions (\`sessions.create\` / \`screenpool_session_create\`) |
| :--- | :--- | :--- |
| **Worker Tab** | Automatically acquired and recycled per job | Dedicated worker page retained across steps |
| **State Retention** | Discarded on completion | Cookies, DOM state, storage, and URL retained |
| **Actions** | Single-shot pipeline (\`actions: [...]\`) | Multi-step interactive loop (\`observe\` -> \`act\` -> \`observe\`) |
| **Best For** | Static captures, PDFs, scraping, quick verification | Multi-step logins, complex wizards, live recording |

### Persistent Profiles & Headed Hand-Off
- **\`userDataDir\`**: Pass a directory path to persist authentication cookies, storage, and cache across restarts.
- **\`openHeadedHandoff\` / \`screenpool_mode_switch\`**: Dynamically toggles between headless and headed mode, or opens a temporary visible window for manual CAPTCHA / OAuth completion with automatic session sync.

---

## 🚀 2. Quick Start & Developer API

### Installation
\`\`\`bash
npm install screenpool
\`\`\`

### Basic Programmatic Usage
\`\`\`typescript
import { ScreenPool } from 'screenpool';

const pool = new ScreenPool({
  poolSize: 4,
  headless: true,
  stealth: true, // Anti-bot evasions
});
await pool.init();

// 1. Capture Screenshot
const shot = await pool.screenshot({
  url: 'https://example.com',
  format: 'png',
  fullPage: true,
});

// 2. Render PDF
const pdf = await pool.pdf({
  url: 'https://example.com',
  format: 'A4',
  printBackground: true,
});

// 3. PageSpeed & Core Web Vitals Audit
const audit = await pool.audit({
  url: 'https://example.com',
  device: 'mobile',       // 'desktop' | 'mobile'
  throttleNetwork: true,   // Simulated 4G network throttling
});
console.log(\`Score: \${audit.score}/100, LCP: \${audit.webVitals.lcpMs}ms, CLS: \${audit.webVitals.cls}\`);

await pool.destroy();
\`\`\`

---

## 📊 3. Core Web Vitals & PageSpeed Audits

Screenpool provides zero-dependency, native Core Web Vitals extraction using Chromium W3C \`PerformanceObserver\` and CDP:

### Metrics Captured:
- **LCP (Largest Contentful Paint)**: Render time (ms), element selector/tag, and layout area.
- **CLS (Cumulative Layout Shift)**: Layout shift score and shift event counts.
- **FCP (First Contentful Paint)**: Initial paint time (ms).
- **TTFB (Time to First Byte)**: Server response latency (ms).
- **INP (Interaction to Next Paint)** & **FID (First Input Delay)**.
- **CDP Runtime Stats**: JS heap memory, DOM node count, layout duration.

### Google Web Vitals Rating Thresholds:
- **LCP**: Good ≤ 2500ms | Needs Improvement ≤ 4000ms | Poor > 4000ms
- **CLS**: Good ≤ 0.1 | Needs Improvement ≤ 0.25 | Poor > 0.25
- **FCP**: Good ≤ 1800ms | Needs Improvement ≤ 3000ms | Poor > 3000ms
- **TTFB**: Good ≤ 800ms | Needs Improvement ≤ 1800ms | Poor > 1800ms
- **INP**: Good ≤ 200ms | Needs Improvement ≤ 500ms | Poor > 500ms

### Usage in Diagnostics:
\`\`\`typescript
const result = await pool.render({
  url: 'https://example.com',
  diagnostics: {
    enabled: true,
    webVitals: true, // Automatically captures CWV ratings
  },
});
\`\`\`

---

## 🎯 4. Target Descriptors (\`Target\` Syntax)

All interactive operations (\`click\`, \`fill\`, \`hover\`, etc.) require a \`target\` descriptor.

> [!CAUTION]
> **\`"by": "id"\` is NOT supported!**
> Always use standard CSS selectors for element IDs:
> - ❌ \`{"by": "id", "value": "submit-btn"}\`
> - ✅ \`{"by": "css", "value": "#submit-btn"}\`

### Supported Selector Types:
| Type (\`by\`) | Example | Notes |
| :--- | :--- | :--- |
| **\`css\`** | \`{"by": "css", "value": "#login-form input.email"}\` | Standard CSS selector |
| **\`text\`** | \`{"by": "text", "value": "Sign In"}\` | Case-insensitive button or link text |
| **\`role\`** | \`{"by": "role", "role": "button", "name": "Save"}\` | ARIA role and accessible name |
| **\`label\`** | \`{"by": "label", "value": "Password"}\` | Associated \`<label>\` text |
| **\`test-id\`** | \`{"by": "test-id", "value": "submit-btn"}\` | Matches \`data-testid\`, \`data-test\`, \`data-cy\` |
| **\`element-id\`** | \`{"by": "element-id", "value": "e_3", "observationId": "obs_1"}\` | Element ID returned by \`observe\` |
| **\`point\`** | \`{"by": "point", "x": 420, "y": 300}\` | Viewport coordinates |

---

## 🕹️ 5. Supported Automation Actions

### 5.1. \`fill\`
Automatically focuses, updates input/textarea values via native prototype setters (bypassing React/Vue/Svelte \`_valueTracker\` overrides), and dispatches bubbling \`input\` and \`change\` events:
\`\`\`json
{
  "type": "fill",
  "target": { "by": "css", "value": "#email-input" },
  "value": "user@example.com"
}
\`\`\`

### 5.2. \`click\`
Handles single, double, or right clicks. Supports popup expectations (\`expect.page\`):
\`\`\`json
{
  "type": "click",
  "target": { "by": "text", "value": "Submit" }
}
\`\`\`

### 5.3. Custom Dropdowns & Native Selects
- **Native \`<select>\`**:
\`\`\`json
{
  "type": "select",
  "target": { "by": "css", "value": "#country" },
  "values": ["US"]
}
\`\`\`
- **Custom / Floating Dropdowns (React/Vue/Tailwind)**:
\`\`\`json
[
  { "type": "click", "target": { "by": "css", "value": "#role-picker" } },
  { "type": "wait", "target": { "by": "css", "value": "#option-admin" }, "state": "visible" },
  { "type": "click", "target": { "by": "css", "value": "#option-admin" } }
]
\`\`\`

### 5.4. Keyboard & Navigation
- \`type\`: Sequential keystrokes with delay (\`{ "type": "type", "target": { "by": "css", "value": "input" }, "value": "hello", "delayMs": 50 }\`).
- \`press\`: Key press (\`{ "type": "press", "key": "Enter" }\`).
- \`scroll\`: Delta or coordinate scrolling (\`{ "type": "scroll", "deltaY": 500 }\`).
- \`wait\`: Time or DOM condition (\`{ "type": "wait", "durationMs": 1000 }\` or \`{ "type": "wait", "target": { "by": "css", "value": ".toast" }, "state": "visible" }\`).

---

## 🛠️ 6. MCP Tools Reference (21 Tools)

Screenpool provides a complete Model Context Protocol suite via \`screenpool-mcp\` or \`screenpool mcp\`:

1. **\`screenpool_screenshot\`**: Capture full-page or element screenshot.
2. **\`screenpool_pdf\`**: Generate paginated PDF with print styles.
3. **\`screenpool_html\`**: Extract clean rendered HTML or scoped selector DOM.
4. **\`screenpool_metadata\`**: Extract OpenGraph, Twitter, schema metadata, and title.
5. **\`screenpool_extract\`**: Structured data extraction using JSON rules.
6. **\`screenpool_pagespeed\`**: Audit Core Web Vitals (LCP, CLS, FCP, TTFB, INP) and get 0-100 performance score.
7. **\`screenpool_run\`**: Execute stateless multi-action workflow (navigate -> act -> screenshot/video).
8. **\`screenpool_session_create\`**: Open stateful session with optional persistent profile.
9. **\`screenpool_session_close\`**: Close active session and clean up tab.
10. **\`screenpool_observe\`**: Inspect interactive elements, bounding boxes, and accessibility hierarchy.
11. **\`screenpool_act\`**: Execute actions within an existing stateful session.
12. **\`screenpool_record_start\`**: Start video or trace recording on session.
13. **\`screenpool_record_stop\`**: Finalize and save recording artifacts.
14. **\`screenpool_devtools\`**: Inspect DevTools WebSocket endpoints and frontend URLs.
15. **\`screenpool_cdp_send\`**: Direct Chrome DevTools Protocol command execution.
16. **\`screenpool_state_export\`**: Export session cookies, localStorage, and sessionStorage to JSON.
17. **\`screenpool_state_import\`**: Restore session state from JSON.
18. **\`screenpool_mode_switch\`**: Dynamically toggle headed/headless mode and DevTools.
19. **\`screenpool_health\`**: Monitor worker pool capacity, queue latency, and memory.
20. **\`screenpool_capabilities\`**: Discover supported browser engines, video encoders, and features.
21. **\`screenpool_help\`**: Interactive reference documentation for actions, targets, and security.

---

## 📦 7. Skill Installation Commands

To install or sync this skill into your environment:

### Global Installation (Antigravity / Gemini)
\`\`\`bash
npx screenpool skill install --global
# Installs to: ~/.gemini/config/skills/screenpool/SKILL.md
\`\`\`

### Workspace Installation
\`\`\`bash
npx screenpool skill install --workspace
# Installs to: .agents/skills/screenpool/SKILL.md
\`\`\`

### Multi-Target Installation (Antigravity, Cursor, Claude)
\`\`\`bash
npx screenpool skill install --all
\`\`\`
`;

/**
 * Resolves the absolute path to the local repository/package skills/screenpool/SKILL.md.
 */
export function getSkillSourcePath(): string {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const candidatePaths = [
      resolve(currentDir, '../../skills/screenpool/SKILL.md'),
      resolve(currentDir, '../skills/screenpool/SKILL.md'),
      resolve(process.cwd(), 'skills/screenpool/SKILL.md'),
    ];
    for (const p of candidatePaths) {
      if (existsSync(p)) {
        return p;
      }
    }
  } catch {
    // ignore
  }
  return resolve(process.cwd(), 'skills/screenpool/SKILL.md');
}

/**
 * Reads the skill markdown content, with embedded fallback.
 */
export async function getSkillContent(): Promise<string> {
  const sourcePath = getSkillSourcePath();
  try {
    if (existsSync(sourcePath)) {
      return await readFile(sourcePath, 'utf8');
    }
  } catch {
    // fallback to embedded content
  }
  return EMBEDDED_SKILL_CONTENT;
}

/**
 * Determines target destination paths based on flags.
 */
export function resolveSkillTargets(options: SkillInstallOptions = {}): SkillTargetResult[] {
  const home = homedir();
  const cwd = process.cwd();
  const targets: SkillTargetResult[] = [];

  if (options.target) {
    const dest = options.target.endsWith('SKILL.md')
      ? options.target
      : join(options.target, 'skills/screenpool/SKILL.md');
    targets.push({ name: 'Custom target', path: resolve(cwd, dest) });
    return targets;
  }

  const isGlobal = Boolean(options.global);
  const isWorkspace = Boolean(options.workspace);
  const isAll = Boolean(options.all);

  // If no specific flag is passed (or --all is passed), default to both Workspace and Global (Antigravity standard)
  const defaultBoth = (!isGlobal && !isWorkspace && !options.cursor && !options.claude) || isAll;

  if (isWorkspace || defaultBoth) {
    targets.push({
      name: 'Workspace (.agents)',
      path: resolve(cwd, '.agents/skills/screenpool/SKILL.md'),
    });
  }

  if (isGlobal || defaultBoth) {
    targets.push({
      name: 'Global (~/.gemini)',
      path: join(home, '.gemini/config/skills/screenpool/SKILL.md'),
    });
  }

  if (options.cursor || isAll) {
    targets.push({
      name: 'Cursor Rules (.cursor/rules)',
      path: resolve(cwd, '.cursor/rules/screenpool.md'),
    });
  }

  if (options.claude || isAll) {
    targets.push({
      name: 'Claude Skills (.claude/skills)',
      path: resolve(cwd, '.claude/skills/screenpool/SKILL.md'),
    });
  }

  return targets;
}

/**
 * Executes skill CLI commands.
 */
export async function runSkill(argv: any): Promise<void> {
  const subcommand = (argv.subcommand || argv._?.[1] || 'install') as 'install' | 'show' | 'path';

  if (subcommand === 'show' || subcommand === ('cat' as any)) {
    const content = await getSkillContent();
    process.stdout.write(content);
    return;
  }

  if (subcommand === 'path') {
    const p = getSkillSourcePath();
    console.log(p);
    return;
  }

  if (subcommand === 'install' || subcommand === ('add' as any)) {
    const content = await getSkillContent();
    const targets = resolveSkillTargets({
      global: Boolean(argv.global || argv.g),
      workspace: Boolean(argv.workspace || argv.w || argv.local),
      cursor: Boolean(argv.cursor),
      claude: Boolean(argv.claude),
      all: Boolean(argv.all),
      target: argv.target,
    });

    console.log(`\n📦 Installing Screenpool Agent Skill...`);
    for (const t of targets) {
      await mkdir(dirname(t.path), { recursive: true });
      await writeFile(t.path, content, 'utf8');
      console.log(`  ✅ [${t.name}]: ${t.path}`);
    }
    console.log(`\n✨ Screenpool agent skill successfully installed and ready to use!\n`);
    return;
  }

  console.error(`Usage: screenpool skill <install|show|path> [--global] [--workspace] [--all] [--cursor] [--claude] [--target <dir>]`);
  process.exit(1);
}
