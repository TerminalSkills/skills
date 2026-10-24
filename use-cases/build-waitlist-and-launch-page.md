---
title: Build a Waitlist and Launch Page with Viral Referral
slug: build-waitlist-and-launch-page
description: "Launch a viral waitlist page before your product is ready - email capture, referral-powered position climbing, double opt-in confirmation, and invite emails for early access."
skills: [resend, prisma, nextjs]
category: growth
tags: [waitlist, launch, referral, email, nextjs, saas, viral]
---

# Build a Waitlist and Launch Page with Viral Referral

## The Problem

You have a SaaS idea and want to validate demand before writing the product. A plain "collect emails" waitlist leaves visitors passive; a referral-powered one turns every signup into a recruiter. Each person gets a unique link, every confirmed referral moves them up, and the most engaged get access first.

## The Solution

Use **Next.js** (App Router) for the pages and route handlers, **Prisma 7** for entries and the referral tree, and **Resend** for the confirmation and invite emails. Three design choices keep it honest:

- **Position is computed, not stored.** A stored number reduced by 5 per referral gives duplicate positions and never shifts anyone else.
- **Referrals count only after the referred person confirms**, so fake addresses earn nothing.
- **The same response for new and known emails**, so the form cannot reveal who is on the list.

## Step-by-Step Walkthrough

### Step 1: Set up the project and schema

```bash
npx create-next-app@latest waitlist --ts --tailwind --app && cd waitlist
npm install @prisma/client@7 @prisma/adapter-better-sqlite3@7 better-sqlite3 dotenv resend
npm install -D prisma@7 tsx @types/better-sqlite3
```

Prisma 7 differs from older tutorials: the connection URL lives in `prisma.config.ts`, the generator is `prisma-client` with a required `output`, and `PrismaClient` needs a driver adapter. SQLite keeps the example self-contained; for production swap in `@prisma/adapter-pg` and the `postgresql` provider (the `prisma` skill covers both). Add `serverExternalPackages: ["better-sqlite3"]` to `next.config.ts`.

Create `prisma.config.ts` with `import "dotenv/config"`, then `export default defineConfig({ schema: "prisma/schema.prisma", datasource: { url: env("DATABASE_URL") } })` (`defineConfig` and `env` come from `prisma/config`).

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../src/generated/prisma"
}

datasource db {
  provider = "sqlite"
}

