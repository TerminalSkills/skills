---
name: tilda
description: >-
  Build and customize websites with Tilda — zero-code website builder with
  advanced customization. Use when someone asks to "build a website with
  Tilda", "Tilda Publishing", "customize Tilda site", "Tilda API", "landing
  page builder", "no-code website", "Tilda custom code", or "integrate Tilda
  with external services". Covers block-based building, custom HTML/CSS/JS,
  Tilda API, form handling, e-commerce, and integrations.
license: Apache-2.0
compatibility: "Browser-based editor. Custom code: HTML/CSS/JS. API: REST."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: frontend
  tags: ["tilda", "website-builder", "no-code", "landing-page", "ecommerce", "cms"]
---

# Tilda Publishing

## Overview

Tilda is a block-based website builder — drag blocks onto a page, customize them visually, and publish. No backend to manage, no hosting to configure. For developers: inject custom HTML/CSS/JS into any block, use the Tilda API to manage content programmatically, connect forms to any backend, and build custom integrations. Perfect for marketing sites, landing pages, and small e-commerce stores where non-technical staff need to update content independently.

## When to Use

- Building marketing sites and landing pages quickly
- Need a CMS that non-technical staff can update easily
- Small-to-medium e-commerce (Tilda's built-in store)
- Custom landing pages with advanced animations
- Sites that need both visual editing and custom code

## Instructions

### Site Structure

Tilda sites are organized as:
- **Project** → contains pages
- **Page** → contains blocks (sections)
- **Block** → pre-designed section (hero, features, pricing, gallery, etc.)
- **Zero Block** — custom block where you have full design freedom

### Custom HTML/CSS/JS in Blocks

```html
<!-- Add custom code via: Settings → More → HTML code in <head> or Before </body> -->

<!-- Custom CSS (head) -->
<style>
  /* Override Tilda defaults */
  .t-title {
    font-family: 'Inter', sans-serif !important;
  }

  /* Custom animations */
  .t-animate {
    opacity: 0;
    transform: translateY(20px);
    transition: all 0.6s ease;
  }
  .t-animate.is-visible {
    opacity: 1;
    transform: translateY(0);
  }

  /* Responsive overrides */
  @media (max-width: 640px) {
    .t-cover__wrapper {
      min-height: 60vh !important;
    }
  }
</style>
```

```html
<!-- Custom JavaScript (before </body>) -->
<script>
  // Intersection Observer for scroll animations
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.t-animate').forEach((el) => observer.observe(el));
  });

  // Custom form handling — send to your own API
  document.querySelector('.t-form')?.addEventListener('submit', async (e) => {
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);

    // Send to your backend alongside Tilda's built-in handling
    await fetch('https://api.myapp.com/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });
</script>
```

### Zero Block (Custom Design)

Zero Block gives you full Artboard-like control — place elements precisely with custom positioning, animations, and responsive breakpoints.

```html
<!-- Zero Block with custom interactive elements -->
<div class="custom-calculator" id="price-calc">
  <h3>Price Calculator</h3>
  <div class="calc-row">
    <label>Number of users</label>
    <input type="range" id="users" min="1" max="1000" value="10">
    <span id="users-count">10</span>
  </div>
  <div class="calc-row">
    <label>Plan</label>
    <select id="plan">
      <option value="starter">Starter — $5/user</option>
      <option value="pro">Pro — $12/user</option>
      <option value="enterprise">Enterprise — $25/user</option>
    </select>
  </div>
  <div class="calc-result">
    Total: <span id="total">$50</span>/month
  </div>
</div>

<script>
  const prices = { starter: 5, pro: 12, enterprise: 25 };
  const usersInput = document.getElementById('users');
  const planSelect = document.getElementById('plan');

  function updatePrice() {
    const users = parseInt(usersInput.value);
    const price = prices[planSelect.value];
    document.getElementById('users-count').textContent = users;
    document.getElementById('total').textContent = '$' + (users * price).toLocaleString();
  }

  usersInput.addEventListener('input', updatePrice);
  planSelect.addEventListener('change', updatePrice);
</script>
```

### Tilda API

```typescript
// api/tilda.ts — Manage Tilda content programmatically
const TILDA_PUBLIC_KEY = process.env.TILDA_PUBLIC_KEY;
const TILDA_SECRET_KEY = process.env.TILDA_SECRET_KEY;
const BASE_URL = "https://api.tildacdn.info/v1";

// Get all projects
async function getProjects() {
  const res = await fetch(
    `${BASE_URL}/getprojectslist/?publickey=${TILDA_PUBLIC_KEY}&secretkey=${TILDA_SECRET_KEY}`
  );
  return res.json(); // { status: "FOUND", result: [{ id, title, ... }] }
}

// Get all pages in a project
async function getPages(projectId: number) {
  const res = await fetch(
    `${BASE_URL}/getpageslist/?publickey=${TILDA_PUBLIC_KEY}&secretkey=${TILDA_SECRET_KEY}&projectid=${projectId}`
  );
  return res.json();
}

// Get full page content (HTML + CSS + JS)
async function getPageFull(pageId: number) {
  const res = await fetch(
    `${BASE_URL}/getpagefull/?publickey=${TILDA_PUBLIC_KEY}&secretkey=${TILDA_SECRET_KEY}&pageid=${pageId}`
  );
  return res.json();
  // Returns: { html, css, js, images[], title, descr, ... }
}

// Export page to your own hosting
async function exportPage(pageId: number) {
  const page = await getPageFull(pageId);
  const { html, css, js } = page.result;

  // Build self-contained HTML
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <style>${css}</style>
    </head>
    <body>
      ${html}
      <script>${js}</script>
    </body>
    </html>
  `;
}
```

### Form Handling and Webhooks

```typescript
// webhook/tilda-form.ts — Receive Tilda form submissions
/**
 * Configure in Tilda: Block Settings → Form → Webhook URL
 * Tilda sends POST with form data on every submission.
 */
