---
title: Build a Headless Shopify Storefront with Next.js
slug: build-headless-shopify-storefront
description: Replace your slow Shopify theme with a custom Next.js storefront using the Shopify Storefront API — product pages with variants, fast cart with optimistic updates, and checkout redirect to Shopify.
skills:
  - nextjs
  - shopify
difficulty: intermediate
time_estimate: "8 hours"
category: ecommerce
tags:
  - shopify
  - nextjs
  - headless
  - ecommerce
  - graphql
  - storefront-api
---

# Build a Headless Shopify Storefront with Next.js

Lena runs an outdoor gear brand on Shopify and invests in paid ads, but her Lighthouse score is 28 and a product page takes 8.4 seconds to load. Her theme is bloated with app scripts (loyalty, reviews, chat) that block the main thread. She wants to keep Shopify for inventory, orders and payments, and replace the frontend entirely.

## Step 1 — Get a Storefront API token

Install the **Headless** channel from the Shopify App Store, create a storefront, and copy its **private access token**. Private tokens are for server-side requests only; public tokens are for browser and mobile code. In the Headless channel's storefront permissions, enable `unauthenticated_read_product_listings`, `unauthenticated_read_checkouts` and `unauthenticated_write_checkouts` (the Cart API needs the checkout scopes).

```text
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_STOREFRONT_PRIVATE_TOKEN=<private token from the Headless channel>
SHOPIFY_WEBHOOK_SECRET=<your app's client secret, used in step 5>
```

The URL pins an API version (`2026-10`); Shopify ships one each quarter. The client sends the private token in `Shopify-Storefront-Private-Token` and, for buyer-triggered requests, the buyer's IP in `Shopify-Storefront-Buyer-IP`, so bot protection sees the buyer rather than your server.

```typescript
// lib/shopify/client.ts
import { headers } from "next/headers";

const ENDPOINT = `https://${process.env.SHOPIFY_STORE_DOMAIN}/api/2026-10/graphql.json`;

type Opts = { query: string; variables?: Record<string, unknown>; tags?: string[] }; // no tags = uncached buyer request

export async function storefront<T>(opts: Opts): Promise<T> {
  const h: Record<string, string> = { "Content-Type": "application/json", "Shopify-Storefront-Private-Token": process.env.SHOPIFY_STOREFRONT_PRIVATE_TOKEN! };
  if (!opts.tags) {
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0].trim();
    if (ip) h["Shopify-Storefront-Buyer-IP"] = ip;
  }
  const res = await fetch(ENDPOINT, {
    method: "POST", headers: h, body: JSON.stringify({ query: opts.query, variables: opts.variables }),
    ...(opts.tags ? { cache: "force-cache", next: { tags: opts.tags } } : { cache: "no-store" }),
  });
  if (!res.ok) throw new Error(`Storefront API ${res.status}`);
  const { data, errors } = await res.json();
  if (errors?.length) throw new Error(errors[0].message);
  return data as T;
}
```

## Step 2 — Product pages with variants

Product reads are cached with a tag per product (`product-<handle>`), so step 5 can refresh one page at a time. Add `generateMetadata` from `product.seo` for titles and descriptions.

```typescript
// lib/shopify/products.ts
import { storefront } from "./client";

export const PRODUCT_QUERY = /* GraphQL */ `
  query Product($handle: String!) {
    product(handle: $handle) {
      title
      description
      descriptionHtml
      seo { title description }
      featuredImage { url altText }
      images(first: 10) { nodes { url altText width height } }
      options { id name values }
      variants(first: 50) {
        nodes {
          id
          availableForSale
          price { amount currencyCode }
          selectedOptions { name value }
        }
      }
    }
  }
`;

