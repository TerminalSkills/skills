---
title: Build an Embeddable Widget SDK
slug: build-embeddable-widget-sdk
description: Build a JavaScript SDK that lets customers embed a feedback widget on their websites — with iframe isolation, theming, postMessage events, verified user identity, and no style conflicts with host pages.
skills:
  - typescript
  - hono
  - zod
category: development
tags:
  - sdk
  - widget
  - embed
  - iframe
  - javascript
---

# Build an Embeddable Widget SDK

## The Problem

Jorge leads product at a 25-person customer feedback company. Customers want to add a feedback widget to their websites: a floating button that opens a form, collects feedback, and submits it. The current approach is a code snippet that injects HTML directly into the customer's DOM. This breaks constantly: CSS conflicts with the host page, React apps re-render and destroy the widget, and anyone can claim to be any user. They need an SDK that works on any website without conflicts, loads asynchronously, and communicates safely with the host page.

## The Solution

Ship a tiny loader script that adds a floating button and opens the real widget in a cross-origin `<iframe>`. The loader and the iframe talk through `postMessage`, checking `origin` and `source` on every message. A small Hono server (with Zod validation) serves the widget page, restricts who may embed it with a `frame-ancestors` header, and verifies user identity with an HMAC the customer's own server signs. Everything is TypeScript, bundled with esbuild.

## Step-by-Step Walkthrough

### Step 1: Build the Widget Loader

The loader holds the config, the trigger button and the iframe. Only non-sensitive options go in the iframe URL; the user's identity is sent by `postMessage` after the iframe says it is ready, so emails and IDs stay out of URLs and server logs.

```typescript
// src/loader.ts -- the script customers load; built to public/sdk.js
const WIDGET_URL = "https://widget.feedback.app";

interface FeedbackConfig {
  projectId: string;
  position?: "bottom-right" | "bottom-left";
  theme?: "light" | "dark" | "auto";
  primaryColor?: string;
  userId?: string;
  userHash?: string; // HMAC-SHA256(userId), computed on the customer's server
  email?: string;
  onSubmit?: (feedback: unknown) => void;
}

class FeedbackWidget {
  private iframe: HTMLIFrameElement | null = null;
  private trigger = document.createElement("button");
  private listener = (e: MessageEvent) => this.onMessage(e);

  constructor(private config: FeedbackConfig) {
    const side = config.position === "bottom-left" ? "left" : "right";
    this.trigger.setAttribute("aria-label", "Send feedback");
    this.trigger.textContent = "?";
    this.trigger.style.cssText = `position:fixed;${side}:20px;bottom:20px;z-index:2147483647;` +
      `width:56px;height:56px;border:0;border-radius:50%;cursor:pointer;color:#fff;font:600 24px system-ui;` +
      `background:${config.primaryColor ?? "#3B82F6"};box-shadow:0 4px 12px rgba(0,0,0,.15)`;
    this.trigger.onclick = () => (this.iframe ? this.close() : this.open());
    document.body.appendChild(this.trigger);
    window.addEventListener("message", this.listener);
  }

  open(): void {
    if (this.iframe) return;
    const c = this.config;
    const side = c.position === "bottom-left" ? "left" : "right";
    const f = document.createElement("iframe");
    f.title = "Feedback";
    // Without allow-same-origin the widget's origin is "null" and it cannot call its own API.
    // This is safe because the iframe is cross-origin to the host page.
    f.sandbox.add("allow-scripts", "allow-forms", "allow-same-origin");
    f.style.cssText = `position:fixed;${side}:20px;bottom:90px;z-index:2147483646;border:0;` +
      `border-radius:12px;width:380px;height:500px;max-width:calc(100vw - 40px);background:#fff;` +
      `box-shadow:0 8px 30px rgba(0,0,0,.12)`;
    // Only non-sensitive options go in the URL; identity is sent by postMessage after the handshake.
    f.src = `${WIDGET_URL}/widget?` + new URLSearchParams({
      projectId: c.projectId, theme: c.theme ?? "auto", color: c.primaryColor ?? "#3B82F6",
    });
    document.body.appendChild(f);
    this.iframe = f;
  }

  close(): void { this.iframe?.remove(); this.iframe = null; }

  identify(userId: string, userHash: string, email?: string): void {
    Object.assign(this.config, { userId, userHash, email });
    this.sendIdentity();
  }

  destroy(): void {
    this.close();
    this.trigger.remove();
    window.removeEventListener("message", this.listener);
  }

  private sendIdentity(): void {
    const { userId, userHash, email } = this.config;
    if (userId) this.iframe?.contentWindow?.postMessage(
      { type: "IDENTIFY_USER", userId, userHash, email }, WIDGET_URL);
  }

  private onMessage(e: MessageEvent): void {
    // Check both the origin and that the message came from our own iframe
    if (e.origin !== WIDGET_URL || e.source !== this.iframe?.contentWindow) return;
    switch (e.data?.type) {
      case "WIDGET_READY": this.sendIdentity(); break;
      case "FEEDBACK_SUBMITTED":
        this.config.onSubmit?.(e.data.feedback);
        setTimeout(() => this.close(), 2000);
        break;
      case "WIDGET_CLOSE": this.close(); break;
    }
  }
}

