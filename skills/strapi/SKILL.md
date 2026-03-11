---
name: strapi
category: Content Management
tags: [headless-cms, api, content, self-hosted, open-source, rest, graphql]
version: 1.0.0
author: terminal-skills
---

# Strapi — Open-Source Headless CMS

You are an expert in Strapi, the leading open-source headless CMS built with Node.js. You help teams build content APIs using Strapi's admin panel for content modeling, role-based access control, media library, and plugin system — with auto-generated REST and GraphQL APIs that power websites, mobile apps, and any frontend through a clean content management interface that non-technical editors can use.

## Core Capabilities

### Project Setup

```bash
# Create new Strapi project
npx create-strapi@latest my-cms
cd my-cms
npm run develop                           # Starts admin at localhost:1337
```

### Content Types

```markdown
## Content Type Builder (Admin Panel)

Strapi generates API endpoints automatically from content types:

### Collection Types (many entries)
- Articles: title (text), slug (uid), content (rich text), cover (media), author (relation), tags (enumeration[])
- Products: name, price (decimal), description, images (media[]), category (relation)
- Team Members: name, role, bio, photo, social links (json)

### Single Types (one entry)
- Homepage: hero_title, hero_subtitle, featured_articles (relation[])
- Site Settings: site_name, logo, footer_text, social_links

### Components (reusable blocks)
- SEO: meta_title, meta_description, og_image
- Hero: title, subtitle, cta_text, cta_url, background
- Feature Card: icon, title, description

### Auto-generated API:
GET    /api/articles           → List all articles
GET    /api/articles/:id       → Get single article
POST   /api/articles           → Create article
PUT    /api/articles/:id       → Update article
DELETE /api/articles/:id       → Delete article
GET    /api/articles?filters[slug][$eq]=my-post → Filter by field
```

### API Usage

```typescript
// Frontend: Fetch content from Strapi
const STRAPI_URL = process.env.NEXT_PUBLIC_STRAPI_URL || "http://localhost:1337";

// List articles with pagination, filtering, and population
async function getArticles(page = 1, pageSize = 10) {
  const params = new URLSearchParams({
    "populate[cover]": "*",               // Include cover image
    "populate[author]": "*",              // Include author relation
    "filters[publishedAt][$notNull]": "true",  // Only published
    "sort": "publishedAt:desc",
    "pagination[page]": String(page),
    "pagination[pageSize]": String(pageSize),
  });

  const res = await fetch(`${STRAPI_URL}/api/articles?${params}`, {
    headers: { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` },
    next: { revalidate: 60 },             // ISR: revalidate every 60s
  });

  const { data, meta } = await res.json();
  return {
    articles: data.map((item: any) => ({
      id: item.id,
      ...item.attributes,
      cover: item.attributes.cover?.data?.attributes?.url,
      author: item.attributes.author?.data?.attributes?.name,
    })),
    pagination: meta.pagination,
  };
}

// Get single article by slug
async function getArticleBySlug(slug: string) {
  const res = await fetch(
    `${STRAPI_URL}/api/articles?filters[slug][$eq]=${slug}&populate=*`,
    { headers: { Authorization: `Bearer ${process.env.STRAPI_API_TOKEN}` } },
  );
  const { data } = await res.json();
  return data[0] ? { id: data[0].id, ...data[0].attributes } : null;
}
```

### Custom Controllers and Policies

```javascript
// src/api/article/controllers/article.js — Custom logic
const { createCoreController } = require("@strapi/strapi").factories;

module.exports = createCoreController("api::article.article", ({ strapi }) => ({
  // Override find to add view count
  async find(ctx) {
    const { data, meta } = await super.find(ctx);
    return { data, meta };
  },

  // Custom endpoint: /api/articles/:id/increment-views
  async incrementViews(ctx) {
    const { id } = ctx.params;
    const article = await strapi.entityService.findOne("api::article.article", id);
    await strapi.entityService.update("api::article.article", id, {
      data: { views: (article.views || 0) + 1 },
    });
    return { views: (article.views || 0) + 1 };
  },
}));
```

## Installation

```bash
npx create-strapi@latest my-cms
# Database: SQLite (default), PostgreSQL, MySQL, MariaDB
# Strapi Cloud or self-host on any Node.js server
```

## Best Practices

1. **API tokens over user credentials** — Create read-only API tokens for frontend; never expose admin credentials
2. **Populate selectively** — Use `populate` parameter to include only needed relations; avoid `populate=*` in production
3. **Webhooks for revalidation** — Configure Strapi webhooks to trigger Next.js ISR revalidation on content change
4. **Components for reuse** — Create shared components (SEO, Hero, CTA) and reuse across content types
5. **Draft/Publish workflow** — Enable draft system; editors work on drafts, publish when ready; API only returns published by default
6. **Media library** — Use Strapi's media library with cloud providers (AWS S3, Cloudinary) for production image hosting
7. **RBAC** — Set up roles (Author, Editor, Admin) with granular permissions; authors can only edit their own content
8. **Lifecycle hooks** — Use `beforeCreate`, `afterUpdate` hooks for custom logic (auto-generate slugs, send notifications)
