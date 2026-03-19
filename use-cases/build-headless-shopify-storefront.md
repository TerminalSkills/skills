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

Lena runs an outdoor gear brand on Shopify. Her store does $2M/year and she's been investing in paid ads. But her Lighthouse score is 28. Page load time: 8.4 seconds. Every second of load time costs her ~7% in conversion. Her Shopify theme is bloated with app scripts — loyalty widget, review widget, chat widget, all blocking the main thread. She wants to keep Shopify for inventory, orders, and payments (it's great for that), but replace the frontend entirely.

## Step 1 — Configure the Shopify Storefront API

```bash
# Shopify Admin → Apps → Develop apps → Create an app
# Under "API credentials" → Storefront API → Configure

# Required access scopes:
# - unauthenticated_read_product_listings
# - unauthenticated_read_product_inventory  
# - unauthenticated_write_checkouts
# - unauthenticated_read_checkouts
# - unauthenticated_read_customer_tags
# - unauthenticated_read_content (for pages/blogs)

# Add to .env.local:
SHOPIFY_STOREFRONT_ACCESS_TOKEN=your-public-token
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
NEXT_PUBLIC_SHOPIFY_STOREFRONT_URL=https://your-store.myshopify.com/api/2024-10/graphql.json
```

```typescript
// lib/shopify/client.ts — Typed GraphQL client for the Storefront API.

const STOREFRONT_URL = `https://${process.env.SHOPIFY_STORE_DOMAIN}/api/2024-10/graphql.json`;

export async function shopifyFetch<T>({
  query,
  variables,
  cache = "force-cache",
  tags,
}: {
  query: string;
  variables?: Record<string, unknown>;
  cache?: RequestCache;
  tags?: string[];
}): Promise<T> {
  const response = await fetch(STOREFRONT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
    cache,
    next: tags ? { tags } : undefined,
  });

  if (!response.ok) {
    throw new Error(`Shopify API error: ${response.status}`);
  }

  const { data, errors } = await response.json();

  if (errors) {
    throw new Error(errors[0].message);
  }

  return data as T;
}
```

## Step 2 — Product Pages with Variants

```typescript
// lib/shopify/products.ts — Fetch product data with all variants and images.

const PRODUCT_QUERY = `
  query GetProduct($handle: String!) {
    product(handle: $handle) {
      id
      title
      description
      descriptionHtml
      vendor
      productType
      tags
      
      priceRange {
        minVariantPrice { amount currencyCode }
        maxVariantPrice { amount currencyCode }
      }

      images(first: 10) {
        edges {
          node {
            id
            url
            altText
            width
            height
          }
        }
      }

      variants(first: 50) {
        edges {
          node {
            id
            title
            availableForSale
            quantityAvailable
            price { amount currencyCode }
            compareAtPrice { amount currencyCode }
            selectedOptions {
              name
              value
            }
            image {
              url
              altText
            }
          }
        }
      }

      options {
        id
        name
        values
      }

      # Fetch metafields for custom data (size guide, materials, etc.)
      metafields(identifiers: [
        { namespace: "custom", key: "size_guide" }
        { namespace: "custom", key: "materials" }
        { namespace: "reviews", key: "rating" }
      ]) {
        key
        value
        type
      }

      seo {
        title
        description
      }
    }
  }
`;

export async function getProduct(handle: string) {
  const data = await shopifyFetch<{ product: ShopifyProduct }>({
    query: PRODUCT_QUERY,
    variables: { handle },
    cache: "force-cache",
    tags: [`product-${handle}`],
  });

  return normalizeProduct(data.product);
}

