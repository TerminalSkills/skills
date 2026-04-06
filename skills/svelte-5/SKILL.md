---
name: svelte-5
description: >-
  Build reactive web apps with Svelte 5's new runes system. Use when: building
  new Svelte 5 apps, migrating from Svelte 4, using runes for reactivity ($state,
  $derived, $effect, $props), replacing stores with fine-grained state, using
  snippets instead of slots, or working with SvelteKit 2.
license: Apache-2.0
compatibility: "Requires Svelte 5.0+, SvelteKit 2.0+ (optional)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: frontend
  tags: ["svelte", "svelte-5", "runes", "reactive", "frontend"]
  use-cases:
    - "Build a reactive counter or form with $state and $derived runes"
    - "Migrate a Svelte 4 component using stores to Svelte 5 runes"
    - "Replace a Svelte 4 slot with a Svelte 5 snippet"
    - "Create a shared reactive store using $state in a .svelte.ts file"
    - "Run a side effect that syncs with external state using $effect"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Svelte 5

## Overview

Svelte 5 introduces **runes** — a new reactivity model that replaces `$:` reactive declarations, `let` bindings, and Svelte stores with explicit, composable primitives. Runes are functions that start with `$` and are processed by the Svelte compiler.

**Key changes from Svelte 4:**
- `let count = 0` → `let count = $state(0)`
- `$: doubled = count * 2` → `let doubled = $derived(count * 2)`
- `$: { ... }` side effect → `$effect(() => { ... })`
- `export let prop` → `let { prop } = $props()`
- Svelte stores → `$state` in `.svelte.ts` files
- Slots → Snippets

## Runes Reference

### `$state` — reactive state

```svelte
<script>
  let count = $state(0);
  let user = $state({ name: "Alice", age: 30 });

  // Deep reactivity: nested properties trigger updates
  function birthday() {
    user.age++; // reactive!
  }
</script>

<button onclick={() => count++}>{count}</button>
<p>{user.name} is {user.age}</p>
```

**`$state.raw`** — shallow (non-deep) reactive value:

```svelte
<script>
  // Only the top-level reference is reactive; mutations don't trigger updates
  let items = $state.raw([1, 2, 3]);

  function addItem() {
    items = [...items, items.length + 1]; // must reassign
  }
</script>
```

**`$state.snapshot`** — get a plain (non-reactive) copy:

```svelte
<script>
  let form = $state({ name: "", email: "" });

  async function submit() {
    const data = $state.snapshot(form); // plain object for API call
    await fetch("/api", { method: "POST", body: JSON.stringify(data) });
  }
</script>
```

---

### `$derived` — computed values

```svelte
<script>
  let price = $state(100);
  let quantity = $state(3);

  // Recomputes when price or quantity changes
  let total = $derived(price * quantity);
  let discounted = $derived(total > 200 ? total * 0.9 : total);
</script>

<p>Total: ${total}</p>
<p>With discount: ${discounted.toFixed(2)}</p>
```

**`$derived.by`** — for multi-line derived logic:

```svelte
<script>
  let items = $state([{ name: "A", price: 10 }, { name: "B", price: 20 }]);

  let summary = $derived.by(() => {
    const total = items.reduce((sum, item) => sum + item.price, 0);
    const count = items.length;
    return { total, count, avg: count > 0 ? total / count : 0 };
  });
</script>

<p>{summary.count} items, avg ${summary.avg.toFixed(2)}</p>
```

---

### `$effect` — side effects

```svelte
<script>
  let query = $state("");
  let results = $state([]);

  // Runs when query changes; cleanup runs before next execution
  $effect(() => {
    if (!query) return;
    const controller = new AbortController();

    fetch(`/api/search?q=${query}`, { signal: controller.signal })
      .then(r => r.json())
      .then(data => { results = data; });

    // Cleanup function (equivalent to useEffect return)
    return () => controller.abort();
  });
</script>

<input bind:value={query} placeholder="Search..." />
```

**`$effect.pre`** — runs before DOM updates:

```svelte
<script>
  let messages = $state([]);
  let scrollContainer: HTMLElement;

  $effect.pre(() => {
    // Access messages.length to track changes
    messages.length;
    // Runs before DOM update — useful for scroll position
  });
</script>
```

---

### `$props` — component props

```svelte
<!-- Button.svelte -->
<script>
  let {
    label,
    variant = "primary",      // default value
    onclick,                   // event handler
    class: className = "",     // renamed (class is reserved)
    ...rest                    // rest props spread to element
  } = $props();
</script>

<button
  class="btn btn-{variant} {className}"
  {onclick}
  {...rest}
>
  {label}
</button>
```

Usage:

```svelte
<Button label="Submit" variant="danger" onclick={() => console.log("clicked")} />
```

---

### `$bindable` — two-way binding

```svelte
<!-- Input.svelte — exposes value for bind: -->
<script>
  let { value = $bindable(""), placeholder = "" } = $props();
</script>

<input bind:value {placeholder} />
```

