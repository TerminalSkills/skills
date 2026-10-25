---
name: stagehand
description: >-
  Stagehand is Browserbase's open-source SDK for browser agents. It adds three natural-language calls (act, extract, observe) on top of a Chrome browser you drive from TypeScript, Python or Go. Use this skill to automate sites that change often, pull schema-validated data from dynamic pages, log in without sending credentials to the model, and run the same script locally or on Browserbase. Use when someone says "automate this website with AI", "scrape a dynamic page", or "replace brittle Playwright selectors".
license: Apache-2.0
compatibility: 'Node.js 22.18+ (TypeScript SDK 4.x), local Chrome, an API key for a model provider (OpenAI, Anthropic, Google, Groq or Cerebras)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: automation
  repository: https://github.com/browserbase/stagehand
  tags: "browser-automation, ai-agent, web-scraping, natural-language, playwright"
---

# Stagehand

## Overview

Stagehand drives a real Chrome browser. You write normal navigation code (`page.goto`, `page.locator`) and call three AI primitives where a hard-coded selector would be fragile:

- `act(instruction)` performs one action ("click the sign in button").
- `extract(instruction, schema)` returns data validated against a Zod schema (Pydantic in Python).
- `observe(instruction)` returns candidate elements with real selectors and a description, without acting.

This skill covers the TypeScript SDK 4.x (`@browserbasehq/stagehand` 4.3.0 at the time of writing, Node 22.18 or newer). Version 4 is a rewrite: the 3.x API (`new Stagehand({ env, modelName })`, `stagehand.init()`, `stagehand.page`, `enableCaching`, `act({ action })`) does not exist any more. If a project pins 3.x (`npm view @browserbasehq/stagehand dist-tags` shows `v3-latest`), follow that version's docs instead of this page. Python (`pip install stagehand`) and Go SDKs exist with the same shape.

## Instructions

### 1. Install

```bash
npm install @browserbasehq/stagehand 'zod@~4.4.3'
export OPENAI_API_KEY=...   # or the key of whichever provider you use
```

Stay on Zod 4.4.x, as the docs recommend; other minors can cause type errors in `extract()`. Stagehand never reads API keys from the environment on its own: your code passes them in. A local run needs Chrome installed.

### 2. Launch a browser, create a session

```typescript
import { localBrowser, Stagehand } from "@browserbasehq/stagehand";

const browser = await localBrowser.launch({
  userDataDir: "./browser-data",   // keeps cookies between runs; omit for a fresh profile
  // headless: true,               // also: executablePath, viewport, proxy, args
});
try {
  const stagehand = await Stagehand.create({
    browser,
    model: { modelName: "openai/gpt-5.4-mini", apiKey: process.env.OPENAI_API_KEY },
  });
  try {
    const [page] = await browser.context.pages();
    await page.goto("https://news.ycombinator.com");
    // ... act / extract / observe here
  } finally {
    await stagehand.close();      // close the session first, then the browser
  }
} finally {
  await browser.close();
}
```

`modelName` is `provider/model` with provider `openai`, `anthropic`, `google`, `groq` or `cerebras`. Pick a current small model for speed and cost; override per call with `{ model: {...} }`. Scripts run as ES modules (`.mts`, or `"type": "module"`) because of top-level `await`; run with `npx tsx script.mts`.

### 3. act, observe, extract

```typescript
import { z } from "zod/v4";

await stagehand.act("click the 'Comments' link of the first story");

const { data: links } = await stagehand.observe("find the pagination 'More' link");
// links[0] = { selector, description, method?, arguments? }
await stagehand.act(links[0]);      // replays the observed action without a second model call

const { data } = await stagehand.extract(
  "extract the top 5 stories",
  z.object({
    stories: z.array(z.object({ title: z.string(), points: z.number(), url: z.string() })).max(5),
  }),
);
console.log(data.stories);
```

Each call returns an object whose `data` holds the result (plus usage and cache metadata). `stagehand.metrics()` reports token counts. Options on any call: `timeout`, `model`, `page` (target a specific tab), `locator` (limit the model to one region, e.g. `page.locator("form")`) and `ignoreLocators`.

### 4. Credentials

Two safe patterns. Best: let `observe()` find the field, then fill it with Playwright-style code so the secret never reaches the model.

```typescript
const { data: email } = await stagehand.observe("find the email input");
await page.locator(email[0].selector).fill(process.env.APP_EMAIL!);
```

Alternative: `variables` with `%name%` placeholders. The model sees only the names; values are substituted locally.

```typescript
await stagehand.act("type %password% into the password field",
  { variables: { password: process.env.APP_PASSWORD! }, cache: false });
```

Pass `cache: false` on calls that carry credentials, since server-side caching on Browserbase sends variable values to the cache service. Turn logging down (`logging: { level: "off" }` in `Stagehand.create`) when handling sensitive data.

### 5. Run on Browserbase

```typescript
import { browserbase, Stagehand } from "@browserbasehq/stagehand";

const browser = await browserbase.launch({ apiKey: process.env.BROWSERBASE_API_KEY! });
const stagehand = await Stagehand.create({ browser, cache: true });
```

With no `model`, Browserbase's Model Gateway selects and authenticates a model; a local browser cannot use the gateway and needs your own model key. `cache: true` serves identical repeated calls from Browserbase without spending tokens.

## Examples

### Example 1: "Get the invoice table out of our billing portal every Monday"
Launch with a persistent `userDataDir`. On the first run sign in using the step 4 pattern. In later runs the session cookie is still there, so go straight to the page and call `extract("extract every invoice in the table", z.object({ invoices: z.array(z.object({ number: z.string(), amount: z.number(), paid: z.boolean() })) }))`. The result is a typed array such as `[{ number: "INV-2041", amount: 1290, paid: true }]`, ready to write to CSV.

### Example 2: "My Playwright script breaks every time they redesign the checkout"
Keep `page.goto` and the stable steps in plain code, and replace only the brittle clicks with `await stagehand.act("click the Place order button")`. The instruction survives layout changes because the model resolves the element each run; add `cache: true` on Browserbase to avoid paying for unchanged pages.

## Guidelines

- One small action per `act()`; split "log in and open billing and download the PDF" into separate calls.
- Prefer `observe()` then `act(action)` or plain locators for steps you repeat, to cut model calls and make runs deterministic.
- Always give `extract()` a schema; keep it narrow and use `.describe()` on fields that are ambiguous.
- Model calls cost money and take seconds: do not use Stagehand for flows a plain selector handles reliably.
- Close the session before the browser, in `finally` blocks, so Chrome processes do not leak.
- Respect each site's terms of service and robots rules; never automate logins you are not authorized to use.
