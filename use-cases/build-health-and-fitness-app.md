---
title: "Build a Health and Fitness Tracking App"
description: "Build a custom fitness app for coaches and clients — workout logging, nutrition tracking, AI coaching recommendations, progress photos, and wearable sync."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "12 hours"
tags: [fitness, health, workouts, nutrition, ai-coach, wearables, mobile]
---

# Build a Health and Fitness Tracking App

## The Problem

You're a fitness coach running a hybrid training business. Your clients use three different apps (one for workouts, one for macros, one for check-ins) and nothing talks to each other. You want one platform where workouts, nutrition, progress photos and your AI coaching layer live together.

## The Solution

A Next.js (App Router) app with PostgreSQL. The **prisma** skill covers the data model and queries, and the **anthropic-sdk** skill covers the AI coach that reads a client's history and suggests the next workout. The app logs workouts, tracks nutrition against a calorie target, stores progress photos for before/after comparison, and imports wearable data (last section).

## Step-by-Step Walkthrough

### Step 1: Set up Prisma 7 and the schema

Prisma 7 needs a driver adapter, a `prisma.config.ts` that holds the database URL, and the `prisma-client` generator with an explicit `output` folder. Check the installed versions with `npx prisma -v`.

```bash
npm install @prisma/client @prisma/adapter-pg pg @anthropic-ai/sdk zod && npm install -D prisma @types/pg
npx prisma init --datasource-provider postgresql
```

```typescript
// prisma.config.ts
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: env('DATABASE_URL') },
})
```

Point `DATABASE_URL` at a database bound to `127.0.0.1` for development. Replace the generated schema with the model below, then run `npx prisma migrate dev --name init` (it also generates the client into `generated/prisma`; add that folder to `.gitignore`).

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}
datasource db {
  provider = "postgresql"
}

model User {
  id             String          @id @default(cuid())
  email          String          @unique
  name           String
  profile        UserProfile?
  workouts       WorkoutLog[]
  foodEntries    FoodEntry[]
  progressPhotos ProgressPhoto[]
}

model UserProfile {
  id            String    @id @default(cuid())
  userId        String    @unique
  user          User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  sex           String?   // male | female, used by the Mifflin-St Jeor constant
  heightCm      Float?
  weightKg      Float?
  birthDate     DateTime?
  fitnessGoal   String?   // lose_fat | build_muscle | maintain | performance
  activityLevel String?   // sedentary | light | moderate | active | very_active
}

model WorkoutLog {
  id        String        @id @default(cuid())
  userId    String
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  name      String
  date      DateTime
  duration  Int?          // minutes
  sets      ExerciseSet[]
}

model ExerciseSet {
  id           String     @id @default(cuid())
  workoutId    String
  workout      WorkoutLog @relation(fields: [workoutId], references: [id], onDelete: Cascade)
  exerciseName String
  setNumber    Int
  reps         Int?
  weightKg     Float?
  rpe          Int?       // rate of perceived exertion, 1-10
}

model FoodEntry {
  id       String   @id @default(cuid())
  userId   String
  user     User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  date     DateTime @db.Date
  mealType String   // breakfast | lunch | dinner | snack
  name     String
  grams    Float
  calories Float
  proteinG Float
  carbsG   Float
  fatG     Float
}

model ProgressPhoto {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  url       String   // private object-storage key or signed URL, never a public listing
  date      DateTime
  pose      String   @default("front") // front | back | side
  weightKg  Float?
}
```

```typescript
// lib/db.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
```

### Step 2: Take the user from the session, never from the request

Every route reads the user id from your auth session. A `userId` in the body or query string would let any client read or write another client's data. Create `lib/session.ts` exporting `requireUserId(req: Request): Promise<string | null>` that returns the signed-in user's id from your auth library (Auth.js, Clerk, your own JWT) or `null`. Do not ship a stub that trusts a header.

### Step 3: Workout logging API

The body is validated with zod and sets are stored per exercise. Personal records need no extra table: `prisma.exerciseSet.groupBy` with `_max: { weightKg: true }` per exercise answers "what is my best lift".

```typescript
// app/api/workouts/route.ts
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/session'

const body = z.object({
  name: z.string().min(1).max(120),
  duration: z.number().int().positive().max(1440).optional(),
  exercises: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        sets: z.array(
          z.object({ reps: z.number().int().positive(), weight: z.number().min(0), rpe: z.number().int().min(1).max(10).optional() }),
        ),
      }),
    )
    .min(1),
})

export async function POST(req: Request) {
  const userId = await requireUserId(req)
  if (!userId) return new Response('Unauthorized', { status: 401 })
  const parsed = body.safeParse(await req.json())
  if (!parsed.success) return Response.json(parsed.error.flatten(), { status: 400 })
  const { name, duration, exercises } = parsed.data

  const workout = await prisma.workoutLog.create({
    data: {
      userId,
      name,
      date: new Date(),
      duration,
      sets: {
        create: exercises.flatMap((ex) =>
          ex.sets.map((set, i) => ({
            exerciseName: ex.name,
            setNumber: i + 1,
            reps: set.reps,
            weightKg: set.weight,
            rpe: set.rpe,
          })),
        ),
      },
    },
  })

  return Response.json(workout, { status: 201 })
}
```

### Step 4: Nutrition targets

Mifflin-St Jeor needs the client's sex (a constant of +5 or -161), so the profile stores it. The macro split is a starting point for a coach to adjust, not medical advice.

```typescript
// lib/nutrition.ts
import { prisma } from './db'

