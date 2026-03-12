---
name: svelte
category: Web Frameworks
tags: [frontend, javascript, compiler, reactive, lightweight, no-virtual-dom]
version: 1.0.0
author: terminal-skills
---

# Svelte — Compile-Time Reactive UI Framework

You are an expert in Svelte, the UI framework that shifts work from runtime to compile time. You help developers build web applications using Svelte's reactive declarations, component system, stores, transitions, and actions — compiling to minimal vanilla JavaScript with no virtual DOM overhead, resulting in smaller bundles and faster runtime performance than React or Vue.

## Core Capabilities

### Reactive Components (Svelte 5 Runes)

```svelte
<!-- Counter.svelte — Svelte 5 with runes -->
<script lang="ts">
  let count = $state(0);                  // Reactive state
  let doubled = $derived(count * 2);      // Computed value

  function increment() {
    count++;                              // Direct mutation triggers updates
  }

  $effect(() => {
    // Runs when dependencies change (like useEffect)
    console.log(`Count changed to ${count}`);
    document.title = `Count: ${count}`;
  });
</script>

<button onclick={increment}>
  Clicked {count} times (doubled: {doubled})
</button>

<style>
  button {
    padding: 0.5rem 1rem;
    border-radius: 0.5rem;
    background: #ff3e00;
    color: white;
    border: none;
    cursor: pointer;
  }
  button:hover {
    background: #ff5722;
  }
</style>
```

### Props and Events

```svelte
<!-- Card.svelte -->
<script lang="ts">
  interface Props {
    title: string;
    description?: string;
    variant?: "default" | "featured";
    onclick?: () => void;
  }

  let { title, description = "", variant = "default", onclick }: Props = $props();
</script>

<div class="card {variant}" onclick={onclick}>
  <h3>{title}</h3>
  {#if description}
    <p>{description}</p>
  {/if}
  {@render children()}                    <!-- Slot content -->
</div>

<style>
  .card { padding: 1rem; border: 1px solid #ddd; border-radius: 0.5rem; }
  .card.featured { border-color: #ff3e00; background: #fff5f2; }
</style>
```

### Stores (Global State)

```typescript
// stores/cart.ts — Writable store
import { writable, derived } from "svelte/store";

interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

export const cart = writable<CartItem[]>([]);

export const cartTotal = derived(cart, ($cart) =>
  $cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
);

export const cartCount = derived(cart, ($cart) =>
  $cart.reduce((sum, item) => sum + item.quantity, 0)
);

export function addToCart(item: Omit<CartItem, "quantity">) {
  cart.update((items) => {
    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      existing.quantity++;
      return [...items];
    }
    return [...items, { ...item, quantity: 1 }];
  });
}

export function removeFromCart(id: string) {
  cart.update((items) => items.filter((i) => i.id !== id));
}
```

```svelte
<!-- CartSummary.svelte — Using stores -->
<script lang="ts">
  import { cart, cartTotal, cartCount, removeFromCart } from "$lib/stores/cart";
</script>

<div class="cart">
  <h2>Cart ({$cartCount} items)</h2>
  {#each $cart as item (item.id)}
    <div class="item">
      <span>{item.name} × {item.quantity}</span>
      <span>${(item.price * item.quantity).toFixed(2)}</span>
      <button onclick={() => removeFromCart(item.id)}>✕</button>
    </div>
  {/each}
  <p class="total">Total: ${$cartTotal.toFixed(2)}</p>
</div>
```

### Transitions and Animations

```svelte
<script>
  import { fade, fly, slide, scale } from "svelte/transition";
  import { flip } from "svelte/animate";

  let items = $state(["Apple", "Banana", "Cherry"]);
  let showModal = $state(false);
</script>

<!-- Animate list changes -->
{#each items as item (item)}
  <div animate:flip={{ duration: 300 }} transition:fade={{ duration: 200 }}>
    {item}
  </div>
{/each}

<!-- Modal with transitions -->
{#if showModal}
  <div class="overlay" transition:fade={{ duration: 150 }}>
    <div class="modal" transition:fly={{ y: 50, duration: 300 }}>
      <h2>Modal Content</h2>
      <button onclick={() => showModal = false}>Close</button>
    </div>
  </div>
{/if}
```

## Installation

```bash
npx sv create my-app                      # SvelteKit project
cd my-app && npm install && npm run dev

# Or standalone Svelte (with Vite)
npm create vite@latest my-app -- --template svelte-ts
```

## Best Practices

1. **Runes for state** — Use `$state()`, `$derived()`, `$effect()` in Svelte 5; cleaner than Svelte 4's `$:` syntax
2. **Scoped styles by default** — CSS in `<style>` is component-scoped; no CSS modules or CSS-in-JS needed
3. **Stores for shared state** — Use writable/derived stores for state shared between components; auto-subscribe with `$`
4. **Transitions built-in** — Use `transition:fade`, `transition:fly` etc.; no animation library needed for common effects
5. **Small bundles** — Svelte compiles away the framework; a typical app ships 5-10KB of runtime vs 40KB+ for React
6. **SvelteKit for full-stack** — Use SvelteKit for SSR, routing, API endpoints, and deployment adapters
7. **TypeScript support** — Use `<script lang="ts">` for type-safe components; types flow through props and stores
8. **Actions for DOM** — Use `use:action` for reusable DOM behavior (click-outside, tooltip, intersection observer)
