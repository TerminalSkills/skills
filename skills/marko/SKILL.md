---
name: marko
description: >-
  Marko is an HTML-based UI language and framework from eBay with streaming
  server rendering, fine-grained reactivity and automatic partial hydration.
  Use when a user asks to build or migrate a Marko app, write .marko
  components with <let>, <const>, <for> and <try>/<await>, stream pages with
  async data, set up Marko Run or Vite, or upgrade from Marko 5 to Marko 6.
license: Apache-2.0
compatibility: "Node.js 18, 20, 22 or newer; Marko 6 with Marko Run or the Vite plugin"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/marko-js/marko
  category: development
  tags:
    - marko
    - ssr
    - streaming
    - frontend
    - components
---

# Marko — HTML-First UI Framework

## Overview

Marko is a superset of HTML: almost any valid HTML file is a valid `.marko` file, with extra tags for state, loops, conditionals and async data. The compiler decides what runs on the server and what ships to the browser, so only components that actually react to user input send JavaScript. Pages stream: HTML is flushed as soon as it is ready and slow parts fill in later. Latest release checked: `marko` 6.4.0 (2026-09-29), built with `@marko/run` 0.11.x.

Marko 6 uses the "Tags API" only. Marko 5 class components (`class { ... }`, `this.state`, `component.setState`) and `<await ... from=...>` with `<@then>` belong to the older runtime; see the migration notes below.

## Instructions

### Create a project

```bash
npm init marko -- -t basic        # scaffolds a Marko Run app (TypeScript)
cd shop && npm install
npm run dev                       # marko-run dev server
npm run build && npm start        # builds to dist/ and runs node dist/index.mjs
```

The template has `src/routes/+page.marko` (the `/` page), `+layout.marko` and `src/tags/`. Marko Run routes come from the file system: `src/routes/products/+page.marko` serves `/products`; `+layout.marko` wraps pages with `<${input.content}/>`. Without Marko Run, add `marko` plus `vite` and `@marko/vite` and register `marko()` in `vite.config.ts`; add `@marko/type-check` (`mtc`) for TypeScript checks. The `npm init marko` step needs a configured git identity because it creates an initial commit.

### Components (tags)

A file in a `tags/` directory is a custom tag named after the file; Marko searches `tags/` folders upward from the current file (`tags/product-card.marko` becomes `<product-card/>`, as does `tags/product-card/index.marko`). You can also `import ProductCard from "./product-card.marko"` and use `<ProductCard/>`. Attributes arrive as `input`.

```marko
// src/tags/product-card.marko
export interface Input {
  name: string;
  price: number;
}

<let/qty=0>
<const/{ name, price } = input>
<article class="card">
  <h3>${name}</h3>
  <p>$${price.toFixed(2)}</p>
  <button onClick() { qty++ }>Add to cart<if=qty> (${qty})</if></button>
</article>
```

### Core tags

- `<let/count=0>`: reactive state; assign (`count++`, `todos = [...todos, item]`) inside handlers. Each assignment re-runs only what depends on it.
- `<const/doubled=count * 2>`: derived value.
- `<if=cond>`, `<else if=cond>`, `<else>`; `<show=cond>` keeps the content in the DOM and toggles visibility.
- `<for|item, index| of=list by="id">`; also `in=`, and `from= to= step=` for ranges. Give lists a `by` key.
- `<try>` with `<@placeholder>` (loading UI) and `<@catch|err|>` (error UI), wrapping `<await|value|=promise>`.
- `<script>` runs on the client after render, and re-runs when values it reads change; `<lifecycle onMount() {} onUpdate() {} onDestroy() {}/>` for imperative libraries.
- `<id/uid>` creates a unique id, `<define/Name|input|>` makes an inline tag, `<return=value>` exposes a value through a tag variable.
- `<style>` blocks belong to the component; with `<style/styles>` you get CSS-module class names (`class=styles.card`). Use `<style.scss>` or `.less` for preprocessors.

### Streaming with async data

```marko
// src/routes/+page.marko
static async function loadProducts() {
  const res = await fetch("https://api.northwind-outfitters.com/v1/products?limit=24");
  if (!res.ok) throw new Error(`catalog returned ${res.status}`);
  return res.json();
}

<h1>New arrivals</h1>
<try>
  <await|products|=loadProducts()>
    <for|p| of=products by="id">
      <product-card name=p.name price=p.price/>
    </for>
  </await>
  <@placeholder><p>Loading products...</p></@placeholder>
  <@catch|err|><p class="error">Could not load products: ${err.message}</p></@catch>
</try>
```

The browser receives the heading and the placeholder immediately; the list replaces the placeholder when the promise settles. Proxies and CDNs that buffer responses defeat streaming; check them if the page appears all at once.

### Migrating from Marko 5

Replace `class {}` components and `state`/`setState` with `<let>`; `<await from=p><@then>` with `<try><await|v|=p>`; `<@placeholder>` now lives on `<try>`; keep Marko 5 apps on `marko@5` until each page is migrated, because the runtimes differ. Marko 5 docs are archived with the package at `packages/runtime-class` in the repository.

## Examples

### Add a cart counter component and use it on a page

User: "Make a reusable quantity-picker for our Marko store."

```marko
// src/tags/qty-picker.marko
<let/qty=1>
<div class="qty">
  <button onClick() { if (qty > 1) qty-- } disabled=(qty === 1)>-</button>
  <span>${qty}</span>
  <button onClick() { qty++ }>+</button>
</div>
```

Use it with `<qty-picker/>` in any page under the same `src`. Result: the page is server-rendered HTML; only the picker's tiny handler code is sent to the browser.

### Todo list with derived state

User: "Show a todo list with a done counter."

```marko
// src/tags/todo-list.marko
<let/todos=[{ id: 1, text: "Order mugs", done: false }]>
<const/doneCount=todos.filter((t) => t.done).length>
<ul>
  <for|todo| of=todos by="id">
    <li>
      <input type="checkbox" checked=todo.done onChange() {
        todos = todos.map((t) => t.id === todo.id ? { ...t, done: !t.done } : t);
      }>
      ${todo.text}
    </li>
  </for>
</ul>
<p>${doneCount}/${todos.length} done</p>
```

Assign a new array rather than mutating the old one so the change is noticed.

## Guidelines

- Check `npm ls marko` first; many blog posts and older answers describe Marko 3 to 5 syntax that does not compile in 6.
- `${expr}` escapes HTML; use it for all user data. Never inject raw HTML from users.
- Server code that reads secrets belongs in `static` functions or route handlers (`+handler.ts`), not in `<script>` or event handlers, which ship to the browser.
- Keep state as local as possible; a `<let>` in a layout re-renders more than one in a small tag.
- Marko compiles on the fly under Vite; a failed `marko-run build` is the quickest way to find template syntax errors.
- Marko is a good fit for content-heavy, fast-first-paint sites; for a large existing React or Vue team, the ecosystem is smaller.
