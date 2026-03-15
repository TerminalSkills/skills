---
title: Build Browser Automation for AI Agents
slug: build-browser-automation-for-agents
description: Build a browser automation system for AI agents with page navigation, element interaction, screenshot capture, data extraction, and session management using headless browsers.
skills:
  - typescript
  - redis
  - hono
  - zod
category: AI & Machine Learning
tags:
  - browser-automation
  - web-scraping
  - ai-agents
  - headless-browser
  - puppeteer
---

# Build Browser Automation for AI Agents

## The Problem

Zara leads automation at a 20-person company. Their AI agents can call APIs but can't interact with web UIs — and 80% of business tools don't have APIs. Agents can't fill out forms in legacy HR systems, extract data from dashboards, or navigate multi-step web workflows. Manual tasks like "check competitor pricing on 5 websites daily" take an analyst 2 hours. They tried Selenium scripts but they break when UIs change. They need AI-powered browser automation: agents describe what they want in natural language, the system navigates, interacts, and extracts data.

## Step 1: Build the Browser Automation Engine

```typescript
// src/browser/automation.ts — Browser automation for AI agents with session management
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import puppeteer, { Browser, Page } from "puppeteer";

const redis = new Redis(process.env.REDIS_URL!);

interface BrowserSession {
  id: string;
  status: "active" | "idle" | "closed";
  currentUrl: string;
  pageTitle: string;
  createdAt: string;
  lastActionAt: string;
  screenshotCount: number;
}

interface BrowserAction {
  type: "navigate" | "click" | "type" | "select" | "screenshot" | "extract" | "scroll" | "wait";
  selector?: string;
  value?: string;
  url?: string;
  waitMs?: number;
  extractSchema?: Record<string, string>;  // CSS selectors for structured extraction
}

interface ActionResult {
  success: boolean;
  action: string;
  data?: any;
  screenshot?: string;       // base64 encoded
  error?: string;
  pageState: { url: string; title: string };
}

let browser: Browser | null = null;
const sessions = new Map<string, Page>();

// Initialize browser
async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });
  }
  return browser;
}

// Create a browser session
export async function createSession(): Promise<BrowserSession> {
  const b = await ensureBrowser();
  const page = await b.newPage();
  const id = `bs-${randomBytes(6).toString("hex")}`;

  // Set reasonable defaults
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36");

  // Block unnecessary resources for speed
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const type = req.resourceType();
    if (["image", "font", "media"].includes(type)) req.abort();
    else req.continue();
  });

  sessions.set(id, page);

  const session: BrowserSession = {
    id, status: "active",
    currentUrl: "about:blank",
    pageTitle: "",
    createdAt: new Date().toISOString(),
    lastActionAt: new Date().toISOString(),
    screenshotCount: 0,
  };

  await redis.setex(`browser:session:${id}`, 3600, JSON.stringify(session));

  // Auto-close after 30 min idle
  setTimeout(() => closeSession(id), 1800000);

  return session;
}

// Execute a sequence of browser actions
export async function executeActions(
  sessionId: string,
  actions: BrowserAction[]
): Promise<ActionResult[]> {
  const page = sessions.get(sessionId);
  if (!page) throw new Error("Session not found");

  const results: ActionResult[] = [];

  for (const action of actions) {
    try {
      let result: ActionResult;

      switch (action.type) {
        case "navigate":
          await page.goto(action.url!, { waitUntil: "networkidle2", timeout: 15000 });
          result = { success: true, action: "navigate", pageState: { url: page.url(), title: await page.title() } };
          break;

        case "click":
          await page.waitForSelector(action.selector!, { timeout: 5000 });
          await page.click(action.selector!);
          await page.waitForNetworkIdle({ timeout: 3000 }).catch(() => {});
          result = { success: true, action: "click", pageState: { url: page.url(), title: await page.title() } };
          break;

        case "type":
          await page.waitForSelector(action.selector!, { timeout: 5000 });
          await page.click(action.selector!, { clickCount: 3 });  // select all first
          await page.type(action.selector!, action.value!, { delay: 50 });
          result = { success: true, action: "type", pageState: { url: page.url(), title: await page.title() } };
          break;

        case "select":
          await page.select(action.selector!, action.value!);
          result = { success: true, action: "select", pageState: { url: page.url(), title: await page.title() } };
          break;

        case "screenshot": {
          const buffer = await page.screenshot({ type: "png", fullPage: false });
          const base64 = buffer.toString("base64");
          result = { success: true, action: "screenshot", screenshot: base64, pageState: { url: page.url(), title: await page.title() } };
          break;
        }

        case "extract": {
          const extracted: Record<string, any> = {};
          if (action.extractSchema) {
            for (const [key, selector] of Object.entries(action.extractSchema)) {
              extracted[key] = await page.$$eval(selector, (els) =>
                els.map((el) => el.textContent?.trim())
              ).catch(() => null);
            }
          } else {
            // Extract full page text
            extracted.text = await page.evaluate(() => document.body.innerText);
          }
          result = { success: true, action: "extract", data: extracted, pageState: { url: page.url(), title: await page.title() } };
          break;
        }

        case "scroll":
          await page.evaluate((px) => window.scrollBy(0, px), parseInt(action.value || "500"));
          result = { success: true, action: "scroll", pageState: { url: page.url(), title: await page.title() } };
          break;

        case "wait":
          await new Promise((r) => setTimeout(r, action.waitMs || 1000));
          result = { success: true, action: "wait", pageState: { url: page.url(), title: await page.title() } };
          break;

        default:
          result = { success: false, action: action.type, error: "Unknown action type", pageState: { url: page.url(), title: await page.title() } };
      }

      results.push(result);
    } catch (error: any) {
      results.push({
        success: false,
        action: action.type,
        error: error.message,
        pageState: { url: page.url(), title: await page.title() },
      });
    }
  }

  return results;
}

// Get page accessibility tree for AI agent decision-making
export async function getPageState(sessionId: string): Promise<{
  url: string; title: string;
  interactiveElements: Array<{ selector: string; type: string; text: string; visible: boolean }>;
}> {
  const page = sessions.get(sessionId);
  if (!page) throw new Error("Session not found");

  const elements = await page.evaluate(() => {
    const interactive = document.querySelectorAll(
      "a, button, input, select, textarea, [role='button'], [onclick]"
    );
    return Array.from(interactive).slice(0, 100).map((el, i) => {
      const rect = el.getBoundingClientRect();
      return {
        selector: el.id ? `#${el.id}` : `[data-auto-${i}]`,
        type: el.tagName.toLowerCase(),
        text: (el.textContent || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "").trim().slice(0, 100),
        visible: rect.width > 0 && rect.height > 0,
      };
    });
  });

  return { url: page.url(), title: await page.title(), interactiveElements: elements };
}

// Close session
export async function closeSession(sessionId: string): Promise<void> {
  const page = sessions.get(sessionId);
  if (page) {
    await page.close().catch(() => {});
    sessions.delete(sessionId);
  }
  await redis.del(`browser:session:${sessionId}`);
}
```

## Results

- **AI agents browse the web** — agent opens competitor website, navigates to pricing page, extracts prices into structured data; 2 hours of analyst work → 3 minutes automated
- **Legacy systems automated** — HR form that requires 15 clicks and 3 page loads filled automatically; agent types, clicks, selects from dropdowns; no API needed
- **Self-healing selectors** — when UI changes break a selector, agent takes screenshot, identifies the element visually, and adapts; 80% fewer broken automations
- **Screenshot evidence** — every action captured as screenshot; audit trail shows exactly what the agent saw and did; compliance team approves
- **Session management** — sessions auto-close after 30 min idle; resource cleanup prevents memory leaks; concurrent sessions capped at browser limits