(window as any).FeedbackWidget = FeedbackWidget;

// Auto-init from data attributes: <script src=".../sdk.js" data-project-id="...">
const el = document.currentScript as HTMLScriptElement | null;
const init = () => {
  (window as any).__feedbackWidget = new FeedbackWidget({
    projectId: el!.dataset.projectId!,
    position: el!.dataset.position as FeedbackConfig["position"],
    theme: el!.dataset.theme as FeedbackConfig["theme"],
    primaryColor: el!.dataset.color,
  });
};
if (el?.dataset.projectId) { // an async script in <head> can run before <body> exists
  if (document.body) init(); else addEventListener("DOMContentLoaded", init);
}
```

Build it with `npx esbuild src/loader.ts --bundle --minify --format=iife --target=es2020 --outfile=public/sdk.js`. With esbuild 0.28 the result is 2.5 KB minified (about 1.2 KB gzipped); the widget itself loads only when the visitor clicks the button.

### Step 2: Customer Integration

```html
<!-- Simple: one script tag -->
<script src="https://widget.feedback.app/sdk.js"
        data-project-id="proj_abc123" data-position="bottom-right"
        data-theme="auto" data-color="#6366F1" async></script>

<!-- Advanced: programmatic control -->
<script src="https://widget.feedback.app/sdk.js" async></script>
<script>
  window.addEventListener('load', () => {
    const widget = new FeedbackWidget({
      projectId: 'proj_abc123',
      onSubmit: (feedback) => analytics.track('feedback_submitted', feedback),
    });
    // userHash comes from the customer's server: HMAC-SHA256 of the user ID, hex-encoded
    widget.identify(currentUser.id, currentUser.feedbackHash, currentUser.email);
  });
</script>
```

The customer's server computes the hash with the project's identity secret, for example `crypto.createHmac("sha256", secret).update(userId).digest("hex")` in Node. Never put the secret in browser code.

### Step 3: Build the Widget Side

Inside the iframe, a small script waits for identity from its direct parent only, submits feedback to its own origin (no CORS needed), and tells the loader when it is done.

```typescript
// src/widget.ts -- runs inside the iframe, built to public/widget.js
const params = new URLSearchParams(location.search);
let identity: { userId?: string; userHash?: string; email?: string } = {};

// Only the embedding page (our direct parent) may send us identity
addEventListener("message", (e) => {
  if (e.source === parent && e.data?.type === "IDENTIFY_USER") {
    const { userId, userHash, email } = e.data;
    identity = { userId, userHash, email };
  }
});

document.querySelector("form")!.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = new FormData(e.target as HTMLFormElement).get("message");
  const res = await fetch("/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: params.get("projectId"), message, ...identity }),
  });
  // The parent's origin is unknown here; frame-ancestors already limits who can embed us
  if (res.ok) parent.postMessage({ type: "FEEDBACK_SUBMITTED", feedback: { message } }, "*");
});

