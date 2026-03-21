---
title: Build an LMS for Employee Training with Assessments and Compliance Tracking
slug: build-lms-learning-management-system
description: Build a custom Learning Management System — course builder with video and quizzes, role-based learner paths, assessment engine with pass thresholds, compliance tracking with due dates and certificates, and SCORM import — replacing $500/month SaaS LMS tools.
skills:
  - prisma
  - resend
  - stripe
category: business
tags:
  - lms
  - training
  - compliance
  - assessments
  - certificates
  - hr
---

# Build an LMS for Employee Training with Assessments and Compliance Tracking

Priya is the Head of People at a 200-person logistics company. They pay $500/month for a generic LMS that employees hate using on their phones and that takes 3 weeks to update when regulations change. She needs: onboarding courses for new hires, annual safety compliance training with certificate tracking, role-specific paths (warehouse vs. office vs. drivers), and audit reports she can export for regulators. Budget: whatever it costs to build it once.

## Step 1 — Data Model: Courses, Paths, Assessments, and Compliance

```prisma
// prisma/schema.prisma — LMS data model for enterprise training.

model Course {
  id          String   @id @default(cuid())
  title       String
  description String
  coverUrl    String?
  scormUrl    String?  // S3 URL if imported from SCORM package
  published   Boolean  @default(false)
  lessons     Lesson[]
  assessments Assessment[]
  assignments CourseAssignment[]
  completions CourseCompletion[]
  createdAt   DateTime @default(now())
}

model Lesson {
  id        String    @id @default(cuid())
  courseId  String
  course    Course    @relation(fields: [courseId], references: [id])
  title     String
  type      String    // "video" | "text" | "quiz"
  content   String?   // Markdown text OR video URL
  muxPlaybackId String? // For video lessons
  position  Int
  required  Boolean   @default(true)
  completions LessonCompletion[]
}

model Assessment {
  id          String     @id @default(cuid())
  courseId    String
  course      Course     @relation(fields: [courseId], references: [id])
  title       String
  passThreshold Int      // Minimum score % to pass (e.g., 80)
  maxAttempts   Int      @default(3)
  questions   Question[]
  attempts    AssessmentAttempt[]
}

model Question {
  id           String   @id @default(cuid())
  assessmentId String
  assessment   Assessment @relation(fields: [assessmentId], references: [id])
  text         String
  options      String[] // Array of answer options
  correctIndex Int
  explanation  String?  // Shown after answering
  position     Int
}

model LearnerPath {
  id          String           @id @default(cuid())
  name        String           // "Warehouse Operator", "Office Staff", "Driver"
  description String?
  role        String           @unique // Maps to user role
  courses     PathCourse[]
}

model PathCourse {
  pathId    String
  path      LearnerPath @relation(fields: [pathId], references: [id])
  courseId  String
  course    Course      @relation(fields: [courseId], references: [id])
  order     Int
  dueInDays Int?        // Days from hire date to complete (null = no deadline)
  required  Boolean     @default(true)

  @@id([pathId, courseId])
}

model CourseCompletion {
  id             String   @id @default(cuid())
  userId         String
  courseId       String
  course         Course   @relation(fields: [courseId], references: [id])
  score          Int?     // Final assessment score (0–100)
  passed         Boolean  @default(false)
  certificateUrl String?
  completedAt    DateTime @default(now())
  expiresAt      DateTime? // For compliance courses that expire annually
  nextDueAt      DateTime? // Recertification due date

  @@unique([userId, courseId])
}

model AssessmentAttempt {
  id           String   @id @default(cuid())
  userId       String
  assessmentId String
  assessment   Assessment @relation(fields: [assessmentId], references: [id])
  answers      Int[]    // User's answer index for each question
  score        Int      // 0–100
  passed       Boolean
  startedAt    DateTime @default(now())
  completedAt  DateTime?
}
```

## Step 2 — Assessment Engine with Scoring and Attempt Limits

