---
name: alpine
description: |
  Alpine.js is a lightweight JavaScript framework for adding interactivity to HTML
  markup. It provides reactive data, event handling, and DOM manipulation through
  HTML attributes — like a modern jQuery replacement with declarative syntax.
license: Apache-2.0
compatibility:
  - any web server
  - html
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - javascript
    - html
    - lightweight
    - reactive
    - declarative
    - progressive-enhancement
---

# Alpine.js

Alpine.js adds reactive behavior directly in HTML using `x-` attributes. Ideal for adding interactivity to server-rendered pages without a build step.

## Installation

```html
<!-- index.html — add Alpine via CDN -->
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
```

## Core Directives

```html
<!-- templates/basics.html — fundamental Alpine directives -->
<div x-data="{ open: false, count: 0 }">
  <button @click="open = !open">Toggle</button>
  <div x-show="open" x-transition>
    <p>Toggleable content</p>
  </div>

  <p>Count: <span x-text="count"></span></p>
  <button @click="count++">Increment</button>

  <template x-if="count > 5">
    <p>Count is greater than 5!</p>
  </template>
</div>
```

## Data Binding

```html
<!-- templates/binding.html — two-way and attribute binding -->
<div x-data="{ name: '', color: 'blue' }">
  <input x-model="name" placeholder="Your name" />
  <p>Hello, <span x-text="name || 'stranger'"></span>!</p>

  <div :class="{ 'text-red': color === 'red', 'text-blue': color === 'blue' }">
    Colored text
  </div>
  <select x-model="color">
    <option value="blue">Blue</option>
    <option value="red">Red</option>
  </select>
</div>
```

## Loops

```html
<!-- templates/loops.html — iterating over data -->
<div x-data="{ items: ['Apples', 'Bananas'], newItem: '' }">
  <ul>
    <template x-for="(item, i) in items" :key="i">
      <li>
        <span x-text="item"></span>
        <button @click="items.splice(i, 1)">×</button>
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
<!-- templates/events.html — event modifiers -->
<div x-data>
  <button @click.prevent="doSomething()">Prevent default</button>
  <button @click.once="alert('Once!')">Click once</button>
  <input @keydown.enter="submit()" @keydown.escape="cancel()" />
  <input @input.debounce.300ms="search($event.target.value)" placeholder="Search..." />
  <div @click.outside="open = false">Click outside to close</div>
</div>
```

## Dropdown Component

```html
<!-- templates/dropdown.html — dropdown pattern -->
<div x-data="{ open: false }" @click.outside="open = false">
  <button @click="open = !open">Menu ▼</button>
  <div x-show="open" x-transition.origin.top.left @keydown.escape.window="open = false">
    <a href="/profile">Profile</a>
    <a href="/settings">Settings</a>
  </div>
</div>
```

## Reusable Components

```html
<!-- templates/reusable.html — Alpine.data for reusable logic -->
<script>
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
    get remaining() {
      return this.items.filter(i => !i.done).length;
    },
  }));
});
</script>

<div x-data="todoList">
  <form @submit.prevent="add">
    <input x-model="newItem" placeholder="New todo" />
  </form>
  <p x-text="`${remaining} remaining`"></p>
  <template x-for="(item, i) in items" :key="i">
    <div>
      <input type="checkbox" x-model="item.done" />
      <span x-text="item.text" :class="{ 'line-through': item.done }"></span>
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
<!-- templates/stores.html — shared state across components -->
<script>
document.addEventListener('alpine:init', () => {
  Alpine.store('notifications', {
    items: [],
    add(msg) { this.items.push({ text: msg, id: Date.now() }) },
    remove(id) { this.items = this.items.filter(n => n.id !== id) },
  });
});
</script>

<div x-data @click="$store.notifications.add('Clicked!')">Click me</div>
<div x-data>
  <template x-for="n in $store.notifications.items" :key="n.id">
    <div x-text="n.text" @click="$store.notifications.remove(n.id)"></div>
  </template>
</div>
```

## Magic Properties

```html
<!-- templates/magic.html — useful magic properties -->
<div x-data="{ items: [] }">
  <input x-ref="input" />
  <button @click="$refs.input.focus()">Focus</button>
  <button @click="items.push('new'); $nextTick(() => $refs.list.scrollTo(0, 99999))">Add & scroll</button>
  <div x-ref="list" style="max-height:200px;overflow:auto">
    <template x-for="item in items"><p x-text="item"></p></template>
  </div>
</div>
```

## Key Patterns

- `x-data` defines reactive scope — everything inside shares that state
- `x-show` toggles visibility (CSS), `x-if` inserts/removes from DOM
- `x-model` for two-way binding on inputs, selects, checkboxes
- Event modifiers (`.prevent`, `.stop`, `.debounce`, `.outside`) reduce boilerplate
- `Alpine.data()` extracts reusable component logic
- `Alpine.store()` for global state shared across components
- Pairs well with htmx: Alpine handles UI state, htmx handles server requests
