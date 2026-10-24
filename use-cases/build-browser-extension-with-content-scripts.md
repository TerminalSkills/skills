---
title: Build a Browser Extension with Content Scripts
slug: build-browser-extension-with-content-scripts
description: Build a Chrome/Firefox browser extension with content scripts, a background worker, popup UI, and local storage - adding AI-powered highlighting and summaries to any website with a cross-browser Manifest V3 architecture.
skills:
  - typescript
  - zod
  - tailwindcss
category: development
tags:
  - browser-extension
  - chrome
  - content-scripts
  - web-platform
  - ai
---

# Build a Browser Extension with Content Scripts

## The Problem

Priya is a product manager who spends hours each day reading competitor websites, product reviews, and support forums. She copies key points into a spreadsheet, then summarizes them for the team. She wants an extension that lets her select text on any page, get an AI summary, organize highlights by project, and export them. It must not break the pages it runs on, and it must work in both Chrome and Firefox.

## The Solution

A Manifest V3 extension with three parts that talk through typed messages: a content script that draws the selection toolbar, a background worker that owns storage and the AI call, and a popup for the API key and the highlight list. TypeScript (`typescript` skill) types the code against `@types/chrome`, Zod (`zod` skill) validates every message the worker receives, and Tailwind v4 (`tailwindcss` skill) styles the popup. esbuild bundles each entry point.

## Step-by-Step Walkthrough

### 1. Set up the project

```bash
npm init -y && npm install zod && npm install -D typescript esbuild @types/chrome tailwindcss @tailwindcss/cli
```

`tsconfig.json`: `"strict": true`, `"moduleResolution": "Bundler"`, `"lib": ["ES2022", "DOM"]`, `"types": ["chrome"]`, `"noEmit": true`. Source goes in `src/{lib,background,content,popup}`.

### 2. Define the message protocol with Zod

Content scripts run inside untrusted pages and the popup is a second sender, so the worker must not trust the shape of a message. A discriminated union validates it and gives the handler a typed value.

```typescript
// src/lib/messages.ts
import { z } from "zod";

export const Message = z.discriminatedUnion("type", [
  z.object({ type: z.literal("SUMMARIZE_TEXT"), text: z.string().min(10).max(8000), context: z.string().max(300) }),
  z.object({
    type: z.literal("SAVE_HIGHLIGHT"),
    text: z.string().min(1).max(8000),
    summary: z.string().default(""),
    project: z.string().default("default"),
  }),
  z.object({ type: z.literal("GET_HIGHLIGHTS"), project: z.string().optional() }),
  z.object({ type: z.literal("EXPORT_HIGHLIGHTS"), project: z.string().optional() }),
]);
export type Message = z.infer<typeof Message>;

export const Highlight = z.object({ id: z.string(), text: z.string(), url: z.string(), title: z.string(),
  summary: z.string(), project: z.string(), createdAt: z.string() });
export type Highlight = z.infer<typeof Highlight>;
```

### 3. Store data in the right area

`chrome.storage.sync` holds 100 KB in total and 8 KB per item, so it cannot hold a research library; it also copies data to the browser vendor's cloud. Keep highlights and the API key in `storage.local` (about 10 MB, stays on the device) and use `sync` only for small settings such as the model name.

```typescript
// src/lib/storage.ts
import { z } from "zod";
import { Highlight } from "./messages";

export async function getHighlights(project?: string): Promise<Highlight[]> {
  const all = z.array(Highlight).catch([]).parse((await chrome.storage.local.get("highlights")).highlights);
  return project ? all.filter((h) => h.project === project) : all;
}

export async function addHighlight(h: Highlight): Promise<number> {
  const all = await getHighlights();
  all.push(h);
  await chrome.storage.local.set({ highlights: all });
  return all.length;
}

export async function getApiKey(): Promise<string | undefined> {
  return (await chrome.storage.local.get("openaiApiKey")).openaiApiKey as string | undefined;
}

export async function getModel(): Promise<string> {
  const { model } = await chrome.storage.sync.get("model");
  return typeof model === "string" && model ? model : "gpt-5.4-mini";
}
```

### 4. Write the background worker

Create context menus inside `onInstalled`: the worker restarts often, and creating the same menu id at top level throws on every restart. Return `true` from the message listener when you answer asynchronously.

