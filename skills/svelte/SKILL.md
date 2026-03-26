---
name: svelte
description: >-
  You are an expert in Svelte 5 and SvelteKit 2. You help developers build web
  applications using runes ($state, $derived, $effect, $props, $bindable,
  $inspect), snippets, stores, transitions, and actions — compiling to minimal
  vanilla JavaScript with no virtual DOM. Use when building Svelte apps,
  migrating from Svelte 4, or working with SvelteKit.
license: Apache-2.0
compatibility: "Svelte 5.0+, SvelteKit 2.0+ (optional)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["svelte", "frontend", "runes", "reactive", "sveltekit"]
---

# Svelte — Compile-Time Reactive UI Framework

## Overview

Svelte shifts work from runtime to compile time, producing minimal vanilla JavaScript with no virtual DOM. Svelte 5 introduces **runes** — explicit reactivity primitives that replace `$:` declarations and stores. SvelteKit 2 provides SSR, routing, and deployment adapters.

## Instructions

### Runes Reference

**`$state`** — reactive state (deep by default):

```svelte
<script lang="ts">
  let count = $state(0);
  let user = $state({ name: "Alice", age: 30 });
  user.age++;  // deep reactivity — triggers updates
</script>
```

**`$state.raw`** — shallow reactive (must reassign to trigger):

```svelte
<script>
  let items = $state.raw([1, 2, 3]);
  items = [...items, 4];  // must reassign
</script>
```

**`$state.snapshot`** — plain non-reactive copy:

```svelte
<script>
  let form = $state({ name: "", email: "" });
  const data = $state.snapshot(form);  // plain object for API calls
</script>
```

**`$derived`** and **`$derived.by`** — computed values:

```svelte
<script>
  let price = $state(100);
  let quantity = $state(3);
  let total = $derived(price * quantity);

  let summary = $derived.by(() => {
    const t = items.reduce((sum, i) => sum + i.price, 0);
    return { total: t, count: items.length, avg: t / items.length };
  });
</script>
```

**`$effect`** — side effects with cleanup:

```svelte
<script>
  let query = $state("");
  $effect(() => {
    if (!query) return;
    const controller = new AbortController();
    fetch(`/api/search?q=${query}`, { signal: controller.signal })
      .then(r => r.json()).then(data => { results = data; });
    return () => controller.abort();
  });
</script>
```

**`$props`** — component props:

```svelte
<script>
  let { label, variant = "primary", onclick, class: className = "", ...rest } = $props();
</script>
<button class="btn btn-{variant} {className}" {onclick} {...rest}>{label}</button>
```

**`$bindable`** — two-way binding:

```svelte
<!-- Input.svelte -->
<script>
  let { value = $bindable(""), placeholder = "" } = $props();
</script>
<input bind:value {placeholder} />
```

**`$inspect`** — debug reactive values (dev only):

```svelte
<script>
  $inspect(count, doubled);
  $inspect(count).with((type, value) => console.log(`[${type}]`, value));
</script>
```

### Snippets (Replacing Slots)

Svelte 5 replaces slots with typed, reusable markup fragments:

```svelte
<!-- List.svelte -->
<script>
  let { items, row, children } = $props();
</script>
<ul>
  {#each items as item}
    <li>{@render row(item)}</li>
  {/each}
</ul>
{@render children?.()}
```

```svelte
<!-- Parent.svelte -->
<List {items}>
  {#snippet row(item)}
    <strong>{item.name}</strong> — {item.description}
  {/snippet}
</List>
```

### Stores (Shared State)

```typescript
// stores/cart.ts — Writable store (Svelte 4 style, still works)
import { writable, derived } from "svelte/store";

export const cart = writable<CartItem[]>([]);
export const cartTotal = derived(cart, ($cart) =>
  $cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
);
```

**Svelte 5 alternative** — `$state` in `.svelte.ts` modules:

```typescript
// state/counter.svelte.ts
let count = $state(0);
let doubled = $derived(count * 2);

export function getCounter() {
  return {
    get count() { return count; },
    get doubled() { return doubled; },
    increment() { count++; },
  };
}
```

### Transitions

```svelte
<script>
  import { fade, fly, slide } from "svelte/transition";
  import { flip } from "svelte/animate";
  let items = $state(["Apple", "Banana"]);
</script>
{#each items as item (item)}
  <div animate:flip={{ duration: 300 }} transition:fade>{item}</div>
{/each}
```

### Migration from Svelte 4

| Svelte 4 | Svelte 5 |
|-----------|----------|
| `let count = 0` | `let count = $state(0)` |
| `$: doubled = count * 2` | `let doubled = $derived(count * 2)` |
| `$: { sideEffect() }` | `$effect(() => { sideEffect() })` |
| `export let prop` | `let { prop } = $props()` |
| `<slot />` | `{@render children()}` |
| `<slot name="header" />` | `{@render header?.()}` |
| Svelte stores | `$state` in `.svelte.ts` files |

### SvelteKit 2

```svelte
<!-- +page.svelte -->
<script>
  let { data } = $props();  // from +page.ts load function
</script>
<h1>{data.title}</h1>
```

```bash
npx sv create my-app          # SvelteKit project
npm create vite@latest -- --template svelte-ts  # standalone Svelte
```

## Examples

### Example 1: Shopping cart with stores

```svelte
<!-- CartSummary.svelte -->
<script lang="ts">
  import { cart, cartTotal, removeFromCart } from "$lib/stores/cart";
</script>
<div class="cart">
  {#each $cart as item (item.id)}
    <div>{item.name} x {item.quantity} — ${(item.price * item.quantity).toFixed(2)}
      <button onclick={() => removeFromCart(item.id)}>Remove</button>
    </div>
  {/each}
  <p>Total: ${$cartTotal.toFixed(2)}</p>
</div>
```

### Example 2: Async data fetching with $effect

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

## Guidelines

1. **Runes for state** — Use `$state()`, `$derived()`, `$effect()` in Svelte 5; cleaner than Svelte 4's `$:` syntax
2. **Scoped styles** — CSS in `<style>` is component-scoped; no CSS modules needed
3. **Stores vs runes** — Use `$state` in `.svelte.ts` for new code; writable/derived stores still work
4. **Transitions built-in** — Use `transition:fade`, `transition:fly`; no animation library needed
5. **Small bundles** — Svelte compiles away; typical app ships 5-10KB vs 40KB+ for React
6. **SvelteKit for full-stack** — SSR, routing, API endpoints, deployment adapters
7. **TypeScript** — Use `<script lang="ts">` for type-safe components
8. **Actions for DOM** — Use `use:action` for reusable DOM behavior (click-outside, tooltip)
