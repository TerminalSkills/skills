---
title: Build a Headless E-Commerce Store with Shopify and Next.js
slug: build-headless-ecommerce-with-shopify-and-nextjs
description: Build a high-performance headless e-commerce store using Shopify as the backend (products, checkout, payments) and Next.js as the frontend — with custom design, instant page loads, and conversion-optimized UX.
skills:
  - shopify
  - nextjs
  - tailwindcss
  - strapi
category: E-Commerce
tags:
  - ecommerce
  - headless
  - shopify
  - nextjs
  - storefront
---

# Build a Headless E-Commerce Store with Shopify and Next.js

Amara runs a specialty coffee brand selling 40 products online. Her Shopify theme loads in 4.5 seconds and looks like every other Shopify store. Competitors with custom-built sites have 2x higher conversion rates. She wants a lightning-fast, custom-designed storefront that still uses Shopify's checkout, inventory, and payment infrastructure — the best of both worlds.

## Step 1 — Connect Next.js to Shopify Storefront API

The Storefront API gives read access to products, collections, and cart operations. Next.js Server Components fetch data at build time or request time, so pages load instantly.

```typescript
// src/lib/shopify.ts — Shopify Storefront API client.
// All product data comes from Shopify. Blog content comes from Strapi.
// This separation lets each system do what it's best at.

const SHOPIFY_STORE = process.env.SHOPIFY_STORE_DOMAIN!;
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN!;

interface ShopifyResponse<T> {
  data: T;
  errors?: Array<{ message: string }>;
}

export async function shopifyFetch<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(
    `https://${SHOPIFY_STORE}/api/2024-01/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN,
      },
      body: JSON.stringify({ query, variables }),
      next: { revalidate: 60 },  // ISR: revalidate every 60 seconds
    }
  );

  const json: ShopifyResponse<T> = await response.json();

  if (json.errors) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  return json.data;
}

// Fetch all products in a collection
export async function getCollection(handle: string) {
  return shopifyFetch<{
    collection: {
      title: string;
      description: string;
      products: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            handle: string;
            description: string;
            priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
            images: { edges: Array<{ node: { url: string; altText: string } }> };
            tags: string[];
          };
        }>;
      };
    };
  }>(`
    query GetCollection($handle: String!) {
      collection(handle: $handle) {
        title
        description
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              description
              priceRange {
                minVariantPrice { amount currencyCode }
              }
              images(first: 3) {
                edges { node { url altText } }
              }
              tags
            }
          }
        }
      }
    }
  `, { handle });
}

// Fetch single product with all variants
export async function getProduct(handle: string) {
  return shopifyFetch<{
    product: {
      id: string;
      title: string;
      handle: string;
      descriptionHtml: string;
      priceRange: { minVariantPrice: { amount: string; currencyCode: string } };
      images: { edges: Array<{ node: { url: string; altText: string; width: number; height: number } }> };
      variants: {
        edges: Array<{
          node: {
            id: string;
            title: string;
            price: { amount: string; currencyCode: string };
            availableForSale: boolean;
            selectedOptions: Array<{ name: string; value: string }>;
          };
        }>;
      };
      metafields: Array<{
        key: string;
        value: string;
        namespace: string;
      }>;
    };
  }>(`
    query GetProduct($handle: String!) {
      product(handle: $handle) {
        id
        title
        handle
        descriptionHtml
        priceRange {
          minVariantPrice { amount currencyCode }
        }
        images(first: 10) {
          edges { node { url altText width height } }
        }
        variants(first: 20) {
          edges {
            node {
              id
              title
              price { amount currencyCode }
              availableForSale
              selectedOptions { name value }
            }
          }
        }
        metafields(identifiers: [
          { namespace: "custom", key: "roast_level" },
          { namespace: "custom", key: "origin" },
          { namespace: "custom", key: "tasting_notes" },
          { namespace: "custom", key: "brewing_guide" }
        ]) {
          key
          value
          namespace
        }
      }
    }
  `, { handle });
}
```

## Step 2 — Build the Product Page

```tsx
// src/app/products/[handle]/page.tsx — Product detail page.
// Server Component: fetches product data at request time.
// Images from Shopify CDN, auto-optimized via Next.js Image.

import Image from "next/image";
import { getProduct } from "@/lib/shopify";
import { AddToCartButton } from "@/components/add-to-cart";
import { VariantSelector } from "@/components/variant-selector";
import { ProductGallery } from "@/components/product-gallery";
import { formatPrice } from "@/lib/utils";
import { notFound } from "next/navigation";

export async function generateMetadata({ params }: { params: { handle: string } }) {
  const { product } = await getProduct(params.handle);
  if (!product) return {};

  return {
    title: `${product.title} | Amara Coffee`,
    description: product.descriptionHtml.replace(/<[^>]*>/g, "").slice(0, 160),
    openGraph: {
      images: [product.images.edges[0]?.node.url],
    },
  };
}

