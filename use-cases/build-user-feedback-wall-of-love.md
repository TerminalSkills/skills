---
title: "Build a Wall of Love — Automated Testimonials Page"
description: "Build a social proof wall that imports tweets, collects testimonials via a form, scores them with AI, and serves an embeddable widget for any site."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [social-proof, testimonials, ai, anthropic, prisma, nextjs, widget, embed]
---

# Build a Wall of Love — Automated Testimonials Page

## The Problem

You have happy customers. Some tweet about you, some email you, some tell you in calls — but none of it ends up on your website. Building trust through social proof is a conversion multiplier, and you're leaving it on the table.

**Goal:** Automatically collect and display testimonials from multiple sources, score them with AI to surface the best ones, and serve an embeddable widget that works on any site.

---

## Who This Is For

**SaaS marketer** building a trust page that practically runs itself. You want the best testimonials front-and-center without manually curating 200 tweets.

---

## Step 1: Prisma Schema

```prisma
// prisma/schema.prisma
model Testimonial {
  id          String   @id @default(cuid())
  source      String   // "twitter" | "linkedin" | "form" | "email"
  authorName  String
  authorTitle String?
  authorPhoto String?
  authorHandle String?  // @twitter or LinkedIn URL
  content     String   @db.Text
  rating      Int?     // 1-5 stars (form submissions)
  photoUrl    String?  // optional attached photo
  externalUrl String?  // link to original tweet/post
  externalId  String?  // tweet ID, to avoid duplicates

  // Admin fields
  status      String   @default("pending")  // pending | approved | rejected
  featured    Boolean  @default(false)
  tags        String   @default("[]")  // JSON: ["feature", "onboarding", "roi"]

  // AI scoring
  aiScore      Int?     // 0-100, higher = better testimonial
  aiSummary    String?  // AI-generated one-liner
  aiCategories String   @default("[]")  // JSON: detected categories

  productId   String
  createdAt   DateTime @default(now())
  approvedAt  DateTime?

  @@unique([source, externalId])
  @@index([productId, status, aiScore(sort: Desc)])
}

model Product {
  id          String   @id @default(cuid())
  name        String
  slug        String   @unique
  widgetToken String   @unique @default(cuid())
  testimonials Testimonial[]
}
```

---

## Step 2: Twitter Import

```typescript
// lib/import/twitter.ts
import { prisma } from "../prisma";

type Tweet = {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
};

type TwitterUser = {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  description?: string;
};

export async function importTweetsForProduct(
  productSlug: string,
  searchQuery: string
): Promise<{ imported: number; skipped: number }> {
  // Search Twitter API v2
  const url = new URL("https://api.twitter.com/2/tweets/search/recent");
  url.searchParams.set("query", `${searchQuery} -is:retweet lang:en`);
  url.searchParams.set("tweet.fields", "created_at,author_id");
  url.searchParams.set("user.fields", "name,username,profile_image_url,description");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("max_results", "100");

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}` },
  });

  const data = await res.json();
  const tweets: Tweet[] = data.data ?? [];
  const users: TwitterUser[] = data.includes?.users ?? [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const product = await prisma.product.findUnique({ where: { slug: productSlug } });
  if (!product) throw new Error("Product not found");

  let imported = 0;
  let skipped = 0;

  for (const tweet of tweets) {
    const author = userMap.get(tweet.author_id);
    if (!author) continue;

    // Skip if already imported
    const exists = await prisma.testimonial.findUnique({
      where: { source_externalId: { source: "twitter", externalId: tweet.id } },
    });

    if (exists) { skipped++; continue; }

    await prisma.testimonial.create({
      data: {
        source: "twitter",
        externalId: tweet.id,
        externalUrl: `https://twitter.com/${author.username}/status/${tweet.id}`,
        authorName: author.name,
        authorHandle: `@${author.username}`,
        authorPhoto: author.profile_image_url,
        content: tweet.text,
        status: "pending",
        productId: product.id,
      },
    });

    imported++;
  }

  return { imported, skipped };
}
```

---

## Step 3: AI Scoring with Anthropic

```typescript
// lib/ai/scorer.ts
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "../prisma";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

type ScoringResult = {
  score: number;       // 0-100
  summary: string;     // one-liner for display
  categories: string[]; // ["feature", "onboarding", "roi", "support"]
  isSpam: boolean;
};

