---
name: plasmo
description: Expert guidance for Plasmo, the framework for building browser extensions with React, TypeScript, and modern tooling. Helps developers create Chrome and Firefox extensions with content scripts, background workers, popup UIs, and messaging — all with hot reload and zero webpack config.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
  - chrome-extension
  - browser
  - react
  - typescript
  - manifest-v3
---

# Plasmo — Browser Extension Framework


## Overview


Plasmo, the framework for building browser extensions with React, TypeScript, and modern tooling. Helps developers create Chrome and Firefox extensions with content scripts, background workers, popup UIs, and messaging — all with hot reload and zero webpack config.


## Instructions

### Project Setup

Create a new extension with Plasmo CLI:

```bash
# Create a new extension project
pnpm create plasmo my-extension
# Or with a specific template
pnpm create plasmo --with-tailwindcss my-extension

# Development with hot reload
pnpm dev
# Build for production
pnpm build
# Package for Chrome Web Store
pnpm package
```

### Popup UI

Build the extension popup as a React component:

```tsx
// src/popup.tsx — Main popup UI (click the extension icon)
import { useState, useEffect } from "react";
import { Storage } from "@plasmohq/storage";

const storage = new Storage();

function IndexPopup() {
  const [savedCount, setSavedCount] = useState(0);
  const [isEnabled, setIsEnabled] = useState(true);

  useEffect(() => {
    // Load state from extension storage (persists across sessions)
    storage.get<number>("savedCount").then((count) => setSavedCount(count ?? 0));
    storage.get<boolean>("isEnabled").then((enabled) => setIsEnabled(enabled ?? true));
  }, []);

  const toggleExtension = async () => {
    const newState = !isEnabled;
    setIsEnabled(newState);
    await storage.set("isEnabled", newState);
    // Notify content scripts about the state change
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, { type: "TOGGLE", enabled: newState });
    }
  };

  return (
    <div style={{ padding: 16, width: 320 }}>
      <h2>My Extension</h2>
      <p>Saved items: {savedCount}</p>
      <button onClick={toggleExtension}>
        {isEnabled ? "🟢 Enabled" : "🔴 Disabled"}
      </button>
    </div>
  );
}

export default IndexPopup;
```

### Content Scripts

Inject UI and logic into web pages:

```tsx
// src/contents/overlay.tsx — Content script that renders a React component on any page
import type { PlasmoCSConfig, PlasmoGetOverlayAnchor } from "plasmo";
import { useState } from "react";

// Configure which pages this content script runs on
export const config: PlasmoCSConfig = {
  matches: ["https://github.com/*"],           // Only on GitHub
  css: ["contents/overlay.css"],                // Optional custom CSS
};

// Anchor the overlay to a specific DOM element (optional)
export const getOverlayAnchor: PlasmoGetOverlayAnchor = async () => {
  return document.querySelector(".repository-content");
};

// The React component renders as an overlay on the page
function GitHubOverlay() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="plasmo-overlay">
      <button onClick={() => setIsOpen(!isOpen)}>
        📋 Quick Actions
      </button>
      {isOpen && (
        <div className="plasmo-panel">
          <button onClick={() => copyRepoInfo()}>Copy repo info</button>
          <button onClick={() => analyzeReadme()}>Analyze README</button>
        </div>
      )}
    </div>
  );
}

async function copyRepoInfo() {
  const title = document.querySelector("[itemprop='name'] a")?.textContent?.trim();
  const desc = document.querySelector("[itemprop='about']")?.textContent?.trim();
  const stars = document.querySelector("#repo-stars-counter-star")?.textContent?.trim();
  await navigator.clipboard.writeText(`${title}: ${desc} (⭐ ${stars})`);
}

export default GitHubOverlay;
```

### Background Service Worker

Handle long-running tasks, alarms, and cross-tab communication:

```typescript
// src/background.ts — Background service worker (Manifest V3)
import { Storage } from "@plasmohq/storage";

const storage = new Storage();

// Listen for messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "SAVE_ITEM":
      handleSaveItem(message.data).then(sendResponse);
      return true;     // Keep the message channel open for async response

    case "GET_STATS":
      getStats().then(sendResponse);
      return true;
  }
});

async function handleSaveItem(data: { url: string; title: string; content: string }) {
  const items = (await storage.get<any[]>("savedItems")) ?? [];
  items.push({ ...data, savedAt: Date.now() });
  await storage.set("savedItems", items);

  // Update badge count
  const count = items.length;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : "" });
  chrome.action.setBadgeBackgroundColor({ color: "#6366f1" });

  return { success: true, count };
}

// Set up periodic tasks with alarms
chrome.alarms.create("sync-data", { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "sync-data") {
    const items = (await storage.get<any[]>("savedItems")) ?? [];
    if (items.length > 0) {
      // Sync to your backend API
      await fetch("https://api.example.com/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items }),
      });
    }
  }
});

// Context menu (right-click menu)
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "save-selection",
    title: "Save selection to My Extension",
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "save-selection" && info.selectionText) {
    handleSaveItem({
      url: tab?.url ?? "",
      title: tab?.title ?? "",
      content: info.selectionText,
    });
  }
});
```

