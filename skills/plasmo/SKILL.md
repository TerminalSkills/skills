---
name: plasmo
description: >-
  Plasmo is a framework for building browser extensions with React and TypeScript:
  it generates the Manifest V3 file from your code, bundles popups, content
  scripts, background workers and options pages, and gives you hot reload. Use when
  a user asks to "build a Chrome extension", "create a browser extension with
  React", "add a content script UI", "use Plasmo storage or messaging", or "package
  an extension for the Chrome Web Store or Firefox".
license: Apache-2.0
compatibility: "Node.js 18+, pnpm/npm/yarn. Chrome/Chromium (MV3), Firefox and Edge targets."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["chrome-extension", "browser", "react", "typescript", "manifest-v3"]
  repository: https://github.com/PlasmoHQ/plasmo
---

# Plasmo

## Overview

Plasmo is a build framework for browser extensions. File names are the configuration: `popup.tsx` becomes the popup, files in `contents/` become content scripts, `background.ts` becomes the service worker, `options.tsx` the options page. The `manifest.json` is generated, with overrides in `package.json`. `plasmo dev` rebuilds with live reload into `build/chrome-mv3-dev`; `plasmo build` writes `build/chrome-mv3-prod`. Companion packages: `@plasmohq/storage` and `@plasmohq/messaging`.

Maintenance note: the latest npm releases are `plasmo` 0.90.5 (May 2025), `@plasmohq/storage` 1.15.0 and `@plasmohq/messaging` 0.7.2. If a user is starting a new project and open to alternatives, WXT is another actively used extension framework; do not migrate an existing Plasmo project unprompted.

## Instructions

### Project setup

```bash
pnpm create plasmo                       # interactive; or: pnpm create plasmo --with-tailwindcss my-extension
cd my-extension
pnpm dev                                 # then load build/chrome-mv3-dev via chrome://extensions > Load unpacked
pnpm build                               # production bundle in build/chrome-mv3-prod
pnpm package                             # same plus a .zip for store upload
pnpm build --target=firefox-mv2          # firefox-mv3 is experimental
```