type Profile = { sex: 'male' | 'female'; weightKg: number; heightCm: number; birthDate: Date; activityLevel: string; fitnessGoal: string }

export function calculateTDEE(p: Profile) {
  // Mifflin-St Jeor: +5 for men, -161 for women
  const bmr = 10 * p.weightKg + 6.25 * p.heightCm - 5 * Math.floor((Date.now() - p.birthDate.getTime()) / 31_557_600_000) + (p.sex === 'male' ? 5 : -161)
  const activity: Record<string, number> = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 }
  const tdee = bmr * (activity[p.activityLevel] ?? 1.55)
  const goalDelta: Record<string, number> = { lose_fat: -500, build_muscle: 300, maintain: 0, performance: 200 }
  const targetCalories = Math.round(tdee + (goalDelta[p.fitnessGoal] ?? 0))
  const protein = Math.round(p.weightKg * 2.0)          // 2 g per kg of body weight
  const fat = Math.round((targetCalories * 0.25) / 9)   // 25% of calories
  const carbs = Math.max(0, Math.round((targetCalories - protein * 4 - fat * 9) / 4))
  return { tdee: Math.round(tdee), targetCalories, macros: { protein, fat, carbs } }
}
export async function getDailyNutrition(userId: string, date: Date) {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const t = await prisma.foodEntry.aggregate({
    where: { userId, date: day },
    _sum: { calories: true, proteinG: true, carbsG: true, fatG: true },
  })
  return {
    calories: t._sum.calories ?? 0,
    protein: t._sum.proteinG ?? 0,
    carbs: t._sum.carbsG ?? 0,
    fat: t._sum.fatG ?? 0,
  }
}
```

### Step 5: AI coach with Claude

The Anthropic SDK reads `ANTHROPIC_API_KEY` from the environment. Keep the key on the server, call this from a route handler that checks the session, and rate-limit it per user, because each call costs money. Model IDs change: check the current list at <https://platform.claude.com/docs/en/about-claude/models/overview> and keep the ID in one constant or environment variable.

```typescript
// lib/ai-coach.ts
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'
import { getDailyNutrition } from './nutrition'

const client = new Anthropic() // reads ANTHROPIC_API_KEY from the environment

export async function generateWorkoutRecommendation(userId: string): Promise<string> {
  const [profile, recent, today] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.workoutLog.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: 10, include: { sets: true } }),
    getDailyNutrition(userId, new Date()),
  ])

  const history = recent
    .map((w) => `${w.name} (${w.date.toDateString()}): ` + w.sets.map((s) => `${s.exerciseName} ${s.reps}x${s.weightKg}kg`).join('; '))
    .join('\n')

  const response = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 1024,
    system: 'You are a strength coach. For pain, injury or medical conditions, tell the client to see a professional.',
    messages: [
      {
        role: 'user',
        content: `Goal: ${profile?.fitnessGoal ?? 'unknown'}
Activity level: ${profile?.activityLevel ?? 'unknown'}
Weight: ${profile?.weightKg ?? '?'} kg

Last 10 workouts:
${history || 'none yet'}

Today so far: ${Math.round(today.calories)} kcal, ${Math.round(today.protein)} g protein.

Recommend today's workout: name, exercises with sets, reps and weight, estimated duration, one coaching tip.`,
      },
    ],
  })

  return response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n')
}
```

### Step 6: Progress photos

Photos are sensitive. Store them in a private bucket, save only the object key in `ProgressPhoto.url`, and hand the browser short-lived signed URLs. The comparison view needs two queries per pose, the oldest and the newest photo of the signed-in user:

```typescript
const where = { userId, pose }
const [before, after] = await Promise.all([
  prisma.progressPhoto.findFirst({ where, orderBy: { date: 'asc' } }),
  prisma.progressPhoto.findFirst({ where, orderBy: { date: 'desc' } }),
])
```

## Real-World Example

A coach with 30 clients replaces three apps with this one. Before each check-in the coach opens the AI recommendation as a draft to edit, not to send as is, and the photo comparison replaces a shared folder of screenshots.

## Wearable data

- **Apple Health**: HealthKit is an on-device framework with no web API, so a small iOS app reads the data with the user's permission and posts it to your own authenticated endpoint.
- **Android**: Health Connect is the on-device store for Android apps. The Google Fit APIs, including the REST API, are deprecated and supported only until the end of 2026; for cloud integrations Google points developers to the Google Health API (see the Fit migration guide at developers.google.com/fit).

## Related Skills

- [anthropic-sdk](/skills/anthropic-sdk) - Messages API and the AI coach
- [prisma](/skills/prisma) - schema, migrations and queries