model WaitlistEntry {
  id            String          @id @default(cuid())
  email         String          @unique
  referralCode  String          @unique @default(cuid())
  referredById  String?
  referredBy    WaitlistEntry?  @relation("Referrals", fields: [referredById], references: [id])
  referrals     WaitlistEntry[] @relation("Referrals")
  referralCount Int             @default(0) // confirmed referrals only
  confirmToken  String?         @unique
  confirmedAt   DateTime?
  invitedAt     DateTime?
  createdAt     DateTime        @default(now())

  @@index([confirmedAt, referralCount, createdAt])
}
```

Set `DATABASE_URL="file:./dev.db"` in `.env`, then run `npx prisma migrate dev --name init-waitlist && npx prisma generate` (`migrate dev` no longer generates the client).

```typescript
// lib/prisma.ts
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const adapter = new PrismaBetterSqlite3({ url: process.env.DATABASE_URL ?? "file:./dev.db" });
const g = globalThis as unknown as { prisma?: PrismaClient }; // survives dev hot reloads
export const prisma = g.prisma ?? (g.prisma = new PrismaClient({ adapter }));
```

### Step 2: Waitlist logic (join, confirm, rank)

```typescript
// lib/waitlist.ts
import { randomBytes } from "node:crypto";
import { prisma } from "./prisma";
import { sendConfirmationEmail } from "./email";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export async function join(email: string, ref?: string | null) {
  email = email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new Error("invalid email");
  const existing = await prisma.waitlistEntry.findUnique({ where: { email } });
  if (existing?.confirmedAt) return; // same response either way: do not reveal who is on the list
  const referrer = ref ? await prisma.waitlistEntry.findUnique({ where: { referralCode: ref } }) : null;
  const token = randomBytes(32).toString("hex");
  await prisma.waitlistEntry.upsert({
    where: { email },
    update: { confirmToken: token },
    create: { email, confirmToken: token, referredById: referrer?.id },
  });
  await sendConfirmationEmail(email, token);
}
// Credits the referrer only now: unconfirmed signups with made-up addresses earn nothing.
export async function confirm(token: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.waitlistEntry.findUnique({ where: { confirmToken: token } });
    if (!entry) return null;
    const confirmed = await tx.waitlistEntry.update({ where: { id: entry.id }, data: { confirmedAt: new Date(), confirmToken: null } });
    if (entry.referredById) {
      await tx.waitlistEntry.update({ where: { id: entry.referredById }, data: { referralCount: { increment: 1 } } });
    }
    return confirmed;
  });
}
// Rank = confirmed entries with more referrals, or equal referrals and an earlier signup, plus one.
export async function status(code: string) {
  const me = await prisma.waitlistEntry.findUnique({ where: { referralCode: code } });
  if (!me?.confirmedAt) return null;
  const ahead = await prisma.waitlistEntry.count({ where: { confirmedAt: { not: null }, OR: [
    { referralCount: { gt: me.referralCount } },
    { referralCount: me.referralCount, createdAt: { lt: me.createdAt } },
  ] } });
  return { position: ahead + 1, referrals: me.referralCount, code: me.referralCode };
}
```

### Step 3: Email with Resend

Verify a sending domain in the Resend dashboard (SPF and DKIM) and set `RESEND_API_KEY`, `MAIL_FROM` and `APP_URL`. The Node SDK returns `{ data, error }` instead of throwing, so check `error`. A batch request carries up to 100 emails and counts as one API request against the rate limit. The free plan allows 100 emails a day and 3,000 a month, which caps how many invites you can send per day.

```typescript
// lib/email.ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.MAIL_FROM!; // e.g. "YourApp <waitlist@mail.yourdomain.com>", a domain verified in Resend
export async function sendConfirmationEmail(to: string, token: string) {
  const confirmUrl = `${process.env.APP_URL}/api/waitlist/confirm?token=${token}`;
  const { error } = await resend.emails.send({ from: FROM, to, subject: "Confirm your spot on the waitlist",
    html: `<p>Confirm your email to lock in your spot: <a href="${confirmUrl}">Confirm</a></p>` });
  if (error) throw new Error(`Resend: ${error.message}`);
}
export async function sendInviteBatch(entries: { email: string; referralCode: string }[]) {
  const { error } = await resend.batch.send(
    entries.map((e) => ({ from: FROM, to: e.email, subject: "Your early access is ready",
      html: `<p>You're in. <a href="${process.env.APP_URL}/signup?invite=${e.referralCode}">Claim your early access</a>.</p>` })),
  );
  if (error) throw new Error(`Resend: ${error.message}`);
}
```

### Step 4: Route handlers

```typescript
// app/api/waitlist/join/route.ts
import { NextResponse } from "next/server";
import { join } from "@/lib/waitlist";

export async function POST(req: Request) {
  const { email, ref } = await req.json().catch(() => ({}));
  try {
    await join(String(email ?? ""), typeof ref === "string" ? ref : null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const bad = e instanceof Error && e.message === "invalid email";
    return NextResponse.json({ error: bad ? "invalid email" : "try again later" }, { status: bad ? 400 : 502 });
  }
}
```

```typescript
// app/api/waitlist/confirm/route.ts
import { NextResponse } from "next/server";
import { confirm } from "@/lib/waitlist";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  const entry = token ? await confirm(token) : null;
  return NextResponse.redirect(new URL(entry ? `/waitlist/${entry.referralCode}` : "/?invalid=1", process.env.APP_URL));
}
```

Some mail scanners open every link in an email and would confirm the address for the person; if that matters, make the link open a page with a **Confirm** button that submits a POST. Before launch, rate-limit `/api/waitlist/join` per IP and add a bot check such as Cloudflare Turnstile: it sends mail to any address a stranger types.

### Step 5: Landing page and share page

In Next.js 16 `searchParams` and `params` are Promises. Passing `ref` to the client form as a prop avoids `useSearchParams` and its Suspense boundary; `connection()` reads the live count per request.

```tsx
// app/page.tsx
import { connection } from "next/server";
import { prisma } from "@/lib/prisma";
import WaitlistForm from "@/components/WaitlistForm";