type Money = { amount: string; currencyCode: string };
type Img = { url: string; altText: string | null; width: number; height: number };
export type Product = {
  title: string; description: string; descriptionHtml: string;
  seo: { title: string | null; description: string | null };
  featuredImage: Img | null;
  images: { nodes: Img[] };
  options: { id: string; name: string; values: string[] }[];
  variants: { nodes: { id: string; availableForSale: boolean; price: Money; selectedOptions: { name: string; value: string }[] }[] };
};

export async function getProduct(handle: string): Promise<Product | null> {
  const data = await storefront<{ product: Product | null }>({
    query: PRODUCT_QUERY,
    variables: { handle },
    tags: [`product-${handle}`],
  });
  return data.product;
}
```

In Next.js 15 and later `params` is a Promise, so the page awaits it:

```tsx
// app/products/[handle]/page.tsx
import { notFound } from "next/navigation";
import { getProduct } from "@/lib/shopify/products";
import { ProductForm } from "@/components/product-form";

type Props = { params: Promise<{ handle: string }> };

export default async function ProductPage({ params }: Props) {
  const product = await getProduct((await params).handle);
  if (!product) notFound();

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 md:grid-cols-2">
      <div className="grid gap-2">
        {product.images.nodes.map((img) => (
          <img key={img.url} src={img.url} alt={img.altText ?? product.title} width={img.width} height={img.height} />
        ))}
      </div>
      <div>
        <h1 className="text-3xl font-bold">{product.title}</h1>
        <ProductForm product={product} />
        {/* descriptionHtml is merchant-authored HTML from your own store */}
        <div className="prose mt-8" dangerouslySetInnerHTML={{ __html: product.descriptionHtml }} />
      </div>
    </main>
  );
}
```

## Step 3 — Cart with optimistic updates

The cart mutations run in a Server Action, so the token never reaches the browser, and the cart id lives in an httpOnly cookie. `cartCreate` and `cartLinesAdd` replace the old Checkout API, which is gone.

```typescript
// app/actions/cart.ts
"use server";
import { cookies } from "next/headers";
import { storefront } from "@/lib/shopify/client";

const CART_FIELDS = /* GraphQL */ `
  fragment CartFields on Cart { id checkoutUrl totalQuantity }
`;

const CART_CREATE = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartCreate($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

const CART_LINES_ADD = /* GraphQL */ `
  ${CART_FIELDS}
  mutation CartLinesAdd($cartId: ID!, $lines: [CartLineInput!]!) {
    cartLinesAdd(cartId: $cartId, lines: $lines) {
      cart { ...CartFields }
      userErrors { field message }
    }
  }
`;

type Cart = { id: string; checkoutUrl: string; totalQuantity: number };
type Result = { cart: Cart | null; userErrors: { message: string }[] };

export async function addToCart(variantId: string): Promise<Cart> {
  if (!variantId.startsWith("gid://shopify/ProductVariant/")) throw new Error("Invalid variant");
  const jar = await cookies();
  const lines = [{ merchandiseId: variantId, quantity: 1 }];
  const cartId = jar.get("cartId")?.value;
  if (cartId) {
    const { cartLinesAdd } = await storefront<{ cartLinesAdd: Result }>({
      query: CART_LINES_ADD,
      variables: { cartId, lines },
    });
    if (cartLinesAdd.cart) return cartLinesAdd.cart; // null when the cart expired: fall through and start a new one
  }
  const { cartCreate } = await storefront<{ cartCreate: Result }>({
    query: CART_CREATE,
    variables: { lines },
  });
  if (!cartCreate.cart) throw new Error(cartCreate.userErrors[0]?.message ?? "Could not create cart");
  jar.set("cartId", cartCreate.cart.id, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 10 });
  return cartCreate.cart;
}
```

The client component picks a variant, and `useOptimistic` bumps the cart count at once while the action runs:

```tsx
// components/product-form.tsx
"use client";
import { useOptimistic, useState, useTransition } from "react";
import { addToCart } from "@/app/actions/cart";
import type { Product } from "@/lib/shopify/products";

