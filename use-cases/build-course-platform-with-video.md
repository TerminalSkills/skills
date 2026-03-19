---
title: Build a Video Course Platform with Chapters, Quizzes, and Progress Tracking
slug: build-course-platform-with-video
description: Build a coding bootcamp platform with adaptive video streaming, module-based course structure, per-student progress tracking, completion certificates, and Stripe one-time + subscription access — all in Next.js.
skills:
  - stripe
  - prisma
  - mux
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

Marco runs a coding bootcamp. He has 40 hours of recorded lessons sitting in Google Drive, a Notion document outlining the curriculum, and 200 students on a waitlist. He wants a platform where students can purchase access, watch lessons with adaptive streaming, complete quizzes, and earn certificates — without paying $500/month for a Teachable subscription he doesn't control.

## Step 1 — Model the Course Structure in Prisma

A course contains modules, each module has lessons, each lesson can have a quiz. Progress is tracked per enrollment.

```prisma
// prisma/schema.prisma — Course platform data model.
// Course → Module → Lesson → Quiz.
// Enrollment links a User to a Course with progress state.

model Course {
  id          String   @id @default(cuid())
  title       String
  slug        String   @unique
  description String
  thumbnailUrl String?
  price       Int      // cents, 0 = free
  priceId     String?  // Stripe price ID for one-time purchase
  planId      String?  // Stripe price ID for subscription tier
  published   Boolean  @default(false)
  modules     Module[]
  enrollments Enrollment[]
  createdAt   DateTime @default(now())
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
  id          String   @id @default(cuid())
  title       String
  position    Int
  moduleId    String
  module      Module   @relation(fields: [moduleId], references: [id])
  muxAssetId  String?  // Mux asset ID after upload
  muxPlaybackId String? // Mux playback ID for streaming
  duration    Int?     // seconds
  quiz        Quiz?
  progress    LessonProgress[]
}

model Quiz {
  id        String         @id @default(cuid())
  lessonId  String         @unique
  lesson    Lesson         @relation(fields: [lessonId], references: [id])
  questions QuizQuestion[]
}

model QuizQuestion {
  id            String   @id @default(cuid())
  quizId        String
  quiz          Quiz     @relation(fields: [quizId], references: [id])
  text          String
  options       String[] // JSON array of answer options
  correctIndex  Int      // index into options[]
  position      Int
}

model Enrollment {
  id           String   @id @default(cuid())
  userId       String
  courseId     String
  course       Course   @relation(fields: [courseId], references: [id])
  stripeSessionId String?
  completedAt  DateTime?
  certificateUrl String?
  createdAt    DateTime @default(now())
  lessonProgress LessonProgress[]

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
  quizScore    Int?       // 0–100
  completedAt  DateTime?

  @@unique([enrollmentId, lessonId])
}
```

## Step 2 — Upload Videos to Mux and Get Playback IDs

Mux handles transcoding and adaptive bitrate streaming. Upload via a direct upload URL — the file never touches your server.

```typescript
// src/lib/mux.ts — Mux client initialization.
import Mux from "@mux/mux-node";

export const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_TOKEN_SECRET!,
});
```

```typescript
// src/app/api/admin/lessons/[lessonId]/upload/route.ts
// Creates a Mux direct upload URL. The browser uploads directly to Mux.
// Mux fires a webhook when the asset is ready → we save the playback ID.

import { NextResponse } from "next/server";
import { mux } from "@/lib/mux";
import { db } from "@/lib/db";

export async function POST(
  _req: Request,
  { params }: { params: { lessonId: string } }
) {
  // Create a direct upload — returns a URL the client posts the file to
  const upload = await mux.video.uploads.create({
    new_asset_settings: {
      playback_policy: ["signed"],      // Require signed tokens for playback
      encoding_tier: "smart",           // Smart encoding saves cost on short clips
    },
    cors_origin: process.env.NEXT_PUBLIC_APP_URL!,
  });

  // Store the upload ID so we can match it in the webhook
  await db.lesson.update({
    where: { id: params.lessonId },
    data: { muxAssetId: upload.id },   // Temporarily store upload ID
  });

  return NextResponse.json({ uploadUrl: upload.url, uploadId: upload.id });
}
```

