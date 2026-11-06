---
title: Build a Video Course Platform with Chapters, Quizzes, and Progress Tracking
slug: build-course-platform-with-video
description: Build a coding bootcamp platform with adaptive video streaming, module-based course structure, per-student progress tracking, completion certificates, and Stripe one-time + subscription access — all in Next.js.
skills:
  - stripe-billing
  - prisma
category: business
tags:
  - video
  - courses
  - elearning
  - stripe
  - progress-tracking
  - certificates
  - saas
---

# Build a Video Course Platform with Chapters, Quizzes, and Progress Tracking

Marco runs a coding bootcamp. He has 40 hours of recorded lessons sitting in Google Drive, a Notion document outlining the curriculum, and 200 students on a waitlist. He wants a platform where students can purchase access, watch lessons with adaptive streaming, complete quizzes, and earn certificates, on infrastructure he controls rather than a hosted course marketplace.

The stack: Next.js (App Router), Postgres with Prisma, Stripe Checkout, and Mux for video hosting and adaptive streaming. Mux is a hosted video API, so there is no skill for it in the catalog; the steps below use its Node SDK (`@mux/mux-node`) and player (`@mux/mux-player-react`) directly. All Mux, Stripe and Prisma calls were type-checked against `@mux/mux-node` 15, `stripe` 23 and `@mux/mux-player-react` 3.

## Step 1 — Model the Course Structure in Prisma

A course contains modules, each module has lessons, each lesson can have a quiz. Progress is tracked per enrollment. `String[]` for quiz options needs Postgres (or another database that supports scalar lists).

```prisma
// prisma/schema.prisma (models only; the datasource and generator blocks are yours).
model Course {
  id          String   @id @default(cuid())
  title       String
  slug        String   @unique
  priceId     String?  // Stripe price ID, one-time purchase
  planId      String?  // Stripe price ID, subscription tier
  published   Boolean  @default(false)
  modules     Module[]
  enrollments Enrollment[]
}
model Module {
  id       String   @id @default(cuid())
  title    String
  position Int
  courseId String
  course   Course   @relation(fields: [courseId], references: [id])
  lessons  Lesson[]
}
model Lesson {
  id            String   @id @default(cuid())
  title         String
  position      Int
  moduleId      String
  module        Module   @relation(fields: [moduleId], references: [id])
  muxAssetId    String?  // set by the Mux webhook
  muxPlaybackId String?  // signed playback ID
  duration      Int?     // seconds
  questions     QuizQuestion[]
  progress      LessonProgress[]
}
model QuizQuestion {
  id           String   @id @default(cuid())
  lessonId     String
  lesson       Lesson   @relation(fields: [lessonId], references: [id])
  text         String
  options      String[]
  correctIndex Int      // never sent to the browser
  position     Int
}
model Enrollment {
  id              String   @id @default(cuid())
  userId          String
  courseId        String
  course          Course   @relation(fields: [courseId], references: [id])
  stripeSessionId String?
  stripeSubscriptionId String? // set for subscription purchases
  completedAt     DateTime?
  certificateUrl  String?
  createdAt       DateTime @default(now())
  lessonProgress  LessonProgress[]
  @@unique([userId, courseId])
}
model LessonProgress {
  id           String     @id @default(cuid())
  enrollmentId String
  enrollment   Enrollment @relation(fields: [enrollmentId], references: [id])
  lessonId     String
  lesson       Lesson     @relation(fields: [lessonId], references: [id])
  watchedSecs  Int        @default(0)
  completed    Boolean    @default(false)
  quizScore    Int?       // 0-100, computed on the server
  completedAt  DateTime?
  @@unique([enrollmentId, lessonId])
}
```

## Step 2 — Upload Videos to Mux

Mux transcodes to adaptive-bitrate HLS. The admin uploads through a direct upload URL, so the file never touches your server. The lesson ID travels in `passthrough`, which Mux echoes back on the asset, so the webhook can find the lesson.

```typescript
// src/lib/mux.ts (also reads MUX_WEBHOOK_SECRET, MUX_SIGNING_KEY, MUX_PRIVATE_KEY from the environment)
import Mux from "@mux/mux-node";
export const mux = new Mux({ tokenId: process.env.MUX_TOKEN_ID!, tokenSecret: process.env.MUX_TOKEN_SECRET! });
```

