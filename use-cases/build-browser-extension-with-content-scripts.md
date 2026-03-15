---
title: Build a Browser Extension with Content Scripts
slug: build-browser-extension-with-content-scripts
description: Build a Chrome/Firefox browser extension with content scripts, background workers, popup UI, and storage sync — adding AI-powered features to any website with a cross-browser compatible architecture.
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

Priya is a product manager who spends 3 hours daily reading competitor websites, product reviews, and support forums. She copies key points into a spreadsheet, then summarizes them for the team. She wants a browser extension that lets her highlight text on any webpage, AI-summarize it, organize highlights by project, and sync them across devices. The extension needs to work on any website without breaking the page, handle different content types, and work in both Chrome and Firefox.

## Step 1: Build the Extension Architecture

```typescript
// src/background/service-worker.ts — Background service worker
import { Storage } from "../lib/storage";

// Handle messages from content scripts and popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse);
  return true; // async response
});

async function handleMessage(message: any, sender: chrome.runtime.MessageSender) {
  switch (message.type) {
    case "SUMMARIZE_TEXT": {
      const summary = await summarizeWithAI(message.text, message.context);
      return { summary };
    }

    case "SAVE_HIGHLIGHT": {
      const highlight = {
        id: crypto.randomUUID(),
        text: message.text,
        url: sender.tab?.url || "",
        title: sender.tab?.title || "",
        summary: message.summary,
        project: message.project || "default",
        createdAt: new Date().toISOString(),
      };

      await Storage.addHighlight(highlight);

      // Update badge count
      const highlights = await Storage.getHighlights();
      chrome.action.setBadgeText({ text: String(highlights.length) });

      return { saved: true, highlight };
    }

    case "GET_HIGHLIGHTS": {
      const highlights = await Storage.getHighlights(message.project);
      return { highlights };
    }

    case "EXPORT_HIGHLIGHTS": {
      const highlights = await Storage.getHighlights(message.project);
      const markdown = highlights.map((h: any) =>
        `## ${h.title}\n\n> ${h.text}\n\n**Summary:** ${h.summary}\n\n[Source](${h.url}) — ${h.createdAt}\n\n---\n`
      ).join("\n");
      return { markdown };
    }

    default:
      return { error: `Unknown message type: ${message.type}` };
  }
}

async function summarizeWithAI(text: string, context: string): Promise<string> {
  const apiKey = await Storage.get("openaiApiKey");
  if (!apiKey) return "Set your OpenAI API key in extension settings to enable AI summaries.";

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Summarize the highlighted text in 1-2 concise sentences. Focus on key insights and actionable takeaways." },
        { role: "user", content: `Page: ${context}\n\nHighlighted text:\n${text}` },
      ],
      max_tokens: 150,
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "Unable to generate summary.";
}

// Context menu for right-click actions
chrome.contextMenus.create({
  id: "summarize-selection",
  title: "Summarize with AI",
  contexts: ["selection"],
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "summarize-selection" && tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "TRIGGER_SUMMARIZE",
      text: info.selectionText,
    });
  }
});
```

```typescript
// src/content/content-script.ts — Content script injected into web pages
const HIGHLIGHT_COLOR = "#FFEB3B80";

// Listen for text selection
document.addEventListener("mouseup", (e) => {
  const selection = window.getSelection();
  if (!selection || selection.toString().trim().length < 10) return;

  showHighlightPopup(selection, e.clientX, e.clientY);
});