```typescript
// src/app/api/webhooks/mux/route.ts — Mux webhook: asset ready.
// When Mux finishes transcoding, save the playback ID to the lesson.

import { headers } from "next/headers";
import { mux } from "@/lib/mux";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();

  // Verify webhook signature
  const isValid = await mux.webhooks.verifySignature(
    body,
    Object.fromEntries(headersList.entries()),
    process.env.MUX_WEBHOOK_SECRET!
  );
  if (!isValid) return new Response("Invalid signature", { status: 401 });

  const event = JSON.parse(body);

  if (event.type === "video.asset.ready") {
    const asset = event.data;
    const playbackId = asset.playback_ids?.[0]?.id;

    // Find the lesson that was being uploaded
    await db.lesson.updateMany({
      where: { muxAssetId: asset.upload_id ?? asset.id },
      data: {
        muxAssetId: asset.id,          // Replace upload ID with asset ID
        muxPlaybackId: playbackId,
        duration: Math.round(asset.duration),
      },
    });
  }

  return new Response("OK");
}
```

## Step 3 — Sell Courses with Stripe (One-Time + Subscription)

```typescript
// src/app/api/courses/[courseId]/purchase/route.ts
// Creates a Stripe Checkout session for one-time purchase or subscription.
// Enrollment is created in the webhook after payment succeeds.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";

export async function POST(
  req: Request,
  { params }: { params: { courseId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { mode } = await req.json(); // "payment" | "subscription"
  const course = await db.course.findUniqueOrThrow({ where: { id: params.courseId } });

  const priceId = mode === "subscription" ? course.planId : course.priceId;
  if (!priceId) return NextResponse.json({ error: "No price configured" }, { status: 400 });

  const checkoutSession = await stripe.checkout.sessions.create({
    mode,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${course.slug}?enrolled=true`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/courses/${course.slug}`,
    metadata: {
      userId: session.user.id,
      courseId: course.id,
    },
    customer_email: session.user.email!,
  });

  return NextResponse.json({ url: checkoutSession.url });
}
```

```typescript
// src/app/api/webhooks/stripe/route.ts — Create enrollment on successful payment.

import { stripe } from "@/lib/stripe";
import { db } from "@/lib/db";
import { headers } from "next/headers";

export async function POST(req: Request) {
  const body = await req.text();
  const headersList = await headers();
  const sig = headersList.get("stripe-signature")!;

  const event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, courseId } = session.metadata!;

    await db.enrollment.upsert({
      where: { userId_courseId: { userId, courseId } },
      create: { userId, courseId, stripeSessionId: session.id },
      update: {},                        // Already enrolled (e.g. subscription renewal)
    });
  }

  return new Response("OK");
}
```

## Step 4 — Track Progress and Issue Completion Certificates

```typescript
// src/app/api/courses/[courseId]/lessons/[lessonId]/progress/route.ts
// Called when a student marks a lesson complete or finishes a quiz.
// Checks if all lessons are done → generates a certificate.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCertificate } from "@/lib/certificate";

export async function POST(
  req: Request,
  { params }: { params: { courseId: string; lessonId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { watchedSecs, quizScore } = await req.json();

  // Find enrollment
  const enrollment = await db.enrollment.findUniqueOrThrow({
    where: { userId_courseId: { userId: session.user.id, courseId: params.courseId } },
    include: { course: { include: { modules: { include: { lessons: true } } } } },
  });

  // Upsert lesson progress
  await db.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: params.lessonId } },
    create: {
      enrollmentId: enrollment.id,
      lessonId: params.lessonId,
      watchedSecs,
      quizScore,
      completed: true,
      completedAt: new Date(),
    },
    update: { watchedSecs, quizScore, completed: true, completedAt: new Date() },
  });

  // Check if all lessons in the course are complete
  const allLessons = enrollment.course.modules.flatMap((m) => m.lessons);
  const completedCount = await db.lessonProgress.count({
    where: { enrollmentId: enrollment.id, completed: true },
  });

  if (completedCount === allLessons.length && !enrollment.completedAt) {
    const certUrl = await generateCertificate({
      studentName: session.user.name!,
      courseTitle: enrollment.course.title,
      completedAt: new Date(),
    });

    await db.enrollment.update({
      where: { id: enrollment.id },
      data: { completedAt: new Date(), certificateUrl: certUrl },
    });
  }

  return NextResponse.json({ ok: true, totalCompleted: completedCount, total: allLessons.length });
}
```

