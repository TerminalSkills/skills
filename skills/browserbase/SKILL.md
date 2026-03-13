---
name: browserbase
description: >-
   You are an expert in BrowserBase, the cloud platform for running headless
  browsers at scale. You help developers deploy browser-based automations, AI
  agents, and web scraping pipelines using managed Chromium instances with
  residential proxies, session recording, stealth mode, and parallel execution
  — without managing browser infrastructure.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Developer Tools
  tags:
    - browser-automation
    - cloud-browser
    - headless
    - scraping
    - testing
    - infrastructure
---

# BrowserBase — Cloud Browser Infrastructure for AI Agents

You are an expert in BrowserBase, the cloud platform for running headless browsers at scale. You help developers deploy browser-based automations, AI agents, and web scraping pipelines using managed Chromium instances with residential proxies, session recording, stealth mode, and parallel execution — without managing browser infrastructure.

## Core Capabilities

### Session Management

```typescript
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

// Create a browser session
const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
  browserSettings: {
    fingerprint: {
      locales: ["en-US"],
      screen: { maxWidth: 1920, maxHeight: 1080 },
    },
    viewport: { width: 1280, height: 720 },
  },
  proxies: true,                        // Residential proxy (avoid blocks)
  keepAlive: true,                      // Keep session alive between connections
  timeout: 300,                         // Max session duration (seconds)
});

// Connect with Playwright
const browser = await chromium.connectOverCDP(session.connectUrl);
const context = browser.contexts()[0];
const page = context.pages()[0];

await page.goto("https://example.com");
// ... automation logic ...

// Session recording available at:
console.log(`Recording: https://browserbase.com/sessions/${session.id}`);
```

### Parallel Execution

```typescript
// Process 50 URLs concurrently with cloud browsers
async function scrapeInParallel(urls: string[], concurrency = 10) {
  const results: any[] = [];

  // Process in batches
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);

    const batchResults = await Promise.allSettled(
      batch.map(async (url) => {
        const session = await bb.sessions.create({
          projectId: process.env.BROWSERBASE_PROJECT_ID!,
          proxies: true,
          keepAlive: false,              // Auto-cleanup
        });

        const browser = await chromium.connectOverCDP(session.connectUrl);
        const page = browser.contexts()[0].pages()[0];

        try {
          await page.goto(url, { waitUntil: "networkidle" });
          const data = await page.evaluate(() => {
            // Extract data from page
            return { title: document.title, text: document.body.innerText.substring(0, 5000) };
          });
          return { url, ...data };
        } finally {
          await browser.close();
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}
```

### Persistent Context (Login Sessions)

```typescript
// Create a context that persists cookies/auth across sessions
const context = await bb.contexts.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
});

// First session: log in and save context
const loginSession = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
  browserSettings: { context: { id: context.id, persist: true } },
});
// ... log in via Playwright ...

// Later sessions reuse the authenticated context
const workSession = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
  browserSettings: { context: { id: context.id, persist: true } },
});
// Already logged in — cookies persisted
```

## Installation

```bash
npm install @browserbasehq/sdk playwright-core
# Get API key: https://browserbase.com
```

## Best Practices

1. **Proxies for scraping** — Enable `proxies: true` for sites that block datacenter IPs; BrowserBase provides residential proxies
2. **Session recordings** — Every session is recorded; use recordings to debug failed automations without re-running
3. **Persistent contexts** — Use contexts to share login state across sessions; avoid re-authenticating every time
4. **keepAlive for multi-step** — Set `keepAlive: true` for long workflows; `false` for one-shot scraping
5. **Stealth by default** — BrowserBase configures fingerprints and headers to look like a real browser; no extra stealth plugins needed
6. **Concurrency limits** — Respect your plan's concurrent session limit; use batching with `Promise.allSettled` for parallel work
7. **Combine with Stagehand** — Use BrowserBase as the browser backend for Stagehand AI automation; set `env: "BROWSERBASE"`
8. **Timeouts** — Set session `timeout` to prevent zombie sessions; sessions auto-terminate when the timeout expires
