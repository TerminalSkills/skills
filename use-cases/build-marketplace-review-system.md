---
title: "Build a Verified Marketplace Review System"
description: "Add purchase-verified reviews to your marketplace — star ratings, photo uploads, AI moderation for spam and fake reviews, seller replies, and a weighted aggregation score buyers actually trust."
skills: [anthropic-sdk, prisma, s3-storage]
difficulty: intermediate
time_estimate: "7 hours"
tags: [marketplace, reviews, trust, ai-moderation, social-proof, s3, saas]
---

# Build a Verified Marketplace Review System

Fake reviews kill marketplaces. Unverified ratings are worthless. You need a system that only lets real buyers review, catches spam and fake reviews automatically, and gives sellers a clean way to respond publicly. That's what builds trust.

## What You'll Build

- Purchase-gated reviews: only verified buyers can submit
- Star rating (1–5) + text + optional photo upload
- AI moderation: detect spam, fake reviews, and profanity
- Seller response: public reply visible to all future buyers
- Weighted aggregation: recency-adjusted score per listing
- Flagging: other users can flag suspicious reviews

## Architecture

```
Buyer completes order → review prompt unlocked
  → Buyer submits: rating + text + optional photos
  → Photos → S3 upload
  → Claude moderates: spam / fake / profanity check
  → PENDING → auto-approved or queued for human review
  → Score recalculated for listing
  → Seller notified → can reply once
```

## Step 1: Prisma Schema

```prisma
model Review {
  id           String        @id @default(cuid())
  listingId    String
  listing      Listing       @relation(fields: [listingId], references: [id])
  orderId      String        @unique  // one review per order
  order        Order         @relation(fields: [orderId], references: [id])
  reviewerId   String
  reviewer     User          @relation("ReviewAuthor", fields: [reviewerId], references: [id])
  rating       Int           // 1-5
  title        String?
  body         String
  photos       ReviewPhoto[]
  status       ReviewStatus  @default(PENDING)
  moderationScore Float?     // 0-1, Claude confidence review is legitimate
  moderationReason String?
  isVerifiedPurchase Boolean @default(true)
  helpfulCount Int           @default(0)
  sellerReply  SellerReply?
  flags        ReviewFlag[]
  createdAt    DateTime      @default(now())
  publishedAt  DateTime?
}

model ReviewPhoto {
  id       String @id @default(cuid())
  reviewId String
  review   Review @relation(fields: [reviewId], references: [id])
  s3Key    String
  url      String // CloudFront URL
}

model SellerReply {
  id        String   @id @default(cuid())
  reviewId  String   @unique
  review    Review   @relation(fields: [reviewId], references: [id])
  sellerId  String
  body      String
  createdAt DateTime @default(now())
}

model ReviewFlag {
  id         String   @id @default(cuid())
  reviewId   String
  review     Review   @relation(fields: [reviewId], references: [id])
  flaggedById String
  reason     String   // spam | fake | inappropriate | other
  createdAt  DateTime @default(now())
  @@unique([reviewId, flaggedById])
}

enum ReviewStatus { PENDING APPROVED REJECTED FLAGGED }
```

## Step 2: Verify Purchase Before Allowing Review

```typescript
// lib/reviews.ts
export async function canReview(userId: string, listingId: string): Promise<{
  allowed: boolean;
  orderId?: string;
  reason?: string;
}> {
  // Check completed order exists
  const order = await prisma.order.findFirst({
    where: {
      buyerId: userId,
      listingId,
      status: "COMPLETED",
      review: null, // no review submitted yet
    },
  });

  if (!order) {
    return { allowed: false, reason: "no_verified_purchase" };
  }

  return { allowed: true, orderId: order.id };
}
```

## Step 3: AI Moderation with Claude

```typescript
// lib/moderate-review.ts
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

interface ModerationResult {
  approved: boolean;
  score: number;       // 0-1, probability of legitimate review
  reason?: string;
  flags: string[];     // ["spam", "fake", "profanity", "irrelevant"]
}

export async function moderateReview(review: {
  rating: number;
  title?: string;
  body: string;
  listingTitle: string;
}): Promise<ModerationResult> {
  const prompt = `You are a marketplace review moderator. Analyze this review for quality and legitimacy.

Listing: "${review.listingTitle}"
Rating: ${review.rating}/5
Title: "${review.title ?? "(none)"}"
Review body: "${review.body}"