export default async function LandingPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  await connection(); // read the live count on every request instead of at build time
  const { ref } = await searchParams;
  const size = await prisma.waitlistEntry.count({ where: { confirmedAt: { not: null } } });
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="mb-8 text-sm">{size.toLocaleString("en-US")} people are already on the list</p>
      <h1 className="mb-6 text-5xl font-bold">The tool your team has been waiting for</h1>
      <p className="mb-12 text-xl">Join the waitlist for early access and founding pricing.</p>
      <WaitlistForm refCode={ref} />
    </main>
  );
}
```

```tsx
// components/WaitlistForm.tsx
"use client";
import { useState } from "react";

export default function WaitlistForm({ refCode }: { refCode?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState("loading");
    const res = await fetch("/api/waitlist/join", { method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, ref: refCode }) });
    setState(res.ok ? "done" : "error");
  }
  if (state === "done") return <p className="text-xl font-semibold">Check your inbox to confirm your spot.</p>;
  return (
    <form onSubmit={submit} className="mx-auto flex max-w-md gap-3">
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="you@company.com" className="flex-1 rounded-lg border px-4 py-3" />
      <button disabled={state === "loading"} className="rounded-lg bg-indigo-600 px-6 py-3 text-white disabled:opacity-50">
        {state === "loading" ? "Joining..." : "Join waitlist"}
      </button>
      {state === "error" && <span role="alert">Something went wrong, try again.</span>}
    </form>
  );
}
```

The status page computes the position on the server from the referral code, not from editable query parameters.

```tsx
// app/waitlist/[code]/page.tsx
import { notFound } from "next/navigation";
import { status } from "@/lib/waitlist";

export default async function WaitlistStatus({ params }: { params: Promise<{ code: string }> }) {
  const s = await status((await params).code);
  if (!s) notFound();
  const link = `${process.env.APP_URL}/?ref=${s.code}`;
  const text = encodeURIComponent(`I just joined the waitlist - join with my link: ${link}`);
  return (
    <div className="mx-auto max-w-lg px-6 py-16 text-center">
      <h1 className="mb-3 text-3xl font-bold">You're confirmed</h1>
      <p className="mb-6">You are <strong>#{s.position}</strong> with <strong>{s.referrals}</strong> confirmed referrals.</p>
      <p className="mb-6 break-all text-sm">Your referral link: {link}</p>
      <a href={`https://x.com/intent/post?text=${text}`} target="_blank" rel="noopener noreferrer">Share on X</a>
    </div>
  );
}
```

### Step 6: Send launch invites

Invite the most-referred, earliest members first: `npx tsx scripts/send-invites.ts 50`.

```typescript
// scripts/send-invites.ts
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { sendInviteBatch } from "../lib/email";

const limit = Number(process.argv[2] ?? 50); // free plan: 100 emails a day, so start small
const entries = await prisma.waitlistEntry.findMany({
  where: { confirmedAt: { not: null }, invitedAt: null },
  orderBy: [{ referralCount: "desc" }, { createdAt: "asc" }],
  take: Math.min(limit, 100), // one batch = up to 100 emails
});
if (entries.length) {
  await sendInviteBatch(entries);
  await prisma.waitlistEntry.updateMany({ where: { id: { in: entries.map((e) => e.id) } }, data: { invitedAt: new Date() } });
}
console.log(`Invited ${entries.length}`);
```

## Real-World Example

A solo founder building a B2B analytics tool puts this waitlist up on a Monday and shares it with her newsletter and two communities. The status page shows each member their rank, and the few people who share most climb because their referrals count once friends confirm. At launch she runs the invite script for the top 50, then sends daily batches within her Resend plan's limit, and the first group's replies shape the product.

## Related Skills

- [resend](../skills/resend/) - Confirmation and invite emails, batch sending
- [prisma](../skills/prisma/) - Prisma 7 schema, adapters and migrations
- [nextjs](../skills/nextjs/) - App Router pages, route handlers and server components
