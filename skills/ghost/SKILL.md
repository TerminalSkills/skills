---
name: ghost
description: >-
  Ghost is an open-source Node.js publishing platform for blogs, newsletters
  and paid membership sites. Use this skill to run Ghost with Docker or
  ghost-cli, read posts and tags from the Content API for a headless Next.js
  frontend, manage members through the Admin API, or set up paid newsletters
  with Stripe. Trigger words: Ghost CMS, Ghost blog, Ghost Content API,
  headless Ghost, Ghost newsletter, Ghost members.
license: Apache-2.0
compatibility: "Node.js 22 (self-hosted via ghost-cli) or Docker with MySQL 8; Next.js 15+ for the frontend examples"
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/TryGhost/Ghost
  category: content
  tags: "cms, blog, newsletter, membership, self-hosted"
---

# Ghost — Professional Publishing Platform

## Overview

Ghost is an open-source Node.js publishing platform (currently the 6.x line) with a built-in editor, email newsletters, paid memberships through Stripe, and SEO features. It can be used as a normal themed site or as a headless CMS: editors write in Ghost, and a custom frontend such as Next.js reads content from the read-only Content API. Writes (posts, members) go through the Admin API.

## Instructions

### Content API (Headless)

```typescript
// src/lib/ghost.ts — Ghost Content API client
import GhostContentAPI from "@tryghost/content-api";

const ghost = new GhostContentAPI({
  url: process.env.GHOST_URL!,            // https://blog.northwindcoffee.com
  key: process.env.GHOST_CONTENT_API_KEY!,
  version: "v6.0",
});

// Fetch posts with pagination
export async function getPosts(page = 1, limit = 10) {
  return ghost.posts.browse({
    limit,
    page,
    include: ["tags", "authors"],
    fields: ["id", "title", "slug", "excerpt", "feature_image", "published_at", "reading_time"],
    order: "published_at DESC",
  });
}

// Single post by slug
// The client throws on 404, so return null for the page's notFound() check
export async function getPostBySlug(slug: string) {
  try {
    return await ghost.posts.read({ slug }, {
      include: ["tags", "authors"],
      formats: ["html"],                  // or "plaintext"
    });
  } catch (err: any) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
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

// Next.js 15+: params is a Promise
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
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

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPostBySlug(slug);
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

Ghost has built-in free signup, paid subscriptions through Stripe, multiple tiers, newsletter delivery, and per-post visibility (public, members-only, paid-only). Manage members from code with the Admin API, which authenticates with a short-lived JWT built from an Admin API key (`id:secret`) sent as `Authorization: Ghost <token>`; the `@tryghost/admin-api` package does the signing.

```typescript
import GhostAdminAPI from "@tryghost/admin-api";

const admin = new GhostAdminAPI({
  url: process.env.GHOST_URL!,
  key: process.env.GHOST_ADMIN_API_KEY!,   // from Settings → Integrations → Custom integration
  version: "v6.0",
});

await admin.members.add({ email: "dana.ortiz@northwindcoffee.com", name: "Dana Ortiz", newsletters: [] });
const paid = await admin.members.browse({ filter: "status:paid", limit: 50 });
```

Never expose the Admin API key to the browser; use it only on the server.

## Installation

```bash
# Local or server install with the official CLI (Node.js 22, MySQL 8 in production)
npm install ghost-cli@latest -g
ghost install local          # quick local try-out; `ghost install` on an Ubuntu server

# Docker: production mode needs MySQL, so use compose rather than a single container
docker run -d --name ghost-dev -p 2368:2368 -e NODE_ENV=development \
  -e url=http://localhost:2368 -v ghost-content:/var/lib/ghost/content ghost:6
```

For production Docker, run `ghost:6` next to a `mysql:8` container with `database__client=mysql`, `database__connection__host`, `__user`, `__password` and `__database` variables and a volume on `/var/lib/ghost/content`. Ghost(Pro) is the managed alternative.

## Examples

### Example 1: Headless blog on Next.js

**Request:** "Our editors write in Ghost at blog.northwindcoffee.com; build a Next.js site that lists the latest 10 posts and renders each by slug."

Create a Content API key under Settings → Integrations, put `GHOST_URL` and `GHOST_CONTENT_API_KEY` in `.env.local`, add `src/lib/ghost.ts` and the `app/blog/[slug]/page.tsx` shown above. `getPosts(1, 10)` returns an array with a `meta.pagination` object; the post page renders at `/blog/<slug>` and refreshes every 60 seconds.

### Example 2: Sync paying subscribers to another tool

**Request:** "List everyone on a paid plan so we can mail them a coupon."

Use the Admin API snippet above with `filter: "status:paid"`; the result is an array of member objects with `email`, `name`, `status` and `tiers`. Page through with `page` until `meta.pagination.next` is null.

## Guidelines

1. **Headless with Next.js** — Use Ghost as CMS backend + Next.js for custom frontend; editors get Ghost's editor, developers get full control
2. **Content API for reads** — Use Content API (key-based, cacheable) for all public content; Admin API only for writes
3. **Static generation** — Use `generateStaticParams` for all blog posts; revalidate with ISR for near-instant updates
4. **SEO built-in** — Ghost auto-generates meta tags, canonical URLs, structured data; override per-post in editor
5. **Newsletter as growth tool** — Enable email newsletters; every blog post can be sent as email to subscribers
6. **Webhooks for builds** — Configure webhooks in Ghost settings to trigger site rebuilds on publish
7. **Custom integrations** — Create one integration per frontend/service so keys can be revoked separately
8. **Membership tiers** — Use free tier to build email list, paid tier for premium content; Ghost handles Stripe billing

9. **Content API key is public-safe, Admin key is not** — the Content API key only reads published content and can ship to the browser; keep the Admin key server-side.
10. **Production needs MySQL** — SQLite is for development only.
