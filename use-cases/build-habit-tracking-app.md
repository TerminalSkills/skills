---
title: "Build a Habit Tracking App with Streaks and Insights"
description: "Create a mobile-friendly habit tracker with streak tracking, daily reminders, analytics, and social accountability features — a modern Habitica alternative."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "8 hours"
tags: [habits, wellness, streaks, notifications, analytics, mobile]
---

# Build a Habit Tracking App with Streaks and Insights

You're a wellness app developer tired of existing habit trackers being either too gamified or too plain. You want to build a focused, mobile-friendly app with real streak logic, smart reminders, and insights that actually motivate. Think Habitica without the RPG bloat.

## What You'll Build

- Daily habit check-off UI optimized for mobile
- Streak engine: current streak, longest streak, heatmap calendar
- Email/push reminders at user-configured times
- Analytics: completion rate, best days of week, trend patterns
- Social: share streaks, add accountability partners

## Schema Design

```typescript
// prisma/schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  timezone  String   @default("UTC")
  habits    Habit[]
  partners  AccountabilityPartner[] @relation("user")
  createdAt DateTime @default(now())
}

model Habit {
  id          String       @id @default(cuid())
  userId      String
  user        User         @relation(fields: [userId], references: [id])
  name        String
  description String?
  color       String       @default("#6366f1")
  icon        String       @default("✅")
  frequency   String       @default("daily") // daily | weekdays | custom
  reminderTime String?     // "08:00"
  isActive    Boolean      @default(true)
  completions HabitCompletion[]
  createdAt   DateTime     @default(now())
}

model HabitCompletion {
  id        String   @id @default(cuid())
  habitId   String
  habit     Habit    @relation(fields: [habitId], references: [id])
  date      DateTime @db.Date
  note      String?
  createdAt DateTime @default(now())

  @@unique([habitId, date])
}

model AccountabilityPartner {
  id         String   @id @default(cuid())
  userId     String
  user       User     @relation("user", fields: [userId], references: [id])
  partnerEmail String
  status     String   @default("pending") // pending | accepted
  createdAt  DateTime @default(now())
}
```

## Streak Calculation Engine

```typescript
// lib/streaks.ts
import { prisma } from './db'
import { startOfDay, subDays, differenceInDays } from 'date-fns'

export async function calculateStreak(habitId: string) {
  const completions = await prisma.habitCompletion.findMany({
    where: { habitId },
    orderBy: { date: 'desc' },
    select: { date: true },
  })

  if (!completions.length) return { current: 0, longest: 0 }

  const dates = completions.map(c => startOfDay(c.date))
  const today = startOfDay(new Date())

  // Current streak
  let current = 0
  let cursor = today

  for (const date of dates) {
    const diff = differenceInDays(cursor, date)
    if (diff === 0 || diff === 1) {
      current++
      cursor = date
    } else {
      break
    }
  }

  // Longest streak
  let longest = 0
  let running = 1

  for (let i = 1; i < dates.length; i++) {
    const diff = differenceInDays(dates[i - 1], dates[i])
    if (diff === 1) {
      running++
      longest = Math.max(longest, running)
    } else {
      running = 1
    }
  }

  return { current, longest: Math.max(longest, current) }
}

export async function getHeatmapData(habitId: string, days = 365) {
  const since = subDays(new Date(), days)
  const completions = await prisma.habitCompletion.findMany({
    where: { habitId, date: { gte: since } },
    select: { date: true },
  })

  return completions.reduce((acc, c) => {
    const key = c.date.toISOString().split('T')[0]
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {} as Record<string, number>)
}
```

## Daily Reminder Emails with Resend

