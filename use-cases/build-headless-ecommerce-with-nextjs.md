---
title: Build a Headless E-Commerce Store with Next.js
slug: build-headless-ecommerce-with-nextjs
description: >-
  Build a fast, SEO-optimized headless e-commerce storefront using Next.js for
  the frontend, Medusa as the headless commerce backend, Stripe for payments,
  and Meilisearch for instant product search. Complete with cart, checkout,
  and order management.
skills:
  - medusa
  - stripe-billing
  - meilisearch
  - nextjs
category: business
tags:
  - ecommerce
  - headless
  - nextjs
  - medusa
  - stripe
---

# Build a Headless E-Commerce Store with Next.js

Yana runs a small ceramics studio selling handmade pottery online. Her current WooCommerce store loads in 6 seconds, mobile conversion is terrible, and she can't customize the checkout flow. She wants a fast, modern store that feels like an app — instant product search, smooth animations, and a checkout that doesn't lose customers. She decides to go headless: Medusa for the commerce backend, Next.js for the frontend, Stripe for payments, and Meilisearch for search.

## Step 1: Medusa Commerce Backend

Medusa is an open-source headless commerce platform. It handles products, carts, orders, payments, shipping, and fulfillment — all via API. Think Shopify's backend without the locked-in frontend.

```bash
# Initialize Medusa backend
npx create-medusa-app@latest pottery-store
cd pottery-store/backend

# Start the server (runs on port 9000)
npx medusa develop
```

```typescript
// medusa-config.ts — Configure Medusa with PostgreSQL and plugins
module.exports = {
  projectConfig: {
    database_url: process.env.DATABASE_URL,
    store_cors: process.env.STORE_CORS,    // frontend URL
    admin_cors: process.env.ADMIN_CORS,
  },
  plugins: [
    {
      resolve: '@medusajs/medusa-payment-stripe',
      options: {
        api_key: process.env.STRIPE_API_KEY,
      },
    },
    {
      resolve: 'medusa-plugin-meilisearch',
      options: {
        config: { host: process.env.MEILISEARCH_HOST, apiKey: process.env.MEILISEARCH_API_KEY },
        settings: {
          products: {
            indexSettings: {
              searchableAttributes: ['title', 'description', 'collection_title'],
              displayedAttributes: ['title', 'description', 'thumbnail', 'handle', 'variants'],
            },
          },
        },
      },
    },
  ],
}
```

## Step 2: Next.js Storefront

The frontend is a standard Next.js App Router project. It fetches data from Medusa's API and renders server-side for SEO and performance.

```typescript
// lib/medusa.ts — Medusa client for the storefront
import Medusa from '@medusajs/medusa-js'

export const medusa = new Medusa({
  baseUrl: process.env.NEXT_PUBLIC_MEDUSA_URL!,    // http://localhost:9000
  maxRetries: 3,
})

export async function getProducts(limit = 20, offset = 0) {
  const { products, count } = await medusa.products.list({
    limit,
    offset,
    expand: 'variants,variants.prices,images,collection',
  })
  return { products, count }
}

export async function getProduct(handle: string) {
  const { products } = await medusa.products.list({ handle })
  return products[0]
}
```

```tsx
// app/products/page.tsx — Product listing with ISR
import { getProducts } from '@/lib/medusa'

export const revalidate = 60    // revalidate every 60 seconds

export default async function ProductsPage() {
  const { products } = await getProducts()

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-8">
      {products.map(product => (
        <a key={product.id} href={`/products/${product.handle}`} className="group">
          <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">
            <img
              src={product.thumbnail}
              alt={product.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
            />
          </div>
          <h3 className="mt-2 font-medium">{product.title}</h3>
          <p className="text-gray-600">
            ${(product.variants[0]?.prices[0]?.amount / 100).toFixed(2)}
          </p>
        </a>
      ))}
    </div>
  )
}
```

## Step 3: Cart and Checkout

Medusa manages carts server-side. Each visitor gets a cart (stored in a cookie), and items are added/removed via API calls.

