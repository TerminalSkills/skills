---
title: Rebuild a Wix Store as a Headless React Storefront
slug: rebuild-wix-store-as-headless-react-storefront
description: "Build a fast custom React/Next.js storefront on top of Wix Stores using @wix/sdk — keep products, inventory, and orders in the Wix dashboard while replacing the slow Wix-rendered frontend, with ISR product pages, a headless cart, and Wix's hosted checkout."
skills:
  - wix-to-react
  - nextjs
  - tailwindcss
  - web-scraper
category: development
tags:
  - wix
  - headless
  - ecommerce
  - nextjs
  - react
  - wix-sdk
---

# Rebuild a Wix Store as a Headless React Storefront

## The Problem

A specialty coffee roaster sells 120 SKUs through Wix Stores. The business side works: non-technical staff add products, adjust inventory, run discount codes, and fulfill orders entirely from the Wix dashboard, and they have no interest in learning a new admin. The *storefront*, however, is the bottleneck.

Wix renders the shop with a heavy client bundle. On mobile, the product grid takes 4–5 seconds to become interactive, the Largest Contentful Paint hovers around 4s, and the team's paid-search landing pages convert poorly because shoppers bounce before the page settles. Marketing can't add a custom "build your own subscription box" flow because it's not a layout Wix's editor supports. And every experiment — a different PDP layout, a sticky add-to-cart bar — is impossible inside the drag-and-drop canvas.

The team does **not** want to migrate off Wix. Re-platforming the catalog, inventory, payments, and order history to Shopify or Medusa is weeks of work and retrains the whole staff. They want the opposite of a full migration: keep Wix as the commerce *backend* and replace only the frontend with a fast, custom React app that the engineers control in Git. The catch is that Wix Stores has no "export to a storefront" button, and the public site's DOM is generated markup that can't be reused.

## The Solution

Use the **wix-to-react** skill in its **headless** mode. Instead of recreating the store from scraped HTML, the skill connects to Wix as a data source through **Wix Headless** and the official `@wix/sdk`. Products, collections, inventory, and pricing are read live from `@wix/stores`; the cart and checkout are handled by `@wix/ecom`; and checkout itself redirects to Wix's hosted, PCI-compliant checkout so no payment code has to be rebuilt.

The frontend is a **nextjs** + **tailwindcss** app: product listing and detail pages are Server Components with ISR so inventory stays fresh without rebuilding, and the cart lives in a Client Component. The static marketing pages (home, about, wholesale) are extracted once with the **web-scraper** approach from the wix-to-react skill, since they don't need live data. The Wix dashboard keeps running unchanged for staff, while shoppers get a sub-second storefront.

## Step-by-Step Walkthrough

### Step 1: Create a Wix Headless project and get a client ID

In the Wix dashboard, the team creates a **Headless** project, which issues an OAuth client ID for anonymous (visitor) access to the store APIs. That ID is the only credential the storefront needs:

```bash
# .env.local
WIX_CLIENT_ID=8a1c3f2e-7b4d-4e9a-9c21-5f0b2d6e8a11
```

```bash
npm i @wix/sdk @wix/stores @wix/ecom
```

### Step 2: Wire the SDK client

```javascript
// lib/wix.js
import { createClient, OAuthStrategy } from "@wix/sdk";
import { products, collections } from "@wix/stores";
import { currentCart, checkout } from "@wix/ecom";

export const wix = createClient({
  modules: { products, collections, currentCart, checkout },
  auth: OAuthStrategy({ clientId: process.env.WIX_CLIENT_ID }),
});
```

### Step 3: Build product listing and detail as ISR Server Components

```jsx
// app/shop/page.jsx — grid of all products, regenerated every 5 min
import { wix } from "@/lib/wix";
export const revalidate = 300;

export default async function Shop() {
  const { items } = await wix.products.queryProducts().find();
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {items.map((p) => (
        <ProductCard key={p._id} slug={p.slug} name={p.name}
          price={p.priceData.formatted.price} image={p.media.mainMedia.image.url} />
      ))}
    </div>
  );
}
```

