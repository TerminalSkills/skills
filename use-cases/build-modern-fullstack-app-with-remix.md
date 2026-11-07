---
title: "Build a Modern Fullstack App with Remix and Server-Side Rendering"
slug: build-modern-fullstack-app-with-remix
description: "Create a performant fullstack application with server-side rendering, parallel route loaders, progressive-enhancement forms and client state. Remix v2 became React Router framework mode, which is where new projects start."
skills:
  - remix
  - zustand
category: development
tags:
  - remix
  - ssr
  - fullstack
  - state-management
  - react
---

# Build a Modern Fullstack App with Remix and Server-Side Rendering

## The Problem

Your team's React SPA has grown into a 2.5MB JavaScript bundle that takes 4 seconds to become interactive on mobile. Search engines cannot reliably index product pages because content renders client-side. The app fetches data in useEffect waterfalls -- the product page loads the shell, then fetches the product, then fetches reviews, then fetches recommendations, each waiting for the previous one. Moving to server-side rendering feels like a rewrite, and the split between server data and client interactivity state is unclear.

## The Solution

Use the **remix** skill to build the application with nested routes and server-side data loading that eliminates fetch waterfalls, and **zustand** to manage client-only interactive state such as shopping cart contents without conflicting with server data.

A note on names: Remix v2 (`@remix-run/*` packages) was merged into React Router v7 in November 2024 as "framework mode", and the Remix team recommends upgrading to it. The current release is React Router v8 (June 2026; needs Node 22.22+ and React 19.2.7+), and new projects start there with `npx create-react-router@latest`. The loader/action/`Form` model on this page is the one Remix v2 introduced, now under the `react-router` package. The separate `remix` npm package (Remix 3) is a different framework with its own APIs and is not covered here.

## Step-by-Step Walkthrough

### 1. Set up routes with parallel server loaders

Replace client-side fetch waterfalls with one loader per route.

> Create a route for our product detail page at /products/:slug. The loader should fetch the product, reviews, and recommendations in parallel on the server and render everything on first paint with no loading spinners.

Routes are declared in `app/routes.ts`:

```typescript
// app/routes.ts
import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("products/:slug", "routes/product.tsx"),
  route("checkout", "routes/checkout.tsx"),
] satisfies RouteConfig;
```

The loader runs on the server before any HTML is sent. Loaders return plain objects (no `json()` wrapper) and `data()` sets a status code:

```tsx
// app/routes/product.tsx
import { data } from "react-router";
import type { Route } from "./+types/product";
import { db } from "~/lib/db.server";   // server-only module

export async function loader({ params }: Route.LoaderArgs) {
  const [product, reviews, recommendations] = await Promise.all([
    db.products.findBySlug(params.slug),
    db.reviews.findByProduct(params.slug, { limit: 10 }),
    db.recommendations.forProduct(params.slug, { limit: 4 }),
  ]);
  if (!product) throw data("Not Found", { status: 404 });
  return { product, reviews, recommendations };
}

export default function ProductDetail({ loaderData }: Route.ComponentProps) {
  const { product, reviews, recommendations } = loaderData;
  return (
    <div>
      <ProductHero product={product} />
      <ReviewList reviews={reviews} />
      <RecommendationGrid items={recommendations} />
    </div>
  );
}
```

The `./+types/product` import is generated: run `npx react-router typegen` (or `react-router dev`) first. The three queries run in parallel, and the browser receives fully rendered HTML. If reviews are slow, return that promise un-awaited and render it with `<Suspense>` and `<Await>` so the rest of the page is not held back.

### 2. Migrate existing SPA pages incrementally

Convert the highest-traffic pages first without rewriting the app at once.

> I have 45 React SPA routes. Help me migrate the top 5 by traffic (homepage, product listing, product detail, search results, checkout) to server-rendered routes in a new React Router app. Show me how to share the existing React components between the old app and the new one.

A Vite or CRA SPA cannot be converted in place. Create the React Router app beside it, move the five routes and their components, and have your reverse proxy (or CDN rule) send those five paths to the new server and everything else to the old SPA until it is empty. Shared components move into a package or folder both apps import. If the old app is already a Remix v2 app, upgrade it instead of rewriting: enable the v2 future flags, run `npx codemod remix/2/react-router/upgrade`, then `npm run typecheck && npm run build` (see reactrouter.com/upgrading/remix).

