---
title: Build a CMS-Powered Marketing Site
slug: build-cms-powered-marketing-site
description: Build a marketing website with Sanity CMS for content management, Next.js for rendering, and visual editing that lets the marketing team update pages without touching code — launching new landing pages in minutes instead of developer sprints.
skills:
  - sanity
  - nextjs
  - vite
category: content
tags:
  - cms
  - marketing
  - seo
  - content
  - headless
---

# Build a CMS-Powered Marketing Site

Omar leads marketing at a 50-person B2B SaaS company. Every landing page change requires a developer: updating copy, swapping hero images, adding testimonial sections. The marketing team submits a Jira ticket, waits 3-5 days for a developer to make the change, and then the A/B test window has already closed. He wants the marketing team to build and modify pages themselves — drag-and-drop sections, live preview, publish instantly — while developers maintain the component library and site architecture.

## Step 1 — Design the Content Schema

The schema separates reusable content blocks (hero, features, testimonials, CTA) from page documents. Editors compose pages by selecting and ordering blocks — no predefined page layouts.

```typescript
// sanity/schemas/blocks/hero.ts — Hero section block type.
// Each block is a self-contained content unit with all the fields
// needed to render it. Editors pick blocks when building pages.

import { defineType, defineField } from "sanity";

export const hero = defineType({
  name: "hero",
  title: "Hero Section",
  type: "object",
  fields: [
    defineField({
      name: "headline",
      title: "Headline",
      type: "string",
      validation: (Rule) => Rule.required().max(80),
      description: "Primary headline. Keep under 80 characters for mobile.",
    }),
    defineField({
      name: "subheadline",
      title: "Subheadline",
      type: "text",
      rows: 2,
      validation: (Rule) => Rule.max(200),
    }),
    defineField({
      name: "image",
      title: "Hero Image",
      type: "image",
      options: {
        hotspot: true,  // Let editors set the focal point for responsive cropping
      },
      fields: [
        defineField({
          name: "alt",
          title: "Alt Text",
          type: "string",
          validation: (Rule) => Rule.required(),
          description: "Describe the image for screen readers and SEO.",
        }),
      ],
    }),
    defineField({
      name: "cta",
      title: "Primary CTA",
      type: "object",
      fields: [
        defineField({ name: "label", title: "Button Label", type: "string", validation: (Rule) => Rule.required() }),
        defineField({ name: "url", title: "URL", type: "url" }),
        defineField({
          name: "style",
          title: "Style",
          type: "string",
          options: { list: ["primary", "secondary", "outline"] },
          initialValue: "primary",
        }),
      ],
    }),
    defineField({
      name: "secondaryCta",
      title: "Secondary CTA (optional)",
      type: "object",
      fields: [
        defineField({ name: "label", title: "Button Label", type: "string" }),
        defineField({ name: "url", title: "URL", type: "url" }),
      ],
    }),
    defineField({
      name: "layout",
      title: "Layout",
      type: "string",
      options: {
        list: [
          { title: "Image Right", value: "image-right" },
          { title: "Image Left", value: "image-left" },
          { title: "Image Background", value: "image-bg" },
          { title: "Text Only (centered)", value: "text-center" },
        ],
      },
      initialValue: "image-right",
    }),
  ],
  preview: {
    select: { title: "headline", subtitle: "subheadline", media: "image" },
  },
});
```

