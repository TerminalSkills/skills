---
name: ghost
description: >-
  You are an expert in Ghost, the open-source publishing platform for blogs,
  newsletters, and membership sites. You help developers and creators set up
  Ghost as a headless CMS with its Content API for custom frontends, integrate
  the Members/Subscriptions system for paid newsletters, and build custom
  themes — turning Ghost into a full publishing business with built-in
  payments, email newsletters, and SEO.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Content Management
  tags:
    - cms
    - blog
    - publishing
    - newsletter
    - membership
    - self-hosted
    - open-source
---

# Ghost — Professional Publishing Platform

You are an expert in Ghost, the open-source publishing platform for blogs, newsletters, and membership sites. You help developers and creators set up Ghost as a headless CMS with its Content API for custom frontends, integrate the Members/Subscriptions system for paid newsletters, and build custom themes — turning Ghost into a full publishing business with built-in payments, email newsletters, and SEO.

## Core Capabilities

### Content API (Headless)

```typescript
// src/lib/ghost.ts — Ghost Content API client
import GhostContentAPI from "@tryghost/content-api";

const ghost = new GhostContentAPI({
  url: process.env.GHOST_URL!,            // https://your-ghost.com
  key: process.env.GHOST_CONTENT_API_KEY!,
  version: "v5.0",
});

// Fetch posts with pagination
async function getPosts(page = 1, limit = 10) {
  return ghost.posts.browse({
    limit,
    page,
    include: ["tags", "authors"],
    fields: ["id", "title", "slug", "excerpt", "feature_image", "published_at", "reading_time"],
    order: "published_at DESC",
  });
}

// Single post by slug
async function getPostBySlug(slug: string) {
  return ghost.posts.read({ slug }, {
    include: ["tags", "authors"],
    formats: ["html"],                    // or "mobiledoc" for raw
  });
}

// All tags
async function getTags() {
  return ghost.tags.browse({
    limit: "all",
    include: ["count.posts"],
    order: "count.posts DESC",
  });
}

// Posts by tag
async function getPostsByTag(tagSlug: string) {
  return ghost.posts.browse({
    filter: `tag:${tagSlug}`,
    include: ["tags", "authors"],
    limit: 20,
  });
}
```

### Next.js Integration

```tsx
// app/blog/[slug]/page.tsx — Ghost-powered blog with Next.js
import { getPostBySlug, getPosts } from "@/lib/ghost";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const posts = await getPosts(1, 100);
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  if (!post) return {};
  return {
    title: post.meta_title || post.title,
    description: post.meta_description || post.excerpt,
    openGraph: {
      title: post.og_title || post.title,
      description: post.og_description || post.excerpt,
      images: post.og_image ? [post.og_image] : post.feature_image ? [post.feature_image] : [],
    },
  };
}

export default async function BlogPost({ params }: { params: { slug: string } }) {
  const post = await getPostBySlug(params.slug);
  if (!post) notFound();

  return (
    <article className="prose lg:prose-xl mx-auto py-12 px-4">
      {post.feature_image && (
        <img src={post.feature_image} alt={post.title} className="rounded-xl" />
      )}
      <h1>{post.title}</h1>
      <div className="flex items-center gap-3 text-gray-500">
        <span>{post.primary_author?.name}</span>
        <span>·</span>
        <time>{new Date(post.published_at!).toLocaleDateString()}</time>
        <span>·</span>
        <span>{post.reading_time} min read</span>
      </div>
      <div dangerouslySetInnerHTML={{ __html: post.html! }} />
    </article>
  );
}

export const revalidate = 60;             // ISR: revalidate every 60s
```

### Members & Subscriptions

```markdown
## Ghost Membership System

Ghost has built-in:
- Free member signup (email collection)
- Paid subscriptions via Stripe
- Tiered access (Free / Monthly $5 / Annual $50)
- Email newsletter delivery to members
- Content gating (public / members-only / paid-only)

## Admin API for member management
POST /ghost/api/admin/members/ — Create member
PUT  /ghost/api/admin/members/:id/ — Update member
GET  /ghost/api/admin/members/?filter=status:paid — List paid members
```

## Installation

```bash
# Self-hosted (Docker)
docker run -d --name ghost \
  -p 2368:2368 \
  -e url=https://blog.example.com \
  -e database__client=mysql \
  -e database__connection__host=db \
  -v ghost-content:/var/lib/ghost/content \
  ghost:5

# Or Ghost(Pro) managed hosting: https://ghost.org/pricing/
# Or npm: npm install ghost-cli -g && ghost install
```

## Best Practices

1. **Headless with Next.js** — Use Ghost as CMS backend + Next.js for custom frontend; editors get Ghost's editor, developers get full control
2. **Content API for reads** — Use Content API (key-based, cacheable) for all public content; Admin API only for writes
3. **Static generation** — Use `generateStaticParams` for all blog posts; revalidate with ISR for near-instant updates
4. **SEO built-in** — Ghost auto-generates meta tags, canonical URLs, structured data; override per-post in editor
5. **Newsletter as growth tool** — Enable email newsletters; every blog post can be sent as email to subscribers
6. **Webhooks for builds** — Configure webhooks in Ghost settings to trigger site rebuilds on publish
7. **Custom integrations** — Use Ghost's integration system for API keys; separate keys for different frontends/services
8. **Membership tiers** — Use free tier to build email list, paid tier for premium content; Ghost handles Stripe billing