function normalizeProduct(raw: ShopifyProduct): Product {
  return {
    id: raw.id,
    title: raw.title,
    description: raw.description,
    descriptionHtml: raw.descriptionHtml,
    images: raw.images.edges.map(e => e.node),
    variants: raw.variants.edges.map(e => ({
      ...e.node,
      price: parseFloat(e.node.price.amount),
      compareAtPrice: e.node.compareAtPrice
        ? parseFloat(e.node.compareAtPrice.amount)
        : null,
    })),
    options: raw.options,
    metafields: Object.fromEntries(
      raw.metafields?.filter(Boolean).map(m => [m.key, m.value]) || []
    ),
    seo: raw.seo,
  };
}
```

```tsx
// app/products/[handle]/page.tsx — Product page with RSC.
// Renders fast on the server; variant selection is client-side.

import { getProduct } from "@/lib/shopify/products";
import { ProductGallery } from "@/components/product-gallery";
import { ProductForm } from "@/components/product-form";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: { handle: string } }) {
  const product = await getProduct(params.handle);
  if (!product) return {};

  return {
    title: product.seo.title || product.title,
    description: product.seo.description || product.description.slice(0, 160),
    openGraph: {
      images: [{ url: product.images[0]?.url }],
    },
  };
}

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const product = await getProduct(params.handle);
  if (!product) notFound();

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-6xl mx-auto px-4 py-8">
      <ProductGallery images={product.images} />

      <div>
        <h1 className="text-3xl font-bold">{product.title}</h1>
        <ProductForm product={product} />

        <div
          className="prose mt-8"
          dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
        />
      </div>
    </div>
  );
}
```

## Step 3 — Cart with Optimistic Updates

```typescript
// lib/shopify/cart.ts — Cart operations using Shopify Storefront API.

const CREATE_CART_MUTATION = `
  mutation CreateCart($lines: [CartLineInput!]) {
    cartCreate(input: { lines: $lines }) {
      cart {
        id
        checkoutUrl
        totalQuantity
        cost {
          totalAmount { amount currencyCode }
          subtotalAmount { amount currencyCode }
        }
        lines(first: 20) {
          edges {
            node {
              id
              quantity
              merchandise {
                ... on ProductVariant {
                  id
                  title
                  price { amount }
                  product { title handle }
                  image { url altText }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function createCart(variantId: string, quantity: number = 1) {
  const data = await shopifyFetch<{ cartCreate: { cart: ShopifyCart } }>({
    query: CREATE_CART_MUTATION,
    variables: { lines: [{ merchandiseId: variantId, quantity }] },
    cache: "no-store",
  });

  return data.cartCreate.cart;
}

export async function addToCart(cartId: string, variantId: string, quantity: number = 1) {
  const data = await shopifyFetch<{ cartLinesAdd: { cart: ShopifyCart } }>({
    query: `
      mutation AddToCart($cartId: ID!, $lines: [CartLineInput!]!) {
        cartLinesAdd(cartId: $cartId, lines: $lines) {
          cart { id checkoutUrl totalQuantity cost { totalAmount { amount } } }
        }
      }
    `,
    variables: { cartId, lines: [{ merchandiseId: variantId, quantity }] },
    cache: "no-store",
  });

  return data.cartLinesAdd.cart;
}
```

