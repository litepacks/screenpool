# Screenpool Agent Guide & Tool Reference

This guide is designed for AI agents and automation tools executing web automation, browser actions, state management, and DevTools/CDP operations using the **Screenpool** library and MCP tools.

---

## 1. Core Architecture & Concepts

Screenpool is a high-performance, intelligent Chromium browser pool and session manager.

- **Stateless Jobs (`render`, `screenshot`, `pdf`, `extract`, `run`):** Run single-shot executions and automatically clean up worker tabs after job completion.
- **Stateful Sessions (`sessions.create` / `screenpool_session_create`):** Retain browser page state across multi-step automation flows such as `observe`, `act`, `record`, `sendCDP`, `exportState`, and `importState`.
- **Persistent Profiles:** Keep cookies, local storage, and session data across browser restarts via `userDataDir`.
- **Dynamic Mode Switching & Headed Hand-off:** Switch between headless and headed mode on the fly, or launch a temporary visible browser window via `openHeadedHandoff` for manual user authentication/CAPTCHA resolution with automatic cookie/storage sync.

---

## 2. Action Targeting Specification (`Target` Syntax)

All interactive actions (`click`, `fill`, `hover`, etc.) require a `target` descriptor.

### ⚠️ Critical Rule: `"by": "id"` Is NOT Supported!
Screenpool's target schema does not include `"by": "id"`. To select elements by ID, use standard CSS selectors:
- ❌ **Incorrect:** `{"by": "id", "value": "entry-body"}`
- ✅ **Correct:** `{"by": "css", "value": "#entry-body"}`

### Valid Target Types:

| Type (`by`) | Example | Description |
|---|---|---|
| **`css`** | `{"by": "css", "value": "#submit-btn"}` | Standard CSS selector (ID, class, attributes) |
| **`text`** | `{"by": "text", "value": "Sign in"}` | Visible button, link, or text content (case-insensitive) |
| **`role`** | `{"by": "role", "role": "button", "name": "Save"}` | ARIA role and accessible name |
| **`label`** | `{"by": "label", "value": "Username"}` | Associated `<label>` text |
| **`test-id`**| `{"by": "test-id", "value": "login-submit"}` | Matches `data-testid`, `data-test`, or `data-cy` attributes |
| **`element-id`** | `{"by": "element-id", "value": "e_3", "observationId": "obs_123"}` | Element identifier returned by `observe` |
| **`point`** | `{"by": "point", "x": 350, "y": 420}` | Direct viewport coordinate click/interaction |

---

## 3. Supported Actions (`actions`)

### 3.1. `fill` (Input & Textarea Filling)
- Automatically triggers `.focus()` on the target element.
- Updates React, Vue, Svelte, and native form values via native prototype descriptor setters and resets React's internal `_valueTracker`.
- Dispatches bubbling events (`input` and `change` with `{ bubbles: true, composed: true }`).

```json
{
  "type": "fill",
  "target": { "by": "css", "value": "#entry-body" },
  "value": "Sample text content"
}
```

### 3.2. `click`
- Supports clicks, double clicks, right clicks, and optional popup expectations (`expect.page`).

```json
{
  "type": "click",
  "target": { "by": "text", "value": "Submit Response" }
}
```

For buttons opening popups:
```json
{
  "type": "click",
  "target": { "by": "css", "value": "#oauth-login-btn" },
  "expect": {
    "page": {
      "kind": "popup",
      "urlPattern": "https://accounts.google.com/**",
      "timeoutMs": 10000,
      "activate": true
    }
  }
}
```

### 3.3. `type` & `press` (Keyboard Operations)
- `type`: Types characters sequentially with an optional `delayMs`.
- `press`: Dispatches keyboard keys like `Enter`, `Tab`, `Escape`, `Backspace`, `ArrowDown`.

```json
{ "type": "type", "target": { "by": "css", "value": "input.search" }, "value": "search query", "delayMs": 50 }
```
```json
{ "type": "press", "key": "Enter" }
```

### 3.4. `wait`
- Time-based (`durationMs`) or DOM condition-based (`selector`, `text`, `state: "visible" | "hidden"`).

```json
{ "type": "wait", "durationMs": 1500 }
```
```json
{ "type": "wait", "target": { "by": "css", "value": ".toast-success" }, "state": "visible", "timeoutMs": 5000 }
```

### 3.5. `scroll`, `hover`, `drag`, `selectOption`, `evaluate`
- `scroll`: `direction: "down" | "up"`, `amount: 500`, or scroll until element is visible.
- `hover`: Moves mouse over the target element.
- `selectOption`: Selects option values from `<select>` elements (`values: ["opt1"]`).
- `evaluate`: Executes JavaScript expressions in the page context (`script: "() => document.title"`).

---

## 4. MCP Tools Reference

### 4.1. `screenpool_run` (Stateless Single-Step Flow)
Launches the browser, navigates to the target URL, executes the action array sequentially, and optionally produces screenshots or video recordings:

```json
{
  "url": "https://example.com/topic",
  "actions": [
    { "type": "fill", "target": { "by": "css", "value": "#entry-body" }, "value": "Great product." },
    { "type": "click", "target": { "by": "text", "value": "Submit" } }
  ],
  "options": {
    "video": true,
    "preset": "visual"
  }
}
```

---

### 4.2. Stateful Multi-Step Flow (`screenpool_session_create`, `screenpool_observe`, `screenpool_act`)

1. **Create Session:**
   `screenpool_session_create` -> `{ url: "https://example.com", persistent: true }` -> returns `sessionId`.

2. **Inspect Page (`observe`):**
   `screenpool_observe` -> `{ sessionId: "..." }`
   Returns interactive element IDs (`e_1`, `e_2`), bounding boxes, and accessibility hierarchy.

3. **Execute Actions (`act`):**
   `screenpool_act` -> `{ sessionId: "...", actions: [...] }`

4. **Close Session:**
   `screenpool_session_close` -> `{ sessionId: "..." }`

---

### 4.3. DevTools, CDP & Mode Switching

- **`screenpool_devtools`**: Returns active WebSocket inspection endpoints and frontend DevTools URLs.
- **`screenpool_cdp_send`**: Directly executes Chrome DevTools Protocol commands (e.g. `Network.setCookie`, `Emulation.setDeviceMetricsOverride`).
- **`screenpool_state_export` & `screenpool_state_import`**: Exports and imports session cookies and `localStorage` as portable JSON objects.
- **`screenpool_mode_switch`**: Dynamically toggles headless / headed mode and DevTools inspection at runtime.

---

## 5. Example: Controlled Form Submission

```json
{
  "url": "https://example.com/topic",
  "actions": [
    {
      "type": "fill",
      "target": { "by": "css", "value": "#entry-body" },
      "value": "Test comment"
    },
    {
      "type": "click",
      "target": { "by": "text", "value": "Submit" }
    }
  ]
}
```