Everything lives at the project root by default; a `src/` directory is optional (follow the docs' src guide to enable it). Permissions and manifest overrides go under `manifest` in `package.json`:

```json
{ "manifest": { "host_permissions": ["https://github.com/*"], "permissions": ["alarms", "contextMenus"] } }
```

Use `.env.chrome` / `.env.firefox` and `process.env.PLASMO_BROWSER` for target-specific values; only `PLASMO_PUBLIC_*` variables reach client code.

### Popup

```tsx
// popup.tsx
import { useStorage } from "@plasmohq/storage/hook"

function IndexPopup() {
  const [enabled, setEnabled] = useStorage<boolean>("isEnabled", true)
  return (
    <div style={{ padding: 16, width: 320 }}>
      <h2>Repo Notes</h2>
      <button onClick={() => setEnabled(!enabled)}>{enabled ? "Enabled" : "Disabled"}</button>
    </div>
  )
}
export default IndexPopup
```

### Content scripts and content-script UI

A `.tsx` file in `contents/` that default-exports a React component is mounted into the page inside a Shadow DOM (overlay on `document.body` unless you export an anchor).

```tsx
// contents/repo-overlay.tsx
import cssText from "data-text:~contents/repo-overlay.css"
import type { PlasmoCSConfig, PlasmoGetOverlayAnchor, PlasmoGetStyle } from "plasmo"

export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"],
  run_at: "document_idle"
}

// Styles for the shadow DOM must be injected here
export const getStyle: PlasmoGetStyle = () => {
  const style = document.createElement("style")
  style.textContent = cssText
  return style
}

export const getOverlayAnchor: PlasmoGetOverlayAnchor = async () =>
  document.querySelector(".repository-content")

export default function RepoOverlay() {
  const copy = () => {
    const name = document.querySelector("[itemprop='name'] a")?.textContent?.trim()
    return navigator.clipboard.writeText(name ?? "")
  }
  return <button className="repo-btn" onClick={copy}>Copy repo name</button>
}
```

Other exports: `getInlineAnchor` / `getInlineAnchorList` / `getOverlayAnchorList` (anchor types are `"inline"` or `"overlay"`), `getRootContainer` (replaces the Shadow DOM, which disables `getStyle`), `render`. The `css` array in `config` applies to the host page itself, not the shadow root; use it only for things like `@font-face`. A content script without UI is a `.ts` file exporting `config` and running its code at top level. Use `world: "MAIN"` in `config` to run in the page's JS context (no extension APIs there).

### Background service worker and messaging

`@plasmohq/messaging` handlers are files in `background/messages/<name>.ts`; `sendToBackground` calls them by file name. There is no `sendToContentScript` in this package: use `chrome.tabs.sendMessage(tabId, ...)` for background-or-popup to content script.

```ts
// background/messages/save-item.ts
import type { PlasmoMessaging } from "@plasmohq/messaging"
import { Storage } from "@plasmohq/storage"

const storage = new Storage({ area: "local" })

const handler: PlasmoMessaging.MessageHandler<{ url: string; title: string }> = async (req, res) => {
  const items = (await storage.get<object[]>("savedItems")) ?? []
  items.push({ ...req.body, savedAt: Date.now() })
  await storage.set("savedItems", items)
  chrome.action.setBadgeText({ text: String(items.length) })
  res.send({ success: true, count: items.length })
}
export default handler
```

```ts
// from a content script or popup
import { sendToBackground } from "@plasmohq/messaging"
const { count } = await sendToBackground({ name: "save-item", body: { url: location.href, title: document.title } })
```

Long-lived connections use `background/ports/<name>.ts` with `getPort()` / `usePort()`. To let a web page talk to the background through a content script, use `relayMessage` in the script and `sendToBackgroundViaRelay` from the page. Put alarms and context menus in `background.ts` (or `background/index.ts`) and register listeners at top level, since MV3 workers are stopped when idle and wake on events:

```ts
// background.ts
chrome.runtime.onInstalled.addListener(() =>
  chrome.contextMenus.create({ id: "save-selection", title: "Save selection", contexts: ["selection"] }))
chrome.alarms.create("sync-data", { periodInMinutes: 30 })
```

### Storage

`@plasmohq/storage` adds the `storage` permission automatically. `new Storage()` uses the **sync** area by default (Chrome limits it to about 8 KB per item and 100 KB total), so pass `{ area: "local" }` for lists and larger data. Values are JSON-serialized for you. `storage.watch({ key: cb })` reacts to changes; `@plasmohq/storage/secure` encrypts values with a password you supply. Never store an API key you cannot afford to expose: extension storage is readable by anyone with the machine.

### Other pages

`options.tsx` (options page), `newtab.tsx`, `sidepanel.tsx`, `devtools.tsx` and `tabs/<name>.tsx` (extra pages opened via `chrome.runtime.getURL("tabs/<name>.html")`) follow the same default-export-a-component rule. For Firefox, add a fixed add-on ID under `manifest.browser_specific_settings.gecko.id` in `package.json` or storage and messaging fail in development.

## Examples

### Example 1: Highlight words on a page from a popup toggle

**User request:** "Build a Chrome extension with a popup switch that highlights every 'TODO' on any page."

Run `pnpm create plasmo todo-highlighter`, add `"host_permissions": ["https://*/*"]` under `manifest` in `package.json`, create `contents/highlight.ts` exporting `config = { matches: ["https://*/*"] }` that reads `new Storage().get("isEnabled")` and wraps matching text nodes, and subscribes with `storage.watch`. The popup uses `useStorage("isEnabled", true)` as above. `pnpm dev`, load `build/chrome-mv3-dev` unpacked; flipping the switch updates open tabs without messaging code.

### Example 2: Save selected text from a context menu with a badge

**User request:** "Right-click selected text, save it, and show the number saved on the icon."

Add the `contextMenus` permission, create the menu in `background.ts` `onInstalled` as above, and in `chrome.contextMenus.onClicked` call the same save logic as `background/messages/save-item.ts` (extract it to a shared module). The popup reads the list with `useStorage<object[]>("savedItems", [])` after creating the `Storage` with `area: "local"` in both places. Result: badge shows `1`, `2`, ... and the popup lists the items.

## Guidelines

- Plasmo emits Manifest V3 for Chrome; service workers sleep, so keep state in storage, not in module variables.
- Request the fewest permissions and host patterns; broad host patterns like `https://*/*` slows store review.
- Style content-script UI through `getStyle`; page CSS cannot reach into the Shadow DOM, which is the point.
- Match the storage `area` across every component that reads a key; `sync` and `local` are separate stores.
- Build and test each target you ship (`chrome-mv3`, `firefox-mv2`); Firefox MV3 is experimental.
- Keep content scripts small: they load on every matched page.
- Do not hard-code secrets in the bundle; anything in the extension package is public.
