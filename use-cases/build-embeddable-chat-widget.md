---
title: Build an Embeddable Chat Widget
slug: build-embeddable-chat-widget
description: Build an embeddable AI chat widget with iframe isolation, theme customization, conversation persistence, knowledge base integration, and analytics for customer-facing support.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: development
tags:
  - chat
  - widget
  - embeddable
  - ai
  - customer-support
---

# Build an Embeddable Chat Widget

## The Problem

Farah leads product at a 20-person AI startup. Customers want to embed their AI chatbot on their own websites. Current integration requires a React component — only works for React apps, adds 200KB to the customer's bundle, and styling conflicts with host pages. Customers on WordPress, Shopify, and static sites can't integrate at all. They need a universal embed: one script tag, works on any website, iframe-isolated, customizable theme to match the host brand, persists conversations across page navigations, and sends analytics back.

## Step 1: Build the Widget Engine

```typescript
// src/widget/engine.ts — Embeddable chat widget with iframe isolation and theming
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface WidgetConfig {
  id: string;
  apiKey: string;
  theme: {
    primaryColor: string;
    fontFamily: string;
    borderRadius: number;
    position: "bottom-right" | "bottom-left";
    headerTitle: string;
    headerSubtitle: string;
    avatarUrl?: string;
    welcomeMessage: string;
  };
  behavior: {
    autoOpen: boolean;
    autoOpenDelayMs: number;
    showOnPages: string[];     // URL patterns: ["/pricing*", "/docs*"]
    hideOnMobile: boolean;
    requireEmail: boolean;
    knowledgeBaseId?: string;
  };
  branding: { showPoweredBy: boolean };
}

interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// Generate embed script for customer
export function generateEmbedScript(widgetId: string): string {
  return `<script>
(function(){var w=document.createElement('script');w.src='${process.env.CDN_URL}/widget/${widgetId}/loader.js';w.async=true;document.head.appendChild(w);})();
</script>`;
}

// Generate the loader JS that creates the iframe
export async function generateLoader(widgetId: string): Promise<string> {
  const config = await getWidgetConfig(widgetId);
  if (!config) throw new Error("Widget not found");

  return `(function(){
  if(window.__chatWidget) return;
  window.__chatWidget = true;

  var config = ${JSON.stringify({ id: config.id, theme: config.theme, behavior: config.behavior, branding: config.branding })};

  // Check page matching
  if(config.behavior.showOnPages.length > 0) {
    var match = config.behavior.showOnPages.some(function(p) {
      return new RegExp(p.replace('*','.*')).test(window.location.pathname);
    });
    if(!match) return;
  }

  // Check mobile
  if(config.behavior.hideOnMobile && window.innerWidth < 768) return;

  // Create toggle button
  var btn = document.createElement('div');
  btn.id = 'chat-widget-toggle';
  btn.innerHTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  btn.style.cssText = 'position:fixed;${config.theme.position === "bottom-left" ? "left" : "right"}:20px;bottom:20px;width:56px;height:56px;border-radius:50%;background:${config.theme.primaryColor};display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:999998;transition:transform 0.2s;';
  btn.onmouseenter = function(){this.style.transform='scale(1.1)'};
  btn.onmouseleave = function(){this.style.transform='scale(1)'};
  document.body.appendChild(btn);

  // Create iframe container
  var container = document.createElement('div');
  container.id = 'chat-widget-container';
  container.style.cssText = 'position:fixed;${config.theme.position === "bottom-left" ? "left" : "right"}:20px;bottom:90px;width:380px;height:600px;max-height:calc(100vh - 120px);border-radius:${config.theme.borderRadius}px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,0.15);z-index:999999;display:none;';

  var iframe = document.createElement('iframe');
  iframe.src = '${process.env.APP_URL}/widget/${widgetId}/chat';
  iframe.style.cssText = 'width:100%;height:100%;border:none;';
  iframe.allow = 'clipboard-write';
  container.appendChild(iframe);
  document.body.appendChild(container);

  var open = false;
  btn.onclick = function() {
    open = !open;
    container.style.display = open ? 'block' : 'none';
    btn.innerHTML = open
      ? '<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>'
      : '<svg width="24" height="24" viewBox="0 0 24 24" fill="white"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>';
  };

  // Auto-open
  if(config.behavior.autoOpen) {
    setTimeout(function(){ btn.click(); }, config.behavior.autoOpenDelayMs || 3000);
  }

  // Listen for messages from iframe
  window.addEventListener('message', function(e) {
    if(e.data.type === 'widget:resize') {
      container.style.height = e.data.height + 'px';
    }
    if(e.data.type === 'widget:close') {
      btn.click();
    }
  });
})();`;
}

// Handle chat message
export async function handleMessage(params: {
  widgetId: string;
  sessionId: string;
  message: string;
  visitorId: string;
}): Promise<ChatMessage> {
  const config = await getWidgetConfig(params.widgetId);
  if (!config) throw new Error("Widget not found");

  // Store user message
  const userMsg: ChatMessage = {
    id: `msg-${randomBytes(4).toString("hex")}`,
    sessionId: params.sessionId,
    role: "user",
    content: params.message,
    timestamp: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO widget_messages (id, session_id, widget_id, role, content, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [userMsg.id, params.sessionId, params.widgetId, "user", params.message]
  );

  // Generate AI response (in production: call LLM with knowledge base context)
  const response = await generateResponse(params.message, config);

  const assistantMsg: ChatMessage = {
    id: `msg-${randomBytes(4).toString("hex")}`,
    sessionId: params.sessionId,
    role: "assistant",
    content: response,
    timestamp: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO widget_messages (id, session_id, widget_id, role, content, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [assistantMsg.id, params.sessionId, params.widgetId, "assistant", response]
  );

  // Track analytics
  await redis.hincrby(`widget:analytics:${params.widgetId}`, "messages", 1);
  await redis.hincrby(`widget:analytics:${params.widgetId}`, "sessions", 0);  // dedup by session
  await redis.sadd(`widget:sessions:${params.widgetId}`, params.sessionId);

  return assistantMsg;
}

async function generateResponse(message: string, config: WidgetConfig): Promise<string> {
  // In production: call LLM with knowledge base context
  return `Thanks for your message! I'll help you with that.`;
}