### 3. Add client state with Zustand

Some state is purely client-side and should not touch the server: cart items, filter toggles, UI preferences.

> Set up a Zustand store for the shopping cart. It should persist to localStorage so items survive page refreshes, and it must not cause SSR hydration mismatches.

```typescript
// app/lib/cart-store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type CartState = {
  items: Record<string, number>;
  add: (slug: string) => void;
  clear: () => void;
};

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: {},
      add: (slug) => set((s) => ({ items: { ...s.items, [slug]: (s.items[slug] ?? 0) + 1 } })),
      clear: () => set({ items: {} }),
    }),
    { name: "cart", skipHydration: true },   // server and first client render both start empty
  ),
);
```

```tsx
// app/components/cart-hydrator.tsx -- render once in root.tsx
import { useEffect } from "react";
import { useCart } from "~/lib/cart-store";

export function CartHydrator() {
  useEffect(() => {
    void useCart.persist.rehydrate();   // restore from localStorage after hydration
  }, []);
  return null;
}
```

`skipHydration` keeps the server render and the first client render identical, and the stored cart is restored after mount. Product data comes from the loader; whether the product is in the cart is client state. Never read or write the store inside a loader: the module is shared across requests on the server.

### 4. Add progressive enhancement for forms

Forms built with `<Form>` work without JavaScript, then enhance when it loads.

> Convert the checkout form to use the Form component with server-side action validation. Use one Zod schema on the server. The form should submit and show errors even if JavaScript fails to load.

```tsx
// app/routes/checkout.tsx
import { Form, data, redirect } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/checkout";

const checkoutSchema = z.object({
  email: z.email("Enter a valid email"),
  postalCode: z.string().min(3, "Postal code is required"),
});

export async function action({ request }: Route.ActionArgs) {
  const form = Object.fromEntries(await request.formData());
  const parsed = checkoutSchema.safeParse(form);
  if (!parsed.success) {
    return data({ errors: z.flattenError(parsed.error).fieldErrors }, { status: 400 });
  }
  // create the order here, then:
  return redirect("/orders/confirmed");
}

export default function Checkout({ actionData }: Route.ComponentProps) {
  const errors = actionData?.errors;
  return (
    <Form method="post">
      <input name="email" type="email" required />
      {errors?.email && <p role="alert">{errors.email[0]}</p>}
      <input name="postalCode" required />
      {errors?.postalCode && <p role="alert">{errors.postalCode[0]}</p>}
      <button type="submit">Pay</button>
    </Form>
  );
}
```

A POST with `email=bad` returns status 400 and the page re-renders with the error, with or without JavaScript. After a successful action every active loader revalidates automatically. Since v7.12 React Router also rejects action submissions to UI routes from other origins with a 400; list trusted external origins in `allowedActionOrigins` in `react-router.config.ts`. This is a cross-origin check, so keep your own authentication on state-changing routes.

## Real-World Example

A direct-to-consumer brand with 180,000 monthly visitors had a React SPA that scored 34 on mobile Lighthouse performance, and its product pages only appeared to Google after client JavaScript ran. The team moved five key routes to a React Router app over one week and put the old SPA behind the proxy for the rest. Time to First Byte for those pages was 220ms in their own measurements, cart state stayed in Zustand with `skipHydration`, and their mobile Lighthouse score rose into the high 80s.

## Tips

- Migrate routes by traffic volume, not by complexity. The homepage and product pages deliver the most SEO and performance value first.
- Keep Zustand stores in a module that does not import server-only code, so database clients and secrets never reach the client bundle. Name server-only modules `*.server.ts`.
- Test hydration by disabling JavaScript in the browser: pages and forms should still render and submit.
- Do not mix `@remix-run/*` and `react-router` packages in one app, and since v8 import everything from `react-router` (the `react-router-dom` package is gone).

## Related Skills

- **remix** -- routes, loaders, actions and forms, covering Remix v2 and React Router framework mode.
- **zustand** -- client-only cart state with `persist` and `skipHydration`.
