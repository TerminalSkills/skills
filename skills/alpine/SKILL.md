---
name: alpine
description: |
  Alpine.js is a lightweight JavaScript framework for adding interactivity to HTML
  markup. It provides reactive data, event handling, and DOM manipulation through
  HTML attributes — like a modern jQuery replacement with declarative syntax.
license: Apache-2.0
compatibility: 'Alpine.js 3.17.x; any web server or bundler; modern browsers'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/alpinejs/alpine
  category: development
  tags:
    - javascript
    - html
    - lightweight
    - reactive
---

# Alpine.js

## Overview

Alpine.js adds reactive behavior directly in HTML markup using `x-` attributes. It's ideal for adding interactivity to server-rendered pages without a build step or SPA framework. The current release is 3.17.5 (npm, October 2026); all snippets below were run against it in a DOM test.

## Instructions

Load Alpine with `defer`, put `x-data` on the element that owns the state, and use directives (`x-show`, `x-text`, `x-model`, `x-for`, `@event`) inside it. Reusable logic goes into `Alpine.data()`, shared state into `Alpine.store()`.

## Installation

```html
<!-- index.html — add Alpine via CDN -->
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.17.5/dist/cdn.min.js"
        integrity="sha384-FYLKjwG3aohNhNZoVG8sY/5ntunm+MqylL90Q+rT3OM7AwV9/BKFjk/RjoIpIgsI"
        crossorigin="anonymous"></script>
<!-- Or install the npm package named alpinejs. Plugins (@alpinejs/persist, mask, intersect, focus, collapse, anchor)
     are separate scripts that must load BEFORE the core script. -->
```

```javascript
// main.js — npm module setup
import Alpine from 'alpinejs';
window.Alpine = Alpine;
Alpine.start();   // call once, after registering Alpine.data / Alpine.store / plugins
```

If the page runs under a strict Content-Security-Policy without `unsafe-eval`, use the `@alpinejs/csp` build, which does not use `eval`/`new Function` and so limits what inline expressions may contain.

## Core Directives

```html
<!-- templates/basics.html — fundamental Alpine directives -->
<div x-data="{ open: false, count: 0 }">
  <!-- Toggle visibility -->
  <button @click="open = !open">Toggle</button>
  <div x-show="open" x-transition>
    <p>This content can be toggled</p>
  </div>

  <!-- Reactive counter -->
  <p>Count: <span x-text="count"></span></p>
  <button @click="count++">Increment</button>

  <!-- Conditional rendering (removes from DOM) -->
  <template x-if="count > 5">
    <p>Count is greater than 5!</p>
  </template>
</div>
```

## Data Binding

```html
<!-- templates/binding.html — two-way binding and attribute binding -->
<div x-data="{ name: '', color: 'blue' }">
  <!-- Two-way binding -->
  <input x-model="name" placeholder="Your name" />
  <p>Hello, <span x-text="name || 'stranger'"></span>!</p>

  <!-- Attribute binding -->
  <div :class="{ 'text-red': color === 'red', 'text-blue': color === 'blue' }">
    Colored text
  </div>
  <select x-model="color">
    <option value="blue">Blue</option>
    <option value="red">Red</option>
  </select>

  <!-- Style binding -->
  <div :style="{ color: color, fontWeight: name ? 'bold' : 'normal' }">
    Dynamic styles
  </div>
</div>
```

## Loops

```html
<!-- templates/loops.html — iterating over data -->
<div x-data="{ items: ['Apples', 'Bananas', 'Cherries'], newItem: '' }">
  <ul>
    <template x-for="(item, index) in items" :key="item">
      <li>
        <span x-text="item"></span>
        <button @click="items.splice(index, 1)">×</button>
      </li>
    </template>
  </ul>

  <form @submit.prevent="items.push(newItem); newItem = ''">
    <input x-model="newItem" placeholder="Add item" />
    <button type="submit">Add</button>
  </form>
</div>
```

## Event Handling

```html
<!-- templates/events.html — event modifiers and custom events -->
<div x-data="{ count: 0 }">
  <!-- Modifiers -->
  <button @click.prevent="count++">Prevent default</button>
  <button @click.once="alert('Only once!')">Click once</button>
  <input @keydown.enter="submitForm()" @keydown.escape="cancel()" />

  <!-- Debounce -->
  <input @input.debounce.300ms="search($event.target.value)" placeholder="Search..." />

  <!-- Listen to events from window -->
  <div @custom-event.window="count++">
    Count: <span x-text="count"></span>
  </div>

  <!-- Dispatch custom event -->
  <button @click="$dispatch('custom-event')">Dispatch</button>
</div>
```

## Component Patterns