```typescript
// src/background/service-worker.ts
import { Message } from "../lib/messages";
import * as Storage from "../lib/storage";

chrome.runtime.onInstalled.addListener(() => {
  // Create menus here, not at top level: the worker restarts often and a repeated id throws.
  chrome.contextMenus.create({ id: "summarize-selection", title: "Summarize with AI", contexts: ["selection"] });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "summarize-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_SUMMARIZE" });
  }
});

chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
  const parsed = Message.safeParse(raw);
  if (!parsed.success) return void sendResponse({ error: "Invalid message" });
  handle(parsed.data, sender).then(sendResponse, (e: Error) => sendResponse({ error: e.message }));
  return true; // keep the channel open for the async response
});

async function handle(msg: Message, sender: chrome.runtime.MessageSender) {
  switch (msg.type) {
    case "SUMMARIZE_TEXT":
      return { summary: await summarize(msg.text, msg.context) };
    case "SAVE_HIGHLIGHT": {
      const count = await Storage.addHighlight({
        id: crypto.randomUUID(), text: msg.text, summary: msg.summary, project: msg.project,
        url: sender.tab?.url ?? "", title: sender.tab?.title ?? "", createdAt: new Date().toISOString(),
      });
      await chrome.action.setBadgeText({ text: String(count) });
      return { saved: true };
    }
    case "GET_HIGHLIGHTS":
      return { highlights: await Storage.getHighlights(msg.project) };
    case "EXPORT_HIGHLIGHTS": {
      const items = await Storage.getHighlights(msg.project);
      const markdown = items
        .map((h) => `## ${h.title}\n\n> ${h.text}\n\n**Summary:** ${h.summary}\n\n[Source](${h.url}) - ${h.createdAt}\n`)
        .join("\n---\n\n");
      return { markdown };
    }
  }
}

