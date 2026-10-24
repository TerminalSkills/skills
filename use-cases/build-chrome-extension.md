---
title: Build a Chrome Extension
slug: build-chrome-extension
description: Build a Chrome extension with Manifest V3, content scripts, a background service worker, and a popup UI. Inject custom UI into any website, sync settings, and publish to the Chrome Web Store.
skills:
  - typescript
  - react
  - vite
category: development
tags:
  - chrome
  - browser-extension
  - manifest-v3
  - content-script
  - productivity
---

# Build a Chrome Extension

## The Problem

Leon is a developer who spends hours on GitHub, Jira, and Notion. He wants a browser extension that shows time-tracking overlays on any page, saves reading progress, and lets him quickly capture notes with a keyboard shortcut — without switching apps. Chrome's Manifest V3 extension platform makes this possible, but the architecture (content scripts, service workers, popup) has strict boundaries.

## The Solution

A Manifest V3 extension has three parts that cannot share memory: a **content script** (runs inside the page, can touch the DOM, cannot use most `chrome.*` APIs), a **service worker** (no DOM, stopped when idle, so state lives in `chrome.storage`), and a **popup** (a small web page, here React). They talk through `chrome.runtime.sendMessage`. [TypeScript](/skills/typescript) types all three, [React](/skills/react) renders the popup, and [Vite](/skills/vite) builds them. Check the setup with `npm i react react-dom && npm i -D vite @vitejs/plugin-react typescript @types/chrome @types/react @types/react-dom @types/node`.

## Step-by-Step Walkthrough

### Step 1: Manifest

Request only the permissions you use: no `tabs` (the active-tab query below needs none), no `host_permissions` (content scripts get their hosts from `matches`). Fewer permissions mean an easier store review and a less alarming install prompt. Put it in `public/manifest.json` so Vite copies it to `dist/`; also add `public/icons/icon48.png`, which the notification uses.

```json
{
  "manifest_version": 3,
  "name": "FocusFlow",
  "version": "1.0.0",
  "description": "Time tracking and quick notes for any website",
  "permissions": ["storage", "alarms", "notifications"],
  "background": { "service_worker": "background.js", "type": "module" },
  "content_scripts": [
    { "matches": ["https://*/*"], "js": ["content.js"], "run_at": "document_idle" }
  ],
  "action": { "default_popup": "popup.html" },
  "commands": {
    "capture_note": {
      "suggested_key": { "default": "Alt+Shift+N" },
      "description": "Capture a quick note"
    }
  }
}
```

### Step 2: Content script

Page text is untrusted. The modal is built with `textContent` inside a closed shadow root; interpolating `document.title` into `innerHTML` would let a hostile page inject script-capable markup into your UI.

```typescript
// Content script: runs in an isolated world on every matched page.
const REPORT_EVERY_S = 15;

// Count only the seconds the tab is visible and report them in batches.
setInterval(() => {
  if (document.visibilityState !== "visible") return;
  chrome.runtime.sendMessage({
    type: "TRACK_TIME",
    payload: { domain: location.hostname, seconds: REPORT_EVERY_S },
  }).catch(() => {}); // the service worker may be restarting
}, REPORT_EVERY_S * 1000);

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "CAPTURE_NOTE") showNoteModal();
});

function showNoteModal() {
  if (document.getElementById("focusflow-host")) return;
  // A shadow root keeps the page's CSS out of the modal and ours out of the page.
  const host = document.createElement("div");
  host.id = "focusflow-host";
  const root = host.attachShadow({ mode: "closed" });

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;top:20%;left:50%;transform:translateX(-50%);z-index:2147483647;" +
    "width:360px;padding:16px;background:#fff;color:#111;border-radius:8px;" +
    "box-shadow:0 8px 32px rgba(0,0,0,.3);font:14px system-ui";

  const source = document.createElement("p");
  source.textContent = document.title; // textContent, never innerHTML: page titles are untrusted
  const area = document.createElement("textarea");
  area.style.cssText = "width:100%;height:100px;box-sizing:border-box";
  const save = document.createElement("button");
  save.textContent = "Save";
  const cancel = document.createElement("button");
  cancel.textContent = "Cancel";

  save.onclick = async () => {
    if (area.value.trim()) {
      await chrome.runtime.sendMessage({
        type: "SAVE_NOTE",
        payload: { text: area.value, url: location.href, title: document.title, timestamp: Date.now() },
      });
    }
    host.remove();
  };
  cancel.onclick = () => host.remove();

  box.append(source, area, save, cancel);
  root.append(box);
  document.body.append(host);
  area.focus();
}
```

### Step 3: Service worker

Message handlers and command listeners must be registered synchronously at the top level, or the worker misses the event that woke it. Anything kept in a variable is lost when the worker stops, which is why notes and time live in `chrome.storage.local`.

