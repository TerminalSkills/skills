---
name: marko
category: Frontend Development
tags: [framework, streaming, ssr, performance, ebay, ui, components]
version: 1.0.0
author: terminal-skills
---

# Marko — HTML-First UI Framework

You are an expert in Marko, the HTML-first UI framework by eBay that powers ebay.com. You help developers build high-performance web applications with streaming server rendering, automatic partial hydration, a concise tag-based syntax, and reactive state — optimized for fast first-paint and minimal client-side JavaScript through fine-grained reactivity and compiler optimizations.

## Core Capabilities

### Components

```marko
// components/product-card.marko — HTML-first syntax
<let/count=0/>

<div class="product-card">
  <img src=input.imageUrl alt=input.name />
  <h3>${input.name}</h3>
  <p class="price">$${input.price.toFixed(2)}</p>

  <div class="rating">
    <for|star| of=Array.from({length: 5})>
      <span class=(star < input.rating ? "filled" : "empty")>★</span>
    </for>
  </div>

  <div class="actions">
    <button onClick() { count++ }>
      Add to Cart ${count > 0 ? `(${count})` : ""}
    </button>
  </div>
</div>

style {
  .product-card {
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 16px;
    transition: box-shadow 0.2s;
  }
  .product-card:hover {
    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  }
  .filled { color: #f59e0b; }
  .empty { color: #d1d5db; }
}
```

### Streaming SSR

```marko
// pages/products.marko — Streaming server rendering
<let/products = fetch("/api/products").then(r => r.json()) />

<html>
<head>
  <title>Products</title>
</head>
<body>
  <h1>Our Products</h1>

  <!-- Streams immediately, fills in when data arrives -->
  <await|products| from=products>
    <@placeholder>
      <div class="skeleton-grid">
        <for|_| of=Array(8)>
          <div class="skeleton-card" />
        </for>
      </div>
    </@placeholder>

    <@then>
      <div class="product-grid">
        <for|product| of=products>
          <product-card
            name=product.name
            price=product.price
            imageUrl=product.image
            rating=product.rating
          />
        </for>
      </div>
    </@then>

    <@catch|error|>
      <div class="error">Failed to load products: ${error.message}</div>
    </@catch>
  </await>
</body>
</html>
```

### Reactive State

```marko
// components/todo-list.marko
<let/todos=[]/>
<let/newTodo=""/>

<form onSubmit(e) {
  e.preventDefault();
  if (newTodo.trim()) {
    todos = [...todos, { id: Date.now(), text: newTodo, done: false }];
    newTodo = "";
  }
}>
  <input value=newTodo onInput(e) { newTodo = e.target.value }
    placeholder="Add a todo..." />
  <button type="submit">Add</button>
</form>

<ul>
  <for|todo, index| of=todos>
    <li class=(todo.done ? "done" : "")>
      <input type="checkbox" checked=todo.done
        onChange() {
          todos = todos.map((t, i) =>
            i === index ? { ...t, done: !t.done } : t
          );
        }
      />
      <span>${todo.text}</span>
    </li>
  </for>
</ul>

<p>${todos.filter(t => t.done).length}/${todos.length} completed</p>
```

## Installation

```bash
npx @marko/create my-app
cd my-app && npm install
npm run dev                                # Dev server with hot reload
```

## Best Practices

1. **HTML-first** — Write HTML with embedded JS, not JS that returns HTML; natural template syntax
2. **Streaming SSR** — Use `<await>` for async data; browser gets HTML progressively, no blank page
3. **Automatic partial hydration** — Marko only sends JS for interactive components; static parts stay as HTML
4. **Fine-grained reactivity** — `<let/>` creates reactive state; only changed DOM nodes update
5. **Scoped styles** — CSS in `style {}` is scoped to the component; no class name collisions
6. **Tags API** — Components are custom tags; `<product-card>` auto-resolves from `components/` directory
7. **eBay scale** — Powers ebay.com serving billions of pages/day; battle-tested for performance
8. **Compiler optimized** — Build step optimizes component boundaries, splits server/client code automatically
