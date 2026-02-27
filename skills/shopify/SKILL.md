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
compatibility: "Liquid (themes). Node.js/Ruby (apps). React/Remix (Hydrogen). Shopify CLI."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: ecommerce
  tags: ["shopify", "ecommerce", "liquid", "storefront", "hydrogen", "themes"]
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
npm install -g @shopify/cli @shopify/theme
shopify theme init my-theme
cd my-theme
shopify theme dev  # Local development with hot reload
```

#### Theme Structure

```
my-theme/
├── layout/
│   └── theme.liquid          # Main layout (wraps all pages)
├── templates/
│   ├── index.json            # Homepage (JSON template)
│   ├── product.liquid        # Product page
│   ├── collection.liquid     # Collection page
│   ├── cart.liquid            # Cart page
│   └── page.liquid            # Generic page
├── sections/
│   ├── header.liquid          # Header section (customizable in admin)
│   ├── hero-banner.liquid     # Hero banner section
│   ├── featured-products.liquid
│   └── footer.liquid
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
    {
      "type": "image_picker",
      "id": "image",
      "label": "Background Image"
    },
    {
      "type": "text",
      "id": "heading",
      "label": "Heading",
      "default": "Welcome to our store"
    },
    {
      "type": "richtext",
      "id": "text",
      "label": "Description"
    },
    {
      "type": "text",
      "id": "button_text",
      "label": "Button Text"
    },
    {
      "type": "url",
      "id": "button_link",
      "label": "Button Link"
    }
  ],
  "presets": [
    {
      "name": "Hero Banner"
    }
  ]
}
{% endschema %}
```

```liquid
{% comment %} sections/featured-products.liquid — Dynamic product grid {% endcomment %}

<section class="featured-products">
  <h2>{{ section.settings.title }}</h2>
  <div class="product-grid">
    {% for product in section.settings.collection.products limit: section.settings.limit %}
      {% render 'product-card', product: product %}
    {% endfor %}
  </div>
</section>

{% schema %}
{
  "name": "Featured Products",
  "settings": [
    { "type": "text", "id": "title", "label": "Section Title", "default": "Featured Products" },
    { "type": "collection", "id": "collection", "label": "Collection" },
    { "type": "range", "id": "limit", "label": "Products to show", "min": 2, "max": 12, "step": 1, "default": 4 }
  ],
  "presets": [{ "name": "Featured Products" }]
}
{% endschema %}
```

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

```json
// config/settings_schema.json — Theme customization panel
[
  {
    "name": "Colors",
    "settings": [
      { "type": "color", "id": "color_primary", "label": "Primary Color", "default": "#000000" },
      { "type": "color", "id": "color_secondary", "label": "Secondary Color", "default": "#333333" },
      { "type": "color", "id": "color_accent", "label": "Accent Color", "default": "#0066cc" }
    ]
  },
  {
    "name": "Typography",
    "settings": [
      { "type": "font_picker", "id": "font_heading", "label": "Heading Font", "default": "helvetica_n7" },
      { "type": "font_picker", "id": "font_body", "label": "Body Font", "default": "helvetica_n4" }
    ]
  },
  {
    "name": "Social Media",
    "settings": [
      { "type": "text", "id": "social_instagram", "label": "Instagram URL" },
      { "type": "text", "id": "social_facebook", "label": "Facebook URL" },
      { "type": "text", "id": "social_tiktok", "label": "TikTok URL" }
    ]
  }
]
```

### Storefront API (Headless)

```typescript
// lib/shopify.ts — Query Shopify Storefront API
const SHOPIFY_DOMAIN = "my-store.myshopify.com";
const STOREFRONT_TOKEN = process.env.SHOPIFY_STOREFRONT_TOKEN;

async function shopifyQuery(query: string, variables?: Record<string, any>) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/api/2024-10/graphql.json`, {
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

### Admin API (Backend/Apps)

```typescript
// admin/products.ts — Manage products via Admin API
const ADMIN_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN;

async function adminQuery(query: string, variables?: Record<string, any>) {
  const res = await fetch(`https://${SHOPIFY_DOMAIN}/admin/api/2024-10/graphql.json`, {
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
  mutation CreateProduct($input: ProductInput!) {
    productCreate(input: $input) {
      product { id title }
      userErrors { field message }
    }
  }
`, {
  input: {
    title: "New Product",
    bodyHtml: "<p>Product description</p>",
    vendor: "My Brand",
    productType: "Accessories",
    tags: ["new", "featured"],
  },
});
```

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

async function updateQuantity(lineItemKey, quantity) {
  const res = await fetch("/cart/change.js", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: lineItemKey, quantity }),
  });
  const cart = await res.json();
  updateCartUI(cart);
}

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
- **Storefront API for headless** — GraphQL, read-only, public token
- **Admin API for apps** — GraphQL/REST, private token, full CRUD
- **Image optimization** — always use `| image_url: width: X` filter
- **Metafields for custom data** — extend products/pages with custom fields
- **Theme settings for global config** — colors, fonts, social links in `settings_schema.json`
- **`shopify theme dev` for local development** — hot reload, sync with store
- **Checkout is managed by Shopify** — customize only via checkout extensions (Shopify Plus)
- **Staff training** — sections + settings make themes self-service for non-devs