### Messaging Between Components

Type-safe communication between popup, content scripts, and background:

```typescript
// src/messaging.ts — Type-safe messaging with Plasmo messaging API
import { sendToBackground, sendToContentScript } from "@plasmohq/messaging";

// Define message types
interface SaveRequest { url: string; title: string; }
interface SaveResponse { success: boolean; id: string; }

// From content script → background
async function saveFromContentScript(data: SaveRequest): Promise<SaveResponse> {
  return sendToBackground({
    name: "save-item",        // Maps to src/background/messages/save-item.ts
    body: data,
  });
}

// From popup → content script
async function highlightElements() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return sendToContentScript({
    name: "highlight",
    tabId: tabs[0].id!,
    body: { selector: "h1, h2, h3" },
  });
}
```

```typescript
// src/background/messages/save-item.ts — Background message handler
import type { PlasmoMessaging } from "@plasmohq/messaging";

const handler: PlasmoMessaging.MessageHandler = async (req, res) => {
  const { url, title } = req.body;

  // Process the save request
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ [id]: { url, title, savedAt: Date.now() } });

  res.send({ success: true, id });
};

export default handler;
```

### Storage with React Hooks

Reactive storage that syncs across extension components:

```tsx
// src/popup.tsx — Using storage hooks for reactive state
import { useStorage } from "@plasmohq/storage/hook";

function SettingsPopup() {
  // useStorage provides React state that persists and syncs
  // Changes in popup instantly reflect in content scripts and vice versa
  const [theme, setTheme] = useStorage<string>("theme", "light");
  const [apiKey, setApiKey] = useStorage<string>("apiKey", "");
  const [savedItems, setSavedItems] = useStorage<any[]>("savedItems", []);

  return (
    <div style={{ padding: 16, width: 350 }}>
      <h3>Settings</h3>

      <label>Theme</label>
      <select value={theme} onChange={(e) => setTheme(e.target.value)}>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>

      <label>API Key</label>
      <input
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Enter your API key"
      />

      <h3>Saved Items ({savedItems.length})</h3>
      <ul>
        {savedItems.slice(-5).map((item, i) => (
          <li key={i}>{item.title}</li>
        ))}
      </ul>
    </div>
  );
}
```

### Options Page

Full-page settings interface:

```tsx
// src/options.tsx — Extension options page (chrome-extension://id/options.html)
function OptionsPage() {
  const [settings, setSettings] = useStorage("settings", {
    autoSave: true,
    notifications: true,
    syncInterval: 30,
    excludedSites: [] as string[],
  });

  const updateSetting = (key: string, value: any) => {
    setSettings({ ...settings, [key]: value });
  };

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 20 }}>
      <h1>Extension Settings</h1>
      <div>
        <label>
          <input type="checkbox" checked={settings.autoSave}
            onChange={(e) => updateSetting("autoSave", e.target.checked)} />
          Auto-save highlighted text
        </label>
      </div>
      <div>
        <label>Sync interval (minutes)</label>
        <input type="number" value={settings.syncInterval}
          onChange={(e) => updateSetting("syncInterval", parseInt(e.target.value))} />
      </div>
    </div>
  );
}

export default OptionsPage;
```

## Installation

```bash
pnpm create plasmo my-extension
cd my-extension
pnpm dev     # Start dev server with hot reload
```


## Examples


### Example 1: Setting up Plasmo with a custom configuration

**User request:**

```
I just installed Plasmo. Help me configure it for my TypeScript + React workflow with my preferred keybindings.
```

The agent creates the configuration file with TypeScript-aware settings, configures relevant plugins/extensions for React development, sets up keyboard shortcuts matching the user's preferences, and verifies the setup works correctly.

### Example 2: Extending Plasmo with custom functionality

**User request:**

```
I want to add a custom popup ui to Plasmo. How do I build one?
```

The agent scaffolds the extension/plugin project, implements the core functionality following Plasmo's API patterns, adds configuration options, and provides testing instructions to verify it works end-to-end.


## Guidelines

1. **Manifest V3 by default** — Plasmo generates MV3 manifests; service workers replace persistent background pages
2. **Use Plasmo storage over chrome.storage** — `@plasmohq/storage` provides React hooks and cross-component sync
3. **Content script isolation** — Plasmo uses Shadow DOM for content script UIs; your CSS won't leak into the page
4. **Minimize permissions** — Request only the permissions you need in `package.json` under `manifest.permissions`
5. **Hot reload in dev** — `pnpm dev` auto-reloads the extension on file changes; no manual refresh needed
6. **Type your messages** — Use Plasmo's messaging API for type-safe communication between components
7. **Test across browsers** — Build for both Chrome (`pnpm build --target=chrome-mv3`) and Firefox (`--target=firefox-mv3`)
8. **Bundle size matters** — Extensions load on every page; keep content scripts small, lazy-load heavy logic