function showHighlightPopup(selection: Selection, x: number, y: number): void {
  // Remove existing popup
  document.querySelector("#ai-highlight-popup")?.remove();

  const popup = document.createElement("div");
  popup.id = "ai-highlight-popup";
  popup.innerHTML = `
    <div style="position:fixed;top:${y - 50}px;left:${x}px;z-index:999999;
      background:white;border-radius:8px;box-shadow:0 4px 20px rgba(0,0,0,0.15);
      padding:8px;display:flex;gap:6px;font-family:system-ui;font-size:13px;">
      <button id="ai-btn-highlight" style="padding:4px 10px;border:none;border-radius:4px;
        background:#FFEB3B;cursor:pointer;font-size:13px;">📌 Save</button>
      <button id="ai-btn-summarize" style="padding:4px 10px;border:none;border-radius:4px;
        background:#4CAF50;color:white;cursor:pointer;font-size:13px;">✨ Summarize</button>
      <button id="ai-btn-close" style="padding:4px 10px;border:none;border-radius:4px;
        background:#eee;cursor:pointer;font-size:13px;">✕</button>
    </div>
  `;

  document.body.appendChild(popup);

  const text = selection.toString().trim();

  popup.querySelector("#ai-btn-summarize")?.addEventListener("click", async () => {
    const btn = popup.querySelector("#ai-btn-summarize") as HTMLElement;
    btn.textContent = "⏳ Thinking...";

    const response = await chrome.runtime.sendMessage({
      type: "SUMMARIZE_TEXT",
      text,
      context: document.title,
    });

    // Show summary in-page
    showSummaryTooltip(response.summary, x, y);

    // Auto-save with summary
    await chrome.runtime.sendMessage({
      type: "SAVE_HIGHLIGHT",
      text,
      summary: response.summary,
    });

    highlightSelection(selection);
    popup.remove();
  });

  popup.querySelector("#ai-btn-highlight")?.addEventListener("click", async () => {
    await chrome.runtime.sendMessage({
      type: "SAVE_HIGHLIGHT",
      text,
      summary: "",
    });
    highlightSelection(selection);
    popup.remove();
  });

  popup.querySelector("#ai-btn-close")?.addEventListener("click", () => popup.remove());

  // Auto-dismiss after 5 seconds
  setTimeout(() => popup.remove(), 5000);
}

function highlightSelection(selection: Selection): void {
  const range = selection.getRangeAt(0);
  const highlight = document.createElement("mark");
  highlight.style.backgroundColor = HIGHLIGHT_COLOR;
  highlight.style.borderRadius = "2px";
  range.surroundContents(highlight);
}

function showSummaryTooltip(summary: string, x: number, y: number): void {
  const tooltip = document.createElement("div");
  tooltip.style.cssText = `position:fixed;top:${y + 10}px;left:${x}px;z-index:999999;
    max-width:400px;background:#1a1a1a;color:#fff;border-radius:8px;padding:12px;
    font-family:system-ui;font-size:13px;line-height:1.5;box-shadow:0 4px 20px rgba(0,0,0,0.3);`;
  tooltip.textContent = `✨ ${summary}`;
  document.body.appendChild(tooltip);
  setTimeout(() => tooltip.remove(), 8000);
}

// Handle messages from background
chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TRIGGER_SUMMARIZE") {
    const selection = window.getSelection();
    if (selection) showHighlightPopup(selection, 100, 100);
  }
});
```

```json
// manifest.json — Cross-browser extension manifest (Manifest V3)
{
  "manifest_version": 3,
  "name": "AI Highlighter",
  "version": "1.0.0",
  "description": "Highlight text on any webpage, get AI summaries, and organize research",
  "permissions": ["storage", "contextMenus", "activeTab"],
  "host_permissions": ["https://api.openai.com/*"],
  "background": { "service_worker": "background/service-worker.js" },
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content/content-script.js"],
    "run_at": "document_idle"
  }],
  "action": {
    "default_popup": "popup/index.html",
    "default_icon": "icons/icon-48.png"
  },
  "icons": { "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
}
```

## Results

- **Research time cut from 3 hours to 45 minutes** — highlight text, get AI summary, save in one click; no more copy-pasting into spreadsheets
- **Works on any website** — content script injects minimal UI on text selection; doesn't break page layout or functionality
- **Cross-device sync** — `chrome.storage.sync` keeps highlights in sync across desktop and laptop; research doesn't stay on one machine
- **One-click export** — export all highlights as markdown for team Notion/Slack; organized by project, with sources and summaries
- **AI cost: ~$0.001 per summary** — GPT-4o-mini with 150 max tokens; 1000 summaries cost about $1
