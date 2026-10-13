---
title: Expose Your Web App's Actions to AI Agents with WebMCP
slug: expose-web-app-actions-to-ai-agents-with-webmcp
description: Let browser-based AI agents search, add items and run safe actions on your site through typed tools instead of fragile click-and-scrape automation, using the draft WebMCP browser API.
skills:
  - webmcp
category: development
tags:
  - webmcp
  - mcp
  - ai-agents
  - browser
  - web-development
---

## The Problem

Daria runs a small outdoor-gear shop. Customers increasingly ask a browser assistant to "find waterproof hiking boots under $150 and put the best one in my cart". The agent reads screenshots and the DOM, guesses which button is "Add to cart", and breaks every time she redesigns the product page. She cannot build a full MCP server for this: the cart lives in the visitor's logged-in session, and a server-side integration would need to re-implement authentication.

## The Solution

WebMCP lets the page itself publish tools through `document.modelContext.registerTool()`. The agent discovers `search_products` and `add_to_cart` with typed inputs and calls them in the visitor's own authenticated session. Using the `webmcp` skill, the agent writing the code follows the verified API shape, adds annotations, and keeps checkout out of reach. WebMCP is a W3C Community Group draft with Chrome and Edge origin trials, so it is added as progressive enhancement.

## Step-by-Step Walkthrough

### Step 1: Enable WebMCP in a test browser

Turn on `about:flags#enable-webmcp-testing` in Chrome and serve the shop from `localhost` (a secure context is required).

### Step 2: Feature-detect and register a read-only search tool

```js
if ('modelContext' in document) {
  await document.modelContext.registerTool({
    name: 'search_products',
    description: 'Searches the catalog by keyword; returns up to 10 products with USD price.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, maxPrice: { type: 'number' } },
      required: ['query']
    },
    annotations: { readOnlyHint: true },
    async execute({ query, maxPrice }) {
      return (await catalog.search(query, { maxPrice, limit: 10 }))
        .map(p => ({ sku: p.sku, name: p.name, priceUsd: p.price }));
    }
  });
}
```

### Step 3: Register add_to_cart with strict validation

Validate quantity in code, return a descriptive error on bad input so the model retries, and reuse the same cart store the UI renders so the page updates immediately.

### Step 4: Tie tool lifetime to the page

Pass an `AbortController` signal as the second argument to `registerTool` and call `abort()` when the user leaves the product view, so only relevant tools are exposed.

### Step 5: Test with getTools and executeTool

In the console, run `await document.modelContext.getTools()` to confirm both tools appear, then `executeTool` with `{ query: "hiking boots", maxPrice: 150 }`. Listen for `toolchange` to confirm registration changes.

## Real-World Example

After the change, a visitor asks their browser agent for boots under $150. The agent calls `search_products` and gets three results such as `{ "sku": "BT-2210", "name": "Ridgeline Waterproof Boot", "priceUsd": 139 }`, then calls `add_to_cart` with `{ "sku": "BT-2210", "quantity": 1 }`. The cart badge on the page updates to 1. Daria deliberately did not register a checkout tool, so the visitor reviews the cart and pays by hand. Visitors on Safari or Firefox see the unchanged site, since no `document.modelContext` exists there.

## Related Skills

- `webmcp` - the skill used throughout this guide
