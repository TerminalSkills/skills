---
name: stagehand
description: >-
   You are an expert in Stagehand by BrowserBase, the AI-powered browser
  automation framework that lets you control web pages using natural language
  instructions. You help developers build web automations that act, extract
  data, and observe pages using plain English commands instead of brittle CSS
  selectors — powered by GPT-4o or Claude for visual understanding of page
  layouts.
category: AI & Machine Learning
tags: [browser-automation, ai-agent, computer-use, web-automation, natural-language, playwright]
version: 1.0.0
author: terminal-skills
---

# Stagehand — AI Browser Automation in Natural Language

You are an expert in Stagehand by BrowserBase, the AI-powered browser automation framework that lets you control web pages using natural language instructions. You help developers build web automations that act, extract data, and observe pages using plain English commands instead of brittle CSS selectors — powered by GPT-4o or Claude for visual understanding of page layouts.

## Core Capabilities

### Setup and Basic Actions

```typescript
import { Stagehand } from "@browserbasehq/stagehand";

const stagehand = new Stagehand({
  env: "LOCAL",                           // "LOCAL" for Playwright, "BROWSERBASE" for cloud
  modelName: "gpt-4o",
  modelClientOptions: { apiKey: process.env.OPENAI_API_KEY },
  enableCaching: true,                    // Cache AI decisions for repeated patterns
});

await stagehand.init();
const page = stagehand.page;              // Standard Playwright page object

// Navigate
await page.goto("https://app.example.com");

// Act — natural language browser control
await stagehand.act({ action: "Click the sign-in button" });
await stagehand.act({ action: "Type 'user@example.com' into the email field" });
await stagehand.act({ action: "Select 'Enterprise' from the plan dropdown" });
await stagehand.act({ action: "Scroll down to the pricing section" });

// Act with variables — keep credentials out of prompts
await stagehand.act({
  action: "Log in with username %user% and password %pass%",
  variables: {
    user: process.env.USERNAME!,
    pass: process.env.PASSWORD!,
  },
});
```

### Extract Structured Data

```typescript
// Extract structured data from any page
const products = await stagehand.extract({
  instruction: "Extract all product listings with name, price, rating, and availability",
  schema: {
    type: "object",
    properties: {
      products: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            price: { type: "number" },
            rating: { type: "number" },
            inStock: { type: "boolean" },
          },
          required: ["name", "price"],
        },
      },
    },
  },
});

// Extract from complex pages (tables, nested layouts)
const invoiceData = await stagehand.extract({
  instruction: "Extract the invoice number, date, line items with quantities and amounts, and the total",
  schema: invoiceSchema,
});
```

### Observe — Find Elements Without Acting

```typescript
// Observe returns possible actions without performing them
const actions = await stagehand.observe({
  instruction: "Find all clickable navigation items",
});
// Returns: [{description: "Home link", selector: "xpath=...", ...}, ...]

// Use observe for conditional logic
const buttons = await stagehand.observe({
  instruction: "Find the 'Accept cookies' button if it exists",
});
if (buttons.length > 0) {
  await stagehand.act({ action: "Dismiss the cookie popup" });
}
```

### Cloud Execution with BrowserBase

```typescript
// Run in cloud for parallel, scalable automation
const stagehand = new Stagehand({
  env: "BROWSERBASE",                     // Cloud-hosted browser
  modelName: "gpt-4o",
  browserbaseSessionCreateParams: {
    projectId: process.env.BROWSERBASE_PROJECT_ID!,
    proxies: true,                        // Residential proxy
  },
});
```

## Installation

```bash
npm install @browserbasehq/stagehand
# Requires: OPENAI_API_KEY or ANTHROPIC_API_KEY
# Optional: BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID for cloud
```

## Best Practices

1. **Natural language for dynamic pages** — Use `act()` for pages that change layout frequently; CSS selectors break, natural language adapts
2. **Variables for secrets** — Never put credentials in action strings; use the `variables` parameter
3. **Enable caching** — Set `enableCaching: true` to avoid repeated AI calls for identical actions; huge cost savings
4. **Combine with Playwright** — Use `stagehand.page` for stable interactions (login forms) and `stagehand.act()` for dynamic ones
5. **Schema for extraction** — Always provide a Zod/JSON schema to `extract()`; structured output is more reliable than free-text
6. **Observe before acting** — Use `observe()` to check if elements exist before acting; prevents errors on conditional UI
7. **BrowserBase for scale** — Use cloud browsers for parallel automation; local is fine for development and testing
8. **Model selection** — GPT-4o for speed, Claude for complex visual reasoning; both work well for most tasks
