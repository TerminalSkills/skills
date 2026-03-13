---
title: Build a Qwik App for Instant Loading
slug: build-qwik-app-for-instant-loading
description: >-
  Build a web app with Qwik that achieves near-zero JavaScript on initial load
  using resumability — the page is interactive immediately without hydration,
  loading JS only when users interact.
skills:
  - qwik
  - tailwindcss
  - zod
category: development
tags:
  - qwik
  - performance
  - resumability
  - ssr
  - javascript
---

# Build a Qwik App for Instant Loading

Tara's marketing site scores 45 on mobile PageSpeed. The React app ships 300KB of JavaScript that must download, parse, and execute before anything is interactive. Qwik eliminates this: the server renders HTML, and instead of hydrating (re-executing all components in the browser), Qwik "resumes" — it serializes the app state into HTML and loads tiny JS chunks only when a user interacts with something. The result: near-zero JS on load, instant interactivity.

## Step 1: Create the App

```bash
npm create qwik@latest my-app
cd my-app
npm install
```

## Step 2: Component with Lazy-Loaded Interactivity

```tsx
// src/routes/index.tsx
import { component$, useSignal, $ } from "@builder.io/qwik";
import { routeLoader$, Form, routeAction$, zod$, z } from "@builder.io/qwik-city";

// Runs on server during SSR — data is serialized into HTML
export const useProducts = routeLoader$(async () => {
  const res = await fetch("https://api.mystore.com/products?limit=20");
  return res.json() as Promise<Product[]>;
});

// Server action — runs on server when form submits
export const useAddToCart = routeAction$(
  async (data, { cookie }) => {
    const cart = JSON.parse(cookie.get("cart")?.value || "[]");
    cart.push({ productId: data.productId, quantity: 1 });
    cookie.set("cart", JSON.stringify(cart), { path: "/" });
    return { success: true, cartSize: cart.length };
  },
  zod$({ productId: z.string() })
);

export default component$(() => {
  const products = useProducts();
  const addToCart = useAddToCart();
  const search = useSignal("");

  // This filter function only loads when user types — not on initial render
  const filtered = products.value.filter((p) =>
    p.name.toLowerCase().includes(search.value.toLowerCase())
  );

  return (
    <main class="max-w-6xl mx-auto p-6">
      <h1 class="text-3xl font-bold mb-6">Products</h1>

      <input
        bind:value={search}
        placeholder="Search products..."
        class="w-full px-4 py-2 border rounded mb-6"
      />

      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        {filtered.map((product) => (
          <div key={product.id} class="bg-white rounded-lg border p-4">
            <img
              src={product.image}
              alt={product.name}
              width={400}
              height={300}
              class="rounded mb-3"
            />
            <h2 class="font-semibold">{product.name}</h2>
            <p class="text-gray-600 text-sm mt-1">{product.description}</p>
            <div class="flex justify-between items-center mt-3">
              <span class="text-lg font-bold">${product.price}</span>
              <Form action={addToCart}>
                <input type="hidden" name="productId" value={product.id} />
                <button
                  type="submit"
                  class="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Add to Cart
                </button>
              </Form>
            </div>
          </div>
        ))}
      </div>
    </main>
  );
});
```

## Step 3: Lazy Event Handlers with $

```tsx
// src/components/InteractiveCard.tsx
import { component$, useSignal, useVisibleTask$, $ } from "@builder.io/qwik";

export const InteractiveCard = component$<{ product: Product }>((props) => {
  const isExpanded = useSignal(false);
  const reviews = useSignal<Review[]>([]);

  // Only loads JS when element becomes visible
  useVisibleTask$(async () => {
    // Lazy-load reviews only when card scrolls into view
    const res = await fetch(`/api/reviews?productId=${props.product.id}`);
    reviews.value = await res.json();
  });

  // The $ suffix means this handler is lazy-loaded
  // Browser downloads this code only when user clicks
  const handleExpand = $(() => {
    isExpanded.value = !isExpanded.value;
  });

  return (
    <div class="border rounded-lg p-4">
      <h3 class="font-semibold">{props.product.name}</h3>

      <button onClick$={handleExpand} class="text-blue-600 text-sm mt-2">
        {isExpanded.value ? "Show less" : "Show more"}
      </button>

      {isExpanded.value && (
        <div class="mt-3 space-y-2">
          <p class="text-gray-600">{props.product.fullDescription}</p>
          <h4 class="font-medium mt-4">Reviews ({reviews.value.length})</h4>
          {reviews.value.map((review) => (
            <div key={review.id} class="bg-gray-50 rounded p-2 text-sm">
              <span class="font-medium">{review.author}</span>: {review.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
```

## Step 4: Layout with Shared Navigation

```tsx
// src/routes/layout.tsx
import { component$, Slot, useSignal } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";

export default component$(() => {
  const location = useLocation();
  const mobileMenuOpen = useSignal(false);

  return (
    <>
      <nav class="border-b bg-white">
        <div class="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" class="text-xl font-bold">MyStore</Link>

          <div class="hidden md:flex gap-6">
            <NavLink href="/" active={location.url.pathname === "/"}>Home</NavLink>
            <NavLink href="/products/" active={location.url.pathname.startsWith("/products")}>Products</NavLink>
            <NavLink href="/about/" active={location.url.pathname === "/about/"}>About</NavLink>
          </div>

          <button
            onClick$={() => (mobileMenuOpen.value = !mobileMenuOpen.value)}
            class="md:hidden"
          >
            ☰
          </button>
        </div>
      </nav>

      <Slot />
    </>
  );
});
```

## Step 5: Deploy

```bash
# Build for Node.js server
npm run build

# Or adapt for edge/serverless
npm run qwik add cloudflare-pages
npm run qwik add vercel-edge
npm run qwik add netlify-edge
```

## Summary

Tara's PageSpeed score jumped from 45 to 98 on mobile. The initial page load sends zero JavaScript for static content — Qwik's resumability means the HTML is already interactive. When a user types in the search box, only the search handler JS (~2KB) downloads. When they click "Show more," only the expand handler downloads. The total JS loaded for a typical session is 15KB instead of 300KB. Server actions handle form submissions without client-side fetch code. The `$` suffix is the key concept: any function ending with `$` is a lazy-loading boundary that Qwik extracts into a separate chunk.
