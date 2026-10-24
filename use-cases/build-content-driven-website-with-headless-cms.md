---
title: Build a Content-Driven Website with a Headless CMS
slug: build-content-driven-website-with-headless-cms
description: Build a fast marketing website using Strapi 5 as the headless CMS and Next.js with static generation and on-demand revalidation, so a marketing team can publish landing pages, blog posts and case studies without developer involvement.
skills: [strapi, contentful]
category: content
tags: [headless-cms, jamstack, content, marketing, blog, isr, seo]
---

# Build a Content-Driven Website with a Headless CMS

Noor is the head of marketing at a 40-person SaaS company. The marketing team publishes three blog posts a week, launches two landing pages a month and manages a library of 50+ case studies. Every content change currently requires a developer to edit code, commit and deploy, a two-day turnaround that kills momentum.

Noor needs a system where marketing manages all content independently while developers keep control of the frontend, performance and SEO. The solution: Strapi 5 as a self-hosted CMS (full control over the data), Next.js for the frontend (static pages that refresh when content is published), and a structured content model that scales.

## Step 1: Create the Strapi project and content model

Strapi 5 needs an LTS Node.js release (22, 24 or 26 at the time of writing).

```bash
npx create-strapi@latest cms
cd cms
HOST=127.0.0.1 npm run develop      # admin panel at http://127.0.0.1:1337/admin
```

Strapi listens on all interfaces by default; set `HOST=127.0.0.1` in `.env` for local work and put a reverse proxy with TLS in front of it in production. The first visit to `/admin` asks you to create the admin account.

Build the content model in the Content-Type Builder (in development mode it writes the schema files into `src/`, which you commit):

```text
Blog Post (collection, Draft & Publish on)
  title: Text (required)            slug: UID (attached to title)
  excerpt: Long text (max 300)      body: Rich text (Blocks)
  featured_image: Media (single)    author: Relation -> Team Member
  category: Relation -> Category    seo: Component -> SEO

Landing Page (collection)
  title, slug, hero: Component -> Hero Block, seo
  sections: Dynamic zone [Feature Grid, CTA Banner, FAQ, Logo Cloud]

Case Study (collection)
  title, slug, client_name, client_logo: Media
  industry: Enumeration, challenge / solution: Rich text (Blocks)
  results: Repeatable component { metric, value, description }, seo

Components
  SEO: meta_title, meta_description, og_image (Media), canonical_url
```

Then create a read-only API token in Settings -> API Tokens and keep it in the frontend's environment as `STRAPI_API_TOKEN`. Content types are private by default, so the token is what lets the frontend read them.

## Step 2: Fetch content from Next.js

In Strapi 5 the REST response is flat: fields sit directly on each item, documents are identified by `documentId`, and there is no `attributes` wrapper. Relations, media and components are only included when you ask for them with `populate`. Lists accept `sort`, `filters[field][$eq]`, `pagination[page]` and `pagination[pageSize]`.

```typescript
// lib/strapi.ts
const STRAPI_URL = process.env.STRAPI_URL ?? "http://127.0.0.1:1337";
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN;

export interface StrapiList<T> {
  data: T[];
  meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } };
}
export interface Media { url: string; alternativeText: string | null; width: number; height: number }
export interface Seo { meta_title?: string; meta_description?: string; og_image?: Media | null }
export interface BlogPost {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  excerpt: string;
  body: import("@strapi/blocks-react-renderer").BlocksContent;
  publishedAt: string;
  featured_image: Media | null;
  author: { name: string } | null;
  seo: Seo | null;
}

async function fetchStrapi<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`/api${path}`, STRAPI_URL);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
    next: { revalidate: 3600 }, // safety net; the webhook in Step 3 refreshes sooner
  });
  if (!res.ok) throw new Error(`Strapi ${res.status}: ${path}`);
  return res.json() as Promise<T>;
}

// Uploads served by Strapi's local provider come back as relative URLs
export const mediaUrl = (url: string) => (url.startsWith("http") ? url : new URL(url, STRAPI_URL).toString());

const blogPopulate = {
  "populate[0]": "featured_image",
  "populate[1]": "author",
  "populate[2]": "seo",
  "populate[3]": "seo.og_image",
};

export function getBlogPosts(page = 1, pageSize = 12) {
  return fetchStrapi<StrapiList<BlogPost>>("/blog-posts", {
    ...blogPopulate,
    sort: "publishedAt:desc",
    "pagination[page]": String(page),
    "pagination[pageSize]": String(pageSize),
  });
}

export async function getBlogPostBySlug(slug: string) {
  const res = await fetchStrapi<StrapiList<BlogPost>>("/blog-posts", {
    ...blogPopulate,
    "filters[slug][$eq]": slug,
  });
  return res.data[0] ?? null;
}
```

For landing pages, a dynamic zone is only populated with scalar fields unless you ask per component, with `populate[sections][on][<category>.<component>][populate]=*`. `populate=*` goes one level deep only, so list the nested paths you need.

