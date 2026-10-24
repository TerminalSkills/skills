---
title: Build Browser Automation for AI Agents
slug: build-browser-automation-for-agents
description: Build a browser automation system for AI agents with page navigation, element interaction, screenshot capture, data extraction, and session management using headless Chrome and Puppeteer.
skills:
  - puppeteer
  - typescript
  - zod
  - redis
category: data-ai
tags:
  - browser-automation
  - web-scraping
  - ai-agents
  - headless-browser
  - puppeteer
---

# Build Browser Automation for AI Agents

## The Problem

Zara leads automation at a 20-person company. Their AI agents can call APIs but can't interact with web UIs, and many of the business tools they depend on have no API at all. Agents can't fill out forms in a legacy HR system, extract data from a dashboard, or walk through a multi-step web workflow. A manual task like "check competitor pricing on 5 websites daily" takes an analyst about 2 hours. Hard-coded Selenium scripts break whenever a page changes. They need a browser service that an agent can drive step by step: look at the page, choose an action, see the result.

## The Solution

Run headless Chrome through **Puppeteer** and expose a small session API. The agent sends JSON actions (validated with **Zod**), gets back the page state and any extracted data, and can ask for a list of the page's interactive elements to decide what to do next. Session metadata lives in **Redis**. Because the agent chooses the URLs, the service refuses non-public addresses.

## Step-by-Step Walkthrough

### Step 1: Install

```bash
npm install puppeteer zod ioredis
npm install -D typescript @types/node
```

`npm install puppeteer` downloads a matching Chrome. Chrome's sandbox stays on. On Ubuntu 23.10+ AppArmor can block it ("No usable sandbox!"); follow the AppArmor note in Chromium's documentation, or, inside a container that you control, set `BROWSER_NO_SANDBOX=1`.

### Step 2: Build the Automation Engine

```typescript
// src/browser/automation.ts — browser sessions for AI agents (Puppeteer + Redis metadata)
import { lookup } from "node:dns/promises";
import { randomBytes } from "node:crypto";
import { isIP } from "node:net";
import { Redis } from "ioredis";
import puppeteer, { type Browser, type Page } from "puppeteer";
import { z } from "zod";

const redis = new Redis(process.env.REDIS_URL!);
const MAX_SESSIONS = 5;
const IDLE_MS = 30 * 60 * 1000;

// Agents send JSON; validate it before it reaches the browser
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().url() }),
  z.object({ type: z.literal("click"), selector: z.string().min(1) }),
  z.object({ type: z.literal("type"), selector: z.string().min(1), value: z.string() }),
  z.object({ type: z.literal("select"), selector: z.string().min(1), value: z.string() }),
  z.object({ type: z.literal("screenshot") }),
  z.object({ type: z.literal("extract"), schema: z.record(z.string(), z.string()).optional() }),
  z.object({ type: z.literal("scroll"), pixels: z.number().int().default(500) }),
  z.object({ type: z.literal("wait"), ms: z.number().int().min(0).max(10_000).default(1000) }),
]);
export type BrowserAction = z.infer<typeof ActionSchema>;

export interface ActionResult {
  success: boolean;
  action: string;
  data?: unknown;
  screenshot?: string; // base64 PNG
  error?: string;
  pageState: { url: string; title: string };
}

// The agent controls the URL, so refuse anything that is not public http(s):
// otherwise it can reach localhost, the cloud metadata service or your intranet.
function isPrivateIp(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    // URL parsing turns ::ffff:127.0.0.1 into ::ffff:7f00:1, so decode the hex form too
    const mapped = v.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mapped) {
      const hi = parseInt(mapped[1], 16), lo = parseInt(mapped[2], 16);
      return isPrivateIp(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || /^fe[89ab]/.test(v) ||
      (v.startsWith("::ffff:") && isPrivateIp(v.slice(7)));
  }
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

export async function assertPublicUrl(raw: string): Promise<void> {
  if (process.env.BROWSER_ALLOW_PRIVATE === "1") return; // local testing only
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`Blocked protocol ${url.protocol}`);
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (addrs.some((a) => isPrivateIp(a.address))) throw new Error(`Blocked non-public address for ${host}`);
}

let browser: Browser | null = null;
const sessions = new Map<string, { page: Page; idle: NodeJS.Timeout }>();

async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.connected) {
    browser = await puppeteer.launch({
      headless: true,
      // Keep Chrome's sandbox on. Only containers that run as root need it off.
      args: process.env.BROWSER_NO_SANDBOX === "1" ? ["--no-sandbox"] : [],
    });
  }
  return browser;
}

function touch(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  clearTimeout(s.idle);
  s.idle = setTimeout(() => void closeSession(id), IDLE_MS);
}

export async function createSession(): Promise<{ id: string }> {
  if (sessions.size >= MAX_SESSIONS) throw new Error("Too many open sessions");
  const page = await (await ensureBrowser()).newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Check every navigation request, redirects included, and skip heavy resources
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (["image", "font", "media"].includes(req.resourceType())) return void req.abort();
    if (req.isNavigationRequest()) {
      assertPublicUrl(req.url()).then(() => req.continue(), () => req.abort("blockedbyclient"));
    } else {
      req.continue();
    }
  });

  const id = `bs-${randomBytes(6).toString("hex")}`;
  sessions.set(id, { page, idle: setTimeout(() => void closeSession(id), IDLE_MS) });
  await redis.set(`browser:session:${id}`, JSON.stringify({ createdAt: new Date().toISOString() }), "EX", 3600);
  return { id };
}

export async function executeActions(sessionId: string, input: unknown[]): Promise<ActionResult[]> {
  const entry = sessions.get(sessionId);
  if (!entry) throw new Error("Session not found");
  const { page } = entry;
  const state = async () => ({ url: page.url(), title: await page.title() });
  const results: ActionResult[] = [];

  for (const raw of input) {
    touch(sessionId);
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) {
      results.push({ success: false, action: "invalid", error: parsed.error.message, pageState: await state() });
      continue;
    }
    const a = parsed.data;
    try {
      let data: unknown;
      let screenshot: string | undefined;
      switch (a.type) {
        case "navigate":
          await assertPublicUrl(a.url);
          await page.goto(a.url, { waitUntil: "networkidle2", timeout: 15_000 });
          break;
        case "click":
          await page.locator(a.selector).setTimeout(5000).click();
          await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {});
          break;
        case "type":
          // fill() replaces the field's current value, so no triple-click needed
          await page.locator(a.selector).setTimeout(5000).fill(a.value);
          break;
        case "select":
          await page.select(a.selector, a.value);
          break;
        case "screenshot":
          screenshot = await page.screenshot({ type: "png", encoding: "base64" });
          break;
        case "extract":
          if (a.schema) {
            data = Object.fromEntries(await Promise.all(Object.entries(a.schema).map(async ([key, sel]) =>
              [key, await page.$$eval(sel, (els) => els.map((el) => el.textContent?.trim()))] as const)));
          } else {
            data = { text: await page.evaluate(() => document.body.innerText) };
          }
          break;
        case "scroll":
          await page.evaluate((px) => window.scrollBy(0, px), a.pixels);
          break;
        case "wait":
          await new Promise((r) => setTimeout(r, a.ms));
          break;
      }
      results.push({ success: true, action: a.type, data, screenshot, pageState: await state() });
    } catch (error) {
      results.push({ success: false, action: a.type, error: (error as Error).message, pageState: await state() });
    }
  }
  return results;
}

// Snapshot of what an agent can act on. Each element gets a data-agent-id so the
// returned selector can be passed straight back to click/type/select.
export async function getPageState(sessionId: string) {
  const entry = sessions.get(sessionId);
  if (!entry) throw new Error("Session not found");
  const { page } = entry;
  touch(sessionId);

  const interactiveElements = await page.evaluate(() => {
    const els = document.querySelectorAll("a, button, input, select, textarea, [role='button']");
    return Array.from(els).slice(0, 100).map((el, i) => {
      el.setAttribute("data-agent-id", String(i));
      const rect = el.getBoundingClientRect();
      return {
        selector: `[data-agent-id="${i}"]`,
        type: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim().slice(0, 100),
        visible: rect.width > 0 && rect.height > 0,
      };
    });
  });
  return { url: page.url(), title: await page.title(), interactiveElements };
}

export async function closeSession(sessionId: string): Promise<void> {
  const entry = sessions.get(sessionId);
  if (entry) {
    clearTimeout(entry.idle);
    sessions.delete(sessionId);
    await entry.page.close().catch(() => {});
  }
  await redis.del(`browser:session:${sessionId}`);
}

export async function shutdown(): Promise<void> {
  await Promise.all([...sessions.keys()].map(closeSession));
  await browser?.close();
  redis.disconnect();
}
```