```svelte
<!-- Parent.svelte -->
<script>
  import Input from "./Input.svelte";
  let name = $state("");
</script>

<Input bind:value={name} placeholder="Your name" />
<p>Hello, {name}!</p>
```

---

### `$inspect` — debug reactive values

```svelte
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);

  // Logs to console whenever count or doubled changes (dev only)
  $inspect(count, doubled);

  // Custom handler
  $inspect(count).with((type, value) => {
    console.log(`[${type}] count =`, value); // type: "init" | "update"
  });
</script>
```

---

## Snippets (replacing Slots)

Svelte 5 replaces slots with **snippets** — typed, reusable markup fragments.

### Basic snippet

```svelte
<!-- Card.svelte -->
<script>
  let { header, children } = $props();
</script>

<div class="card">
  <div class="card-header">
    {@render header()}
  </div>
  <div class="card-body">
    {@render children()}
  </div>
</div>
```

```svelte
<!-- Parent.svelte -->
<Card>
  {#snippet header()}
    <h2>My Card Title</h2>
  {/snippet}
  <p>Card body content here.</p>
</Card>
```

### Snippet with parameters

```svelte
<!-- List.svelte -->
<script>
  let { items, row } = $props();
</script>

<ul>
  {#each items as item}
    <li>{@render row(item)}</li>
  {/each}
</ul>
```

```svelte
<!-- Parent.svelte -->
<List {items}>
  {#snippet row(item)}
    <strong>{item.name}</strong> — {item.description}
  {/snippet}
</List>
```

---

## Migration from Svelte 4

### Reactive declarations → `$derived`

```svelte
<!-- Svelte 4 -->
<script>
  let count = 0;
  $: doubled = count * 2;
  $: console.log("count changed:", count);
</script>

<!-- Svelte 5 -->
<script>
  let count = $state(0);
  let doubled = $derived(count * 2);
  $effect(() => { console.log("count changed:", count); });
</script>
```

### Stores → `$state` in module

```ts
// Svelte 4: stores/counter.ts
import { writable, derived } from "svelte/store";
export const count = writable(0);
export const doubled = derived(count, $c => $c * 2);
```

```ts
// Svelte 5: state/counter.svelte.ts
// Use .svelte.ts extension for runes outside components
let count = $state(0);
let doubled = $derived(count * 2);

export function getCounter() {
  return {
    get count() { return count; },
    get doubled() { return doubled; },
    increment() { count++; },
    reset() { count = 0; },
  };
}
```

```svelte
<!-- Component.svelte -->
<script>
  import { getCounter } from "$lib/state/counter.svelte.ts";
  const counter = getCounter();
</script>

<p>{counter.count} (doubled: {counter.doubled})</p>
<button onclick={counter.increment}>+1</button>
```

### Props: `export let` → `$props()`

```svelte
<!-- Svelte 4 -->
<script>
  export let name;
  export let age = 0;
</script>

<!-- Svelte 5 -->
<script>
  let { name, age = 0 } = $props();
</script>
```

### Slots → Snippets

```svelte
<!-- Svelte 4 -->
<div><slot name="header" /><slot /></div>

<!-- Svelte 5 -->
<script>
  let { header, children } = $props();
</script>
<div>{@render header?.()}{@render children?.()}</div>
```

---

## SvelteKit 2 Compatibility

SvelteKit 2 works with Svelte 5 out of the box. Key patterns:

```svelte
<!-- +page.svelte — load data -->
<script>
  let { data } = $props(); // from +page.ts load function
</script>

<h1>{data.title}</h1>
```

```ts
// +page.ts
export async function load({ fetch }) {
  const res = await fetch("/api/posts");
  return { posts: await res.json() };
}
```

### Form actions still work

```svelte
<form method="POST" action="?/create">
  <input name="title" />
  <button>Create</button>
</form>
```

---

## Common Patterns

### Toggle with $state

```svelte
<script>
  let open = $state(false);
</script>

<button onclick={() => (open = !open)}>
  {open ? "Close" : "Open"}
</button>
{#if open}<div class="modal">Content</div>{/if}
```

### Async derived with $effect

```svelte
<script>
  let userId = $state(1);
  let user = $state(null);
  let loading = $state(false);

  $effect(() => {
    loading = true;
    fetch(`/api/users/${userId}`)
      .then(r => r.json())
      .then(data => { user = data; loading = false; });
  });
</script>

{#if loading}<p>Loading...</p>
{:else if user}<p>{user.name}</p>{/if}
```

### Class component pattern (shared state)

```ts
// lib/theme.svelte.ts
class ThemeStore {
  current = $state<"light" | "dark">("light");

  toggle() {
    this.current = this.current === "light" ? "dark" : "light";
  }
}

export const theme = new ThemeStore();
```

```svelte
<script>
  import { theme } from "$lib/theme.svelte.ts";
</script>

<button onclick={theme.toggle}>
  Switch to {theme.current === "light" ? "dark" : "light"}
</button>
```