Check for:
1. SPAM: promotional content, links, unrelated content
2. FAKE: suspiciously generic, copy-paste, no specific details about the product
3. PROFANITY: offensive language
4. IRRELEVANT: review is about shipping/seller but the product is fine (legitimate but misfiled)
5. LEGITIMATE: genuine buyer experience

Return JSON:
{
  "approved": true/false,
  "score": 0.0-1.0,
  "flags": [],
  "reason": "brief explanation if not approved"
}

Be lenient — short genuine reviews should pass. Only reject clear spam/fake content.
Return ONLY JSON.`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });

  const text = message.content[0].type === "text" ? message.content[0].text : "{}";
  const result = JSON.parse(text);

  return {
    approved: result.approved ?? true,
    score: result.score ?? 0.5,
    reason: result.reason,
    flags: result.flags ?? [],
  };
}
```

## Step 4: Submit Review Endpoint

```typescript
// POST /api/reviews
export async function POST(req: Request) {
  const { listingId, rating, title, body, photoKeys } = await req.json();
  const userId = await getSessionUserId(req);

  // Verify purchase
  const { allowed, orderId, reason } = await canReview(userId, listingId);
  if (!allowed) return Response.json({ error: reason }, { status: 403 });

  // Get listing title for moderation context
  const listing = await prisma.listing.findUnique({
    where: { id: listingId },
    select: { title: true },
  });

  // AI moderation
  const moderation = await moderateReview({ rating, title, body, listingTitle: listing!.title });

  // Auto-approve high-confidence legit reviews; queue borderline cases
  const status = moderation.approved && moderation.score > 0.7 ? "APPROVED" : "PENDING";

  const review = await prisma.review.create({
    data: {
      listingId,
      orderId: orderId!,
      reviewerId: userId,
      rating,
      title,
      body,
      status,
      moderationScore: moderation.score,
      moderationReason: moderation.reason,
      publishedAt: status === "APPROVED" ? new Date() : null,
      photos: photoKeys?.length
        ? { create: photoKeys.map((key: string) => ({
            s3Key: key,
            url: getPublicFileUrl(key),
          }))}
        : undefined,
    },
  });

  // Recalculate listing score
  if (status === "APPROVED") await recalculateListingScore(listingId);

  return Response.json({ review, autoApproved: status === "APPROVED" });
}
```

## Step 5: Weighted Score Aggregation

```typescript
// Recency-weighted average: recent reviews count more
export async function recalculateListingScore(listingId: string) {
  const reviews = await prisma.review.findMany({
    where: { listingId, status: "APPROVED" },
    select: { rating: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  if (reviews.length === 0) return;

  const now = Date.now();
  let weightedSum = 0;
  let totalWeight = 0;

  reviews.forEach((r, i) => {
    // Exponential decay: newer reviews have higher weight
    const ageMs = now - r.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-ageDays / 180); // half-life ~180 days
    weightedSum += r.rating * weight;
    totalWeight += weight;
  });

  const score = weightedSum / totalWeight;

  await prisma.listing.update({
    where: { id: listingId },
    data: {
      reviewScore: Math.round(score * 10) / 10,
      reviewCount: reviews.length,
    },
  });
}
```

## Step 6: Seller Reply

```typescript
// POST /api/reviews/[id]/reply
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { body } = await req.json();
  const sellerId = await getSessionUserId(req);

  const review = await prisma.review.findUnique({
    where: { id: params.id },
    include: { listing: true, sellerReply: true },
  });

  if (!review) return Response.json({ error: "not_found" }, { status: 404 });
  if (review.listing.sellerId !== sellerId) return Response.json({ error: "forbidden" }, { status: 403 });
  if (review.sellerReply) return Response.json({ error: "already_replied" }, { status: 409 });

  const reply = await prisma.sellerReply.create({
    data: { reviewId: params.id, sellerId, body },
  });

  return Response.json({ reply });
}
```

## Environment Variables

```bash
ANTHROPIC_API_KEY=sk-ant-...
AWS_REGION=us-east-1
S3_BUCKET=my-app-reviews
CLOUDFRONT_DOMAIN=https://cdn.example.com
DATABASE_URL=postgresql://...
```

## Launch Checklist

- [ ] Purchase verification working before unlock
- [ ] Photo upload presigned URL flow
- [ ] Moderation score stored per review
- [ ] Human review queue for PENDING items
- [ ] Weighted score updates on new reviews
- [ ] Seller notification on new review (email)
- [ ] Flag button visible to all users

## What's Next

- Review response templates for sellers
- Review analytics: common complaints per listing
- Review incentives: buyer earns points for quality reviews
- Bulk re-moderation when moderation model improves
