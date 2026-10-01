---
name: wxt
description: >-
  WXT is a Vite-based framework that builds browser extensions for Chrome,
  Firefox, Safari, and Edge from one codebase. Use when someone asks to "build a
  browser extension", "Chrome extension with React", "WXT framework", "cross-
  browser extension", "manifest v3 extension", "build Firefox extension", or
  "browser extension with TypeScript". Covers content scripts, background
  workers, popup/options pages, storage, messaging, and publishing.
license: Apache-2.0
compatibility: "WXT 0.21: Node.js 22+, Vite 6.3.4+, TypeScript 5.4+. Targets Chrome, Firefox, Safari, Edge. Supports React, Vue, Svelte, Solid."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["browser-extension", "chrome", "firefox", "wxt", "manifest-v3"]
  repository: https://github.com/wxt-dev/wxt
---

# WXT

## Overview

WXT is a Vite-based framework for building browser extensions — its own tagline is "like Nuxt, but for web extensions." File-based entrypoints, hot reload, TypeScript-first, auto-imports. One codebase produces a separate build per browser: Manifest V3 for Chrome and Edge, Manifest V2 by default for Firefox and Safari (pass `--mv3` to override). There is no `manifest.json` in the source tree — WXT generates it from `wxt.config.ts` and the entrypoint files.

WXT is still pre-1.0, so a change in the second digit (0.20 → 0.21) is a breaking release. This skill matches 0.21, which needs Node.js 22+, and makes `vite` a required peer dependency and `web-ext` an optional one (without `web-ext` the dev command no longer opens a browser).

## When to Use

- Building a browser extension for Chrome, Firefox, or all browsers
- Want hot reload during development (not manual reload)
- Need TypeScript + React/Vue/Svelte in your extension
- Migrating from Manifest V2 to V3
- Want one codebase that targets multiple browsers

## Instructions

### Setup

```bash
npx wxt@latest init code-explainer -t react --pm npm   # templates: vanilla, vue, react, svelte, solid
cd code-explainer
npm install    # postinstall runs `wxt prepare`, which generates .wxt/ (types, tsconfig)
npm run dev    # Opens Chrome with the extension loaded and hot reload
```

Without `-t` and `--pm` the `init` command asks for the template and package manager. To add WXT to an existing project: `npm i -D wxt vite typescript`, plus `web-ext` if the dev command should open a browser.

### Project Structure

```
code-explainer/
├── entrypoints/
│   ├── popup/           # Popup UI (click extension icon)
│   │   ├── index.html
│   │   ├── main.tsx
│   │   └── App.tsx
│   ├── content.ts       # Content script (runs on web pages)
│   └── background.ts    # Service worker (background logic)
├── utils/               # Auto-imported helpers (also components/, hooks/, composables/)
├── public/
│   └── icon/            # 16.png, 32.png, 48.png, 96.png, 128.png — found automatically
├── .env                 # WXT_* and VITE_* variables, exposed on import.meta.env
├── wxt.config.ts
└── package.json
```

More content scripts go in files named `{name}.content.ts`. Other recognised entrypoint names include `options`, `sidepanel`, `newtab` and `devtools` (each a folder with an `index.html`).

### Config and Permissions

WXT does not add permissions for you. Every API used below has to be declared, or it is `undefined` at runtime (`storage` throws):

```typescript
// wxt.config.ts
import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "Code Explainer",
    permissions: ["storage", "alarms"],
    host_permissions: ["https://api.openai.com/*"],
  },
});
```

Write manifest keys in MV3 form (`action`, `host_permissions`); WXT converts them for MV2 builds. The manifest `name` and `version` default to the values in `package.json`, which also name the zip files — the template ships as `wxt-react-starter` 0.0.0, so edit both.

```typescript
// utils/storage.ts — typed storage items, auto-imported everywhere
export const explainCount = storage.defineItem<number>("local:explainCount", { fallback: 0 });
```

### Content Script