```typescript
// src/app/api/admin/lessons/[lessonId]/upload/route.ts
import { NextResponse } from "next/server";
import { mux } from "@/lib/mux";
import { requireAdmin } from "@/lib/auth"; // your own check; throws or returns a Response for non-admins
export async function POST(_req: Request, { params }: { params: Promise<{ lessonId: string }> }) { // params is a Promise in Next.js 15+
  await requireAdmin();
  const { lessonId } = await params;
  const upload = await mux.video.uploads.create({
    cors_origin: process.env.NEXT_PUBLIC_APP_URL!,
    // "signed" playback needs a short-lived token (Step 4); video_quality replaces the deprecated encoding_tier
    new_asset_settings: { playback_policy: ["signed"], video_quality: "basic", passthrough: lessonId },
  });
  return NextResponse.json({ uploadUrl: upload.url });
}
```

The browser sends the file with `PUT` to `uploadUrl`. When the asset is ready, Mux calls your webhook. `verifySignature` returns nothing and throws on a bad signature, so use `unwrap`, which verifies and parses in one step:

```typescript
// src/app/api/webhooks/mux/route.ts
import { mux } from "@/lib/mux";
import { db } from "@/lib/db";
export async function POST(req: Request) {
  const body = await req.text(); // raw body: the signature covers the exact bytes
  let event;
  try { event = await mux.webhooks.unwrap(body, req.headers, process.env.MUX_WEBHOOK_SECRET!); }
  catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.type === "video.asset.ready") {
    const asset = event.data, lessonId = asset.passthrough;
    const playbackId = asset.playback_ids?.[0]?.id;
    if (lessonId && playbackId) {
      await db.lesson.updateMany({
        where: { id: lessonId },
        data: { muxAssetId: asset.id, muxPlaybackId: playbackId, duration: asset.duration ? Math.round(asset.duration) : null },
      });
    }
  }
  return new Response("OK");
}
```

Register the endpoint in the Mux dashboard (Settings, Webhooks) for `MUX_WEBHOOK_SECRET`. Separately create a signing key (Settings, Signing Keys) and put its ID and private key in `MUX_SIGNING_KEY` and `MUX_PRIVATE_KEY`.

## Step 3 — Sell Courses with Stripe (One-Time + Subscription)

Create the prices in the Stripe dashboard and store their IDs on the course. Checkout creates the session, and the enrollment is created only from the verified webhook, never from the success redirect.

