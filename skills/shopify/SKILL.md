---
name: shopify
description: >-
  Build and customize Shopify stores — themes with Liquid, Storefront API,
  custom apps, and headless commerce with Hydrogen. Use when someone asks to
  "build a Shopify store", "Shopify theme", "Liquid templates", "Shopify API",
  "Shopify app", "headless Shopify", "Hydrogen storefront", "customize Shopify",
  "Shopify product management", or "e-commerce with Shopify". Covers Liquid
  templating, theme development, Storefront/Admin APIs, custom apps, checkout
  extensions, and Hydrogen (React-based headless).
license: Apache-2.0
compatibility: "Liquid (themes). Node.js 22.12+ and Git 2.28+ for Shopify CLI. React (Hydrogen)."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags: ["shopify", "ecommerce", "liquid", "storefront", "hydrogen"]
  repository: "https://github.com/Shopify/cli"
---

# Shopify

## Overview

Shopify is the leading e-commerce platform — from simple stores to enterprise. Build custom themes with Liquid templating (no backend needed, employees can edit content through the admin panel), extend functionality with custom apps via the Admin and Storefront APIs, or go fully headless with Hydrogen (React/Remix). Covers the full spectrum: zero-code store setup, theme customization, API integrations, and custom headless storefronts.

## When to Use

- Building an online store (products, cart, checkout, payments)
- Customizing Shopify themes (layout, design, sections)
- Building custom functionality (apps, integrations, webhooks)
- Headless commerce (custom frontend, Shopify as backend)
- Staff-manageable stores where non-technical people update products and content

## Instructions

### Theme Development with Liquid

```bash
# Install Shopify CLI
npm install -g @shopify/cli@latest   # needs Node.js 22.12+ and Git 2.28+
shopify theme init            # clones the Dawn reference theme; asks for a name
cd dawn                       # or the folder name you chose
shopify theme dev --store my-store.myshopify.com   # local preview with hot reload (asks you to log in)
shopify theme push --unpublished --theme "Redesign test"   # upload as a new unpublished theme
```

#### Theme Structure

```
my-theme/
├── layout/
│   └── theme.liquid          # Main layout (wraps all pages)
├── templates/
│   ├── index.json            # Homepage (JSON template)
│   ├── product.json          # Product page (JSON template listing sections)
│   ├── collection.json       # Collection page
│   ├── cart.json             # Cart page
│   └── page.json             # Generic page
├── sections/
│   ├── header.liquid          # Header section (customizable in admin)
│   ├── hero-banner.liquid     # Hero banner section
│   ├── featured-products.liquid
│   └── footer.liquid
├── blocks/                    # Optional: reusable theme blocks (*.liquid)
├── snippets/
│   ├── product-card.liquid    # Reusable product card
│   └── price.liquid           # Price display with compare-at
├── assets/
│   ├── theme.css
│   └── theme.js
├── config/
│   └── settings_schema.json   # Theme settings (colors, fonts, etc.)
└── locales/
    └── en.default.json        # Translations
```

#### Liquid Templates

```liquid
{% comment %} sections/hero-banner.liquid — Customizable hero section {% endcomment %}
{% comment %}
  Staff can change the heading, text, image, and button
  through the Shopify admin without touching code.
{% endcomment %}

<section class="hero" style="background-image: url('{{ section.settings.image | image_url: width: 1920 }}')">
  <div class="hero__content">
    <h1>{{ section.settings.heading }}</h1>
    <p>{{ section.settings.text }}</p>
    {% if section.settings.button_text != blank %}
      <a href="{{ section.settings.button_link }}" class="btn">
        {{ section.settings.button_text }}
      </a>
    {% endif %}
  </div>
</section>

{% schema %}
{
  "name": "Hero Banner",
  "settings": [
    { "type": "image_picker", "id": "image", "label": "Background Image" },
    { "type": "text", "id": "heading", "label": "Heading", "default": "Welcome to our store" },
    { "type": "richtext", "id": "text", "label": "Description" },
    { "type": "text", "id": "button_text", "label": "Button Text" },
    { "type": "url", "id": "button_link", "label": "Button Link" }
  ],
  "presets": [{ "name": "Hero Banner" }]
}
{% endschema %}
```

Collections and products are picked with `collection` and `product` setting types, then looped with `{% for product in section.settings.collection.products limit: 4 %}{% render 'product-card', product: product %}{% endfor %}`.

```liquid
{% comment %} snippets/product-card.liquid — Reusable product card {% endcomment %}

<div class="product-card">
  <a href="{{ product.url }}">
    <img
      src="{{ product.featured_image | image_url: width: 400 }}"
      alt="{{ product.featured_image.alt | escape }}"
      loading="lazy"
      width="400"
      height="400"
    >
    <h3>{{ product.title }}</h3>
    <div class="product-card__price">
      {% if product.compare_at_price > product.price %}
        <span class="price--sale">{{ product.price | money }}</span>
        <span class="price--compare">{{ product.compare_at_price | money }}</span>
      {% else %}
        <span>{{ product.price | money }}</span>
      {% endif %}
    </div>
  </a>
  <button class="btn" data-product-id="{{ product.variants.first.id }}">
    {% if product.available %}
      Add to Cart
    {% else %}
      Sold Out
    {% endif %}
  </button>
</div>
```