```typescript
// src/lib/certificate.ts — Generate a PDF certificate with a verifiable URL.
// Uses @react-pdf/renderer to create a branded PDF and uploads it to Mux Storage (or S3).

import { renderToBuffer } from "@react-pdf/renderer";
import { CertificateDocument } from "@/components/CertificateDocument";
import { uploadFile } from "@/lib/storage";
import { nanoid } from "nanoid";

interface CertificateOptions {
  studentName: string;
  courseTitle: string;
  completedAt: Date;
}

export async function generateCertificate(opts: CertificateOptions): Promise<string> {
  const buffer = await renderToBuffer(
    CertificateDocument({
      ...opts,
      verificationId: nanoid(12),        // Short ID for public verification
    })
  );

  const key = `certificates/${nanoid()}.pdf`;
  const url = await uploadFile(buffer, key, "application/pdf");
  return url;
}
```

## Step 5 — Student Dashboard: Continue Where You Left Off

```typescript
// src/app/dashboard/page.tsx — Student dashboard showing enrolled courses and resume points.

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import Link from "next/link";
import MuxPlayer from "@mux/mux-player-react";

export default async function DashboardPage() {
  const session = await auth();

  const enrollments = await db.enrollment.findMany({
    where: { userId: session!.user.id },
    include: {
      course: { include: { modules: { include: { lessons: { orderBy: { position: "asc" } } }, orderBy: { position: "asc" } } } },
      lessonProgress: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const coursesWithResume = enrollments.map((e) => {
    const completedIds = new Set(e.lessonProgress.filter((p) => p.completed).map((p) => p.lessonId));
    const allLessons = e.course.modules.flatMap((m) => m.lessons);
    const nextLesson = allLessons.find((l) => !completedIds.has(l.id));
    const progress = Math.round((completedIds.size / allLessons.length) * 100);

    return { enrollment: e, course: e.course, nextLesson, progress };
  });

  return (
    <div className="max-w-4xl mx-auto py-10 px-4 space-y-8">
      <h1 className="text-2xl font-bold">My Courses</h1>
      {coursesWithResume.map(({ course, nextLesson, progress, enrollment }) => (
        <div key={course.id} className="border rounded-xl p-6 flex gap-6 items-center">
          {course.thumbnailUrl && <img src={course.thumbnailUrl} className="w-32 h-20 rounded object-cover" alt="" />}
          <div className="flex-1 space-y-2">
            <h2 className="font-semibold text-lg">{course.title}</h2>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-sm text-gray-500">{progress}% complete</p>
            {enrollment.certificateUrl ? (
              <a href={enrollment.certificateUrl} target="_blank" rel="noopener noreferrer"
                 className="text-sm text-green-600 font-medium">🎓 View Certificate</a>
            ) : nextLesson ? (
              <Link href={`/courses/${course.slug}/lessons/${nextLesson.id}`}
                    className="inline-block px-4 py-2 bg-blue-600 text-white text-sm rounded-lg">
                Continue →
              </Link>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
```

## Results

Marco launched the bootcamp with 3 courses, 40 lessons total, and a $299 one-time price per course.

- **Platform cost: $0/month fixed** — Mux charges per minute of video stored (~$0.015/min) and per minute streamed (~$0.005/min). At 200 enrolled students averaging 5 hours of video each, streaming cost is ~$300. Still far cheaper than Teachable at $500/month flat.
- **Enrollment flow: 4 minutes** — students land on course page, hit Buy, enter card in Stripe Checkout, land on the course player. Stripe handles tax, receipts, and refund requests.
- **Progress UX** — the dashboard shows each student exactly where to resume. Completion rate went from 22% (when Marco sent Notion links) to 61% after the "continue" button launched.
- **Certificates** — 47 students completed their first course in the first month. Each got a PDF certificate with a public verification URL. Several posted it on LinkedIn, driving organic signups.
- **Quiz pass rates** — the assessment engine revealed that Lesson 12 (async/await) had a 38% fail rate. Marco re-recorded it; fail rate dropped to 9%.