The blog page renders the Blocks rich-text field with `@strapi/blocks-react-renderer` (`npm install @strapi/blocks-react-renderer`). Route `params` are a Promise in current Next.js versions.

```tsx
// app/blog/[slug]/page.tsx
import { BlocksRenderer } from "@strapi/blocks-react-renderer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getBlogPostBySlug, getBlogPosts, mediaUrl } from "@/lib/strapi";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const { data } = await getBlogPosts(1, 100);
  return data.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) return {};

  const title = post.seo?.meta_title || post.title;
  const description = post.seo?.meta_description || post.excerpt;
  const image = post.seo?.og_image ?? post.featured_image;
  return {
    title,
    description,
    openGraph: { title, description, images: image ? [{ url: mediaUrl(image.url) }] : [] },
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);
  if (!post) notFound();

  return (
    <article className="mx-auto max-w-3xl px-4 py-16">
      {post.featured_image && (
        <img
          src={mediaUrl(post.featured_image.url)}
          alt={post.featured_image.alternativeText ?? post.title}
          width={post.featured_image.width}
          height={post.featured_image.height}
          className="mb-8 w-full rounded-2xl"
        />
      )}
      <h1 className="mb-4 text-4xl font-bold">{post.title}</h1>
      <p className="mb-8 text-gray-500">
        {post.author?.name} ·{" "}
        <time dateTime={post.publishedAt}>
          {new Date(post.publishedAt).toLocaleDateString("en-US", { dateStyle: "long" })}
        </time>
      </p>
      <BlocksRenderer content={post.body} />
    </article>
  );
}
```

## Step 3: Publish in Strapi, refresh the page

A Strapi webhook fires on publish and calls a Next.js route handler that revalidates just the affected pages. Without it, pages would show new content only after the revalidation window in `fetchStrapi`.

```typescript
// app/api/revalidate/route.ts
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

function authorized(header: string | null) {
  const expected = `Bearer ${process.env.REVALIDATION_SECRET ?? ""}`;
  if (!header || !process.env.REVALIDATION_SECRET) return false;
  const a = Buffer.from(header), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { model, entry } = (await request.json()) as { model: string; entry: { slug?: string } };

  switch (model) {
    case "blog-post":
      if (entry.slug) revalidatePath(`/blog/${entry.slug}`);
      revalidatePath("/blog");
      break;
    case "landing-page":
      if (entry.slug) revalidatePath(`/${entry.slug}`);
      break;
    case "case-study":
      if (entry.slug) revalidatePath(`/case-studies/${entry.slug}`);
      revalidatePath("/case-studies");
      break;
    default:
      revalidatePath("/", "layout");
  }
  return NextResponse.json({ revalidated: true, model });
}
```

In Strapi, open Settings -> Webhooks, add `https://www.example.com/api/revalidate`, add the header `Authorization: Bearer <REVALIDATION_SECRET>`, and tick **Entry publish**, **Entry unpublish** and **Entry update** for your content types. The payload has `event`, `model` (the content type's singular name, such as `blog-post`), `uid` and `entry`, and Strapi sends an `X-Strapi-Event` header with each delivery. Test it by publishing a draft and checking that the page changes within seconds.

## Using Contentful instead

If you prefer a hosted CMS, Contentful replaces Strapi in Steps 1 and 2; the `revalidatePath` route in Step 3 stays, and you point a Contentful webhook (Settings -> Webhooks) at it with the same `Authorization` header. Install the Delivery SDK (`npm install contentful`) and keep `CONTENTFUL_SPACE_ID` and `CONTENTFUL_DELIVERY_TOKEN` (a Content Delivery API key from Settings -> API keys) in the environment. The SDK calls `cdn.contentful.com` by default; use a Preview API token with `host: "preview.contentful.com"` only for drafts.

```typescript
// lib/contentful.ts
import { createClient } from "contentful";

const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID!,
  accessToken: process.env.CONTENTFUL_DELIVERY_TOKEN!,
});

export async function getPostBySlug(slug: string) {
  const res = await client.getEntries({ content_type: "blogPost", "fields.slug": slug, limit: 1 });
  const post = res.items[0];
  return post ? { title: post.fields.title as string, excerpt: post.fields.excerpt as string } : null;
}
```

`content_type` is the content type ID from your Contentful model (`blogPost` here), and filtering on a field needs `fields.<fieldId>`.

## Result

After setup, the marketing team creates, previews and publishes posts, case studies and landing pages from the Strapi admin without a developer. Developers only get involved to add a new section type (a new component in Strapi and a matching React component). Measure the real numbers for your own team: time from edit to live page, developer hours per week and posts per week before and after.

## Related Skills

- [strapi](../skills/strapi/SKILL.md) -- content modeling, REST and GraphQL APIs, roles and permissions, the media library
- [contentful](../skills/contentful/SKILL.md) -- hosted alternative: Content Delivery and Preview APIs, rich text, webhooks