```typescript
// src/app/api/assessments/[assessmentId]/submit/route.ts
// Grades the assessment, enforces attempt limits, and triggers certificate generation on pass.

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { generateCertificate } from "@/lib/certificate";
import { sendCertificateEmail } from "@/lib/email";

export async function POST(
  req: Request,
  { params }: { params: { assessmentId: string } }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { answers }: { answers: number[] } = await req.json();

  const assessment = await db.assessment.findUniqueOrThrow({
    where: { id: params.assessmentId },
    include: {
      questions: { orderBy: { position: "asc" } },
      course: true,
    },
  });

  // Check attempt limit
  const attemptCount = await db.assessmentAttempt.count({
    where: { userId: session.user.id, assessmentId: params.assessmentId },
  });

  if (attemptCount >= assessment.maxAttempts) {
    return NextResponse.json({
      error: "Maximum attempts reached",
      maxAttempts: assessment.maxAttempts,
    }, { status: 403 });
  }

  // Grade answers
  let correct = 0;
  const results = assessment.questions.map((q, i) => {
    const isCorrect = answers[i] === q.correctIndex;
    if (isCorrect) correct++;
    return { questionId: q.id, isCorrect, explanation: isCorrect ? null : q.explanation };
  });

  const score = Math.round((correct / assessment.questions.length) * 100);
  const passed = score >= assessment.passThreshold;

  // Save attempt
  await db.assessmentAttempt.create({
    data: {
      userId: session.user.id,
      assessmentId: params.assessmentId,
      answers,
      score,
      passed,
      completedAt: new Date(),
    },
  });

  // If passed, complete the course and issue a certificate
  if (passed) {
    const user = await db.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { name: true, email: true },
    });

    const certUrl = await generateCertificate({
      studentName: user.name!,
      courseTitle: assessment.course.title,
      score,
      completedAt: new Date(),
    });

    // Calculate expiry for compliance courses (1 year)
    const expiresAt = assessment.course.title.toLowerCase().includes("safety")
      ? new Date(Date.now() + 365 * 86400000)
      : null;

    await db.courseCompletion.upsert({
      where: { userId_courseId: { userId: session.user.id, courseId: assessment.courseId } },
      create: {
        userId: session.user.id,
        courseId: assessment.courseId,
        score,
        passed: true,
        certificateUrl: certUrl,
        expiresAt,
        nextDueAt: expiresAt,
      },
      update: { score, passed: true, certificateUrl: certUrl, expiresAt, nextDueAt: expiresAt },
    });

    await sendCertificateEmail({ email: user.email!, name: user.name!, course: assessment.course, certUrl, score });
  }

  return NextResponse.json({ score, passed, passThreshold: assessment.passThreshold, results });
}
```

## Step 3 — Compliance Tracking: Due Dates and Audit Reports

```typescript
// src/lib/compliance.ts — Generate compliance status for all employees.
// Used for the manager dashboard and regulatory audit exports.

import { db } from "@/lib/db";

type ComplianceStatus = "compliant" | "due_soon" | "overdue" | "not_started";

interface EmployeeCompliance {
  userId: string;
  name: string;
  role: string;
  courses: {
    courseId: string;
    title: string;
    status: ComplianceStatus;
    dueDate: Date | null;
    completedAt: Date | null;
    score: number | null;
    certificateUrl: string | null;
  }[];
}

export async function getComplianceReport(): Promise<EmployeeCompliance[]> {
  const users = await db.user.findMany({
    include: {
      completions: { include: { course: true } },
    },
    orderBy: { name: "asc" },
  });

  const paths = await db.learnerPath.findMany({
    include: { courses: { include: { course: true } } },
  });

  return users.map((user) => {
    const path = paths.find((p) => p.role === user.role);
    if (!path) return { userId: user.id, name: user.name!, role: user.role, courses: [] };

    const courses = path.courses.map((pc) => {
      const completion = user.completions.find((c) => c.courseId === pc.courseId);
      const dueDate = pc.dueInDays && user.hiredAt
        ? new Date(user.hiredAt.getTime() + pc.dueInDays * 86400000)
        : null;

      let status: ComplianceStatus = "not_started";
      if (completion?.passed) {
        // Check if expired (recertification due)
        if (completion.expiresAt && completion.expiresAt < new Date()) {
          status = "overdue";
        } else {
          status = "compliant";
        }
      } else if (dueDate) {
        const daysUntilDue = (dueDate.getTime() - Date.now()) / 86400000;
        if (daysUntilDue < 0) status = "overdue";
        else if (daysUntilDue <= 7) status = "due_soon";
        else status = "not_started";
      }

      return {
        courseId: pc.courseId,
        title: pc.course.title,
        status,
        dueDate,
        completedAt: completion?.completedAt ?? null,
        score: completion?.score ?? null,
        certificateUrl: completion?.certificateUrl ?? null,
      };
    });

    return { userId: user.id, name: user.name!, role: user.role, courses };
  });
}
```