```typescript
// entrypoints/content.ts — Runs on matched web pages; createShadowRootUi isolates the button's styles.
// DOM and extension API calls must stay inside main(): WXT imports this file in Node at build time.
export default defineContentScript({
  matches: ["https://github.com/*"],
  cssInjectionMode: "ui",
  async main(ctx) {
    const ui = await createShadowRootUi(ctx, {
      name: "code-explainer",
      position: "inline",
      anchor: "body",
      onMount(container) {
        const btn = document.createElement("button");
        btn.textContent = "Explain selection";
        btn.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:9999";
        btn.onclick = async () => {
          const code = window.getSelection()?.toString().slice(0, 5000);
          if (!code) return;
          // Send to background for the API call
          const reply = await browser.runtime.sendMessage({ type: "EXPLAIN", code });
          alert(reply.error ?? reply.summary);
        };
        container.append(btn);
      },
    });
    ui.mount();
  },
});
```

### Background Service Worker

```typescript
// entrypoints/background.ts — Service worker: API calls, alarms, message routing. No DOM access.
// The main function cannot be async.
export default defineBackground(() => {
  // Since WXT 0.20 `browser` is the native API, not webextension-polyfill:
  // answer with sendResponse and return true instead of returning a promise.
  browser.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type !== "EXPLAIN") return;
    explain(msg.code)
      .then((summary) => sendResponse({ summary }))
      .catch((err) => sendResponse({ error: String(err) }));
    return true; // keep the channel open until sendResponse runs
  });

  // Periodic tasks with alarms
  browser.alarms.create("refresh-badge", { periodInMinutes: 30 });
  browser.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "refresh-badge") return;
    const count = await explainCount.getValue();
    // MV2 builds (the Firefox default) only have browser.browserAction
    await (browser.action ?? browser.browserAction).setBadgeText({ text: count ? String(count) : "" });
  });
});

async function explain(code: string): Promise<string> {
  const apiKey = await storage.getItem<string>("local:apiKey");
  if (!apiKey) throw new Error("Save an API key in the popup first");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: import.meta.env.WXT_OPENAI_MODEL, // set in .env
      messages: [{ role: "user", content: `Explain this code:\n${code}` }],
    }),
  });
  if (!response.ok) throw new Error(`OpenAI API returned ${response.status}`);
  const data = await response.json();
  await explainCount.setValue((await explainCount.getValue()) + 1);
  return data.choices[0].message.content;
}
```

### Popup UI (React)

```tsx
// entrypoints/popup/App.tsx — Extension popup with React
import { useState, useEffect } from "react";

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    storage.getItem<string>("local:apiKey").then((key) => key && setApiKey(key));
  }, []);

  const save = async () => {
    await storage.setItem("local:apiKey", apiKey);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ width: 300, padding: 16 }}>
      <h2>Code Explainer</h2>
      <input type="password" value={apiKey} placeholder="OpenAI API Key"
        onChange={(e) => setApiKey(e.target.value)} style={{ width: "100%" }} />
      <button onClick={save} style={{ marginTop: 8 }}>{saved ? "Saved" : "Save Key"}</button>
    </div>
  );
}
```

### Build for Multiple Browsers

```bash
npm run dev            # Chrome with hot reload
npm run dev:firefox    # Firefox

# Production builds, one output directory per target
npm run build          # wxt build            → .output/chrome-mv3/
npm run build:firefox  # wxt build -b firefox → .output/firefox-mv2/
npx wxt build -b firefox --mv3   # → .output/firefox-mv3/
npx wxt build -b edge            # or -b safari

# Zip for store submission
npm run zip            # .output/code-explainer-1.0.0-chrome.zip
npm run zip:firefox    # ...-firefox.zip plus ...-sources.zip, which Firefox review requires
```

Branch on the target with `import.meta.env.BROWSER`, `import.meta.env.FIREFOX` or `import.meta.env.MANIFEST_VERSION`; limit an entrypoint to some browsers with `include: ["firefox"]` or `exclude: ["chrome"]`.

### Publish

```bash
npx wxt submit init   # asks for store credentials, writes .env.submit
npx wxt submit --dry-run \
  --chrome-zip .output/code-explainer-1.0.0-chrome.zip \
  --firefox-zip .output/code-explainer-1.0.0-firefox.zip \
  --firefox-sources-zip .output/code-explainer-1.0.0-sources.zip
```