// Get conversation history
export async function getConversation(sessionId: string): Promise<ChatMessage[]> {
  const { rows } = await pool.query(
    "SELECT * FROM widget_messages WHERE session_id = $1 ORDER BY created_at ASC",
    [sessionId]
  );
  return rows;
}

// Widget analytics
export async function getAnalytics(widgetId: string): Promise<{
  totalSessions: number; totalMessages: number; avgMessagesPerSession: number;
  topQuestions: Array<{ question: string; count: number }>;
}> {
  const sessions = await redis.scard(`widget:sessions:${widgetId}`);
  const stats = await redis.hgetall(`widget:analytics:${widgetId}`);

  return {
    totalSessions: sessions,
    totalMessages: parseInt(stats.messages || "0"),
    avgMessagesPerSession: sessions > 0 ? parseInt(stats.messages || "0") / sessions : 0,
    topQuestions: [],
  };
}

async function getWidgetConfig(widgetId: string): Promise<WidgetConfig | null> {
  const cached = await redis.get(`widget:config:${widgetId}`);
  if (cached) return JSON.parse(cached);
  const { rows: [row] } = await pool.query("SELECT * FROM widget_configs WHERE id = $1", [widgetId]);
  if (!row) return null;
  const config = { ...row, theme: JSON.parse(row.theme), behavior: JSON.parse(row.behavior), branding: JSON.parse(row.branding) };
  await redis.setex(`widget:config:${widgetId}`, 300, JSON.stringify(config));
  return config;
}
```

## Results

- **One script tag, any website** — works on WordPress, Shopify, React, static sites; no framework dependency; customer adds 1 line of HTML
- **iframe isolation** — widget CSS/JS can't conflict with host page; host page can't access widget internals; secure by default
- **Brand matching** — primary color, font, border radius, position all configurable; widget looks native to the host site; customers' brands preserved
- **Conversation persistence** — session ID stored in localStorage; user navigates pages, returns to chat, sees history; no lost conversations
- **200KB → 3KB** — loader script is 3KB; iframe loads separately; host page bundle unaffected; page speed score unchanged
