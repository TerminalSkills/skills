---
title: Build a Figma Plugin
slug: build-figma-plugin
description: Build a Figma plugin that automates design tasks using the Figma Plugin API. Create nodes, access styles and variables, communicate between UI and main threads, and publish to the Figma Community.
skills:
  - typescript
  - figma-api
  - vite
category: development
tags:
  - figma
  - plugin
  - design-system
  - automation
  - design-tools
---

# Build a Figma Plugin

## The Problem

Diego is a design systems lead at a product company. His team has 500+ color tokens stored in a spreadsheet. Every time the brand updates, someone spends a full day manually updating styles in Figma. He wants a plugin that pulls tokens from their design token API and updates all Figma variables and styles in one click — and also helps teammates find and apply tokens without remembering names.

## Step 1: Plugin Manifest

```json
// manifest.json — Figma plugin manifest
{
  "name": "TokenSync",
  "id": "com.tokensync.plugin",
  "api": "1.0.0",
  "main": "dist/code.js",
  "ui": "dist/ui.html",
  "editorType": ["figma"],
  "networkAccess": {
    "allowedDomains": ["https://tokens.mycompany.com"]
  },
  "permissions": ["currentuser", "activeusers"]
}
```

## Step 2: Plugin Architecture

Figma plugins run in two sandboxed contexts that communicate via `postMessage`:
- **Main thread** (`code.ts`): Access to Figma API — nodes, styles, variables. No DOM, no fetch.
- **UI thread** (`ui.html`/`ui.ts`): DOM, fetch, React. No Figma API access.

```typescript
// src/code.ts — Main thread: Figma API access
figma.showUI(__html__, { width: 420, height: 580 });

// Handle messages from UI
figma.ui.onmessage = async (msg: PluginMessage) => {
  switch (msg.type) {
    case "SYNC_TOKENS":
      await syncTokensToVariables(msg.tokens);
      break;
    case "APPLY_TOKEN":
      await applyTokenToSelection(msg.tokenId, msg.property);
      break;
    case "GET_SELECTION_INFO":
      figma.ui.postMessage({ type: "SELECTION_INFO", data: getSelectionInfo() });
      break;
    case "CLOSE":
      figma.closePlugin();
      break;
  }
};

// Notify UI when selection changes
figma.on("selectionchange", () => {
  figma.ui.postMessage({ type: "SELECTION_INFO", data: getSelectionInfo() });
});

function getSelectionInfo() {
  const selection = figma.currentPage.selection;
  return {
    count: selection.length,
    types: [...new Set(selection.map((n) => n.type))],
    hasText: selection.some((n) => n.type === "TEXT"),
    hasFrame: selection.some((n) => n.type === "FRAME" || n.type === "COMPONENT"),
  };
}
```

## Step 3: Sync Tokens to Figma Variables

```typescript
// src/code.ts (continued)
interface DesignToken {
  id: string;
  name: string;
  value: string;
  type: "color" | "spacing" | "typography" | "radius";
  group: string;
}

async function syncTokensToVariables(tokens: DesignToken[]) {
  // Find or create a variable collection
  let collection = figma.variables.getLocalVariableCollections()
    .find((c) => c.name === "Design Tokens");

  if (!collection) {
    collection = figma.variables.createVariableCollection("Design Tokens");
  }

  const modeId = collection.defaultModeId;
  let synced = 0;
  let errors = 0;

  for (const token of tokens) {
    try {
      if (token.type === "color") {
        await syncColorToken(token, collection, modeId);
        synced++;
      } else if (token.type === "spacing" || token.type === "radius") {
        await syncNumberToken(token, collection, modeId);
        synced++;
      }
    } catch (e) {
      errors++;
      console.error(`Failed to sync token ${token.name}:`, e);
    }
  }

  figma.ui.postMessage({ type: "SYNC_COMPLETE", synced, errors });
  figma.notify(`✅ Synced ${synced} tokens${errors > 0 ? `, ${errors} errors` : ""}`);
}

async function syncColorToken(
  token: DesignToken,
  collection: VariableCollection,
  modeId: string
) {
  const existing = figma.variables.getLocalVariables("COLOR")
    .find((v) => v.name === `${token.group}/${token.name}`);

  const variable = existing ?? figma.variables.createVariable(
    `${token.group}/${token.name}`,
    collection,
    "COLOR"
  );

  const rgb = hexToRgb(token.value);
  variable.setValueForMode(modeId, { r: rgb.r / 255, g: rgb.g / 255, b: rgb.b / 255, a: 1 });
}

async function syncNumberToken(
  token: DesignToken,
  collection: VariableCollection,
  modeId: string
) {
  const existing = figma.variables.getLocalVariables("FLOAT")
    .find((v) => v.name === `${token.group}/${token.name}`);

  const variable = existing ?? figma.variables.createVariable(
    `${token.group}/${token.name}`,
    collection,
    "FLOAT"
  );

  variable.setValueForMode(modeId, parseFloat(token.value));
}

async function applyTokenToSelection(tokenId: string, property: string) {
  const variable = figma.variables.getVariableById(tokenId);
  if (!variable) return;

  for (const node of figma.currentPage.selection) {
    if (property === "fill" && "fills" in node) {
      const fills = [...(node.fills as Paint[])];
      if (fills.length > 0 && fills[0].type === "SOLID") {
        fills[0] = figma.variables.setBoundVariableForPaint(fills[0] as SolidPaint, "color", variable);
        node.fills = fills;
      }
    }
    if (property === "stroke" && "strokes" in node) {
      const strokes = [...(node.strokes as Paint[])];
      if (strokes.length > 0 && strokes[0].type === "SOLID") {
        strokes[0] = figma.variables.setBoundVariableForPaint(strokes[0] as SolidPaint, "color", variable);
        node.strokes = strokes;
      }
    }
  }
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!;
  return { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) };
}
```

