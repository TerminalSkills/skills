---
name: webmcp
description: >-
  Exposes a web page's functionality to AI agents as callable tools with WebMCP, a draft browser API (document.modelContext) from the W3C Web Machine Learning Community Group. Use when a user asks to "make my web app agent-ready", "let AI agents add items or search on my site", "register tools in the browser", "use document.modelContext.registerTool", or "test WebMCP in Chrome".
license: Apache-2.0
compatibility: "Chrome 149+ origin trial or the about:flags#enable-webmcp-testing flag for local development; Edge 150 origin trial. Secure context (HTTPS or localhost) required. Safari and Firefox have no implementation."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: "webmcp, mcp, ai-agents, browser-api"
  repository: https://github.com/webmachinelearning/webmcp
---
# WebMCP

## Overview

WebMCP is a proposed web platform API that lets a web page expose its own functionality as "tools": JavaScript functions with a natural-language description and a JSON Schema for their input. A browser-based AI agent discovers those tools and calls them directly instead of clicking through the UI or scraping the DOM.

Key facts, verified against the repository and spec:

- **Runs client-side in the page**, in the user's own authenticated browser session. There is no separate server; the tool's `execute` function is ordinary page JavaScript.
- **Status: draft.** It is a Draft Community Group Report of the W3C Web Machine Learning Community Group, "not a W3C Standard nor on the W3C Standards Track". The repository marks it experimental and says the draft has changed significantly since August 2025. Editors are from Google and Microsoft.
- **Browser support:** Chrome has an origin trial (Chrome 149) plus the `about:flags#enable-webmcp-testing` flag for local development; Edge has an origin trial (Edge 150). Safari and Firefox list no implementation, only standards-position issues. Treat it as progressive enhancement.
- Only the **imperative** API (`registerTool`) is defined by the spec. A declarative, form-based API is being explored but is not part of it.

The core surface is `document.modelContext` (a `ModelContext` object, SecureContext only):

| Member | Purpose |
|---|---|
| `registerTool(tool, { signal, exposedTo })` | Register a tool; aborting `signal` unregisters it. Returns a Promise. |
| `getTools({ fromOrigins })` | List registered tools (same-origin by default). Used by agents. |
| `executeTool(tool, args, { signal })` | Run a discovered tool; resolves to a JSON string. |
| `toolchange` event (`ontoolchange`) | Fires when tools are added, removed or updated. |

## Instructions

### 1. Enable it for development

Open Chrome with `about:flags#enable-webmcp-testing` enabled, or register for the origin trial (links in the Chrome docs at developer.chrome.com/docs/ai/webmcp). Serve the page over HTTPS or from `localhost`.

### 2. Add types (optional)

```bash
npm install --save-dev webmcp-types
```

The `webmcp-types` package provides TypeScript definitions for the API.

### 3. Feature-detect and register a tool

```js
if ('modelContext' in document) {
  const controller = new AbortController();
  await document.modelContext.registerTool(
    {
      name: 'add_task',
      title: 'Add task',
      description: 'Adds a task to the signed-in user\'s to-do list.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Task text' },
          due: { type: 'string', description: 'Due date, YYYY-MM-DD' }
        },
        required: ['title']
      },
      annotations: { readOnlyHint: false },
      async execute({ title, due }, { signal }) {
        const task = await todoStore.add({ title, due }, { signal });
        return { id: task.id, title: task.title, due: task.due };
      }
    },
    { signal: controller.signal }
  );
  // later: controller.abort() unregisters the tool
}
```

Tool fields: `name` and `description` and `execute` are required; `title`, `inputSchema` and `annotations` are optional. `execute(input, { signal })` returns a value that is serialized to a JSON string; the `signal` reports cancellation. If the value cannot be serialized, the call rejects.

### 4. Annotate the tool

`annotations` takes `readOnlyHint` (tool does not change state), `untrustedContentHint` (output contains user-generated or external data) and `consequentialHint` (high-stakes or irreversible, so the agent or browser can ask the user first). All default to false.

### 5. Register by page state

Register tools when they are useful for the current view and unregister them with the `AbortController` when the view changes. Register statically by default rather than building tool lists dynamically.

### 6. Inspect and test

An agent (or your test code) can enumerate and call tools:

```js
const tools = await document.modelContext.getTools();
const add = tools.find(t => t.name === 'add_task');
const result = await document.modelContext.executeTool(add, { title: 'Renew passport' });
document.modelContext.addEventListener('toolchange', () => console.log('tools changed'));
```