```typescript
// lib/reminders.ts
import { Resend } from 'resend'
import { prisma } from './db'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendDailyReminders() {
  const now = new Date()
  const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

  // Find all habits with reminders set for this time slot
  const habits = await prisma.habit.findMany({
    where: {
      isActive: true,
      reminderTime: currentTime,
    },
    include: { user: true },
  })

  const byUser = habits.reduce((acc, habit) => {
    const key = habit.user.email
    if (!acc[key]) acc[key] = { user: habit.user, habits: [] }
    acc[key].habits.push(habit)
    return acc
  }, {} as Record<string, any>)

  for (const { user, habits } of Object.values(byUser)) {
    await resend.emails.send({
      from: 'HabitPulse <reminders@habitpulse.app>',
      to: user.email,
      subject: `⏰ Time to check in — ${habits.length} habit${habits.length > 1 ? 's' : ''} waiting`,
      html: buildReminderEmail(user.name, habits),
    })
  }
}

function buildReminderEmail(name: string, habits: any[]) {
  const list = habits.map(h => `<li>${h.icon} <strong>${h.name}</strong></li>`).join('')
  return `
    <h2>Hey ${name} 👋</h2>
    <p>Your habits are waiting for today's check-in:</p>
    <ul>${list}</ul>
    <a href="${process.env.APP_URL}/today" style="background:#6366f1;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;margin-top:16px">
      Check In Now →
    </a>
    <p style="color:#888;font-size:12px;margin-top:24px">
      You're on a streak — don't break it! 🔥
    </p>
  `
}
```

## Analytics API

```typescript
// app/api/habits/[id]/analytics/route.ts
import { prisma } from '@/lib/db'
import { calculateStreak, getHeatmapData } from '@/lib/streaks'
import { startOfMonth, endOfMonth, getDay } from 'date-fns'

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { id } = params

  const [streak, heatmap, completions] = await Promise.all([
    calculateStreak(id),
    getHeatmapData(id, 365),
    prisma.habitCompletion.findMany({
      where: {
        habitId: id,
        date: { gte: startOfMonth(new Date()), lte: endOfMonth(new Date()) },
      },
    }),
  ])

  // Best days of week
  const allCompletions = await prisma.habitCompletion.findMany({
    where: { habitId: id },
    select: { date: true },
  })

  const dayCount = [0, 0, 0, 0, 0, 0, 0] // Sun-Sat
  allCompletions.forEach(c => { dayCount[getDay(c.date)]++ })
  const bestDay = dayCount.indexOf(Math.max(...dayCount))

  const habit = await prisma.habit.findUnique({
    where: { id },
    select: { createdAt: true, frequency: true },
  })

  const totalDays = Math.ceil(
    (Date.now() - habit!.createdAt.getTime()) / (1000 * 60 * 60 * 24)
  )
  const completionRate = Math.round((allCompletions.length / totalDays) * 100)

  return Response.json({
    streak,
    heatmap,
    completionRate,
    thisMonth: completions.length,
    bestDay: ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][bestDay],
  })
}
```

## Accountability Partner Invite

```typescript
// lib/partners.ts
export async function invitePartner(userId: string, partnerEmail: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } })
  
  const partner = await prisma.accountabilityPartner.create({
    data: { userId, partnerEmail, status: 'pending' },
  })

  await resend.emails.send({
    from: 'HabitPulse <noreply@habitpulse.app>',
    to: partnerEmail,
    subject: `${user!.name} wants you as their accountability partner 🤝`,
    html: `
      <h2>${user!.name} invited you to be their accountability partner!</h2>
      <p>You'll get weekly updates on their habit streaks and can cheer them on.</p>
      <a href="${process.env.APP_URL}/accept-partner?token=${partner.id}">
        Accept Invitation →
      </a>
    `,
  })

  return partner
}
```

## Key Features Summary

- **Mobile-first UI**: large check-off buttons, swipe gestures, bottom nav
- **Streak engine**: handles timezone-aware dates, missed days, habit frequency
- **Heatmap calendar**: GitHub-style contribution graph per habit
- **Smart reminders**: batched per user, sent at their local time via cron
- **Accountability**: partners get weekly streak digests via Resend

## Deployment Checklist

```bash
# Run migrations
npx prisma migrate deploy

# Set up cron for reminders (every 5 min, checks current time)
# Vercel: vercel.json crons
# Railway: add cron service

# Environment variables needed:
# DATABASE_URL, RESEND_API_KEY, APP_URL, NEXTAUTH_SECRET
```

## Extensions to Consider

- **Push notifications** via Web Push API for mobile PWA
- **Habit templates**: "Morning Routine", "Fitness Month" starter packs
- **Streak freeze** mechanic: buy yourself a grace day
- **Weekly digest email** with insights and encouragement
- **Import from Habitica** via their API