## Step 4: UI Thread — React + Fetch External API

```typescript
// src/ui/App.tsx — UI thread (has DOM + fetch access)
import { useEffect, useState } from "react";

interface Token { id: string; name: string; value: string; type: string; group: string }

type Message = { type: string; [key: string]: any };

// Helper to send messages to main thread
function sendToPlugin(msg: Message) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

export default function App() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<any>(null);
  const [status, setStatus] = useState("");

  // Listen for messages from main thread
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;
      if (msg.type === "SELECTION_INFO") setSelection(msg.data);
      if (msg.type === "SYNC_COMPLETE") {
        setSyncing(false);
        setStatus(`✅ Synced ${msg.synced} tokens${msg.errors > 0 ? `, ${msg.errors} errors` : ""}`);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const fetchTokens = async () => {
    setLoading(true);
    try {
      // Fetch from external API (only possible in UI thread)
      const res = await fetch("https://tokens.mycompany.com/api/tokens", {
        headers: { Authorization: `Bearer ${process.env.TOKEN_API_KEY}` },
      });
      const data = await res.json();
      setTokens(data.tokens);
    } finally {
      setLoading(false);
    }
  };

  const syncAll = () => {
    setSyncing(true);
    sendToPlugin({ type: "SYNC_TOKENS", tokens });
  };

  const applyToken = (token: Token, property: string) => {
    sendToPlugin({ type: "APPLY_TOKEN", tokenId: token.id, property });
  };

  const filtered = tokens.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase()) || t.group.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ padding: 16, fontFamily: "Inter, sans-serif" }}>
      <h2 style={{ margin: "0 0 12px" }}>TokenSync</h2>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={fetchTokens} disabled={loading}>
          {loading ? "Loading..." : "Fetch Tokens"}
        </button>
        <button onClick={syncAll} disabled={syncing || tokens.length === 0} style={{ background: "#18a0fb", color: "#fff" }}>
          {syncing ? "Syncing..." : `Sync ${tokens.length} tokens`}
        </button>
      </div>

      {status && <p style={{ color: "green", margin: "0 0 8px", fontSize: 12 }}>{status}</p>}

      {tokens.length > 0 && (
        <>
          <input
            placeholder="Search tokens..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", marginBottom: 8, padding: "6px 8px", boxSizing: "border-box" }}
          />
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {filtered.map((token) => (
              <div key={token.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: "1px solid #eee" }}>
                {token.type === "color" && (
                  <div style={{ width: 20, height: 20, background: token.value, borderRadius: 4, border: "1px solid #ddd", flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{token.group}/{token.name}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{token.value}</div>
                </div>
                {token.type === "color" && selection && (
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => applyToken(token, "fill")} title="Apply as fill" style={{ fontSize: 11 }}>Fill</button>
                    <button onClick={() => applyToken(token, "stroke")} title="Apply as stroke" style={{ fontSize: 11 }}>Stroke</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

## Step 5: Build and Publish to Figma Community

```bash
# vite.config.ts — Build both main thread and UI
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        code: resolve(__dirname, "src/code.ts"),
        ui: resolve(__dirname, "src/ui/index.html"),
      },
      output: { entryFileNames: "[name].js" },
    },
  },
});

# Build
npm run build

# Test in Figma Desktop:
# Plugins → Development → Import plugin from manifest...
# Select manifest.json

# Publish to Figma Community:
# 1. Open Figma Desktop → Plugins → Manage plugins
# 2. Click "Publish" next to your plugin
# 3. Add icon (128x128), screenshots, description
# 4. Submit for review (typically 1-5 business days)
```

## Results

- **Brand update time: 8 hours → 5 minutes** — one click fetches new tokens from API and updates all 500+ Figma variables; no manual work
- **Token search replaces tribal knowledge** — designers type a token name instead of scrolling through the styles panel; onboarding new designers takes minutes
- **Apply tokens to selection** — select any element, click a token to apply as fill or stroke; keeps design consistent with the token system
- **Synced across team** — variables are Figma-native; other team members see updates without installing anything extra
- **Published on Figma Community** — available as a one-click install for the team; versioning managed through the Figma plugin update flow
