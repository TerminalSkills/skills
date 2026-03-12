---
title: Launch a Full-Stack SaaS MVP in a Weekend
slug: launch-fullstack-saas-mvp-in-a-weekend
description: Build and ship a complete SaaS MVP using the modern TypeScript stack — Next.js with shadcn/ui for the frontend, tRPC for type-safe APIs, Prisma + Neon for the database, Auth.js for authentication, Lemon Squeezy for payments, Tailwind CSS for styling, Vitest for testing, and Zod for validation — going from zero to deployed product with auth, billing, and tests in 48 hours.
skills: [shadcn-ui, trpc, prisma, authjs, lemon-squeezy, tailwindcss, vitest, zod, hono]
category: Frontend Development
tags: [saas, fullstack, typescript, nextjs, mvp, startup, payments, auth]
---

# Launch a Full-Stack SaaS MVP in a Weekend

Dani has validated a SaaS idea through customer interviews: a team feedback tool where managers collect weekly check-ins from their team and get AI-generated summaries. She has 48 hours to build an MVP with authentication, a dashboard, team management, weekly check-in forms, and a payment wall for the Pro plan. No boilerplate — just the fastest path from idea to production.

## Hour 1-4: Project Setup and Auth

```bash
# Scaffold Next.js with shadcn/ui
npx create-next-app@latest feedback-app --typescript --tailwind --app --src-dir
cd feedback-app
npx shadcn@latest init
npx shadcn@latest add button card dialog form input table tabs avatar dropdown-menu toast badge

# Install the stack
npm install @trpc/server @trpc/client @trpc/react-query @tanstack/react-query
npm install @prisma/client next-auth@beta @auth/prisma-adapter
npm install @lemonsqueezy/lemonsqueezy.js zod
npm install -D prisma vitest @vitest/coverage-v8
```

```prisma
// prisma/schema.prisma — Data model
model User {
  id            String    @id @default(cuid())
  name          String?
  email         String    @unique
  emailVerified DateTime?
  image         String?
  role          String    @default("member")
  plan          String    @default("free")
  lsCustomerId  String?
  lsSubId       String?
  team          Team?     @relation("TeamOwner")
  memberships   TeamMember[]
  checkIns      CheckIn[]
  accounts      Account[]
  sessions      Session[]
}

model Team {
  id      String       @id @default(cuid())
  name    String
  owner   User         @relation("TeamOwner", fields: [ownerId], references: [id])
  ownerId String       @unique
  members TeamMember[]
}

model TeamMember {
  id     String @id @default(cuid())
  user   User   @relation(fields: [userId], references: [id])
  userId String
  team   Team   @relation(fields: [teamId], references: [id])
  teamId String
  role   String @default("member")
  @@unique([userId, teamId])
}

model CheckIn {
  id        String   @id @default(cuid())
  user      User     @relation(fields: [userId], references: [id])
  userId    String
  wins      String
  blockers  String
  plans     String
  mood      Int                            // 1-5
  week      String                         // "2026-W11"
  createdAt DateTime @default(now())
  @@unique([userId, week])
}
```

## Hour 5-8: tRPC API Layer

```typescript
// server/trpc.ts — Type-safe API
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";

const t = initTRPC.context<Context>().create();

export const protectedProcedure = t.procedure.use(async ({ ctx, next }) => {
  if (!ctx.session?.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { user: ctx.session.user } });
});

const proProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  if (ctx.user.plan !== "pro") throw new TRPCError({ code: "FORBIDDEN", message: "Pro plan required" });
  return next();
});

// server/routers/checkins.ts
export const checkInsRouter = router({
  submit: protectedProcedure
    .input(z.object({
      wins: z.string().min(1, "Share at least one win"),
      blockers: z.string(),
      plans: z.string().min(1, "Share your plans"),
      mood: z.number().min(1).max(5),
    }))
    .mutation(async ({ input, ctx }) => {
      const week = getISOWeek(new Date());
      return ctx.db.checkIn.upsert({
        where: { userId_week: { userId: ctx.user.id, week } },
        create: { ...input, userId: ctx.user.id, week },
        update: input,
      });
    }),

  teamSummary: proProcedure                // Pro-only: AI summaries
    .input(z.object({ week: z.string() }))
    .query(async ({ input, ctx }) => {
      const checkIns = await ctx.db.checkIn.findMany({
        where: { week: input.week, user: { memberships: { some: { teamId: ctx.user.team!.id } } } },
        include: { user: { select: { name: true } } },
      });

      // AI summary via OpenRouter
      const summary = await generateSummary(checkIns);
      return { checkIns, summary };
    }),
});
```

## Hour 9-14: Dashboard UI with shadcn

```tsx
// app/dashboard/page.tsx
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/utils/trpc";

export default function Dashboard() {
  const { data: team } = trpc.teams.getMyTeam.useQuery();
  const { data: stats } = trpc.checkins.weeklyStats.useQuery();
  const { data: summary } = trpc.checkins.teamSummary.useQuery(
    { week: getCurrentWeek() },
    { enabled: !!team },
  );

  return (
    <div className="space-y-6 p-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Team Members</CardTitle></CardHeader>
          <CardContent><p className="text-3xl font-bold">{stats?.totalMembers}</p></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Check-ins This Week</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.submittedThisWeek}/{stats?.totalMembers}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-gray-500">Team Mood</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{stats?.avgMood?.toFixed(1)} / 5</p>
            <Badge variant={stats?.avgMood > 3.5 ? "default" : "destructive"}>
              {stats?.avgMood > 3.5 ? "Healthy" : "Needs Attention"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {summary && (
        <Card>
          <CardHeader><CardTitle>AI Weekly Summary</CardTitle></CardHeader>
          <CardContent className="prose dark:prose-invert">{summary.summary}</CardContent>
        </Card>
      )}
    </div>
  );
}
```

## Hour 15-16: Tests

```typescript
// __tests__/checkins.test.ts
import { describe, it, expect } from "vitest";

describe("check-in validation", () => {
  const schema = checkInSchema;

  it("accepts valid check-in", () => {
    const result = schema.safeParse({
      wins: "Shipped the auth flow",
      blockers: "Waiting on design review",
      plans: "Build the dashboard",
      mood: 4,
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty wins", () => {
    const result = schema.safeParse({ wins: "", blockers: "", plans: "Test", mood: 3 });
    expect(result.success).toBe(false);
  });

  it("rejects mood out of range", () => {
    const result = schema.safeParse({ wins: "Win", blockers: "", plans: "Plan", mood: 6 });
    expect(result.success).toBe(false);
  });
});
```

## Results

Dani ships the MVP in 47 hours. Within 2 weeks:

- **15 teams signed up** during beta; 8 converted to Pro ($29/mo) after free trial
- **Type safety**: tRPC caught 6 API contract mismatches during development; zero runtime type errors
- **Auth**: Google + GitHub sign-in; 90% of users chose Google OAuth (one-click)
- **Payments**: Lemon Squeezy handles EU VAT automatically; Dani receives payouts without tax complexity
- **Testing**: 42 tests with 85% coverage; caught 3 bugs before launch via Vitest
- **Performance**: Full page load in 1.2s (shadcn/ui + Tailwind = 12KB CSS); Lighthouse score 96
- **Development speed**: tRPC + Prisma + Zod = change schema → types flow everywhere → zero boilerplate
- **MRR**: $232 after 2 weeks; validation that the problem is real and teams will pay to solve it
