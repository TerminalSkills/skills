---
title: Build a Content-Driven Website with a Headless CMS
slug: build-content-driven-website-with-headless-cms
description: Build a high-performance marketing website using Strapi as the headless CMS for content management, Next.js for the frontend with ISR, and Contentful's Image API for optimized media delivery — enabling a marketing team of 5 to publish landing pages, blog posts, and case studies without developer involvement.
skills: [strapi, contentful, ghost]
category: Content Management
tags: [headless-cms, jamstack, content, marketing, blog, isr, seo]
---

# Build a Content-Driven Website with a Headless CMS

Noor is the head of marketing at a 40-person SaaS company. The marketing team publishes 3 blog posts per week, launches 2 landing pages per month, and manages a library of 50+ case studies. Currently, every content change requires a developer to edit code, commit, and deploy — a 2-day turnaround that kills momentum.

Noor needs a system where the marketing team manages all content independently while developers control the frontend, performance, and SEO. The solution: Strapi as the self-hosted CMS (full control over data), Next.js for the frontend (SSG + ISR for speed), and a structured content model that scales.

## Step 1: Content Architecture in Strapi

The content model defines what the marketing team can create and edit. Strapi's admin panel lets editors work with structured forms instead of raw files.

```markdown
## Content Types (configured in Strapi admin)

### Blog Post (Collection)
- title: Short Text (required)
- slug: UID (auto-generated from title)
- excerpt: Long Text (max 300 chars)
- body: Rich Text (blocks: headings, images, code, embeds)
- featured_image: Media (single image)
- author: Relation → Team Member
- category: Relation → Category
- tags: Relation → Tag (many-to-many)
- seo: Component → SEO
- published_at: DateTime

### Landing Page (Collection)
- title: Short Text
- slug: UID
- hero: Component → Hero Block
- sections: Dynamic Zone [
    Feature Grid,
    Testimonial Carousel,
    CTA Banner,
    Pricing Table,
    FAQ Accordion,
    Stats Counter,
    Logo Cloud,
  ]
- seo: Component → SEO

### Case Study (Collection)
- title: Short Text
- slug: UID
- client_name: Short Text
- client_logo: Media
- industry: Enumeration [SaaS, E-commerce, Fintech, Healthcare, Education]
- challenge: Rich Text
- solution: Rich Text
- results: Component (repeatable) → Result Metric
    - metric: Short Text ("Revenue increase")
    - value: Short Text ("340%")
    - description: Short Text ("Year-over-year growth")
- testimonial_quote: Long Text
- testimonial_author: Short Text
- seo: Component → SEO

### Reusable Components
- SEO: meta_title, meta_description, og_image, canonical_url
- Hero Block: headline, subheadline, cta_text, cta_url, background_image, style (dark/light)
- Feature Grid: title, features[] → { icon, title, description }
- CTA Banner: headline, description, button_text, button_url, background_color
```

## Step 2: Next.js Frontend with ISR

```typescript
// src/lib/strapi.ts — Strapi API client
const STRAPI_URL = process.env.STRAPI_URL || "http://localhost:1337";
const STRAPI_TOKEN = process.env.STRAPI_API_TOKEN;

async function fetchStrapi<T>(
  path: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`/api${path}`, STRAPI_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${STRAPI_TOKEN}` },
    next: { revalidate: 60 },             // Revalidate every 60 seconds
  });

  if (!res.ok) throw new Error(`Strapi ${res.status}: ${path}`);
  return res.json();
}

export async function getBlogPosts(page = 1, pageSize = 12) {
  return fetchStrapi<StrapiResponse<BlogPost[]>>("/blog-posts", {
    "populate[featured_image]": "*",
    "populate[author]": "*",
    "populate[category]": "*",
    "populate[seo]": "*",
    "sort": "publishedAt:desc",
    "pagination[page]": String(page),
    "pagination[pageSize]": String(pageSize),
  });
}

export async function getLandingPage(slug: string) {
  const res = await fetchStrapi<StrapiResponse<LandingPage[]>>("/landing-pages", {
    "filters[slug][$eq]": slug,
    "populate[hero]": "*",
    "populate[sections]": "*",
    "populate[seo]": "*",
  });
  return res.data[0] || null;
}
```

```tsx
// app/blog/[slug]/page.tsx — Blog post page with SEO
import { getBlogPostBySlug, getBlogPosts } from "@/lib/strapi";
import { RichTextRenderer } from "@/components/RichTextRenderer";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

export async function generateStaticParams() {
  const { data } = await getBlogPosts(1, 100);
  return data.map((post) => ({ slug: post.attributes.slug }));
}

export async function generateMetadata({ params }): Promise<Metadata> {
  const post = await getBlogPostBySlug(params.slug);
  if (!post) return {};

  const seo = post.attributes.seo;
  return {
    title: seo?.meta_title || post.attributes.title,
    description: seo?.meta_description || post.attributes.excerpt,
    openGraph: {
      title: seo?.meta_title || post.attributes.title,
      description: seo?.meta_description || post.attributes.excerpt,
      images: seo?.og_image?.data
        ? [{ url: seo.og_image.data.attributes.url }]
        : post.attributes.featured_image?.data
          ? [{ url: post.attributes.featured_image.data.attributes.url }]
          : [],
    },
  };
}

export default async function BlogPostPage({ params }) {
  const post = await getBlogPostBySlug(params.slug);
  if (!post) notFound();

  const { title, body, featured_image, author, publishedAt } = post.attributes;

  return (
    <article className="max-w-3xl mx-auto py-16 px-4">
      {featured_image?.data && (
        <img
          src={featured_image.data.attributes.url}
          alt={title}
          className="w-full rounded-2xl mb-8"
        />
      )}
      <h1 className="text-4xl font-bold mb-4">{title}</h1>
      <div className="flex items-center gap-3 text-gray-500 mb-8">
        <span>{author?.data?.attributes?.name}</span>
        <span>·</span>
        <time>{new Date(publishedAt).toLocaleDateString("en-US", {
          year: "numeric", month: "long", day: "numeric"
        })}</time>
      </div>
      <div className="prose prose-lg max-w-none">
        <RichTextRenderer content={body} />
      </div>
    </article>
  );
}

export const revalidate = 60;
```

## Step 3: Webhook-Triggered Rebuilds

```typescript
// app/api/revalidate/route.ts — Strapi webhook handler
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secret = request.headers.get("x-webhook-secret");
  if (secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { model, entry } = body;

  // Revalidate based on content type
  switch (model) {
    case "blog-post":
      revalidatePath(`/blog/${entry.slug}`);
      revalidatePath("/blog");
      break;
    case "landing-page":
      revalidatePath(`/${entry.slug}`);
      break;
    case "case-study":
      revalidatePath(`/case-studies/${entry.slug}`);
      revalidatePath("/case-studies");
      break;
    default:
      revalidatePath("/");                // Catch-all
  }

  return NextResponse.json({ revalidated: true, model, slug: entry.slug });
}
```

## Results

The marketing team publishes content independently within 2 weeks of setup. Developer involvement drops from 15 hours/week to 2 hours/week (bug fixes and new section types only).

- **Content publishing**: 2 days → 5 minutes (editor to live)
- **Page speed**: 98 Lighthouse score (SSG + ISR + optimized images)
- **Content output**: 3 posts/week → 5 posts/week (no developer bottleneck)
- **Landing page creation**: 1 week → 2 hours (drag-and-drop sections in Strapi)
- **SEO**: Proper meta tags, structured data, and sitemap generated automatically
- **Infrastructure cost**: Strapi on $5/mo DigitalOcean droplet + Vercel free tier