export async function scoreTestimonial(id: string): Promise<void> {
  const testimonial = await prisma.testimonial.findUnique({ where: { id } });
  if (!testimonial) return;

  const message = await anthropic.messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 512,
    system: `You are evaluating customer testimonials for a SaaS product.
Score them on quality for use as social proof (0-100).

A high score (80+) means: specific outcomes, concrete benefits, authentic voice, mentions results or numbers.
A low score (<40) means: generic ("great product!"), vague, or spam.

Respond with JSON only:
{
  "score": <0-100>,
  "summary": "<15-word summary of the key benefit they mention>",
  "categories": [<array from: "feature", "onboarding", "support", "roi", "integration", "ux">],
  "isSpam": <true|false>
}`,
    messages: [
      {
        role: "user",
        content: `Author: ${testimonial.authorName}
Content: ${testimonial.content}`,
      },
    ],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";

  let result: ScoringResult;
  try {
    result = JSON.parse(text);
  } catch {
    result = { score: 50, summary: "", categories: [], isSpam: false };
  }

  await prisma.testimonial.update({
    where: { id },
    data: {
      aiScore: result.score,
      aiSummary: result.summary,
      aiCategories: JSON.stringify(result.categories),
      // Auto-reject spam
      status: result.isSpam ? "rejected" : testimonial.status,
    },
  });
}

// Batch score all pending
export async function scorePendingTestimonials(productId: string): Promise<void> {
  const pending = await prisma.testimonial.findMany({
    where: { productId, aiScore: null, status: { not: "rejected" } },
    take: 50,
  });

  // Score sequentially to respect rate limits
  for (const t of pending) {
    await scoreTestimonial(t.id);
    await new Promise((r) => setTimeout(r, 200)); // 200ms between calls
  }
}
```

---

## Step 4: Testimonial Submission Form

```tsx
// app/[productSlug]/submit/page.tsx
"use server";

async function submitTestimonial(formData: FormData) {
  "use server";
  const { productSlug } = /* from params */;

  const product = await prisma.product.findUnique({ where: { slug: productSlug } });
  if (!product) throw new Error("Product not found");

  const content = formData.get("content") as string;
  const name = formData.get("name") as string;
  const title = formData.get("title") as string;
  const rating = parseInt(formData.get("rating") as string);

  const testimonial = await prisma.testimonial.create({
    data: {
      source: "form",
      authorName: name,
      authorTitle: title,
      content,
      rating,
      status: "pending",
      productId: product.id,
    },
  });

  // Score immediately in background
  await scoreTestimonial(testimonial.id);

  redirect(`/${productSlug}/submit/thanks`);
}
```

---

## Step 5: Admin Approval Queue

```tsx
// app/admin/testimonials/page.tsx
import { prisma } from "@/lib/prisma";

export default async function ApprovalQueue() {
  const pending = await prisma.testimonial.findMany({
    where: { status: "pending" },
    orderBy: { aiScore: "desc" }, // highest quality first
    take: 50,
  });

  return (
    <div className="space-y-4">
      <h1>Approval Queue ({pending.length})</h1>
      {pending.map((t) => (
        <TestimonialCard key={t.id} testimonial={t} />
      ))}
    </div>
  );
}
```

---

## Step 6: Embeddable Widget

```typescript
// app/api/widget/[token]/route.ts
export async function GET(
  request: Request,
  { params }: { params: { token: string } }
) {
  const product = await prisma.product.findUnique({
    where: { widgetToken: params.token },
  });
  if (!product) return new Response("Not found", { status: 404 });

  const { searchParams } = new URL(request.url);
  const tag = searchParams.get("tag");
  const limit = parseInt(searchParams.get("limit") ?? "12");

  const testimonials = await prisma.testimonial.findMany({
    where: {
      productId: product.id,
      status: "approved",
      ...(tag ? { tags: { contains: tag } } : {}),
    },
    orderBy: [{ featured: "desc" }, { aiScore: "desc" }],
    take: limit,
    select: {
      id: true, authorName: true, authorTitle: true,
      authorPhoto: true, authorHandle: true,
      content: true, aiSummary: true, source: true, externalUrl: true,
    },
  });

  return Response.json(testimonials, {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
```

Embed on any site:

```html
<!-- Embed snippet -->
<div id="wall-of-love"></div>
<script>
  fetch("https://yoursaas.com/api/widget/YOUR_TOKEN")
    .then(r => r.json())
    .then(testimonials => {
      const container = document.getElementById("wall-of-love");
      container.innerHTML = testimonials.map(t => `
        <div class="testimonial">
          <img src="${t.authorPhoto}" alt="${t.authorName}" />
          <p>${t.content}</p>
          <span>${t.authorName} — ${t.authorTitle ?? ''}</span>
        </div>
      `).join("");
    });
</script>
```

---

## Automation: Scheduled Import

```typescript
// Cron job (Cloudflare Workers, Vercel Cron, etc.)
export async function importAndScore() {
  const products = await prisma.product.findMany();

  for (const product of products) {
    await importTweetsForProduct(product.slug, `@${product.slug} OR #${product.slug}`);
    await scorePendingTestimonials(product.id);
  }
}
```

---

## Result

- ✅ Twitter import with deduplication
- ✅ Form submissions with star ratings
- ✅ AI scoring — best testimonials surface automatically
- ✅ Admin approval queue sorted by AI score
- ✅ Tags: feature, onboarding, roi, support
- ✅ Embeddable widget with CORS support
- ✅ Featured testimonials always shown first

**Payoff:** Your testimonials page updates itself. The AI surfaces the most compelling stories, and the widget puts them everywhere you need trust.
