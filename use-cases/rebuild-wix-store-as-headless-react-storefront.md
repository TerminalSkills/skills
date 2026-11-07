---
title: Rebuild a Wix Store as a Headless React Storefront
slug: rebuild-wix-store-as-headless-react-storefront
description: "Build a fast custom React/Next.js storefront on top of Wix Stores using @wix/sdk — keep products, inventory, and orders in the Wix dashboard while replacing the slow Wix-rendered frontend, with ISR product pages, a headless cart, and Wix's hosted checkout."
skills:
  - wix-to-react
  - nextjs
  - tailwindcss
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

Use the **wix-to-react** skill in its **headless** mode. Instead of recreating the store from scraped HTML, the skill connects to Wix as a data source through **Wix Headless** and the official `@wix/sdk`. Products are read live from `@wix/stores`; the cart is handled by `@wix/ecom`; and checkout redirects to Wix's hosted checkout through `@wix/redirects`, so no payment code has to be rebuilt.

The frontend is a **nextjs** + **tailwindcss** app: product listing and detail pages are Server Components with ISR so inventory stays fresh without rebuilding, and the cart lives in a Client Component. The static marketing pages (home, about, wholesale) are captured once with the Playwright extractor from the wix-to-react skill, since they don't need live data. The Wix dashboard keeps running unchanged for staff, while shoppers get a much lighter storefront.

## Step-by-Step Walkthrough

### Step 1: Create a Wix Headless project and get a client ID

In the Wix dashboard, the team creates a **Headless** project (or adds a headless client to the existing site) and copies the OAuth client ID from Headless Settings. The client ID is the only credential the storefront needs, and it is not a secret. Under the same settings, the team adds the storefront's domain (and `http://localhost:3000` for development) as an allowed redirect domain, otherwise the hosted checkout redirect is refused.

```bash
# .env.local
NEXT_PUBLIC_WIX_CLIENT_ID=your-headless-client-id
```

```bash
npm i @wix/sdk @wix/stores @wix/ecom @wix/redirects
```

A Wix store runs either Catalog V1 (`products`) or Catalog V3 (`productsV3`), never both, and calling the wrong one fails. Wix is migrating every store to V3, so this walkthrough uses V3; the `catalogVersioning` module in `@wix/stores` tells you which one a site has before you write product code.

### Step 2: Wire the SDK clients

The server client only reads the catalog. The browser client holds the visitor's session, so it must persist its tokens, otherwise every page load starts a new anonymous visitor with an empty cart.

```typescript
// lib/wix-server.ts — read-only catalog access for Server Components
import { createClient, OAuthStrategy } from "@wix/sdk";
import { productsV3 } from "@wix/stores";

export const wixServer = createClient({
  modules: { productsV3 },
  auth: OAuthStrategy({ clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID! }),
});
```

```typescript
// lib/wix-browser.ts — visitor session, cart and checkout (client only)
import { createClient, OAuthStrategy } from "@wix/sdk";
import { currentCart } from "@wix/ecom";
import { redirects } from "@wix/redirects";

const KEY = "wix-visitor-tokens";
const saved = typeof window === "undefined" ? null : localStorage.getItem(KEY);

export const wixBrowser = createClient({
  modules: { currentCart, redirects },
  auth: OAuthStrategy({
    clientId: process.env.NEXT_PUBLIC_WIX_CLIENT_ID!,
    tokens: saved ? JSON.parse(saved) : undefined,
  }),
});

export const saveTokens = () =>
  localStorage.setItem(KEY, JSON.stringify(wixBrowser.auth.getTokens()));
```

### Step 3: Build product listing and detail as ISR Server Components

```tsx
// app/shop/page.tsx — grid of products, regenerated every 5 min
import { media } from "@wix/sdk";
import { wixServer } from "@/lib/wix-server";
export const revalidate = 300;

export default async function Shop() {
  // "CURRENCY" is what makes formattedAmount appear in the price ranges
  const { items } = await wixServer.productsV3
    .queryProducts({ fields: ["CURRENCY"] }).limit(100).find();
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
      {items.map((p) => (
        <ProductCard key={p._id} slug={p.slug!} name={p.name!}
          price={p.actualPriceRange?.minValue?.formattedAmount}
          image={p.media?.main?.image ? media.getImageUrl(p.media.main.image).url : undefined} />
      ))}
    </div>
  );
}
```

`queryProducts()` returns at most 100 items per page and pages by cursor, so a larger catalog loops `while (page.hasNext()) page = await page.next()` (or passes a cursor to `.skipTo()`). `media.main.image` is a `wix:image://` reference, not a URL; `media.getImageUrl()` from `@wix/sdk` turns it into one.