async function summarize(text: string, context: string): Promise<string> {
  const apiKey = await Storage.getApiKey();
  if (!apiKey) return "Add your OpenAI API key in the extension popup to enable summaries.";
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: await Storage.getModel(),
      messages: [
        { role: "system", content: "Summarize the highlighted text in 1-2 sentences. Focus on key insights." },
        { role: "user", content: `Page: ${context}\n\nHighlighted text:\n${text}` },
      ],
      max_completion_tokens: 600, // reasoning models spend part of this budget before answering
    }),
  });
  if (!res.ok) throw new Error(`OpenAI returned ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No summary returned.";
}
```

The model name is a setting because vendors retire models; pick a current small model from the OpenAI model page and store it with `chrome.storage.sync.set({ model })`. The request uses Chat Completions with `max_completion_tokens`. The API key lives in the user's own browser, and the call goes straight from the extension to OpenAI, so there is no server of yours to secure.

### 5. Write the content script

The toolbar is drawn inside a closed shadow root, so page CSS cannot restyle it and it cannot leak styles into the page. Clone the selection range before any `await`, because clicking a button clears the live selection. Model output is written with `textContent`, never `innerHTML`.

```typescript
// src/content/content-script.ts
// Everything is drawn inside a shadow root so page CSS cannot break the UI and ours cannot leak out.
let host: HTMLElement | undefined, lastPoint = { x: 100, y: 100 };

document.addEventListener("mouseup", (e) => {
  if (host && e.composedPath().includes(host)) return;
  lastPoint = { x: e.clientX, y: e.clientY };
  const sel = window.getSelection();
  if (sel && sel.toString().trim().length >= 10) showPopup(sel, lastPoint.x, lastPoint.y);
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === "TRIGGER_SUMMARIZE") {
    const sel = window.getSelection();
    if (sel && sel.toString().trim()) showPopup(sel, lastPoint.x, lastPoint.y, true);
  }
});

function ui(html: string, x: number, y: number): ShadowRoot {
  host?.remove();
  host = document.createElement("div");
  host.style.cssText = `all:initial;position:fixed;top:${Math.max(y - 50, 8)}px;left:${Math.min(x, innerWidth - 300)}px;z-index:2147483647`;
  const root = host.attachShadow({ mode: "closed" });
  root.innerHTML = `<style>
    .box{background:#fff;color:#111;border-radius:8px;box-shadow:0 4px 20px #0003;padding:8px;
      font:13px system-ui;display:flex;gap:6px;max-width:380px}
    button{padding:4px 10px;border:0;border-radius:4px;cursor:pointer;font:inherit;background:#eee}
    .go{background:#2e7d32;color:#fff}</style><div class="box">${html}</div>`;
  document.documentElement.appendChild(host);
  setTimeout(() => host?.remove(), 15000);
  return root;
}

function showPopup(sel: Selection, x: number, y: number, autoSummarize = false): void {
  const text = sel.toString().trim();
  const range = sel.getRangeAt(0).cloneRange(); // the live selection is cleared once the user clicks
  const root = ui(`<button id="save">Save</button><button id="sum" class="go">Summarize</button><button id="x">x</button>`, x, y);
  const q = (id: string) => root.getElementById(id) as HTMLButtonElement;
  const save = async (summary: string) => {
    await chrome.runtime.sendMessage({ type: "SAVE_HIGHLIGHT", text, summary });
    markRange(range);
  };
  q("save").onclick = async () => { await save(""); host?.remove(); };
  q("x").onclick = () => host?.remove();
  q("sum").onclick = async () => {
    q("sum").textContent = "Thinking...";
    const res = await chrome.runtime.sendMessage({ type: "SUMMARIZE_TEXT", text, context: document.title });
    if (res?.error || !res?.summary) return void ui(`<span>${res?.error ?? "No summary"}</span>`, x, y);
    await save(res.summary);
    const box = ui(`<span id="s"></span>`, x, y);
    box.getElementById("s")!.textContent = res.summary; // textContent: model output is untrusted
  };
  if (autoSummarize) q("sum").click();
}

function markRange(range: Range): void {
  try {
    const mark = document.createElement("mark");
    mark.style.background = "#ffeb3b80";
    range.surroundContents(mark);
  } catch { /* throws when the range crosses element boundaries; the highlight is saved anyway */ }
}
```

### 6. Build the popup with Tailwind

```html
<!-- src/popup/index.html -->
<!doctype html>
<meta charset="utf-8">
<link rel="stylesheet" href="popup.css">
<body class="w-80 space-y-3 p-3 font-sans">
  <h1 class="text-base font-semibold">AI Highlighter</h1>
  <div class="flex gap-2">
    <input id="key" type="password" placeholder="OpenAI API key" class="min-w-0 flex-1 rounded border px-2 py-1 text-sm">
    <button id="save-key" class="rounded bg-green-700 px-3 text-sm text-white">Save</button>
  </div>
  <ul id="list" class="max-h-64 space-y-2 overflow-y-auto"></ul>
  <button id="export" class="w-full rounded bg-slate-100 py-1 text-sm">Copy as Markdown</button>
  <script src="popup.js"></script>
</body>
```

`src/popup/popup.css` contains one line, `@import "tailwindcss";`. `popup.ts` reads the highlights with `GET_HIGHLIGHTS`, writes the key with `chrome.storage.local.set({ openaiApiKey })`, and copies the `EXPORT_HIGHLIGHTS` markdown to the clipboard.

### 7. Write one manifest for both browsers

Chrome supports only `background.service_worker`; Firefox runs Manifest V3 background code as an event page and only reads `scripts`. Listing both works in each (Chrome 121+ ignores `scripts`). Firefox also needs an extension ID for `storage.sync`, and requires one for new submissions to addons.mozilla.org.

```json
{
  "manifest_version": 3,
  "name": "AI Highlighter",
  "version": "1.0.0",
  "description": "Highlight text on any webpage, get AI summaries, and export your research",
  "permissions": ["storage", "contextMenus"],
  "host_permissions": ["https://api.openai.com/*"],
  "background": { "service_worker": "background/service-worker.js", "scripts": ["background/service-worker.js"] },
  "content_scripts": [{ "matches": ["<all_urls>"], "js": ["content/content-script.js"], "run_at": "document_idle" }],
  "action": { "default_popup": "popup/index.html" },
  "browser_specific_settings": { "gecko": { "id": "ai-highlighter@example.com" } }
}
```

### 8. Bundle and load

```bash
mkdir -p dist/popup && npx tsc --noEmit
npx esbuild src/background/service-worker.ts --bundle --format=esm --outfile=dist/background/service-worker.js
npx esbuild src/content/content-script.ts --bundle --format=iife --outfile=dist/content/content-script.js
npx esbuild src/popup/popup.ts --bundle --format=iife --outfile=dist/popup/popup.js
npx @tailwindcss/cli -i src/popup/popup.css -o dist/popup/popup.css
cp manifest.json dist/ && cp src/popup/index.html dist/popup/
```

Chrome: open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, select `dist/`. Firefox: open `about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on**, select `dist/manifest.json`. Open the popup, paste your key (saved in `storage.local`), select a sentence on any page, and click **Summarize**.

## Real-World Example

Priya's team reads about thirty competitor pages a week. She loads the extension in Chrome, creates a project per competitor, and highlights pricing changes and recurring complaints as she reads. On Friday she opens the popup, copies the Markdown export, and pastes it into the team's weekly note, with each quote linked to its source page. A teammate on Firefox loads the same `dist/` folder. Because the highlights stay in `storage.local`, nothing she reads leaves her machine except the text she chooses to summarize, which goes to OpenAI under her own key.

## Related Skills

- `typescript` - strict typing of the worker, content script and popup
- `zod` - validating messages and stored data at the trust boundary
- `tailwindcss` - Tailwind v4 CSS build for the popup