export default async function ProductPage({ params }: { params: { handle: string } }) {
  const { product } = await getProduct(params.handle);
  if (!product) notFound();

  const images = product.images.edges.map((e) => e.node);
  const variants = product.variants.edges.map((e) => e.node);

  // Extract metafields for rich product info
  const metafields = Object.fromEntries(
    (product.metafields || [])
      .filter(Boolean)
      .map((m) => [m.key, m.value])
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="lg:grid lg:grid-cols-2 lg:gap-12">
        {/* Image gallery with zoom */}
        <ProductGallery images={images} productTitle={product.title} />

        {/* Product info */}
        <div className="mt-8 lg:mt-0">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            {product.title}
          </h1>

          <p className="mt-3 text-2xl text-gray-900">
            {formatPrice(product.priceRange.minVariantPrice)}
          </p>

          {/* Coffee-specific metadata from Shopify metafields */}
          {metafields.origin && (
            <div className="mt-6 grid grid-cols-2 gap-4 border-t pt-6">
              <div>
                <p className="text-sm font-medium text-gray-500">Origin</p>
                <p className="mt-1 text-sm text-gray-900">{metafields.origin}</p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-500">Roast Level</p>
                <p className="mt-1 text-sm text-gray-900">{metafields.roast_level}</p>
              </div>
              {metafields.tasting_notes && (
                <div className="col-span-2">
                  <p className="text-sm font-medium text-gray-500">Tasting Notes</p>
                  <p className="mt-1 text-sm text-gray-900">{metafields.tasting_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Variant selector (size: 250g, 500g, 1kg) */}
          <div className="mt-6">
            <VariantSelector variants={variants} />
          </div>

          {/* Add to cart */}
          <div className="mt-6">
            <AddToCartButton productId={product.id} variants={variants} />
          </div>

          {/* Description */}
          <div
            className="prose prose-sm mt-8"
            dangerouslySetInnerHTML={{ __html: product.descriptionHtml }}
          />

          {/* Brewing guide from metafield */}
          {metafields.brewing_guide && (
            <details className="mt-8 border-t pt-6">
              <summary className="cursor-pointer font-medium text-gray-900">
                Brewing Guide
              </summary>
              <div className="mt-4 prose prose-sm text-gray-600">
                {metafields.brewing_guide}
              </div>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
```

## Step 3 — Cart with Shopify Cart API

```typescript
// src/lib/cart.ts — Cart operations using Shopify Storefront API.
// Cart state lives on Shopify's servers — the cart ID is stored in a cookie.
// This means the cart persists across sessions and devices (if user is logged in).

import { shopifyFetch } from "./shopify";
import { cookies } from "next/headers";

const CART_COOKIE = "shopify_cart_id";

export async function createCart(variantId: string, quantity: number = 1) {
  const { cartCreate } = await shopifyFetch<{
    cartCreate: { cart: Cart };
  }>(`
    mutation CreateCart($variantId: ID!, $quantity: Int!) {
      cartCreate(input: {
        lines: [{ merchandiseId: $variantId, quantity: $quantity }]
      }) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost { totalAmount { amount currencyCode } }
          lines(first: 50) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product { title handle images(first: 1) { edges { node { url } } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { variantId, quantity });

  // Store cart ID in cookie
  cookies().set(CART_COOKIE, cartCreate.cart.id, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 14,  // 14 days
  });

  return cartCreate.cart;
}

export async function addToCart(variantId: string, quantity: number = 1) {
  const cartId = cookies().get(CART_COOKIE)?.value;

  if (!cartId) {
    return createCart(variantId, quantity);
  }

  const { cartLinesAdd } = await shopifyFetch<{
    cartLinesAdd: { cart: Cart };
  }>(`
    mutation AddToCart($cartId: ID!, $variantId: ID!, $quantity: Int!) {
      cartLinesAdd(cartId: $cartId, lines: [{ merchandiseId: $variantId, quantity: $quantity }]) {
        cart {
          id
          checkoutUrl
          totalQuantity
          cost { totalAmount { amount currencyCode } }
          lines(first: 50) {
            edges {
              node {
                id
                quantity
                merchandise {
                  ... on ProductVariant {
                    id
                    title
                    price { amount currencyCode }
                    product { title handle images(first: 1) { edges { node { url } } } }
                  }
                }
              }
            }
          }
        }
      }
    }
  `, { cartId, variantId, quantity });

  return cartLinesAdd.cart;
}

// Redirect to Shopify's hosted checkout
export async function getCheckoutUrl(): Promise<string> {
  const cartId = cookies().get(CART_COOKIE)?.value;
  if (!cartId) throw new Error("No cart found");

  const { cart } = await shopifyFetch<{ cart: { checkoutUrl: string } }>(`
    query GetCheckoutUrl($cartId: ID!) {
      cart(id: $cartId) { checkoutUrl }
    }
  `, { cartId });

  return cart.checkoutUrl;
}

interface Cart {
  id: string;
  checkoutUrl: string;
  totalQuantity: number;
  cost: { totalAmount: { amount: string; currencyCode: string } };
  lines: {
    edges: Array<{
      node: {
        id: string;
        quantity: number;
        merchandise: {
          id: string;
          title: string;
          price: { amount: string; currencyCode: string };
          product: { title: string; handle: string; images: { edges: Array<{ node: { url: string } }> } };
        };
      };
    }>;
  };
}
```

## Results

Amara launched the headless store after 3 weeks of development. After two months:

- **Page load: 4.5s → 1.1s** — Next.js Server Components stream HTML, Shopify CDN serves optimized images. Largest Contentful Paint dropped from 4.2s to 0.9s. Google PageSpeed score: 98.
- **Conversion rate: 1.8% → 3.4%** — faster pages convert better. The custom UX with tasting notes, brewing guides, and rich product imagery creates confidence to buy. Cart abandonment dropped 22%.
- **SEO traffic: +45% in 2 months** — Core Web Vitals improvement boosted search ranking. Custom meta tags and structured data (Product schema) improved click-through from search results.
- **Shopify still handles everything complex** — checkout, payments (Stripe + Apple Pay + Google Pay), inventory, tax calculation, shipping rates, order management, and refunds. Amara's team manages products entirely in Shopify Admin.
- **Blog via Strapi**: coffee guides, recipes, and origin stories are authored in Strapi's rich text editor and rendered on the Next.js frontend. Shopify for products, Strapi for editorial — each tool used for what it's best at.
- **Development velocity**: new product pages are automatic (Shopify product → auto-appears on site). Landing pages and blog posts are managed in Strapi. The development team only touches code for new features, not content updates.
