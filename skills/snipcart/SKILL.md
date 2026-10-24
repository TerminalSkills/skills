---
name: snipcart
description: >-
  Snipcart is a hosted shopping cart and checkout that you add to any website
  with a script and HTML data attributes, no backend needed. Use when a user
  asks to add a shopping cart to a static site, sell products from a JAMstack
  or Astro/Next.js site, add "add to cart" buttons, validate prices with the
  JSON crawler, listen to cart events, or manage a Snipcart store from an AI
  assistant through the Snipcart MCP server.
license: Apache-2.0
compatibility: "Any website that can serve HTML and a script tag; Snipcart account (test mode is free); MCP server needs the private API key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags:
    - snipcart
    - ecommerce
    - cart
    - jamstack
    - static-site
---

# Snipcart

## Overview

Snipcart (v3) turns HTML elements into products. You load its script, mark a button with the `snipcart-add-item` class and `data-item-*` attributes, and Snipcart provides the cart, checkout, taxes, shipping, discounts, inventory and the merchant dashboard. Testing is free. In production it charges 2% of sales plus your payment gateway fees, or a flat $20 per month when monthly sales are under $1,000 (see snipcart.com/pricing).

Before an order is created, Snipcart's servers fetch each item's `data-item-url` and compare the price (and price-changing options) with what your page advertises, so a shopper cannot edit prices in the browser.

## Instructions

### Step 1: Install the script

Open the Installation page in the Snipcart docs (docs.snipcart.com/v3/setup/installation), copy the current snippet, replace the key with your **public** API key from the dashboard and paste it right after `<body>`. It begins like this:

```html
<script>
  window.SnipcartSettings = {
    publicApiKey: "YOUR_PUBLIC_API_KEY",
    loadStrategy: "on-user-interaction",   // load the cart on first interaction, keeps pages fast
    currency: "usd",
  };
  // ...loader code from the docs continues here...
</script>
```

The loader fetches `snipcart.js` and `snipcart.css` from `cdn.snipcart.com` and creates the hidden `#snipcart` element itself. Register your site's domain in the dashboard (Store configuration > Domains and URLs), otherwise orders fail validation.

### Step 2: Add products and a cart button

```html
<button class="snipcart-add-item"
  data-item-id="organic-tee-black"
  data-item-name="Organic Cotton Tee"
  data-item-price="29.99"
  data-item-url="/products/organic-tee"
  data-item-image="/images/organic-tee.jpg"
  data-item-description="Heavyweight 100% organic cotton"
  data-item-custom1-name="Size"
  data-item-custom1-options="S|M|L|XL">
  Add to cart
</button>

<button class="snipcart-checkout">
  Cart (<span class="snipcart-items-count">0</span>)
</button>
```

Required attributes are `data-item-id`, `data-item-name` and `data-item-price` (use `.` as the decimal separator). `data-item-url` is optional from 3.2.2 (it defaults to the current page) but must be the page where this exact button is served. Options in `data-item-custom{n}-options` are separated by `|`; append a price modifier such as `Gold[+10.00]` for options that change the price. Products sharing an id must share a price.

### Step 3: Generate buttons in a framework

```astro
---
// components/ProductCard.astro
const { product } = Astro.props
---
<button class="snipcart-add-item"
  data-item-id={product.id}
  data-item-name={product.name}
  data-item-price={product.price}
  data-item-url={`/products/${product.slug}`}
  data-item-image={product.image}>
  Add to cart
</button>
```

The button must exist in the HTML the crawler receives. If the page renders buttons only in the browser, point `data-item-url` at a URL that returns JSON instead: when the response `Content-Type` is `application/json`, Snipcart uses its JSON crawler and expects an object with `id` and `price` (plus `customFields`, `dimensions`, `fileGuid` and others where relevant).

### Step 4: JavaScript SDK events

```javascript
document.addEventListener('snipcart.ready', () => {
  Snipcart.events.on('item.added', (cartItem) => {
    console.log('Added:', cartItem.name, cartItem.quantity)
  })
  Snipcart.events.on('cart.confirmed', (response) => {
    console.log('Order confirmed:', response)
  })
})
```

Events documented for v3 include `item.adding`, `item.added`, `item.updated`, `item.removed`, `cart.created`, `cart.confirmed` and `cart.confirm.error`. The old `Snipcart.api.cart.items.added` style belongs to v2.

### Step 5: Manage the store from an AI assistant (MCP)

Snipcart hosts an MCP server (38 tools for orders, customers, products, discounts, refunds, abandoned carts, shipping methods, domains). It uses Streamable HTTP and your **secret** API key (`ST_` test, `SL_` live) in a header:

```bash
claude mcp add Snipcart -t http https://ai.snipcart.com/mcp \
  --header "X-Snipcart-Api-Key: ${SNIPCART_SECRET_API_KEY}" --scope project
```

Start with the test key. The secret key can refund orders, so keep it out of the repository.

## Examples

### Example 1: Add a cart to a static brochure site

Request: "Add Snipcart to my 11ty site and make the 'Hand-poured candle' (id candle-01, $18) buyable."

Paste the Step 1 snippet in the base layout, then in `products/candle.html`:

```html
<button class="snipcart-add-item" data-item-id="candle-01" data-item-name="Hand-poured candle"
  data-item-price="18.00" data-item-url="/products/candle/" data-item-image="/img/candle.jpg">Add to cart</button>
```

Result: clicking the button opens the cart overlay; in test mode, checkout accepts the test card from the dashboard, and the order appears under Orders. If checkout says the item could not be validated, the deployed page at `/products/candle/` does not contain a button with id `candle-01` and price `18.00`.

### Example 2: Track purchases in analytics

Request: "Send an add_to_cart event to GA4 when someone adds an item."

```javascript
document.addEventListener('snipcart.ready', () => {
  Snipcart.events.on('item.added', (cartItem) => {
    gtag('event', 'add_to_cart', {
      currency: 'USD',
      value: cartItem.price,
      items: [{ item_id: cartItem.id, item_name: cartItem.name, quantity: cartItem.quantity }],
    })
  })
})
```

## Guidelines

- Develop in test mode with the public test key; switch to the live key only on the production domain.
- Validation fetches your live URLs, so a page behind a login, a staging password or a redirect to another domain makes orders fail. Keep `data-item-url` on a registered domain.
- Never put the secret API key in front-end code; only `publicApiKey` belongs in the page.
- Prices in HTML are the source of truth: change them on the page, not in the cart.
- For server-side order handling use Snipcart webhooks and check the `X-Snipcart-RequestToken` header with a GET to `https://app.snipcart.com/api/requestvalidation/{token}` before trusting a payload.
- If you need your own checkout, subscriptions logic or complex catalogs, compare with a hosted store platform; Snipcart is best for adding commerce to an existing site.