```typescript
// sanity/schemas/documents/page.ts — Page document with block builder.
// The `sections` field is an array of block types. Editors compose pages
// by adding, removing, and reordering sections.

import { defineType, defineField } from "sanity";

export const page = defineType({
  name: "page",
  title: "Page",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Page Title",
      type: "string",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "URL Slug",
      type: "slug",
      options: { source: "title", maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "sections",
      title: "Page Sections",
      type: "array",
      of: [
        { type: "hero" },
        { type: "featureGrid" },
        { type: "testimonials" },
        { type: "pricingTable" },
        { type: "ctaBanner" },
        { type: "faqAccordion" },
        { type: "logoCloud" },
        { type: "statsBar" },
        { type: "richTextBlock" },
      ],
      description: "Build the page by adding and ordering sections.",
    }),
    defineField({
      name: "seo",
      title: "SEO",
      type: "object",
      fields: [
        defineField({ name: "metaTitle", title: "Meta Title", type: "string", validation: (Rule) => Rule.max(60) }),
        defineField({ name: "metaDescription", title: "Meta Description", type: "text", rows: 2, validation: (Rule) => Rule.max(160) }),
        defineField({ name: "ogImage", title: "Social Share Image", type: "image" }),
        defineField({ name: "noIndex", title: "Hide from Search Engines", type: "boolean", initialValue: false }),
      ],
    }),
  ],
  preview: {
    select: { title: "title", slug: "slug.current" },
    prepare({ title, slug }) {
      return { title, subtitle: `/${slug}` };
    },
  },
});
```

## Step 2 — Render Pages with Next.js

```typescript
// src/app/(marketing)/[slug]/page.tsx — Dynamic page renderer.
// Fetches the page document from Sanity, renders each section
// with the matching React component. New block types automatically
// work once a developer adds the component — editors can use them immediately.

import { client } from "@/lib/sanity/client";
import { notFound } from "next/navigation";
import { SectionRenderer } from "@/components/sections/renderer";
import type { Metadata } from "next";

const PAGE_QUERY = `*[_type == "page" && slug.current == $slug][0]{
  title,
  slug,
  sections[]{
    _type,
    _key,
    ...,
    // Dereference any references within sections
    "image": image{..., asset->},
    "testimonials": testimonials[]->{name, role, company, quote, avatar{asset->}},
    "logos": logos[]{..., asset->}
  },
  seo
}`;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await client.fetch(PAGE_QUERY, { slug });

  if (!page) return {};

  return {
    title: page.seo?.metaTitle || page.title,
    description: page.seo?.metaDescription,
    openGraph: {
      title: page.seo?.metaTitle || page.title,
      description: page.seo?.metaDescription,
      images: page.seo?.ogImage ? [{ url: urlFor(page.seo.ogImage).width(1200).height(630).url() }] : [],
    },
    robots: page.seo?.noIndex ? { index: false } : undefined,
  };
}

export async function generateStaticParams() {
  const slugs = await client.fetch<{ slug: string }[]>(
    `*[_type == "page" && defined(slug.current)]{ "slug": slug.current }`
  );
  return slugs.map(({ slug }) => ({ slug }));
}

export default async function MarketingPage({ params }: Props) {
  const { slug } = await params;
  const page = await client.fetch(PAGE_QUERY, { slug });

  if (!page) notFound();

  return (
    <main>
      {page.sections?.map((section: any) => (
        <SectionRenderer key={section._key} section={section} />
      ))}
    </main>
  );
}
```

```tsx
// src/components/sections/renderer.tsx — Section component router.
// Maps Sanity block _type to React components.

import { HeroSection } from "./hero-section";
import { FeatureGrid } from "./feature-grid";
import { Testimonials } from "./testimonials";
import { CtaBanner } from "./cta-banner";
import { FaqAccordion } from "./faq-accordion";
import { PricingTable } from "./pricing-table";
import { LogoCloud } from "./logo-cloud";
import { StatsBar } from "./stats-bar";
import { RichTextBlock } from "./rich-text-block";

const components: Record<string, React.ComponentType<any>> = {
  hero: HeroSection,
  featureGrid: FeatureGrid,
  testimonials: Testimonials,
  ctaBanner: CtaBanner,
  faqAccordion: FaqAccordion,
  pricingTable: PricingTable,
  logoCloud: LogoCloud,
  statsBar: StatsBar,
  richTextBlock: RichTextBlock,
};

export function SectionRenderer({ section }: { section: any }) {
  const Component = components[section._type];

  if (!Component) {
    console.warn(`Unknown section type: ${section._type}`);
    return null;
  }

  return <Component {...section} />;
}
```