parent.postMessage({ type: "WIDGET_READY" }, "*");
```

Build it with `npx esbuild src/widget.ts --bundle --minify --format=esm --outfile=public/widget.js`.

### Step 4: Serve the Widget and Receive Feedback

The server answers `/widget` with a `Content-Security-Policy: frame-ancestors` header listing the customer's allowed origins, so a third party cannot embed a customer's project. `POST /api/feedback` validates the body with Zod and trusts a `userId` only if its HMAC checks out. Install `hono`, `@hono/node-server`, `@hono/zod-validator` and `zod`.

```typescript
// src/server.ts -- serves the widget page and receives feedback
import { createHmac, timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";

// Replace with your database: allowed customer origins and identity secret per project
const projects = new Map([
  ["proj_abc123", { origins: ["https://app.acme.example"], secret: process.env.ACME_IDENTITY_SECRET ?? "dev-only" }],
]);

const feedbackSchema = z.object({
  projectId: z.string().min(1),
  message: z.string().trim().min(1).max(5000),
  rating: z.number().int().min(1).max(5).optional(),
  userId: z.string().max(200).optional(),
  userHash: z.string().max(128).optional(),
  email: z.email().optional(),
  pageUrl: z.url().optional(),
});

const app = new Hono();

// Only the customer's own sites may frame the widget
app.get("/widget", (c) => {
  const project = projects.get(c.req.query("projectId") ?? "");
  if (!project) return c.text("Unknown project", 404);
  c.header("Content-Security-Policy", `frame-ancestors ${project.origins.join(" ")}`);
  return c.html(`<!doctype html><meta charset="utf-8"><title>Feedback</title>
<form id="f"><textarea name="message" required maxlength="5000"></textarea><button>Send</button></form>
<script type="module" src="/widget.js"></script>`); // widget.js: see Step 3
});

app.use("/*", serveStatic({ root: "./public" })); // sdk.js, widget.js

app.post("/api/feedback", zValidator("json", feedbackSchema), (c) => {
  const body = c.req.valid("json");
  const project = projects.get(body.projectId);
  if (!project) return c.json({ error: "unknown project" }, 404);

  // Trust a userId only if the customer's server signed it
  let verified = false;
  if (body.userId && body.userHash) {
    const want = createHmac("sha256", project.secret).update(body.userId).digest("hex");
    verified = want.length === body.userHash.length &&
      timingSafeEqual(Buffer.from(want), Buffer.from(body.userHash));
  }
  console.log("feedback", { ...body, userHash: undefined, verified });
  return c.json({ ok: true }, 201);
});

serve({ fetch: app.fetch, port: 8787, hostname: "127.0.0.1" });
```

Checked against Hono 4.13, Zod 4.6 and `@hono/zod-validator` 0.9: `GET /widget` returns the `frame-ancestors` header, a valid signed submission returns `201` with `verified: true`, and an empty message returns `400`. The server binds to `127.0.0.1`; put a TLS-terminating proxy in front for `https://widget.feedback.app`.

## Real-World Example

Jorge's team rolls the SDK out to a customer running a React dashboard. The old snippet vanished whenever the app re-rendered; the new button is appended to `document.body` and the form lives in the iframe, so React never touches it. The customer's backend signs each logged-in user's ID, so feedback shows up in the inbox tagged with a verified user instead of a self-declared one. A second customer's site has a strict Content Security Policy, and their security team adds the widget domain to `script-src` and `frame-src`; nothing else is needed.

What the iframe approach does and does not give you:

- **No style conflicts.** The widget's CSS cannot leak into the host page, and the host's CSS cannot reach the form.
- **Works on any framework.** React, Vue, Angular, WordPress or static HTML; there is no framework-specific SDK.
- **CSP needs one change on strict sites.** The loader sets styles through the DOM (`style.cssText`), which CSP allows, but the host must permit the widget domain in `script-src` and `frame-src`.
- **Small loader.** 2.5 KB minified, with the heavy UI deferred until the first click.
- **Messages are checked.** Every handler verifies `origin` and `source`, and the server limits who may embed the widget.

## Related Skills

- [typescript](../skills/typescript/) -- strict typing for the loader, widget and server
- [hono](../skills/hono/) -- the widget and feedback API server
- [zod](../skills/zod/) -- request validation