```typescript
// src/app/api/courses/[courseId]/purchase/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
export async function POST(req: Request, { params }: { params: Promise<{ courseId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const [{ courseId }, { mode }] = [await params, await req.json()];
  if (mode !== "payment" && mode !== "subscription") return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
  const course = await db.course.findUniqueOrThrow({ where: { id: courseId } });
  const price = mode === "subscription" ? course.planId : course.priceId;
  if (!price) return NextResponse.json({ error: "No price configured" }, { status: 400 });
  const checkout = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${course.slug}?enrolled=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${course.slug}`,
    metadata: { userId: session.user.id, courseId: course.id },
    customer_email: session.user.email!,
  });
  return NextResponse.json({ url: checkout.url });
}
```

```typescript
// src/app/api/webhooks/stripe/route.ts
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
export async function POST(req: Request) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });
  let event;
  try { event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!); }
  catch { return new Response("Invalid signature", { status: 400 }); }
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    // Card payments are paid at completion; delayed methods fire async_payment_succeeded instead.
    if (session.payment_status === "paid" && session.metadata?.userId && session.metadata?.courseId) {
      const { userId, courseId } = session.metadata;
      await db.enrollment.upsert({ // idempotent: Stripe may deliver the event twice
        where: { userId_courseId: { userId, courseId } }, create: { userId, courseId, stripeSessionId: session.id, stripeSubscriptionId: typeof session.subscription === "string" ? session.subscription : null }, update: {},
      });
    }
  }
  return new Response("OK");
}
```

For subscriptions, also handle `customer.subscription.deleted`: find the enrollment by `stripeSubscriptionId` (`event.data.object.id`) and remove or expire it, otherwise cancelled students keep access. The **stripe-billing** skill covers the subscription lifecycle events. If you enable delayed payment methods, also handle `checkout.session.async_payment_succeeded`.

## Step 4 — Play Lessons with Signed Tokens

Because the playback policy is `signed`, the player needs a JWT that your server mints only for enrolled students. The server component below checks enrollment, signs a one-hour token and hands it to the player.

```tsx
// src/app/courses/[slug]/lessons/[lessonId]/page.tsx
import { notFound } from "next/navigation";
import MuxPlayer from "@mux/mux-player-react";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { mux } from "@/lib/mux";
export default async function LessonPage({ params }: { params: Promise<{ slug: string; lessonId: string }> }) {
  const { slug, lessonId } = await params;
  const session = await auth();
  if (!session?.user?.id) notFound();
  const lesson = await db.lesson.findFirst({ where: { id: lessonId, module: { course: { slug } } } });
  const enrollment = lesson && (await db.enrollment.findFirst({ where: { userId: session.user.id, course: { slug } } }));
  if (!lesson?.muxPlaybackId || !enrollment) notFound();
  const token = await mux.jwt.signPlaybackId(lesson.muxPlaybackId, { type: "video", expiration: "1h" });
  return (
    <MuxPlayer playbackId={lesson.muxPlaybackId} tokens={{ playback: token }} metadata={{ video_title: lesson.title }} />
  );
}
```

## Step 5 — Track Progress and Issue Certificates

The browser reports `watchedSecs` and quiz `answers`, but the server decides what counts: the lesson must belong to the course and the quiz is graded here, against `correctIndex` values that never leave the server. `watchedSecs` is client-reported, so the 90% check is a speed bump, not proof of viewing.

```typescript
// src/app/api/courses/[courseId]/lessons/[lessonId]/progress/route.ts
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCertificate } from "@/lib/certificate";
export async function POST(req: Request, { params }: { params: Promise<{ courseId: string; lessonId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { courseId, lessonId } = await params;
  const { watchedSecs, answers } = await req.json();
  const enrollment = await db.enrollment.findUnique({
    where: { userId_courseId: { userId: session.user.id, courseId } },
    include: { course: { include: { modules: { include: { lessons: true } } } } },
  });
  if (!enrollment) return NextResponse.json({ error: "Not enrolled" }, { status: 403 });
  const allLessons = enrollment.course.modules.flatMap((m) => m.lessons);
  const lesson = allLessons.find((l) => l.id === lessonId);
  if (!lesson) return NextResponse.json({ error: "Lesson not in course" }, { status: 404 });
  const watched = Math.max(0, Math.floor(Number(watchedSecs) || 0));
  if (lesson.duration && watched < lesson.duration * 0.9) {
    return NextResponse.json({ error: "Watch at least 90% of the lesson" }, { status: 422 });
  }
  let quizScore: number | null = null;
  const questions = await db.quizQuestion.findMany({ where: { lessonId }, orderBy: { position: "asc" } });
  if (questions.length > 0) {
    const given: unknown[] = Array.isArray(answers) ? answers : [];
    const right = questions.filter((q, i) => given[i] === q.correctIndex).length;
    quizScore = Math.round((right / questions.length) * 100);
  }
  await db.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
    create: { enrollmentId: enrollment.id, lessonId, watchedSecs: watched, quizScore, completed: true, completedAt: new Date() },
    update: { watchedSecs: watched, quizScore, completed: true, completedAt: new Date() },
  });
  const completedCount = await db.lessonProgress.count({ where: { enrollmentId: enrollment.id, completed: true } });
  if (completedCount >= allLessons.length && !enrollment.completedAt) {
    // Claim completion first so two parallel requests cannot both issue a certificate.
    const claimed = await db.enrollment.updateMany({ where: { id: enrollment.id, completedAt: null }, data: { completedAt: new Date() } });
    if (claimed.count === 1) {
      const certificateUrl = await generateCertificate({ studentName: session.user.name ?? "Student", courseTitle: enrollment.course.title, completedAt: new Date() });
      await db.enrollment.update({ where: { id: enrollment.id }, data: { certificateUrl } });
    }
  }
  return NextResponse.json({ ok: true, quizScore, totalCompleted: completedCount, total: allLessons.length });
}
```

The certificate is a PDF rendered with `renderToBuffer` from `@react-pdf/renderer` (a React `<Document>` with the student name, course title and a `nanoid(12)` verification ID), uploaded to S3 or any object store under a random `certificates/<nanoid>.pdf` key so the URL cannot be guessed.

## Step 6 — Dashboard with a Resume Point

The dashboard query includes each course's lessons in order and the student's progress. Pick the first lesson without a completed row as the "Continue" target and show `completed / total` as the progress bar. Guard against a course with zero lessons before dividing, and render the certificate link when `certificateUrl` is set.

## Real-World Example

Marco launches with three courses, 40 lessons and a one-time price per course. A student lands on a course page, clicks Buy, pays in Stripe Checkout and returns to the player; the webhook has created the enrollment by then. Marco watches the per-lesson `quizScore` column: when Lesson 12 (async/await) shows a far lower average than the rest, he re-records it. Since video lives on Mux and billing on Stripe, the only servers he runs are the Next.js app and Postgres.

## Related Skills

- **stripe-billing**: Checkout sessions, verified webhooks and subscription lifecycle for the purchase flow.
- **prisma**: the schema, migrations and upserts behind courses, enrollments and progress.
