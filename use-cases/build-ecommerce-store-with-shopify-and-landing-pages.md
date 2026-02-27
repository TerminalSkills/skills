---
title: Build an E-Commerce Store with Shopify and Marketing Landing Pages
slug: build-ecommerce-store-with-shopify-and-landing-pages
description: Set up a Shopify store with custom theme and connect it with Tilda landing pages for marketing campaigns — staff-editable across both platforms.
skills:
  - shopify
  - tilda
category: ecommerce
tags:
  - shopify
  - tilda
  - ecommerce
  - landing-pages
  - no-code
  - staff-managed
---

## The Problem

Marta runs a small fashion brand with 3 employees. She needs an online store for selling products (catalog, cart, checkout, payments) and landing pages for seasonal campaigns and promotions. The employees — not developers — need to update products, change banners, and create new landing pages without waiting for a developer. Budget is tight: no custom backend, no DevOps, no monthly developer retainer.

## The Solution

Use Shopify for the core store (products, payments, fulfillment) with a custom theme that staff can edit through the admin panel. Use Tilda for marketing landing pages and campaign microsites — visual builder that anyone can use. Connect them so Tilda landing pages link to Shopify products, and form submissions from Tilda go to the team's CRM and Telegram.

## Step-by-Step Walkthrough

### Step 1: Shopify Store with Custom Theme

Set up the Shopify store with sections that staff can rearrange and edit — no developer needed for content changes.

```liquid
{% comment %} layout/theme.liquid — Main store layout {% endcomment %}
<!DOCTYPE html>
<html lang="{{ request.locale.iso_code }}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{{ page_title }}{% unless page_title contains shop.name %} — {{ shop.name }}{% endunless %}</title>
  {{ content_for_header }}
  {{ 'theme.css' | asset_url | stylesheet_tag }}
</head>
<body>
  {% section 'header' %}
  <main>
    {{ content_for_layout }}
  </main>
  {% section 'footer' %}
  {{ 'theme.js' | asset_url | script_tag }}
</body>
</html>
```

```liquid
{% comment %} sections/header.liquid — Staff-editable header {% endcomment %}
<header class="header">
  <div class="header__inner">
    <a href="/" class="header__logo">
      {% if section.settings.logo %}
        <img src="{{ section.settings.logo | image_url: width: 200 }}" alt="{{ shop.name }}">
      {% else %}
        {{ shop.name }}
      {% endif %}
    </a>

    <nav class="header__nav">
      {% for link in section.settings.menu.links %}
        <a href="{{ link.url }}">{{ link.title }}</a>
      {% endfor %}
    </nav>

    <div class="header__actions">
      <a href="/cart" class="header__cart">
        🛒 <span class="cart-count">{{ cart.item_count }}</span>
      </a>
    </div>
  </div>

  {% if section.settings.announcement %}
    <div class="announcement-bar" style="background: {{ section.settings.announcement_bg }}">
      {{ section.settings.announcement }}
    </div>
  {% endif %}
</header>

{% schema %}
{
  "name": "Header",
  "settings": [
    { "type": "image_picker", "id": "logo", "label": "Logo" },
    { "type": "link_list", "id": "menu", "label": "Navigation Menu", "default": "main-menu" },
    { "type": "text", "id": "announcement", "label": "Announcement Text" },
    { "type": "color", "id": "announcement_bg", "label": "Announcement Background", "default": "#000000" }
  ]
}
{% endschema %}
```