```typescript
// hooks/useCart.ts — Cart management with React context
'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { medusa } from '@/lib/medusa'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [cart, setCart] = useState(null)

  useEffect(() => {
    const cartId = localStorage.getItem('cart_id')
    if (cartId) {
      medusa.carts.retrieve(cartId).then(({ cart }) => setCart(cart))
    } else {
      medusa.carts.create().then(({ cart }) => {
        localStorage.setItem('cart_id', cart.id)
        setCart(cart)
      })
    }
  }, [])

  const addItem = async (variantId: string, quantity = 1) => {
    const { cart: updated } = await medusa.carts.lineItems.create(cart.id, {
      variant_id: variantId,
      quantity,
    })
    setCart(updated)
  }

  const removeItem = async (lineItemId: string) => {
    const { cart: updated } = await medusa.carts.lineItems.delete(cart.id, lineItemId)
    setCart(updated)
  }

  return (
    <CartContext.Provider value={{ cart, addItem, removeItem }}>
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => useContext(CartContext)
```

```tsx
// components/AddToCart.tsx — Add to cart button
'use client'
import { useCart } from '@/hooks/useCart'

export function AddToCartButton({ variantId }) {
  const { addItem } = useCart()
  const [adding, setAdding] = useState(false)

  const handleAdd = async () => {
    setAdding(true)
    await addItem(variantId)
    setAdding(false)
  }

  return (
    <button onClick={handleAdd} disabled={adding}
      className="w-full bg-black text-white py-3 rounded-lg hover:bg-gray-800 disabled:bg-gray-400">
      {adding ? 'Adding...' : 'Add to Cart'}
    </button>
  )
}
```

## Step 4: Instant Product Search

Meilisearch provides typo-tolerant, instant search. Products sync automatically through Medusa's plugin.

```tsx
// components/Search.tsx — Instant product search
'use client'
import { instantMeiliSearch } from '@meilisearch/instant-meilisearch'
import { InstantSearch, SearchBox, Hits } from 'react-instantsearch'

const { searchClient } = instantMeiliSearch(
  process.env.NEXT_PUBLIC_MEILISEARCH_HOST!,
  process.env.NEXT_PUBLIC_MEILISEARCH_KEY!,
)

export function ProductSearch() {
  return (
    <InstantSearch indexName="products" searchClient={searchClient}>
      <SearchBox
        placeholder="Search pottery..."
        classNames={{
          input: 'w-full px-4 py-2 border rounded-lg',
        }}
      />
      <Hits hitComponent={({ hit }) => (
        <a href={`/products/${hit.handle}`} className="flex gap-3 p-2 hover:bg-gray-50 rounded">
          <img src={hit.thumbnail} alt={hit.title} className="w-16 h-16 object-cover rounded" />
          <div>
            <p className="font-medium">{hit.title}</p>
            <p className="text-sm text-gray-500">{hit.description?.slice(0, 60)}...</p>
          </div>
        </a>
      )} />
    </InstantSearch>
  )
}
```

## Step 5: Stripe Checkout Completion

When the customer is ready to pay, Medusa creates a Stripe Payment Intent. The frontend collects card details with Stripe Elements.

```tsx
// components/Checkout.tsx — Payment with Stripe Elements
'use client'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { loadStripe } from '@stripe/stripe-js'
import { medusa } from '@/lib/medusa'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_KEY!)

function CheckoutForm({ cartId }) {
  const stripe = useStripe()
  const elements = useElements()

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Create payment session in Medusa
    await medusa.carts.createPaymentSessions(cartId)
    await medusa.carts.setPaymentSession(cartId, { provider_id: 'stripe' })

    // Confirm with Stripe
    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: { return_url: `${window.location.origin}/order/confirmed` },
    })

    if (error) console.error(error.message)
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      <button className="mt-4 w-full bg-black text-white py-3 rounded-lg">
        Pay Now
      </button>
    </form>
  )
}
```

## Results

Yana launches the new store and the difference is immediate. Page load drops from 6 seconds to 0.8 seconds (Next.js SSR + ISR caching). Mobile conversion rate jumps from 1.2% to 3.8% within the first month. Product search is instant — customers type "blue mug" and results appear as they type, with typo tolerance handling "bule mug" correctly. The Stripe checkout is two steps instead of five. Total hosting cost: $0 for Medusa (self-hosted), $0 for Meilisearch (self-hosted), $20/month for a VPS — compared to $79/month for Shopify with worse performance.