```tsx
// src/components/sections/hero-section.tsx — Hero component.
// Renders the hero block type with responsive image and layout variants.

import Image from "next/image";
import { urlFor } from "@/lib/sanity/image";
import { cn } from "@/lib/utils";

interface HeroProps {
  headline: string;
  subheadline?: string;
  image?: any;
  cta?: { label: string; url: string; style: string };
  secondaryCta?: { label: string; url: string };
  layout: "image-right" | "image-left" | "image-bg" | "text-center";
}

export function HeroSection({ headline, subheadline, image, cta, secondaryCta, layout }: HeroProps) {
  const isImageLayout = layout === "image-right" || layout === "image-left";

  return (
    <section className={cn(
      "relative py-20 lg:py-28",
      layout === "image-bg" && "text-white"
    )}>
      {layout === "image-bg" && image && (
        <Image
          src={urlFor(image).width(1920).height(1080).url()}
          alt={image.alt || ""}
          fill
          className="object-cover brightness-50"
          priority
        />
      )}

      <div className={cn(
        "relative mx-auto max-w-7xl px-6",
        isImageLayout && "lg:grid lg:grid-cols-2 lg:gap-16 lg:items-center",
        layout === "image-left" && "lg:grid-flow-col-dense",
        layout === "text-center" && "text-center max-w-3xl"
      )}>
        <div className={layout === "image-left" ? "lg:col-start-2" : ""}>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl">
            {headline}
          </h1>
          {subheadline && (
            <p className="mt-6 text-lg text-gray-600 dark:text-gray-300">{subheadline}</p>
          )}
          <div className={cn("mt-8 flex gap-4", layout === "text-center" && "justify-center")}>
            {cta && (
              <a
                href={cta.url}
                className={cn(
                  "rounded-lg px-6 py-3 font-medium transition-colors",
                  cta.style === "primary" && "bg-blue-600 text-white hover:bg-blue-700",
                  cta.style === "secondary" && "bg-gray-100 text-gray-900 hover:bg-gray-200",
                  cta.style === "outline" && "border-2 border-blue-600 text-blue-600 hover:bg-blue-50"
                )}
              >
                {cta.label}
              </a>
            )}
            {secondaryCta && (
              <a href={secondaryCta.url} className="rounded-lg px-6 py-3 font-medium text-gray-600 hover:text-gray-900">
                {secondaryCta.label} →
              </a>
            )}
          </div>
        </div>

        {isImageLayout && image && (
          <div className={layout === "image-left" ? "lg:col-start-1" : ""}>
            <Image
              src={urlFor(image).width(800).height(600).url()}
              alt={image.alt || ""}
              width={800}
              height={600}
              className="rounded-xl shadow-lg"
              priority
            />
          </div>
        )}
      </div>
    </section>
  );
}
```

## Step 3 — Enable Visual Editing

```typescript
// src/lib/sanity/client.ts — Sanity client with preview support.

import { createClient } from "next-sanity";

export const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  useCdn: process.env.NODE_ENV === "production",  // CDN for production reads
});

// Preview client for draft content in visual editing mode
export const previewClient = createClient({
  ...client.config(),
  useCdn: false,
  token: process.env.SANITY_API_TOKEN,
  perspective: "previewDrafts",  // See draft changes before publishing
});
```

## Results

Omar's marketing team started using the CMS after a one-hour training session. After two months:

- **Landing page launch time: 5 days → 30 minutes** — the marketing team builds pages from the block library without developer involvement. New product launch pages, event pages, and campaign landing pages go live the same day they're planned.
- **Developer involvement reduced by 80%** — developers only build new block types when the marketing team needs a pattern that doesn't exist yet. In two months, the team requested 3 new block types (video embed, comparison table, interactive demo).
- **A/B testing velocity: 1 test/month → 4 tests/week** — editors duplicate a page, change the headline and CTA, and publish the variant immediately. No more waiting for developer sprints.
- **SEO metadata completion: 40% → 100%** — the schema makes meta title, description, and OG image fields visible and validated. Editors can't publish without completing SEO fields.
- **Content reuse: testimonials and logos** are stored as separate documents and referenced by pages. Updating a customer logo in one place updates it everywhere.
- **Site performance: 98 Lighthouse score** — Next.js static generation + Sanity CDN + optimized images via `next/image`. Pages are pre-built at deploy time with ISR for content updates.