```liquid
{% comment %} sections/collection-grid.liquid — Product grid for any collection {% endcomment %}
<section class="collection-grid">
  <h2>{{ section.settings.title }}</h2>
  <div class="grid grid--{{ section.settings.columns }}">
    {% for product in section.settings.collection.products limit: section.settings.limit %}
      <div class="product-card">
        <a href="{{ product.url }}">
          <div class="product-card__image">
            <img
              src="{{ product.featured_image | image_url: width: 400 }}"
              alt="{{ product.title | escape }}"
              loading="lazy"
            >
            {% if product.compare_at_price > product.price %}
              <span class="badge badge--sale">Sale</span>
            {% endif %}
          </div>
          <h3 class="product-card__title">{{ product.title }}</h3>
          <div class="product-card__price">
            {{ product.price | money }}
            {% if product.compare_at_price > product.price %}
              <del>{{ product.compare_at_price | money }}</del>
            {% endif %}
          </div>
        </a>
      </div>
    {% endfor %}
  </div>
</section>

{% schema %}
{
  "name": "Collection Grid",
  "settings": [
    { "type": "text", "id": "title", "label": "Title", "default": "Shop Collection" },
    { "type": "collection", "id": "collection", "label": "Collection" },
    { "type": "range", "id": "columns", "label": "Columns", "min": 2, "max": 4, "default": 3 },
    { "type": "range", "id": "limit", "label": "Products to Show", "min": 3, "max": 12, "default": 6 }
  ],
  "presets": [{ "name": "Collection Grid" }]
}
{% endschema %}
```

### Step 2: Tilda Landing Pages for Campaigns

Campaign landing pages live on Tilda — staff drag blocks to build pages visually.

```html
<!-- Tilda page: Custom code to link to Shopify products -->
<!-- Add to: Settings → More → Before </body> -->

<script>
  // Replace Tilda store buttons with Shopify links
  document.querySelectorAll('[data-shopify-handle]').forEach((el) => {
    const handle = el.dataset.shopifyHandle;
    el.href = `https://mystore.myshopify.com/products/${handle}`;
  });

  // Track campaign conversions
  const urlParams = new URLSearchParams(window.location.search);
  const campaign = urlParams.get('utm_campaign');
  if (campaign) {
    sessionStorage.setItem('campaign', campaign);
  }

  // "Buy Now" buttons that add to Shopify cart directly
  document.querySelectorAll('.shopify-buy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const variantId = btn.dataset.variantId;
      const shopifyDomain = 'mystore.myshopify.com';

      // Create Shopify checkout with this product
      const res = await fetch(`https://${shopifyDomain}/cart/${variantId}:1`, {
        redirect: 'follow',
      });
      window.location.href = `https://${shopifyDomain}/cart/${variantId}:1`;
    });
  });
</script>

<style>
  /* Brand-consistent styling for Tilda pages */
  .shopify-buy-btn {
    background: #000;
    color: #fff;
    padding: 14px 32px;
    border: none;
    font-size: 16px;
    cursor: pointer;
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .shopify-buy-btn:hover {
    background: #333;
  }
</style>
```

### Step 3: Connect Tilda Forms to Team

```typescript
// webhook/tilda-lead.ts — Receive leads from Tilda landing pages
export async function POST(req: Request) {
  const formData = await req.formData();
  const name = formData.get("Name") as string;
  const email = formData.get("Email") as string;
  const phone = formData.get("Phone") as string;
  const campaign = formData.get("utm_campaign") as string;

  // Notify team on Telegram
  const message = `🔔 New lead from campaign!\n👤 ${name}\n📧 ${email}\n📱 ${phone}\n🎯 Campaign: ${campaign || "direct"}`;

  await fetch(`https://api.telegram.org/bot${process.env.TG_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TG_CHAT_ID,
      text: message,
    }),
  });

  // Add to Google Sheets (simple CRM)
  await fetch(process.env.GOOGLE_SHEETS_WEBHOOK!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, phone, campaign, date: new Date().toISOString() }),
  });

  return new Response("OK");
}
```

## The Outcome

Marta's brand launches in 2 weeks. The Shopify store handles products, cart, payments, and order fulfillment — employees update products, change prices, and swap hero banners through the admin panel. Campaign landing pages live on Tilda — when the spring collection drops, an employee builds a landing page in 2 hours (drag blocks, add product photos, write copy), links "Buy Now" buttons to Shopify products, and every form submission pings the team on Telegram. Monthly cost: Shopify Basic ($39) + Tilda Business ($25) = $64/month for a fully functional e-commerce operation. No developer maintenance needed for day-to-day operations.
