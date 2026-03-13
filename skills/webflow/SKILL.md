---
name: webflow
description: >-
   You are an expert in Webflow, the visual web development platform that
  combines a design tool with a CMS and hosting. You help teams build
  responsive websites, landing pages, and content-driven sites using Webflow's
  visual builder, CMS collections, Ecommerce, form handling, and Webflow APIs
  — enabling designers to build production websites without writing code while
  giving developers API access for custom integrations and dynamic content.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Web Development
  tags:
    - no-code
    - website-builder
    - cms
    - design
    - visual-development
    - hosting
---

# Webflow — Visual Web Development Platform

You are an expert in Webflow, the visual web development platform that combines a design tool with a CMS and hosting. You help teams build responsive websites, landing pages, and content-driven sites using Webflow's visual builder, CMS collections, Ecommerce, form handling, and Webflow APIs — enabling designers to build production websites without writing code while giving developers API access for custom integrations and dynamic content.

## Core Capabilities

### CMS & Collections

```markdown
## Webflow CMS Structure

### Collections (like database tables)
- Blog Posts: title, slug, body (rich text), thumbnail, author (ref), category (ref), published date
- Team Members: name, role, bio, headshot, social links, department (option)
- Case Studies: client, industry, challenge, solution, results, testimonial
- Products: name, price, description, images (multi-image), SKU, category

### Dynamic Pages
Each collection gets an auto-generated template page:
- /blog/{slug} → Blog Post template
- /team/{slug} → Team Member template

### CMS API (read/write)
GET  /collections/{id}/items     → List items
POST /collections/{id}/items     → Create item
PUT  /items/{id}                 → Update item
DELETE /items/{id}               → Delete item
```

### Data API Integration

```typescript
// Webflow API v2 — Manage CMS content programmatically
const WEBFLOW_TOKEN = process.env.WEBFLOW_API_TOKEN;
const SITE_ID = process.env.WEBFLOW_SITE_ID;

// List all CMS items in a collection
async function getBlogPosts(collectionId: string) {
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${collectionId}/items`,
    {
      headers: { Authorization: `Bearer ${WEBFLOW_TOKEN}` },
    },
  );
  const { items } = await res.json();
  return items;
}

// Create a new CMS item (e.g., from external source)
async function createBlogPost(collectionId: string, post: {
  name: string;
  slug: string;
  body: string;
  thumbnail: string;
  published: boolean;
}) {
  const res = await fetch(
    `https://api.webflow.com/v2/collections/${collectionId}/items`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WEBFLOW_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fieldData: {
          name: post.name,
          slug: post.slug,
          "post-body": post.body,          // Field slug from Webflow
          "thumbnail-image": { url: post.thumbnail },
        },
        isArchived: false,
        isDraft: !post.published,
      }),
    },
  );
  return res.json();
}

// Publish staged items
async function publishItems(collectionId: string, itemIds: string[]) {
  await fetch(
    `https://api.webflow.com/v2/collections/${collectionId}/items/publish`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${WEBFLOW_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ itemIds }),
    },
  );
}
```

### Design System

```markdown
## Webflow Design Patterns

### Global Classes
- Create reusable classes: .container, .section, .heading-xl, .button-primary
- Use combo classes for variants: .button-primary.is-large, .section.is-dark

### Responsive Breakpoints
- Desktop (default) → Tablet (991px) → Mobile Landscape (767px) → Mobile (478px)
- Design desktop first, then adjust for smaller screens
- Hide/show elements per breakpoint with display: none

### Interactions & Animations
- Scroll-triggered animations (fade in, parallax, scale)
- Hover effects on cards, buttons, images
- Page load animations (staggered reveals)
- Lottie integration for complex animations

### Components (reusable)
- Symbols: Reusable blocks synced across pages (navbar, footer, CTA)
- Component properties: Swap text, images, styles per instance
```

## Installation

```markdown
# No installation — browser-based
# https://webflow.com

# Pricing (per site):
- Starter: Free (webflow.io subdomain, 1 page)
- Basic: $18/month (custom domain, 150 pages)
- CMS: $29/month (CMS collections, 2K items)
- Business: $49/month (10K items, form logic)
- Enterprise: Custom

# Workspace pricing (per seat): $28-60/month
```

## Best Practices

1. **Design system first** — Create global classes for typography, spacing, colors before building pages
2. **CMS for dynamic content** — Use collections for anything editors need to update (blog, team, testimonials)
3. **Combo classes for variants** — Don't duplicate classes; use .card + .is-featured for variations
4. **API for automation** — Use Webflow API to sync content from external sources (CRM, Google Sheets, headless CMS)
5. **Interactions sparingly** — Add scroll animations for engagement but don't overdo it; performance matters on mobile
6. **Responsive in order** — Design desktop → tablet → mobile; Webflow inherits styles downward
7. **Symbols for consistency** — Navbar, footer, CTAs should be symbols; change once, update everywhere
8. **Backups** — Webflow has version history, but export your site periodically as a static backup