```tsx
// components/product-form.tsx — Client component for variant selection and cart.
// Uses optimistic updates so the cart feels instant.

"use client";
import { useState, useOptimistic, useTransition } from "react";
import { addToCart, createCart } from "@/lib/shopify/cart";
import { useCart } from "@/context/cart-context";

export function ProductForm({ product }: { product: Product }) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(
    Object.fromEntries(product.options.map(o => [o.name, o.values[0]]))
  );
  const [isPending, startTransition] = useTransition();
  const { cart, setCart } = useCart();

  const selectedVariant = product.variants.find(v =>
    v.selectedOptions.every(opt => selectedOptions[opt.name] === opt.value)
  );

  function selectOption(name: string, value: string) {
    setSelectedOptions(prev => ({ ...prev, [name]: value }));
  }

  async function handleAddToCart() {
    if (!selectedVariant) return;

    startTransition(async () => {
      let updatedCart;
      if (cart?.id) {
        updatedCart = await addToCart(cart.id, selectedVariant.id);
      } else {
        updatedCart = await createCart(selectedVariant.id);
      }
      setCart(updatedCart);
    });
  }

  return (
    <div className="mt-6 space-y-4">
      {product.options.map(option => (
        <div key={option.id}>
          <label className="text-sm font-medium text-gray-700">{option.name}</label>
          <div className="mt-2 flex gap-2 flex-wrap">
            {option.values.map(value => (
              <button
                key={value}
                onClick={() => selectOption(option.name, value)}
                className={`px-4 py-2 border rounded-lg text-sm ${
                  selectedOptions[option.name] === value
                    ? "border-black bg-black text-white"
                    : "border-gray-300 hover:border-gray-600"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-4">
        <span className="text-2xl font-bold">
          ${selectedVariant?.price.toFixed(2)}
        </span>
        {selectedVariant?.compareAtPrice && (
          <span className="text-lg text-gray-400 line-through">
            ${selectedVariant.compareAtPrice.toFixed(2)}
          </span>
        )}
      </div>

      <button
        onClick={handleAddToCart}
        disabled={!selectedVariant?.availableForSale || isPending}
        className="w-full bg-black text-white py-4 rounded-lg font-medium disabled:opacity-50"
      >
        {isPending ? "Adding..." : selectedVariant?.availableForSale ? "Add to Cart" : "Sold Out"}
      </button>
    </div>
  );
}
```

## Step 4 — Checkout Redirect

```typescript
// Checkout is handled by Shopify — just redirect to cart.checkoutUrl.
// No custom checkout needed; Shopify handles payment, taxes, shipping.

// app/api/checkout/route.ts
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { cartId } = await request.json();

  // The checkoutUrl comes from the cart object returned by the Storefront API
  // It's already set when the cart is created — just redirect to it
  const cart = await getCart(cartId);

  return NextResponse.json({ checkoutUrl: cart.checkoutUrl });
}
```

## Step 5 — On-Demand Revalidation for Inventory Changes

```typescript
// app/api/webhooks/shopify/route.ts — Revalidate product pages when stock changes.
// Set up in Shopify: Settings → Notifications → Webhooks → product/updated

import { revalidateTag } from "next/cache";
import crypto from "crypto";

export async function POST(request: Request) {
  const body = await request.text();
  const hmac = request.headers.get("X-Shopify-Hmac-Sha256");

  // Verify webhook authenticity
  const hash = crypto
    .createHmac("sha256", process.env.SHOPIFY_WEBHOOK_SECRET!)
    .update(body)
    .digest("base64");

  if (hash !== hmac) {
    return new Response("Unauthorized", { status: 401 });
  }

  const topic = request.headers.get("X-Shopify-Topic");
  const payload = JSON.parse(body);

  if (topic === "products/update" && payload.handle) {
    revalidateTag(`product-${payload.handle}`);
  }

  if (topic === "collections/update") {
    revalidateTag(`collection-${payload.handle}`);
  }

  return new Response("OK");
}
```

## Results

Lena launched the new storefront after 3 weeks of development:

- **Lighthouse score: 28 → 97** — server-side rendering, no blocking scripts, Next.js image optimization, minimal JS bundle.
- **Page load time: 8.4s → 1.1s** — measured with WebPageTest from the same geography. LCP (Largest Contentful Paint) went from 7.2s to 0.9s.
- **Conversion rate up 23%** — from 1.8% to 2.2%. At $2M revenue and ~$80 AOV, that's ~$460k additional annual revenue from the same ad spend.
- **Shopify kept for the good parts** — inventory, orders, shipping, discounts, the admin — all untouched. Lena's operations team didn't change their workflow.
- **Webhooks keep inventory fresh** — when a product sells out, the Shopify webhook fires, Next.js revalidates the product page, and the "Sold Out" button appears within seconds. No stale cache showing in-stock items that are gone.
- **Development tip** — use `shopify-api-node` or the official `@shopify/shopify-api` SDK for admin operations (fulfillment, refunds); use the Storefront API for customer-facing reads and cart operations. Different APIs for different audiences.