Drop `--dry-run` to submit. The first listing in each store has to be created by hand. Edge accepts the Chrome zip via `--edge-zip`. Safari is not automated: build with `-b safari` and wrap the output with Xcode's `safari-web-extension-packager`.

## Examples

### Example 1: Block distracting sites during focus time

**User prompt:** "Build a Chrome extension that blocks Reddit and YouTube while I'm in a focus session."

Add a storage item and a second content script; the popup starts a session with `focusUntil.setValue(Date.now() + 25 * 60_000)`.

```typescript
// utils/storage.ts
export const focusUntil = storage.defineItem<number>("local:focusUntil", { fallback: 0 });
```

```typescript
// entrypoints/blocker.content.ts
export default defineContentScript({
  matches: ["*://*.reddit.com/*", "*://*.youtube.com/*"],
  runAt: "document_start",
  async main() {
    const until = await focusUntil.getValue();
    if (Date.now() >= until) return;
    window.stop();
    const time = new Date(until).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    document.documentElement.innerHTML = `<body><h1>Focus time. Back at ${time}.</h1></body>`;
  },
});
```

`npm run build` picks the file up by name and adds it to the generated manifest:

```json
"content_scripts": [
  { "matches": ["*://*.reddit.com/*", "*://*.youtube.com/*"], "run_at": "document_start", "js": ["content-scripts/blocker.js"] }
]
```

### Example 2: Ship the same extension to Firefox

**User prompt:** "My WXT extension works in Chrome. Package it for the Firefox add-on store too."

```bash
npx wxt zip -b firefox
```

```
✔ Zipped extension in 44 ms
  ├─ .output/code-explainer-1.0.0-firefox.zip  95.69 kB
  └─ .output/code-explainer-1.0.0-sources.zip  69.52 kB
```

The command also lists every file that went into the sources zip (hidden files such as `.env` are left out). The Firefox build is MV2: `host_permissions` are merged into `permissions`, `action` becomes `browser_action`, and the background runs as a script instead of a service worker. A new listing must first declare `browser_specific_settings.gecko.data_collection_permissions` in `manifest` (the build warns until it does; an explicit `gecko.id` is recommended). Upload both zips; the reviewers rebuild the extension from the sources zip, so check that `npm i && npm run zip:firefox` works inside it.

## Guidelines

- **File-based entrypoints** — file name and location determine the extension component
- **`browser.*` API** — a plain alias for the browser's own `browser`/`chrome` global with `@types/chrome` types; the polyfill was removed in 0.20, so APIs a browser lacks are `undefined` (feature-detect with `?.`)
- **No promise replies from `onMessage`** — use `sendResponse` plus `return true`, or a messaging library such as `@webext-core/messaging`; Chrome only began accepting returned promises in version 148
- **Declare permissions yourself** — `storage`, `alarms`, `host_permissions` and the rest go in `manifest` in `wxt.config.ts`
- **`storage` helper** — keys carry their area prefix (`local:`, `session:`, `sync:`, `managed:`); prefer `storage.defineItem` for typed values with a fallback
- **Imports** — helpers are auto-imported; for explicit imports use `#imports` (`wxt/storage`, `wxt/client` and `wxt/sandbox` no longer exist)
- **Hot reload works** — `npm run dev` reloads content scripts and popup on save
- **MV3 service workers** — background scripts are service workers (no persistent state)
- **Single-page sites** — content scripts run only on full page loads; on sites like GitHub or YouTube match the whole origin and listen for `wxt:locationchange` with `ctx.addEventListener`
- **Secrets** — anything in `.env` or the source is shipped inside the extension and readable by every user; take API keys from the user at runtime or proxy calls through your own server
- **Upgrading** — install with `--ignore-scripts`, apply the steps in the upgrade guide, then run `wxt prepare`
- **Chrome Web Store API v1 stops working on 15 October 2026** — rerun `wxt submit init` and choose v2 (service-account auth)
- **When not to use** — an existing extension with a working custom build gains little; Safari still needs Xcode on macOS