```jsx
// app/shop/[slug]/page.jsx — PDP with live stock + SEO metadata
export const revalidate = 300;

export async function generateStaticParams() {
  const { items } = await wix.products.queryProducts().find();
  return items.map((p) => ({ slug: p.slug }));
}

export default async function Product({ params }) {
  const { items } = await wix.products.queryProducts().eq("slug", params.slug).find();
  const p = items[0];
  return <ProductDetail product={p} inStock={p.stock.inStock} />;
}
```

The `_tokens.json` extracted from the old Wix store (per the wix-to-react skill) seeds `tailwind.config`, so the rebuilt PDP matches the roaster's brand colors and type scale.

### Step 4: Add a headless cart and redirect to Wix checkout

```jsx
// components/AddToCart.jsx
"use client";
import { wix } from "@/lib/wix";

export function AddToCart({ productId }) {
  async function add() {
    await wix.currentCart.addToCurrentCart({
      lineItems: [{ catalogReference: {
        appId: "215238eb-22a5-4c36-9e7b-e7c08025e04e", // Wix Stores app id
        catalogItemId: productId,
      }, quantity: 1 }],
    });
  }
  async function goToCheckout() {
    const { checkoutId } = await wix.currentCart.createCheckoutFromCurrentCart({
      channelType: "WEB",
    });
    const { redirectSession } = await wix.checkout.createRedirectSession({
      ecomCheckout: { checkoutId },
      callbacks: { postFlowUrl: window.location.origin + "/thank-you" },
    });
    window.location.href = redirectSession.fullUrl; // Wix hosted checkout
  }
  return (
    <>
      <button className="btn" onClick={add}>Add to cart</button>
      <button className="btn-primary" onClick={goToCheckout}>Checkout</button>
    </>
  );
}
```

Payments, taxes, and order records stay entirely in Wix — the storefront never touches card data.

### Step 5: Extract the static marketing pages and ship

Home, about, and wholesale pages have no live data, so they're captured once with the wix-to-react Playwright extractor and rebuilt as plain Server Components. Per-page `metadata` exports carry over the original titles and descriptions, the product slugs are kept identical to the old `/product-page/<slug>` URLs (with 301s mapping the old pattern to `/shop/<slug>`), and a crawl confirms parity before DNS cutover.

## Real-World Example

The roaster's storefront rebuild took three days. The `@wix/sdk` integration meant zero catalog migration — all 120 SKUs, their variants (whole-bean vs ground, 250g/1kg), inventory counts, and the staff's existing discount codes kept working through the Wix dashboard with no changes to anyone's workflow.

After launch, mobile LCP dropped from ~4.1s to 1.3s because the Wix client bundle was gone and product pages were pre-rendered with ISR. The team finally shipped the "build your own subscription box" flow as a custom React route querying `@wix/stores` for eligible products — something the Wix editor couldn't express. Checkout conversion on paid-search traffic rose noticeably since shoppers reached an interactive PDP in about a second instead of waiting for the old page to hydrate. Because checkout still redirected to Wix's hosted flow, the migration required no PCI work and no payment re-integration, and the finance team's order reports were unchanged.

## Related Skills

- **wix-to-react** — the core skill; here it's used in **headless mode** (`@wix/sdk` + `@wix/stores`/`@wix/ecom`) plus its extraction flow for the static marketing pages. See also the full-migration path in [Migrate a Wix Site to a Next.js App](migrate-a-wix-site-to-nextjs).
- **nextjs** — App Router Server Components, `generateStaticParams`, ISR (`revalidate`), and per-page SEO `metadata`.
- **tailwindcss** — apply the extracted brand tokens and build the responsive product grid and PDP.
- **web-scraper** — capture the static marketing pages (home, about, wholesale) that don't need live product data.