`getTools()` returns `RegisteredTool` entries with `name`, `title`, `description`, `inputSchema`, `window`, `origin`, `annotations`.

### 7. Cross-origin access

By default, other sites and cross-origin iframes cannot see your tools. Share a tool with `exposedTo: ['https://partner.shop']` (each entry must be a potentially trustworthy origin, else `SecurityError`). A cross-origin iframe needs the `allow="tools"` permission policy, or `registerTool()` rejects with `NotAllowedError`.

### Errors

Platform failures reject with a `DOMException` (`NotFoundError`, `DataError`, `OperationError`, `AbortError`). Return descriptive errors from `execute` so the model can retry with valid input.

## Examples

### Example 1: To-do app with add and list tools

Prompt: "Make my to-do app usable by browser agents."

```js
const ctx = document.modelContext;
await ctx.registerTool({
  name: 'list_tasks',
  description: 'Lists open tasks, optionally only those due on or before a date.',
  inputSchema: { type: 'object', properties: { dueBefore: { type: 'string', description: 'YYYY-MM-DD' } } },
  annotations: { readOnlyHint: true, untrustedContentHint: true },
  async execute({ dueBefore }) {
    return (await todoStore.open(dueBefore)).map(t => ({ id: t.id, title: t.title, due: t.due }));
  }
});
```

What the agent sees: two tools, `list_tasks` (read-only, content flagged untrusted because task titles may come from shared lists) and `add_task`. Asked "add 'Renew passport' due 2026-11-30", it calls `add_task` with `{ "title": "Renew passport", "due": "2026-11-30" }` and receives `{"id":"t_418","title":"Renew passport","due":"2026-11-30"}`; the page's UI updates because `todoStore` is the same state the interface renders.

### Example 2: Shop page with search and add-to-cart

```js
await ctx.registerTool({
  name: 'search_products',
  description: 'Searches the catalog by keyword and returns up to 10 matches with price in USD.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search words, e.g. "waterproof hiking boots"' },
      maxPrice: { type: 'number', description: 'Upper price limit in USD' }
    },
    required: ['query']
  },
  annotations: { readOnlyHint: true },
  async execute({ query, maxPrice }) {
    const hits = await catalog.search(query, { maxPrice, limit: 10 });
    return hits.map(p => ({ sku: p.sku, name: p.name, priceUsd: p.price }));
  }
});

await ctx.registerTool({
  name: 'add_to_cart',
  description: 'Adds a product to the cart. Does not place the order.',
  inputSchema: {
    type: 'object',
    properties: { sku: { type: 'string' }, quantity: { type: 'integer', minimum: 1, maximum: 10 } },
    required: ['sku']
  },
  async execute({ sku, quantity = 1 }) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10)
      return { error: 'quantity must be an integer from 1 to 10' };
    const item = await cart.add(sku, quantity);
    return { cartItems: cart.count(), added: item.name };
  }
});
```

There is deliberately no `checkout` tool: payment stays a human step in the UI. If you did add one, mark it `consequentialHint: true`.

## Guidelines

- **Security.** Tools run in the user's authenticated session with that user's permissions. Expose the smallest action set, validate every argument in code (schema constraints are guidance, not enforcement), and mark irreversible actions with `consequentialHint`. Never register tools that delete data, move money or change credentials without a confirmation step. The draft also describes `requestUserInteraction()` for asking the user mid-execution; its exact shape was not confirmed, so check the current spec before relying on it.
- **Untrusted output.** Set `untrustedContentHint` when results contain user-generated text, because a hostile string can try to steer the agent (prompt injection).
- **Cross-origin.** Leave `exposedTo` unset unless you trust the origin to act on behalf of your users. Read-only tools can still leak user data.
- **Tool design (Chrome guidance).** One job per tool, verb names that match behavior, specific parameter types and enums, self-explanatory values instead of opaque IDs, accept raw user input rather than making the model transform it. Chrome's security guide cites budgets: description 500 chars, parameter description 150, names 30, tool output 1.5K characters; these may change.
- **Instability.** The API is a draft and has changed repeatedly. Feature-detect `document.modelContext`, wrap registration in one module, and pin to your tested Chrome version.
- **When not to use it.** If you need server-to-agent access with no open browser tab, build a regular MCP server or API instead. WebMCP only works while the page is open in a supporting browser, and it is not usable for Safari or Firefox visitors today.
- Primary sources: github.com/webmachinelearning/webmcp, webmachinelearning.github.io/webmcp, developer.chrome.com/docs/ai/webmcp/best-practices.
