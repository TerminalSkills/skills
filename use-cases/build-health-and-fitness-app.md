---
title: "Build a Health and Fitness Tracking App"
description: "Build a custom fitness app for coaches and clients — workout logging, nutrition tracking, AI coaching recommendations, progress photos, and wearable sync."
skills: [anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "12 hours"
tags: [fitness, health, workouts, nutrition, ai-coach, wearables, mobile]
---

# Build a Health and Fitness Tracking App

You're a fitness coach running a hybrid training business. Your clients use 3 different apps (one for workouts, one for macros, one for check-ins) and nothing talks to each other. Build one cohesive platform where everything lives — workouts, nutrition, progress, and your AI coaching layer.

## What You'll Build

- Workout logging with exercise library: sets, reps, weight, duration
- Nutrition tracking: calories, macros, meal logging with a food database
- Progress photos with side-by-side comparison view
- AI coach: generate personalized workout recommendations via Claude
- Wearable sync: Apple Health / Google Fit data import

## Schema

```typescript
// prisma/schema.prisma
model User {
  id           String    @id @default(cuid())
  email        String    @unique
  name         String
  coachId      String?
  coach        User?     @relation("coaching", fields: [coachId], references: [id])
  clients      User[]    @relation("coaching")
  profile      UserProfile?
  workouts     WorkoutLog[]
  mealLogs     MealLog[]
  progressPhotos ProgressPhoto[]
}

model UserProfile {
  id           String  @id @default(cuid())
  userId       String  @unique
  user         User    @relation(fields: [userId], references: [id])
  heightCm     Float?
  weightKg     Float?
  birthDate    DateTime?
  fitnessGoal  String? // lose_fat | build_muscle | maintain | performance
  activityLevel String? // sedentary | light | moderate | active | very_active
  tdee         Int?    // computed daily calorie target
}

model WorkoutLog {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  name       String
  date       DateTime
  duration   Int?      // minutes
  notes      String?
  exercises  ExerciseSet[]
  createdAt  DateTime  @default(now())
}

model ExerciseSet {
  id          String     @id @default(cuid())
  workoutId   String
  workout     WorkoutLog @relation(fields: [workoutId], references: [id])
  exerciseName String
  setNumber   Int
  reps        Int?
  weightKg    Float?
  durationSec Int?
  distanceM   Float?
  rpe         Int?       // Rate of Perceived Exertion 1-10
}

model MealLog {
  id         String    @id @default(cuid())
  userId     String
  user       User      @relation(fields: [userId], references: [id])
  date       DateTime  @db.Date
  mealType   String    // breakfast | lunch | dinner | snack
  foods      FoodEntry[]
  createdAt  DateTime  @default(now())
}

model FoodEntry {
  id         String   @id @default(cuid())
  mealLogId  String
  mealLog    MealLog  @relation(fields: [mealLogId], references: [id])
  name       String
  grams      Float
  calories   Float
  proteinG   Float
  carbsG     Float
  fatG       Float
}

model ProgressPhoto {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation(fields: [userId], references: [id])
  url        String
  date       DateTime
  pose       String   @default("front") // front | back | side
  weightKg   Float?
  notes      String?
  createdAt  DateTime @default(now())
}
```

## Workout Logging API

```typescript
// app/api/workouts/route.ts
import { prisma } from '@/lib/db'

export async function POST(req: Request) {
  const { userId, name, exercises, duration, notes } = await req.json()

  const workout = await prisma.workoutLog.create({
    data: {
      userId,
      name,
      date: new Date(),
      duration,
      notes,
      exercises: {
        create: exercises.flatMap((ex: any) =>
          ex.sets.map((set: any, i: number) => ({
            exerciseName: ex.name,
            setNumber: i + 1,
            reps: set.reps,
            weightKg: set.weight,
            rpe: set.rpe,
          }))
        ),
      },
    },
    include: { exercises: true },
  })

  // Update personal records
  await updatePersonalRecords(userId, workout.exercises)

  return Response.json(workout)
}

async function updatePersonalRecords(userId: string, sets: any[]) {
  for (const set of sets) {
    if (!set.reps || !set.weightKg) continue
    // 1RM estimate: Epley formula
    const estimated1RM = set.weightKg * (1 + set.reps / 30)
    // Store as user metadata or separate PR table
    console.log(`PR check: ${set.exerciseName} — estimated 1RM: ${estimated1RM.toFixed(1)}kg`)
  }
}
```

## Nutrition Macros Calculator

```typescript
// lib/nutrition.ts
export function calculateTDEE(profile: {
  weightKg: number
  heightCm: number
  birthDate: Date
  activityLevel: string
  fitnessGoal: string
}) {
  const age = new Date().getFullYear() - profile.birthDate.getFullYear()
  // Mifflin-St Jeor BMR (assuming male for demo; add gender field)
  const bmr = 10 * profile.weightKg + 6.25 * profile.heightCm - 5 * age + 5

  const activityMultipliers: Record<string, number> = {
    sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9,
  }

  const tdee = bmr * (activityMultipliers[profile.activityLevel] || 1.55)

  const goalAdjustments: Record<string, number> = {
    lose_fat: -500, build_muscle: 300, maintain: 0, performance: 200,
  }

  const targetCalories = Math.round(tdee + (goalAdjustments[profile.fitnessGoal] || 0))

  return {
    tdee: Math.round(tdee),
    targetCalories,
    macros: {
      protein: Math.round(profile.weightKg * 2.2), // 1g per lb
      fat: Math.round(targetCalories * 0.25 / 9),
      carbs: Math.round((targetCalories - profile.weightKg * 2.2 * 4 - (targetCalories * 0.25)) / 4),
    },
  }
}

export async function getDailyNutrition(userId: string, date: Date) {
  const meals = await prisma.mealLog.findMany({
    where: { userId, date: { equals: date } },
    include: { foods: true },
  })

  return meals.flatMap(m => m.foods).reduce(
    (totals, food) => ({
      calories: totals.calories + food.calories,
      protein: totals.protein + food.proteinG,
      carbs: totals.carbs + food.carbsG,
      fat: totals.fat + food.fatG,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  )
}
```

## AI Coach with Claude

```typescript
// lib/ai-coach.ts
import Anthropic from '@anthropic-ai/sdk'
import { prisma } from './db'

const client = new Anthropic()

export async function generateWorkoutRecommendation(userId: string) {
  const [profile, recentWorkouts, nutritionAvg] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.workoutLog.findMany({
      where: { userId },
      orderBy: { date: 'desc' },
      take: 10,
      include: { exercises: true },
    }),
    getDailyNutrition(userId, new Date()),
  ])

  const workoutSummary = recentWorkouts
    .map(w => `${w.name} (${w.date.toDateString()}): ${w.exercises.map(e => `${e.exerciseName} ${e.sets || 'x'} ${e.reps || ''}r @ ${e.weightKg || '?'}kg`).join(', ')}`)
    .join('\n')

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: 'You are an expert personal trainer and nutritionist. Give specific, actionable workout recommendations based on the client\'s history and goals.',
    messages: [{
      role: 'user',
      content: `Client profile:
- Goal: ${profile?.fitnessGoal}
- Activity level: ${profile?.activityLevel}
- Weight: ${profile?.weightKg}kg

Recent 10 workouts:
${workoutSummary}

Today's nutrition: ${nutritionAvg.calories} kcal, ${nutritionAvg.protein}g protein

Recommend today's workout. Include: workout name, exercises with sets/reps/weight suggestions, estimated duration, and one coaching tip.`
    }],
  })

  return response.content[0].type === 'text' ? response.content[0].text : ''
}
```

## Progress Photo Comparison

```typescript
// app/api/progress/compare/route.ts
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const userId = searchParams.get('userId')!
  const pose = searchParams.get('pose') || 'front'

  const photos = await prisma.progressPhoto.findMany({
    where: { userId, pose },
    orderBy: { date: 'asc' },
    select: { id: true, url: true, date: true, weightKg: true },
  })

  // Return first and latest for comparison
  if (photos.length < 2) return Response.json({ photos, canCompare: false })

  return Response.json({
    before: photos[0],
    after: photos[photos.length - 1],
    daysBetween: Math.round((photos[photos.length - 1].date.getTime() - photos[0].date.getTime()) / 86400000),
    weightChange: photos[0].weightKg && photos[photos.length - 1].weightKg
      ? photos[photos.length - 1].weightKg! - photos[0].weightKg!
      : null,
    canCompare: true,
  })
}
```

## Key Features Summary

- **Exercise library**: 300+ exercises with muscle group tagging
- **Volume tracking**: weekly volume per muscle group to prevent overtraining
- **AI coach**: personalized recommendations based on history + goals
- **Macro tracking**: TDEE calculator with goal-based calorie targets
- **Progress comparison**: side-by-side photo viewer with weight delta

## Extensions to Consider

- **Apple Health / Google Fit** sync via REST API or HealthKit
- **Workout templates**: save and share training programs
- **Coach dashboard**: manage multiple clients, leave form notes
- **Body measurements** tracking (waist, arms, chest)
- **Video form check**: upload clip, AI analyzes technique
