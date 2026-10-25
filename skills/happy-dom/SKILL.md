---
name: happy-dom
description: >-
  Run DOM tests without a browser using Happy DOM — fast JavaScript DOM
  implementation. Use when someone asks to "test without a browser", "Happy DOM",
  "fast DOM environment for tests", "replace jsdom", "Vitest DOM environment",
  or "server-side DOM". Covers test environment setup, Vitest/Jest integration,
  SSR testing, and performance comparison with jsdom.
license: Apache-2.0
compatibility: "happy-dom 21 needs Node.js 20+; Vitest 5 needs Node.js 22.12+. Vitest, Jest, Bun, or standalone."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/capricorn86/happy-dom
  tags: "testing, dom, happy-dom, jsdom, vitest"
---

# Happy DOM

## Overview

Happy DOM is a JavaScript implementation of a web browser without a GUI, for Node.js and Bun. It provides `window`, `document`, `HTMLElement`, custom elements, `MutationObserver`, `fetch` and many other Web APIs without launching a browser, and is usually faster to start than jsdom. Use it as the test environment for Vitest or Jest when testing UI components, or for server-side DOM manipulation (email templates, HTML generation, scraping).

Security: older releases let page scripts escape the sandbox and run code on the host (several critical advisories, for example GHSA-37j7-fg3j-429f fixed in 20.0.0, and further high-severity ones up to 21.0.3). Always install the latest release (21.0.4 at the time of writing, `npm view happy-dom version`). Since 20.0 JavaScript evaluation of page scripts is off by default; leave it off, and never feed untrusted HTML or URLs to a Window with `enableJavaScriptEvaluation: true`.

## When to Use

- Test environment for React/Vue/Svelte component tests (faster than jsdom)
- Vitest, Jest or Bun test environment (Vitest supports it out of the box)
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

That's it — all tests now run with Happy DOM providing DOM APIs. For Testing Library matchers add `setupFiles: ["./setup.ts"]` containing `import "@testing-library/jest-dom/vitest";` and install `@testing-library/react`, `@testing-library/dom` and `@testing-library/jest-dom`. Verified with Vitest 5.0.5, happy-dom 21.0.4 and React Testing Library 16.

### Per-File Environment

```typescript
// tests/component.test.tsx — JSX needs a .tsx file. Override environment for specific tests
// @vitest-environment happy-dom

import { expect, test } from "vitest";
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

Install it with `npm install -D @happy-dom/jest-environment happy-dom`.

### Timers and async work

`await window.happyDOM.waitUntilComplete()` waits for pending timers, fetches and other async tasks started on that window (verified for `window.setTimeout`). Under Vitest the global `setTimeout` is not Happy DOM's, so `waitUntilComplete()` and the timer settings do not cover it; use `vi.useFakeTimers()` or Testing Library's `waitFor` instead.

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

async function renderEmailTemplate(template: string, data: Record<string, string>): Promise<string> {
  const window = new Window();
  const document = window.document;

  document.body.innerHTML = template;

  // Replace placeholders
  for (const [key, value] of Object.entries(data)) {
    const elements = document.querySelectorAll(`[data-field="${key}"]`);
    elements.forEach((el) => { el.textContent = value; });
  }

  const html = document.body.innerHTML;
  await window.happyDOM.close();
  return html;
}
```

## Examples

### Example 1: Speed up Vitest test suite

**User prompt:** "Our Vitest tests using jsdom take 45 seconds. Make them faster."

The agent will install `happy-dom`, switch the test environment to it (one config change), run the suite to see which tests still pass, and time both runs (`npx vitest run`) to report the real difference.

### Example 2: Parse and extract data from HTML

**User prompt:** "Parse HTML pages and extract structured data without a browser."

The agent will use Happy DOM to parse HTML strings, query elements with CSS selectors, and return structured data.

## Guidelines

- **One config line for Vitest** — `environment: "happy-dom"` in vitest.config.ts
- **Faster startup than jsdom** — measure on your own suite before and after switching
- **Many Web APIs** — `fetch`, `FormData`, `URL`, `MutationObserver`, custom elements; not every browser API exists, so check a missing one before assuming a bug
- **Keep it updated** — pin `happy-dom` to the latest release; old versions have critical sandbox-escape advisories
- **Not 100% browser-identical** — some edge cases differ; test critical paths in a real browser
- **`await window.happyDOM.close()`** — clean up resources in standalone usage; `window.happyDOM.abort()` cancels pending work
- **Works with Testing Library** — `@testing-library/react` works unchanged
- **SSR testing** — render components server-side and assert on HTML output
- **Per-file override** — `// @vitest-environment happy-dom` for specific tests
