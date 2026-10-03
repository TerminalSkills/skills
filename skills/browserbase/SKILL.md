---
name: browserbase
description: >-
  Browserbase runs managed headless Chromium sessions in the cloud, so browser
  automation, AI agents and scraping jobs need no browser infrastructure of
  their own. Use when someone asks to "run Playwright in the cloud", "Browserbase
  session", "headless browsers at scale", "scrape with proxies and CAPTCHA
  solving", "persist a login across browser sessions", or "use Stagehand with
  Browserbase". Covers sessions, proxies, contexts, parallel runs and replays.
license: Apache-2.0
compatibility: "Node.js 18+ with @browserbasehq/sdk and playwright-core; needs a Browserbase account (BROWSERBASE_API_KEY). Some options require a paid plan."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
    - browser-automation
    - cloud-browser
    - headless
    - scraping
    - infrastructure
  repository: https://github.com/browserbase/sdk-node
---

# BrowserBase — Cloud Browser Infrastructure for AI Agents

## Overview

Browserbase is a hosted service that starts isolated Chromium sessions on demand. You create a session through the REST API or the Node SDK (`@browserbasehq/sdk`), receive a WebSocket `connectUrl`, and drive the browser with Playwright, Puppeteer or Selenium over CDP. The service adds proxies, CAPTCHA solving, session recording and logs, live view, and persistent contexts. Stagehand, Browserbase's open-source SDK with `act`, `extract` and `observe` primitives, uses it as its cloud browser. It is a paid, account-based service; this skill was checked against the public documentation only, not against a live account.

## Instructions

### Install and authenticate

```bash
npm install @browserbasehq/sdk playwright-core
export BROWSERBASE_API_KEY=...        # from the Browserbase dashboard, never hard-code
export BROWSERBASE_PROJECT_ID=...     # Settings page; optional, the API key can infer it
```

The REST API authenticates with the `X-BB-API-Key` header; the SDK sets it from `apiKey`.

### Create a session and connect

```typescript
import Browserbase from "@browserbasehq/sdk";
import { chromium } from "playwright-core";

const bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY! });

const session = await bb.sessions.create({
  projectId: process.env.BROWSERBASE_PROJECT_ID!,
  browserSettings: {
    viewport: { width: 1280, height: 720 },
    blockAds: true,            // default false
    solveCaptchas: true,       // default true
    recordSession: true,       // default true
  },
  proxies: true,               // Browserbase-managed proxies
  region: "us-east-1",         // us-west-2 | us-east-1 | eu-central-1 | ap-southeast-1
  timeout: 300,                // seconds, allowed range 60-21600
  keepAlive: false,            // true needs the Hobby plan or above
});

const browser = await chromium.connectOverCDP(session.connectUrl);
const page = browser.contexts()[0].pages()[0];
await page.goto("https://news.ycombinator.com");
console.log(await page.title());
await browser.close();

console.log(`Replay: https://browserbase.com/sessions/${session.id}`);
```

Other useful `browserSettings`: `os`, `allowedDomains`, `verified` (Verified Browser mode, plan dependent), `ignoreCertificateErrors`. Use `userMetadata` on the session to tag runs for later filtering.

### Persistent contexts (keep logins)

```typescript
const ctx = await bb.contexts.create({ name: "shop-admin" });

// First run: log in, then close the session so the state is saved
const first = await bb.sessions.create({
  browserSettings: { context: { id: ctx.id, persist: true } },
});

// Later run: already authenticated; persist: false = read the state, do not change it
const later = await bb.sessions.create({
  browserSettings: { context: { id: ctx.id, persist: false } },
});
```

Wait a few seconds after closing a `persist: true` session before reusing the context, and do not run two sessions on one context at once, or the site may log you out.

### Parallel runs

```typescript
async function titles(urls: string[], concurrency = 5) {
  const out: { url: string; title?: string; error?: string }[] = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    const batch = urls.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(async (url) => {
      const s = await bb.sessions.create({ projectId: process.env.BROWSERBASE_PROJECT_ID! });
      const b = await chromium.connectOverCDP(s.connectUrl);
      try {
        const p = b.contexts()[0].pages()[0];
        await p.goto(url, { waitUntil: "domcontentloaded" });
        return { url, title: await p.title() };
      } finally {
        await b.close();
      }
    }));
    settled.forEach((r, j) =>
      out.push(r.status === "fulfilled" ? r.value : { url: batch[j], error: String(r.reason) }));
  }
  return out;
}
```

### Stagehand

Stagehand is installed separately (`@browserbasehq/stagehand`, which also needs zod). Its constructor changed between major versions, so follow the README of the version you install rather than copying older snippets; the primitives (`act`, `extract`, `observe`) stay the same.

## Examples

### Example 1: Scrape a page that blocks datacenter IPs

**User prompt:** "Grab the product titles from this retailer, it blocks my server's IP."

The agent creates a session with `proxies: true` and a nearby `region`, connects with `chromium.connectOverCDP`, extracts titles with `page.$$eval`, closes the browser, and prints the replay URL. Result: a JSON list of titles; if the run is blocked, the replay shows where.

### Example 2: Reuse a logged-in session

**User prompt:** "Log into our supplier portal once and let nightly jobs reuse it."

The agent creates a context named `supplier-portal`, runs one interactive login with `persist: true`, stores the context id in `SUPPLIER_CONTEXT_ID`, and has nightly jobs create sessions with that context. When the portal expires the cookie, the job reports "login required" instead of retrying blindly.

## Guidelines

- Credentials come from environment variables; never commit API keys or put them in page scripts.
- Always close the browser in `finally`; sessions otherwise run until `timeout` and count against your concurrency limit.
- Stay within your plan's concurrent-session limit; batch with `Promise.allSettled`.
- Proxies, CAPTCHA solving and recordings do not make scraping permitted: respect the target's terms and robots rules.
- A recorded session can contain typed passwords or personal data; set `recordSession: false` for sensitive logins.
- `keepAlive`, regions and some stealth options depend on the plan; check the dashboard if the API rejects a field.
- For a local one-off script, plain Playwright is simpler and free; use Browserbase when you need scale, proxies or observability.