A few choices in this file are deliberate:

- **`page.locator(...).fill()`** replaces the field's current value and waits for the element to be ready, which replaces the older triple-click-then-type trick.
- **`screenshot({ encoding: "base64" })`** returns a base64 string directly; without `encoding` Puppeteer returns a `Uint8Array`, which has no base64 `toString`.
- **`getPageState`** stamps each element with a `data-agent-id` attribute, so the selectors it returns can be sent straight back in `click`/`type` actions.
- **Navigation checks** run on every navigation request, redirects included, so a public page cannot bounce the browser to `http://169.254.169.254/` (a cloud metadata address) or to `localhost`. For testing against your own dev server, set `BROWSER_ALLOW_PRIVATE=1`.

### Step 3: Drive It From an Agent Loop

The agent's loop is: look, decide, act. This sketch calls the exported functions directly; if the agent runs elsewhere, wrap them in HTTP routes (Hono, Express) bound to `127.0.0.1` or behind authentication.

```typescript
import { createSession, executeActions, getPageState, closeSession } from "./automation";

const { id } = await createSession();
try {
  await executeActions(id, [{ type: "navigate", url: "https://example.com/pricing" }]);
  const page = await getPageState(id);          // give this to the model
  const [result] = await executeActions(id, [   // the model's chosen actions
    { type: "extract", schema: { plans: "h2", prices: ".price" } },
  ]);
  console.log(page.title, result.data);
} finally {
  await closeSession(id);
}
```

Every result carries the page URL and title, and a failed action returns `success: false` with the error instead of throwing, so the model can read the error and try a different selector. Keep the `screenshot` results if you need an audit trail.

## Results

These are the example team's outcomes, not a benchmark:

- **Competitor pricing check moved from a 2-hour analyst task to a scheduled job**: the agent opens each site, extracts prices into structured data and posts a summary.
- **A legacy HR form is filled without an API**: the agent types, clicks and selects dropdown values; a person reviews a screenshot before submission.
- **Screenshots as evidence**: the compliance team sees what the agent saw at each step.
- **Bounded resources**: at most 5 sessions, each closed after 30 minutes without an action.
- **Safe by default**: non-http(s) schemes and private or link-local addresses are blocked, including through redirects.

## Related Skills

- [puppeteer](../skills/puppeteer/) -- Headless Chrome control, selectors, screenshots, network interception
- [typescript](../skills/typescript/) -- Typed action and result shapes
- [zod](../skills/zod/) -- Validating agent-supplied actions
- [redis](../skills/redis/) -- Session metadata with expiry
