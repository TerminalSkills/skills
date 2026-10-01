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
  version: "1.1.0"
  category: development
  tags: ["tilda", "website-builder", "no-code", "landing-page", "ecommerce"]
---

# Tilda Publishing

## Overview

Tilda is a block-based website builder — drag blocks onto a page, customize them visually, and publish. No backend to manage, no hosting to configure. For developers: inject custom HTML/CSS/JS into any block, use the read-only Tilda API to sync published pages to your own server, connect forms to any backend, and build custom integrations. Perfect for marketing sites, landing pages, and small e-commerce stores where non-technical staff need to update content independently.

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

Code for `<head>` (CSS, meta tags) goes into Site Settings → More → HTML code for the
head section (all pages) or Page Settings → Additional → HTML code for the head section
(one page). Code for the page body goes into a T123 "Embed HTML Code" block (Block
Library → Other) or an HTML element inside a Zero Block. The editor and the preview show
embedded code as text; it runs only on the published page.

```html
<!-- Head section: override Tilda styles; nw-reveal is your own class on your own markup -->
<style>
  .t-title { font-family: 'Inter', sans-serif !important; }
  .nw-reveal { opacity: 0; transform: translateY(20px); transition: all 0.6s ease; }
  .nw-reveal.is-visible { opacity: 1; transform: translateY(0); }
  @media (max-width: 640px) { .t-cover__wrapper { min-height: 60vh !important; } }
</style>

<!-- T123 block: reveal .nw-reveal elements as they scroll into view -->
<script>
  document.addEventListener('DOMContentLoaded', () => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add('is-visible');
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.nw-reveal').forEach((el) => observer.observe(el));
  });
</script>
```

### Zero Block (Custom Design)

Zero Block gives you full Artboard-like control — place elements precisely with custom positioning, animations, and responsive breakpoints.

```html
<!-- Paste into an HTML element of a Zero Block (or a T123 block) -->
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

The API is available on the Business plan only; the keys are in Site Settings → Export →
API Integration. Every request is a GET with both keys in the query string, so call it
from a server, never from browser code.

```typescript
// api/tilda.ts — read projects and pages from the Tilda API
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

// Project settings: the export paths set in Site Settings → Export (export_imgpath,
// export_jspath, export_csspath) and the images shared by all pages
async function getProjectInfo(projectId: number) {
  const res = await fetch(
    `${BASE_URL}/getprojectinfo/?publickey=${TILDA_PUBLIC_KEY}&secretkey=${TILDA_SECRET_KEY}&projectid=${projectId}`
  );
  return (await res.json()).result;
}

// Export a page to your own hosting. getpagefullexport returns the complete HTML document
// with links rewritten to the export paths, plus the files to copy as { from, to } pairs.
// (getpagefull returns the same document with Tilda-hosted asset URLs; getpage and
// getpageexport return only the body HTML, for pasting into your own template.)
async function exportPage(pageId: number, project: any, outDir: string) {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const res = await fetch(
    `${BASE_URL}/getpagefullexport/?publickey=${TILDA_PUBLIC_KEY}&secretkey=${TILDA_SECRET_KEY}&pageid=${pageId}`
  );
  const page = (await res.json()).result;   // { id, title, filename: "page1001.html", html, images, ... }
  await writeFile(`${outDir}/${page.filename}`, page.html);
  const groups = [[page.images, project.export_imgpath], [page.js, project.export_jspath], [page.css, project.export_csspath]];
  for (const [files, dir] of groups) {
    await mkdir(`${outDir}/${dir}`, { recursive: true });
    for (const file of files ?? []) {
      const body = Buffer.from(await (await fetch(file.from)).arrayBuffer());
      await writeFile(`${outDir}/${dir}/${file.to}`, body);
    }
  }
}
```

Copy `project.images` the same way; `getprojectinfo` with `&webconfig=htaccess` (or `nginx`) also returns the server rules. To be told when a page is republished, set a webhook URL in the same API Integration panel: Tilda sends a GET with `pageid`, `projectid`, `published` and `publickey`, expects the body `ok` within 5 seconds, and retries twice.

### Form Handling and Webhooks

```typescript
// webhook/tilda-form.ts — Receive Tilda form submissions
/**
 * Configure in Tilda: Site Settings → Forms → Webhook (the script URL must be HTTPS),
 * then tick WEBHOOK in the Content panel of each form block and republish the page.
 * Tilda sends a form-encoded POST on every submission and waits 5 seconds for the
 * response; after a timeout it retries twice, a minute apart, so keep the handler fast.
 */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