```html
<!-- templates/dropdown.html — dropdown component -->
<div x-data="{ open: false }" @click.outside="open = false">
  <button @click="open = !open">
    Menu
    <span :class="{ 'rotate-180': open }" x-text="open ? '▲' : '▼'"></span>
  </button>

  <div x-show="open" x-transition.origin.top.left
    @keydown.escape.window="open = false"
    class="dropdown-menu">
    <a href="/profile">Profile</a>
    <a href="/settings">Settings</a>
    <button @click="$dispatch('logout')">Logout</button>
  </div>
</div>
```

## Reusable Data with Alpine.data

```html
<!-- templates/reusable.html — extracting reusable components -->
<script>
  // Register reusable component
  document.addEventListener('alpine:init', () => {
    Alpine.data('todoList', () => ({
      items: [],
      newItem: '',
      add() {
        if (this.newItem.trim()) {
          this.items.push({ text: this.newItem, done: false });
          this.newItem = '';
        }
      },
      remove(index) {
        this.items.splice(index, 1);
      },
      get remaining() {
        return this.items.filter(i => !i.done).length;
      },
    }));
  });
</script>

<!-- Use anywhere -->
<div x-data="todoList">
  <form @submit.prevent="add">
    <input x-model="newItem" placeholder="New todo" />
    <button type="submit">Add</button>
  </form>
  <p x-text="`${remaining} remaining`"></p>
  <template x-for="(item, i) in items" :key="i">
    <div>
      <input type="checkbox" x-model="item.done" />
      <span x-text="item.text" :class="{ 'line-through': item.done }"></span>
      <button @click="remove(i)">×</button>
    </div>
  </template>
</div>
```

## Working with htmx

```html
<!-- templates/alpine-htmx.html — Alpine + htmx together -->
<div x-data="{ editing: false }" id="article-42">
  <div x-show="!editing">
    <h2>Article Title</h2>
    <button @click="editing = true">Edit</button>
    <button hx-delete="/articles/42" hx-target="#article-42" hx-swap="outerHTML">Delete</button>
  </div>
  <form x-show="editing" hx-put="/articles/42" hx-target="#article-42" hx-swap="outerHTML">
    <input name="title" value="Article Title" />
    <button type="submit">Save</button>
    <button type="button" @click="editing = false">Cancel</button>
  </form>
</div>
```

## Stores (Global State)

```html
<!-- templates/stores.html — Alpine stores for shared state -->
<script>
  document.addEventListener('alpine:init', () => {
    Alpine.store('notifications', {
      items: [],
      add(msg) { this.items.push({ text: msg, id: Date.now() }) },
      remove(id) { this.items = this.items.filter(n => n.id !== id) },
    });
  });
</script>

<div x-data="{}" @click="$store.notifications.add('Button clicked!')">Click me</div>

<div x-data="{}">
  <template x-for="n in $store.notifications.items" :key="n.id">
    <div class="toast" x-text="n.text" @click="$store.notifications.remove(n.id)"></div>
  </template>
</div>
```

## Magic Properties

```html
<!-- templates/magic.html — Alpine magic properties -->
<div x-data="{ items: [] }">
  <!-- $refs — reference DOM elements -->
  <input x-ref="input" />
  <button @click="$refs.input.focus()">Focus input</button>

  <!-- $nextTick — run after DOM update -->
  <button @click="items.push('new'); $nextTick(() => $refs.list.scrollTo(0, 99999))">
    Add & scroll
  </button>
  <div x-ref="list" style="max-height:200px;overflow:auto">
    <template x-for="item in items"><p x-text="item"></p></template>
  </div>

  <!-- $watch — react to data changes -->
  <div x-init="$watch('items', (val) => console.log('items changed:', val))"></div>
</div>
```

## Examples

**"Add a dropdown that closes when I click elsewhere."** Use the dropdown above: `@click.outside="open = false"` on the wrapper and `@keydown.escape.window` on the menu. Result: the menu toggles on click, closes on outside click or Escape.

**"Search as I type without a framework."** `<input @input.debounce.300ms="search($event.target.value)">` calls `search` 300 ms after the last keystroke; define `search` in `Alpine.data('searchBox', ...)` and use `x-data="searchBox"`.

## Guidelines

- Use `x-data` on a parent element to define reactive scope — everything inside shares that state
- Use `x-show` for toggling visibility (CSS), `x-if` for conditional DOM insertion
- Use `x-model` for two-way binding on inputs, selects, checkboxes
- Use event modifiers (`.prevent`, `.stop`, `.debounce`, `.outside`) to reduce boilerplate
- Use `Alpine.data()` to extract reusable components with methods and computed properties
- Use `Alpine.store()` for global state shared across components
- Pairs excellently with htmx: Alpine handles UI state, htmx handles server communication
- Give `x-for` a unique `:key` (an id), not the index, when items can be removed or reordered; `x-for` and `x-if` must sit on a `<template>` with exactly one root element.
- Never put user-supplied HTML into `x-html`; use `x-text` for untrusted strings.
- Alpine 3 is current; htmx 2.x is the stable line (a 4.0 release is tagged `next`), and Alpine initializes elements htmx swaps in automatically.