export function ProductForm({ product }: { product: Product }) {
  const [selected, setSelected] = useState<Record<string, string>>(
    Object.fromEntries(product.options.map((o) => [o.name, o.values[0]])),
  );
  const [cart, setCart] = useState<{ totalQuantity: number; checkoutUrl: string } | null>(null);
  const [optimisticQty, addOptimistic] = useOptimistic(cart?.totalQuantity ?? 0, (n: number) => n + 1);
  const [pending, startTransition] = useTransition();
  const variant = product.variants.nodes.find((v) => v.selectedOptions.every((o) => selected[o.name] === o.value));
  function add() {
    if (!variant) return;
    startTransition(async () => {
      addOptimistic(1); // the count updates immediately and reverts if the action throws
      setCart(await addToCart(variant.id));
    });
  }
  return (
    <div className="mt-6 space-y-4">
      {product.options.map((option) => (
        <div key={option.id} className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{option.name}</span>
          {option.values.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={selected[option.name] === value}
              onClick={() => setSelected((s) => ({ ...s, [option.name]: value }))}
              className="border px-4 py-2 aria-pressed:bg-black aria-pressed:text-white"
            >
              {value}
            </button>
          ))}
        </div>
      ))}
      {variant && <p className="text-2xl font-bold">{Number(variant.price.amount).toLocaleString("en-US", { style: "currency", currency: variant.price.currencyCode })}</p>}
      <button type="button" onClick={add} disabled={!variant?.availableForSale || pending} className="w-full bg-black py-4 text-white disabled:opacity-50">
        {!variant?.availableForSale ? "Sold out" : pending ? "Adding..." : "Add to cart"}
      </button>
      {optimisticQty > 0 && <p>{optimisticQty} in cart. {cart && <a href={cart.checkoutUrl}>Check out</a>}</p>}
    </div>
  );
}
```

## Step 4 — Checkout redirect

No custom checkout is needed. Every cart returned by the Storefront API carries a `checkoutUrl`; the "Check out" link above sends the buyer there, and Shopify handles payment, taxes and shipping.

## Step 5 — On-demand revalidation when products change

Create an app in the Dev Dashboard, subscribe it to the `products/update` topic (`[[webhooks.subscriptions]]` with `topics` and `uri` in `shopify.app.toml`), and use the app's client secret as `SHOPIFY_WEBHOOK_SECRET`. Shopify signs every delivery with it. The handler checks the signature over the raw body before trusting anything:

```typescript
// app/api/webhooks/shopify/route.ts
import crypto from "node:crypto";
import { revalidateTag } from "next/cache";

export async function POST(request: Request) {
  const body = await request.text(); // verify the raw body, before any JSON parsing
  const received = request.headers.get("X-Shopify-Hmac-Sha256") ?? "";
  const expected = crypto.createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET!).update(body).digest("base64");
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const topic = request.headers.get("X-Shopify-Topic");
  const payload = JSON.parse(body) as { handle?: string };
  if (topic === "products/update" && payload.handle) {
    revalidateTag(`product-${payload.handle}`, "max");
  }
  return new Response("OK");
}
```
In Next.js 16, `revalidateTag` takes a cache-life profile as its second argument; `"max"` serves stale content while the page refreshes in the background.

## Results

Lena launched after three weeks of work. These are her store's numbers, not a promise:

- Lighthouse score 28 → 97, page load 8.4 s → 1.1 s (WebPageTest, same location).
- Conversion rate 1.8% → 2.2% on the same ad spend.
- Inventory, orders, shipping and discounts stayed in Shopify, so the operations team changed nothing. When a product sells out, the webhook marks its page stale; the next visit starts a refresh in the background (that visitor still gets the stale page) and later visitors see "Sold out".
- Use the Storefront API for buyer-facing reads and carts, and the Admin API for fulfillment and refunds.

## Related Skills

- [nextjs](/skills/nextjs) - App Router, Server Actions and caching
- [shopify](/skills/shopify) - Storefront API, Admin API and theme work