#### Theme Settings (Staff-Editable)

Global options (colors, fonts, social links) live in `config/settings_schema.json` as groups of settings, for example `{ "name": "Colors", "settings": [{ "type": "color", "id": "color_primary", "label": "Primary Color", "default": "#000000" }] }`. Read them in Liquid as `settings.color_primary`.

### Storefront API (Headless)

```typescript
// lib/shopify.ts — Query Shopify Storefront API (pin an API version; new ones ship quarterly, each supported 12+ months)
const SHOPIFY_DOMAIN = "my-store.myshopify.com";
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

async function shopifyQuery(query: string, variables?: Record<string, any>) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/api/2026-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Storefront-Access-Token": STOREFRONT_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// Get products
const { data } = await shopifyQuery(`
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id
          title
          handle
          priceRange {
            minVariantPrice { amount currencyCode }
          }
          images(first: 1) {
            edges { node { url altText } }
          }
        }
      }
    }
  }
`, { first: 12 });
```

Checkout runs through the cart: create one with `cartCreate` (lines of `merchandiseId` + `quantity`), then send the buyer to the returned `cart.checkoutUrl`. The old Checkout mutations are gone.

### Admin API (Backend/Apps)

Admin API is GraphQL; the REST Admin API is legacy and new public apps must use GraphQL. Scaffold an app with `shopify app init`. Apps created in the Dev Dashboard get a token by POSTing `grant_type=client_credentials`, `client_id` and `client_secret` to `https://my-store.myshopify.com/admin/oauth/access_token` (works when app and store are in the same organization; the token lasts 24 hours, so cache and refresh it). Never ship the token to the browser.

```typescript
// admin/products.ts — Manage products via Admin API
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

async function adminQuery(query: string, variables?: Record<string, any>) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2026-10/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": ADMIN_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });
  return res.json();
}

// Create a product
await adminQuery(`
  mutation CreateProduct($product: ProductCreateInput!) {
    productCreate(product: $product) {
      product { id title }
      userErrors { field message }
    }
  }
`, {
  product: {
    title: "Merino Beanie",
    descriptionHtml: "<p>Soft merino wool beanie.</p>",
    vendor: "Northwind Knits",
    productType: "Accessories",
    tags: ["new", "featured"],
  },
});
// New products start unpublished: publish them with publishablePublish.
```

### Headless with Hydrogen

```bash
npm create @shopify/hydrogen@latest -- --quickstart   # scaffolds a storefront with product, collection, cart and search routes
cd hydrogen-quickstart && shopify hydrogen dev        # http://localhost:3000
```

Hydrogen is Shopify's React framework for Storefront API storefronts, deployed to Oxygen or any Node host.

### Cart with JavaScript (Ajax API)

```javascript
// assets/theme.js — Cart functionality (no page reload)
async function addToCart(variantId, quantity = 1) {
  const res = await fetch("/cart/add.js", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items: [{ id: variantId, quantity }] }),
  });
  const cart = await res.json();
  updateCartUI(cart);
}

// /cart/change.js takes { id: lineItemKey, quantity } to update a line
async function getCart() {
  const res = await fetch("/cart.js");
  return res.json();
}
```

## Examples

### Example 1: Build a custom Shopify theme

**User prompt:** "Create a Shopify theme for a clothing store with customizable hero, product grid, and newsletter sections that staff can edit."

The agent will create Liquid sections with schema blocks, theme settings for colors/fonts, product card snippets, and Ajax cart — all editable by non-technical staff through the Shopify admin panel.

### Example 2: Integrate external service with Shopify

**User prompt:** "When an order is placed, send the details to our warehouse API and update inventory."

The agent will create a Shopify webhook listener for order creation, call the warehouse API, and update inventory via the Admin API.

### Example 3: Headless Shopify with React

**User prompt:** "Build a custom React storefront using Shopify as the backend."

The agent will set up Storefront API queries for products/collections/cart, handle checkout creation, and implement product search.

## Guidelines

- **Sections for customizability** — anything staff should edit goes in a section with `{% schema %}`
- **JSON templates** — use `templates/*.json` for drag-and-drop section ordering
- **Snippets for reusability** — `{% render 'product-card', product: product %}`
- **Ajax API for cart** — `/cart/add.js`, `/cart/change.js`, `/cart.js` for no-reload cart
- **Storefront API for headless** — GraphQL, buyer-facing, public token
- **Admin API for apps** — GraphQL, secret token kept server-side, full CRUD
- **Image optimization** — always use `| image_url: width: X` filter
- **Metafields for custom data** — extend products/pages with custom fields
- **Theme settings for global config** — colors, fonts, social links in `settings_schema.json`
- **`shopify theme dev` for local development** — hot reload, sync with store
- **Checkout is managed by Shopify** — `checkout.liquid` is gone; customize with checkout UI extensions and Shopify Functions
- **Pin an API version** and bump it each quarter; retired versions silently fall forward
- **Staff training** — sections + settings make themes self-service for non-devs