export async function handleTildaForm(req: Request) {
  const data = Object.fromEntries(await req.formData());
  // data: { Name: "Kai Chen", Email: "kai@riverside.io", Phone: "+14155550142",
  //         tranid: "467251:8442970", formid: "form48844953" }  — keys are the fields' variable names

  // Save to CRM
  await fetch("https://api.riverside.io/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: data.Name, email: data.Email, phone: data.Phone, source: "tilda-landing",
    }),
  });

  // Notify the sales team on Telegram
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: `New lead\nName: ${data.Name}\nEmail: ${data.Email}\nPhone: ${data.Phone}`,
    }),
  });

  return new Response("OK");
}
```

### E-Commerce (Tilda Store)

- Store blocks are in the "Store" category of the Block Library; products live in the Product Catalog.
- The cart is block ST100 "Shopping cart with an order form". On a multi-page site put it in the header or footer so it exists on every page; its icon appears only after a product is added.
- Payment and delivery services can only be tested on the published page, not in the preview.
- Orders reach your backend through the same form webhook; in the Webhook settings enable "transfer product data as arrays" (and `externalid`) to receive the ordered products in a structured form.
- Sales, orders and conversion are in Site Settings → Analytics → Website statistics → "Online Store".
- The Product Catalog is not included in a code export; it keeps working only with an active subscription.

### SEO and Analytics Setup

Page title, description and social preview are set per page in Page Settings (General, SEO
and Social media tabs). Google Analytics and Google Tag Manager need no code: enter the
Google tag ID (GA4) or the GTM container ID in Site Settings → Analytics (for GA4 also
tick "Enable gtag.js" in the counter's settings) and publish all pages. Tilda then reports
form submissions as virtual page views such as `/tilda/form31751802/submitted`, and button
clicks and pop-ups when that is switched on in the block's settings. Use one route only —
the built-in counter, GTM, or a pasted snippet — or visits are counted twice. Any other
tag, or the snippet below with your own Measurement ID, goes into Site Settings → More →
HTML code for the head section.

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-7PK2D9QLMS"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){ dataLayer.push(arguments); }
  gtag('js', new Date());
  gtag('config', 'G-7PK2D9QLMS');
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
- **Custom code** — head code (CSS/meta) in Site Settings → More; body HTML/JS in a T123 block or a Zero Block HTML element
- **Forms have built-in webhooks** — send submissions to any HTTPS URL that answers within 5 seconds
- **Tilda API is read-only** — it lists and exports projects/pages; it can't create or edit pages. Business plan only, 150 requests/hour; sync pages to your server instead of calling the API on every visit
- **SEO settings per page** — title, description, OG tags in page settings
- **Custom domain** — point DNS to Tilda, then switch on the free Let's Encrypt certificate in Site Settings → SEO → HTTPS settings
- **E-commerce built-in** — product catalog, cart, checkout, payments
- **Responsive by default** — blocks adapt, but test and adjust breakpoints
- **Staff can edit anything** — text, images, blocks, page order via visual editor
- **Export for self-hosting** — Business plan only (zip in Site Settings → Export, or the API); the exported site needs its own SSL certificate, must keep the "Made on Tilda" label, and forms and the catalog still need an active subscription
- **Don't override critical Tilda classes** — prefix custom CSS with your namespace
- **Google Tag Manager** — use GTM for complex tracking setups instead of inline scripts