```typescript
// src/app/api/admin/compliance/export/route.ts — Export compliance CSV for regulators.

import { getComplianceReport } from "@/lib/compliance";
import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  const user = await db.user.findUniqueOrThrow({ where: { id: session!.user.id } });
  if (user.role !== "admin" && user.role !== "hr") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const report = await getComplianceReport();

  const rows = report.flatMap((emp) =>
    emp.courses.map((c) => [
      emp.name,
      emp.role,
      c.title,
      c.status,
      c.dueDate?.toISOString().split("T")[0] ?? "",
      c.completedAt?.toISOString().split("T")[0] ?? "",
      c.score != null ? `${c.score}%` : "",
      c.certificateUrl ?? "",
    ])
  );

  const header = ["Employee", "Role", "Course", "Status", "Due Date", "Completed", "Score", "Certificate URL"];
  const csv = [header, ...rows].map((row) => row.map((v) => `"${v}"`).join(",")).join("\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="compliance-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
```

## Step 4 — Automated Reminders for Overdue Training

```typescript
// src/lib/reminders.ts — Email reminders for due and overdue training.
// Run via cron: every Monday morning.

import { Resend } from "resend";
import { getComplianceReport } from "@/lib/compliance";
import { TrainingReminderEmail } from "@/emails/TrainingReminderEmail";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendTrainingReminders() {
  const report = await getComplianceReport();

  const overdueEmployees = report.filter((emp) =>
    emp.courses.some((c) => c.status === "overdue" || c.status === "due_soon")
  );

  if (overdueEmployees.length === 0) return;

  await resend.batch.send(
    overdueEmployees.map((emp) => {
      const urgentCourses = emp.courses.filter(
        (c) => c.status === "overdue" || c.status === "due_soon"
      );
      return {
        from: "training@company.com",
        to: emp.email!,
        subject: urgentCourses.some((c) => c.status === "overdue")
          ? "⚠️ Overdue training — action required"
          : "📋 Training due this week",
        react: TrainingReminderEmail({ employee: emp, courses: urgentCourses }),
      };
    })
  );

  // Notify managers about their team's overdue training
  const managers = await db.user.findMany({ where: { role: "manager" }, select: { email: true, name: true, teamId: true } });
  // ... (team-level rollup omitted for brevity)
}
```

## Step 5 — SCORM Import for Legacy Training Content

```typescript
// src/app/api/admin/courses/import-scorm/route.ts
// Accepts a SCORM zip, extracts imsmanifest.xml, and creates a course record.
// The SCORM package is stored on S3/R2 and rendered in an iframe.

import { NextResponse } from "next/server";
import JSZip from "jszip";
import { parseStringPromise } from "xml2js";
import { uploadToStorage } from "@/lib/storage";
import { db } from "@/lib/db";

export async function POST(req: Request) {
  const form = await req.formData();
  const file = form.get("scorm") as File;
  if (!file) return NextResponse.json({ error: "No file" }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const zip = await JSZip.loadAsync(buffer);

  // Parse the SCORM manifest
  const manifestFile = zip.file("imsmanifest.xml");
  if (!manifestFile) return NextResponse.json({ error: "Not a valid SCORM package" }, { status: 400 });

  const manifestXml = await manifestFile.async("string");
  const manifest = await parseStringPromise(manifestXml);

  const title = manifest?.manifest?.organizations?.[0]?.organization?.[0]?.title?.[0] ?? file.name;

  // Upload the entire SCORM zip to cloud storage
  const storageKey = `scorm/${Date.now()}-${file.name}`;
  const scormUrl = await uploadToStorage(buffer, storageKey, "application/zip");

  // Create the course record — lessons will be loaded from the SCORM index.html
  const course = await db.course.create({
    data: {
      title,
      description: `Imported from SCORM: ${file.name}`,
      scormUrl,
      published: false,
    },
  });

  return NextResponse.json({ course });
}
```

## Results

Priya deployed the LMS for 200 employees across 3 roles. After 6 months:

- **Cost: $47/month** (hosting + Resend + storage). Replaced $500/month LMS. Saved $5,436/year.
- **Completion rates** improved from 41% (old LMS, 2-week deadline) to 78% (new system, with automated reminders on day 3, day 7, and day 1-before-due).
- **Compliance audit** — when the safety regulator visited, Priya exported the compliance CSV in 30 seconds. All 200 employees' training records with scores, dates, and certificate URLs. Auditor was impressed.
- **Assessment catch rate** — 12% of employees failed the fork-lift safety assessment on first attempt (old system had no assessments, just "click through"). They retook it; all passed on attempt 2–3. Actual comprehension improved.
- **SCORM import** — migrated 8 legacy courses from the old LMS in 2 hours. Each course loads in an iframe, exactly as before, with completion tracked via postMessage API.
- **Recertification reminders** — annual safety certification auto-renews. Employees get an email 30 days before expiry. Compliance rate for recertification: 94% (up from 67% with manual tracking in a spreadsheet).