```typescript
// Service worker: no DOM, and it is stopped when idle, so keep state in chrome.storage.
export interface Note { text: string; url: string; title: string; timestamp: number }

// Listeners must be registered synchronously at the top level.
chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture_note") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "CAPTURE_NOTE" }).catch(() => {});
});

// Handlers run one at a time: two tabs reporting at once would otherwise read the same
// storage value and overwrite each other's update.
let queue: Promise<unknown> = Promise.resolve();

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const result = queue.then(() => handle(message));
  queue = result.catch(() => {});
  result.then(sendResponse);
  return true; // keep the channel open for the async response
});

async function handle(message: { type: string; payload?: any }) {
  switch (message.type) {
    case "SAVE_NOTE": {
      const { notes = [] } = await chrome.storage.local.get<{ notes?: Note[] }>("notes");
      await chrome.storage.local.set({ notes: [message.payload, ...notes].slice(0, 500) });
      return { ok: true };
    }
    case "GET_NOTES":
      return (await chrome.storage.local.get<{ notes?: Note[] }>("notes")).notes ?? [];
    case "TRACK_TIME": {
      const { time = {} } = await chrome.storage.local.get<{ time?: Record<string, number> }>("time");
      const { domain, seconds } = message.payload;
      time[domain] = (time[domain] ?? 0) + seconds;
      await chrome.storage.local.set({ time });
      return { ok: true };
    }
    case "GET_STATS":
      return (await chrome.storage.local.get<{ time?: Record<string, number> }>("time")).time ?? {};
  }
}

// Alarms persist across worker restarts; create once.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("daily_summary", { delayInMinutes: 1, periodInMinutes: 24 * 60 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== "daily_summary") return;
  const { time = {} } = await chrome.storage.local.get<{ time?: Record<string, number> }>("time");
  const top = Object.entries(time).sort((a, b) => b[1] - a[1])[0];
  if (top) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icons/icon48.png",
      title: "FocusFlow summary",
      message: `Top site: ${top[0]} (${Math.round(top[1] / 60)} min)`,
    });
  }
});
```

### Step 4: Popup

`chrome.storage.sync` is small (about 100 KB in total, 8 KB per item) and follows the user across signed-in browsers, so it holds settings only; notes stay in `local`.

```typescript
// src/popup/App.tsx
import { useEffect, useState } from "react";
import type { Note } from "../background";

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [tab, setTab] = useState<"notes" | "time">("notes");
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    chrome.storage.sync.get<{ theme?: string }>("theme").then((d) => d.theme && setTheme(d.theme));
    chrome.runtime.sendMessage({ type: "GET_NOTES" }).then(setNotes);
    chrome.runtime.sendMessage({ type: "GET_STATS" }).then(setStats);
  }, []);

  const changeTheme = (value: string) => {
    setTheme(value);
    chrome.storage.sync.set({ theme: value }); // synced across the user's signed-in browsers
  };

  return (
    <div className={`popup ${theme}`} style={{ width: 360, minHeight: 300 }}>
      <button onClick={() => setTab("notes")}>Notes</button>
      <button onClick={() => setTab("time")}>Time</button>
      {tab === "notes" ? (
        notes.length === 0 ? <p>No notes yet. Press Alt+Shift+N on a page.</p> :
        notes.map((n) => (
          <div key={n.timestamp}>
            <p>{n.text}</p>
            <small>{new URL(n.url).hostname} · {new Date(n.timestamp).toLocaleDateString()}</small>
          </div>
        ))
      ) : (
        Object.entries(stats).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([domain, s]) => (
          <div key={domain}>{domain}: {Math.round(s / 60)} min</div>
        ))
      )}
      <select value={theme} onChange={(e) => changeTheme(e.target.value)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </div>
  );
}
```

`src/popup/main.tsx` mounts it with `createRoot`, and `popup.html` loads that file.

### Step 5: Build with Vite

A content script is loaded as a classic script and cannot `import` shared chunks, so build it separately as one self-contained IIFE. The popup and the module-type service worker can use the normal multi-entry build. Set `"type": "module"` in `package.json` so Vite loads the two config files without an ESM warning.

```typescript
// vite.config.ts: popup + service worker
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

// Popup + service worker. Both may use ES modules and shared chunks.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, "popup.html"),
        background: resolve(import.meta.dirname, "src/background/index.ts"),
      },
      output: { entryFileNames: "[name].js", chunkFileNames: "chunks/[name]-[hash].js", assetFileNames: "assets/[name]-[hash][extname]" },
    },
  },
});
```

```typescript
// vite.content.config.ts: content script
import { defineConfig } from "vite";
import { resolve } from "node:path";

// Content script: one self-contained classic script (no import statements).
export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: false,
    lib: { entry: resolve(import.meta.dirname, "src/content/index.ts"), formats: ["iife"], name: "focusflowContent", fileName: () => "content.js" },
  },
});
```

```bash
npx vite build && npx vite build -c vite.content.config.ts
```

During development open `chrome://extensions`, enable Developer mode, choose **Load unpacked** and select `dist/`. After each rebuild press the reload icon on the extension card.

### Step 6: Publish

Zip the contents of `dist/` (`cd dist && zip -r ../extension.zip .`) and upload it in the [Chrome Web Store developer dashboard](https://developer.chrome.com/docs/webstore/register). Registration needs a one-time fee. The listing needs 1280x800 (or 640x400) screenshots, a description, and a justification for each permission. Review usually takes a few days and can take a few weeks.

## Real-World Example

Leon spends his day on GitHub, Jira and Notion. FocusFlow adds a note capture on Alt+Shift+N, counts the seconds each domain is visible, and shows the top ten sites in the popup. Because notes and counters live in `chrome.storage.local`, they survive the service worker stopping. After the first build he loads `dist/` unpacked, checks the shortcut on a few sites (if another extension owns Alt+Shift+N he rebinds it at `chrome://extensions/shortcuts`), and then submits the zip.

## Related Skills

- [typescript](/skills/typescript) - typed messages and storage
- [react](/skills/react) - popup UI
- [vite](/skills/vite) - multi-entry build