```tsx
// app/shop/[slug]/page.tsx — PDP with stock status
import { wixServer } from "@/lib/wix-server";
export const revalidate = 300;

export async function generateStaticParams() {
  const { items } = await wixServer.productsV3.queryProducts().limit(100).find();
  return items.map((p) => ({ slug: p.slug! })); // first 100; other slugs render on demand
}

export default async function Product({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params; // params is a Promise in Next.js 16
  // Unlike queryProducts(), getProductBySlug() returns the variants (variantsInfo.variants)
  const { product: p } = await wixServer.productsV3.getProductBySlug(slug, { fields: ["CURRENCY"] });
  return <ProductDetail product={p!} inStock={p!.inventory?.availabilityStatus === "IN_STOCK"} />;
}
```

`queryProducts()` does not return variants, which is why the detail page uses `getProductBySlug()`: the variant picker needs `product.variantsInfo.variants[]` (each with an `_id`), and the grid does not.

The `_tokens.json` extracted from the old Wix store (per the wix-to-react skill) seeds the `@theme` block in `globals.css` (Tailwind v4), so the rebuilt PDP matches the roaster's brand colors and type scale.

### Step 4: Add a headless cart and redirect to Wix checkout

```tsx
// components/AddToCart.tsx
"use client";
import { wixBrowser, saveTokens } from "@/lib/wix-browser";

const WIX_STORES_APP_ID = "215238eb-22a5-4c36-9e7b-e7c08025e04e";

export function AddToCart({ productId, variantId }: { productId: string; variantId?: string }) {
  async function add() {
    await wixBrowser.currentCart.addToCurrentCart({
      lineItems: [{
        catalogReference: {
          appId: WIX_STORES_APP_ID,
          catalogItemId: productId,
          options: variantId ? { variantId } : undefined,
        },
        quantity: 1,
      }],
    });
    saveTokens();
  }
  async function goToCheckout() {
    const { checkoutId } = await wixBrowser.currentCart.createCheckoutFromCurrentCart({
      channelType: "WEB",
    });
    const { redirectSession } = await wixBrowser.redirects.createRedirectSession({
      ecomCheckout: { checkoutId: checkoutId! },
      callbacks: { postFlowUrl: window.location.origin + "/thank-you" },
    });
    window.location.href = redirectSession!.fullUrl!; // Wix hosted checkout
  }
  return (
    <>
      <button className="btn" onClick={add}>Add to cart</button>
      <button className="btn-primary" onClick={goToCheckout}>Checkout</button>
    </>
  );
}
```

Payments, taxes, and order records stay entirely in Wix; the storefront never touches card data. A product with variants (whole bean vs ground) needs the variant ID in `options`, so pass the selected variant from the PDP.

### Step 5: Extract the static marketing pages and ship

Home, about, and wholesale pages have no live data, so they're captured once with the wix-to-react Playwright extractor and rebuilt as plain Server Components. Per-page `metadata` exports carry over the original titles and descriptions, the product slugs are kept identical to the old `/product-page/<slug>` URLs (with 301s in `next.config.ts` mapping the old pattern to `/shop/<slug>`), and a crawl confirms parity before DNS cutover.

## Real-World Example

The roaster's storefront rebuild took three days. In the example team's rebuild, the `@wix/sdk` integration meant zero catalog migration — all 120 SKUs, their variants (whole-bean vs ground, 250g/1kg), inventory counts, and the staff's existing discount codes kept working through the Wix dashboard with no changes to anyone's workflow.

After launch, the team's own mobile measurements showed LCP dropping from about 4.1s to 1.3s, because the Wix client bundle was gone and product pages were pre-rendered with ISR. The team finally shipped the "build your own subscription box" flow as a custom React route querying `@wix/stores` for eligible products — something the Wix editor couldn't express. Because checkout still redirected to Wix's hosted flow, the migration required no PCI work and no payment re-integration, and the finance team's order reports were unchanged.

## Related Skills

- **wix-to-react** — the core skill; here it's used in **headless mode** (`@wix/sdk` + `@wix/stores`/`@wix/ecom`/`@wix/redirects`) plus its extraction flow for the static marketing pages. See also the full-migration path in [Migrate a Wix Site to a Next.js App](migrate-a-wix-site-to-nextjs).
- **nextjs** — App Router Server Components, `generateStaticParams`, ISR (`revalidate`), per-page SEO `metadata`, and the Next.js 16 async `params`.
- **tailwindcss** — apply the extracted brand tokens (`@theme`) and build the responsive product grid and PDP.
