---
name: happy-dom
description: >-
  Run DOM tests without a browser using Happy DOM — fast JavaScript DOM
  implementation. Use when someone asks to "test without a browser", "Happy DOM",
  "fast DOM environment for tests", "replace jsdom", "Vitest DOM environment",
  or "server-side DOM". Covers test environment setup, Vitest/Jest integration,
  SSR testing, and performance comparison with jsdom.
license: Apache-2.0
compatibility: "Node.js 18+. Vitest, Jest, or standalone."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: testing
  tags: ["testing", "dom", "happy-dom", "jsdom", "vitest", "ssr"]
---

# Happy DOM

## Overview

Happy DOM is a JavaScript DOM implementation for Node.js — 3-10x faster than jsdom. It provides `window`, `document`, `HTMLElement`, and 1000+ Web APIs without launching a browser. Use it as the test environment for Vitest or Jest when testing UI components, or for server-side DOM manipulation (email templates, HTML generation, scraping).

## When to Use

- Test environment for React/Vue/Svelte component tests (faster than jsdom)
- Vitest setup — Happy DOM is the recommended environment
- Server-side HTML generation or manipulation
- Parsing and extracting data from HTML strings
- Email template rendering on the server

## Instructions

### Vitest Integration

```bash
npm install -D happy-dom
```

```typescript
// vitest.config.ts — Use Happy DOM for all tests
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
  },
});
```

That's it — all tests now run with Happy DOM providing DOM APIs.

### Per-File Environment

```typescript
// tests/component.test.ts — Override environment for specific tests
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";

test("renders heading", () => {
  render(<h1>Hello</h1>);
  expect(screen.getByRole("heading")).toHaveTextContent("Hello");
});
```

### Jest Integration

```javascript
// jest.config.js
module.exports = {
  testEnvironment: "@happy-dom/jest-environment",
};
```

### Standalone Usage

```typescript
// render.ts — Server-side DOM manipulation
import { Window } from "happy-dom";

const window = new Window({ url: "https://localhost:3000" });
const document = window.document;

// Parse HTML
document.body.innerHTML = `
  <div class="container">
    <h1>Hello World</h1>
    <ul id="items">
      <li>Item 1</li>
      <li>Item 2</li>
    </ul>
  </div>
`;

// Query and manipulate
const heading = document.querySelector("h1");
console.log(heading?.textContent); // "Hello World"

const items = document.querySelectorAll("#items li");
console.log(items.length); // 2

// Create elements
const newItem = document.createElement("li");
newItem.textContent = "Item 3";
document.getElementById("items")?.appendChild(newItem);

// Serialize back to HTML
console.log(document.body.innerHTML);

// Clean up
await window.happyDOM.close();
```

### Email Template Rendering

```typescript
// email.ts — Render email templates server-side
import { Window } from "happy-dom";

function renderEmailTemplate(template: string, data: Record<string, string>): string {
  const window = new Window();
  const document = window.document;

  document.body.innerHTML = template;

  // Replace placeholders
  for (const [key, value] of Object.entries(data)) {
    const elements = document.querySelectorAll(`[data-field="${key}"]`);
    elements.forEach((el) => { el.textContent = value; });
  }

  const html = document.body.innerHTML;
  window.happyDOM.close();
  return html;
}
```

## Examples

### Example 1: Speed up Vitest test suite

**User prompt:** "Our Vitest tests using jsdom take 45 seconds. Make them faster."

The agent will switch the test environment to Happy DOM (one config change), verify all tests still pass, and benchmark the improvement (typically 3-5x faster).

### Example 2: Parse and extract data from HTML

**User prompt:** "Parse HTML pages and extract structured data without a browser."

The agent will use Happy DOM to parse HTML strings, query elements with CSS selectors, and return structured data.

## Guidelines

- **One config line for Vitest** — `environment: "happy-dom"` in vitest.config.ts
- **3-10x faster than jsdom** — measurable improvement on large test suites
- **1000+ Web APIs** — `fetch`, `FormData`, `URL`, `MutationObserver`, `IntersectionObserver`
- **Not 100% browser-identical** — some edge cases differ; test critical paths in a real browser
- **`window.happyDOM.close()`** — clean up resources in standalone usage
- **Works with Testing Library** — `@testing-library/react` works unchanged
- **Lighter than jsdom** — less memory, faster startup
- **SSR testing** — render components server-side and assert on HTML output
- **Per-file override** — `// @vitest-environment happy-dom` for specific tests