export async function handleTildaForm(req: Request) {
  const formData = await req.formData();
  const data = Object.fromEntries(formData);

  // data: { Name: "Kai", Email: "kai@example.com", Phone: "+1234567890", ... }

  // Save to CRM
  await fetch("https://api.mycrm.com/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.Name,
      email: data.Email,
      phone: data.Phone,
      source: "tilda-landing",
    }),
  });

  // Send to Telegram
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: `🔔 New lead!\nName: ${data.Name}\nEmail: ${data.Email}\nPhone: ${data.Phone}`,
    }),
  });

  return new Response("OK");
}
```

### E-Commerce (Tilda Store)

```html
<!-- Custom product page enhancements -->
<script>
  // Add to cart with custom handling
  document.addEventListener('DOMContentLoaded', () => {
    // Track add-to-cart events
    document.querySelectorAll('.js-store-buttons-buy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const productName = btn.closest('.js-product')
          ?.querySelector('.js-product-name')?.textContent;

        // Send to analytics
        if (window.dataLayer) {
          window.dataLayer.push({
            event: 'add_to_cart',
            product_name: productName,
          });
        }
      });
    });
  });
</script>
```

### SEO and Analytics Setup

```html
<!-- Add to Settings → More → HTML code in <head> -->

<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX');
</script>

<!-- Facebook Pixel -->
<script>
  !function(f,b,e,v,n,t,s){/* ... Facebook Pixel code ... */}();
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>

<!-- Custom structured data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "My Company",
  "url": "https://mycompany.com",
  "logo": "https://mycompany.com/logo.png",
  "contactPoint": { "@type": "ContactPoint", "telephone": "+1-234-567-8900" }
}
</script>
```

## Examples

### Example 1: Build a marketing landing page

**User prompt:** "Create a landing page for a SaaS product with hero, features, pricing, FAQ, and contact form — staff should be able to update text and images."

The agent will design the page with Tilda blocks, configure form webhooks, add custom CSS for brand consistency, and set up analytics tracking.

### Example 2: Custom interactive elements on Tilda

**User prompt:** "Add a pricing calculator and interactive product comparison table to our Tilda site."

The agent will create Zero Block layouts with custom HTML/JS for the calculator and comparison table, styled to match the Tilda theme.

### Example 3: Connect Tilda forms to CRM

**User prompt:** "Send every form submission to our CRM and notify the sales team on Telegram."

The agent will configure Tilda webhooks, create a serverless function to receive submissions, and forward data to CRM + Telegram.

## Guidelines

- **Blocks for structure, Zero Block for custom** — use pre-built blocks for speed, Zero Block for full control
- **Custom code in Settings** — HTML in `<head>` for CSS/meta, before `</body>` for JS
- **Forms have built-in webhooks** — send submissions to any URL
- **Tilda API is read-only** — export content, can't create pages via API
- **SEO settings per page** — title, description, OG tags in page settings
- **Custom domain** — point DNS to Tilda, SSL automatic
- **E-commerce built-in** — product catalog, cart, checkout, payments
- **Responsive by default** — blocks adapt, but test and adjust breakpoints
- **Staff can edit anything** — text, images, blocks, page order via visual editor
- **Export for self-hosting** — API returns full HTML/CSS/JS for self-deployment
- **Don't override critical Tilda classes** — prefix custom CSS with your namespace
- **Google Tag Manager** — use GTM for complex tracking setups instead of inline scripts
