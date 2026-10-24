---
title: "Build a Habit Tracking App with Streaks and Insights"
description: "Create a mobile-friendly habit tracker with streak tracking, daily reminders, analytics, and social accountability features — a modern Habitica alternative."
skills: [prisma, resend]
difficulty: intermediate
time_estimate: "8 hours"
tags: [habits, wellness, streaks, notifications, analytics, mobile]
---

# Build a Habit Tracking App with Streaks and Insights

## The Problem

You want a habit tracker that is neither an RPG nor a bare checklist: large check-off buttons on a phone, a streak that is correct across time zones, a reminder at the hour the user picked, and a few insights that show progress. The parts that go wrong are not the UI. They are "what day is it for this user", a reminder job that fires at the server's clock instead of the user's, and a partner invite link that anyone can guess.

## The Solution

Use [Prisma](/skills/prisma) for the data model and queries, and [Resend](/skills/resend) for reminder and invite emails. Store completions as calendar dates (not timestamps), compute "today" in the user's time zone, and run one scheduled endpoint that sends reminders.

## Step-by-Step Walkthrough

### Step 1: Install and configure Prisma 7

```bash
npm install @prisma/client@7 @prisma/adapter-pg@7 pg resend dotenv
npm install -D prisma@7 typescript @types/pg
npx prisma init --datasource-provider postgresql
```

Pin Prisma to major 7: the `latest` tag of the `prisma` CLI has moved to 8.0 release candidates, which no longer accept `init --datasource-provider` and do not match the 7.x client. Prisma 7 generates the client into your own source tree, needs a driver adapter at runtime, and reads the database URL from the config file `init` writes (`prisma.config.ts`, or `prisma7.config.ts` in 7.10), not from `schema.prisma`. The generator block must have an `output`:

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
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  timezone  String   @default("UTC") // IANA name, e.g. "Europe/Berlin"
  habits    Habit[]
  partners  AccountabilityPartner[] @relation("user")
  createdAt DateTime @default(now())
}

model Habit {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  name         String
  icon         String   @default("✅")
  frequency    String   @default("daily") // daily | weekdays
  reminderTime String?  // "08:00" in the user's time zone
  isActive     Boolean  @default(true)
  completions  HabitCompletion[]
  createdAt    DateTime @default(now())
}

model HabitCompletion {
  id        String   @id @default(cuid())
  habitId   String
  habit     Habit    @relation(fields: [habitId], references: [id])
  date      DateTime @db.Date // the user's local calendar day
  createdAt DateTime @default(now())

  @@unique([habitId, date])
}

model AccountabilityPartner {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation("user", fields: [userId], references: [id])
  partnerEmail String
  token        String   @unique @default(uuid()) // unguessable, used in the invite link
  status       String   @default("pending") // pending | accepted
  createdAt    DateTime @default(now())
}
```

```bash
export DATABASE_URL="postgresql://app:$DB_PASSWORD@127.0.0.1:5432/habits"
npx prisma migrate dev --name init   # also run `npx prisma generate` after schema changes
```

```typescript
// lib/db.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
})
```

### Step 2: Write the streak engine on calendar dates

Convert every date to a day number in UTC. A `@db.Date` column comes back as midnight UTC, and "today" is taken from the user's time zone, so a user in Tokyo and one in Los Angeles each get their own day boundary.

```typescript
// lib/streaks.ts
import { prisma } from './db'

const DAY = 86_400_000

export function todayFor(timeZone: string, now = new Date()): Date {
  // 'en-CA' formats as YYYY-MM-DD; Date.parse reads that as midnight UTC
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone }).format(now)
  return new Date(ymd)
}

export async function calculateStreak(habitId: string, timeZone: string) {
  const rows = await prisma.habitCompletion.findMany({
    where: { habitId }, orderBy: { date: 'desc' }, select: { date: true },
  })
  if (!rows.length) return { current: 0, longest: 0 }

  const days = rows.map(r => Math.round(r.date.getTime() / DAY)) // descending, unique
  const today = Math.round(todayFor(timeZone).getTime() / DAY)

  // Current streak: alive if the latest check-in is today or yesterday
  let current = 0
  if (today - days[0] <= 1) {
    current = 1
    for (let i = 1; i < days.length && days[i - 1] - days[i] === 1; i++) current++
  }

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    run = days[i - 1] - days[i] === 1 ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  return { current, longest }
}

export async function getHeatmapData(habitId: string, timeZone: string, days = 365) {
  const since = new Date(todayFor(timeZone).getTime() - days * DAY)
  const rows = await prisma.habitCompletion.findMany({
    where: { habitId, date: { gte: since } }, select: { date: true },
  })
  const heatmap: Record<string, number> = {}
  for (const r of rows) {
    const key = r.date.toISOString().slice(0, 10)
    heatmap[key] = (heatmap[key] ?? 0) + 1
  }
  return heatmap
}
```

This counts every calendar day, so it fits `daily` habits; a `weekdays` habit needs extra skip-day rules.

When the user taps "done", write `date: todayFor(user.timezone)`. The `@@unique([habitId, date])` constraint makes a double tap harmless (catch the unique-violation error, code `P2002`).

### Step 3: Send reminders from one scheduled endpoint

Reminder times are stored as the user's local `HH:MM`, so the job converts the current time into each user's zone before comparing. Run it every 15 minutes and restrict the time picker to quarter hours so every reminder lands in exactly one run.

```typescript
// app/api/cron/reminders/route.ts
import { Resend } from 'resend'
import { prisma } from '@/lib/db'

const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

function localHHMM(timeZone: string, now: Date) {
  const hhmm = new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now)
  const [h, m] = hhmm.split(':')
  return `${h}:${String(Math.floor(Number(m) / 15) * 15).padStart(2, '0')}`
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const now = new Date()
  const habits = await prisma.habit.findMany({
    where: { isActive: true, reminderTime: { not: null } }, include: { user: true },
  })

  const due = new Map<string, { name: string; email: string; items: string[] }>()
  for (const h of habits) {
    if (h.reminderTime !== localHHMM(h.user.timezone, now)) continue
    const entry = due.get(h.userId) ?? { name: h.user.name, email: h.user.email, items: [] }
    entry.items.push(`<li>${esc(h.icon)} <strong>${esc(h.name)}</strong></li>`)
    due.set(h.userId, entry)
  }

  for (const u of due.values()) {
    const { error } = await resend.emails.send({
      from: 'HabitPulse <reminders@habitpulse.app>', // a domain verified in Resend
      to: u.email,
      subject: `Time to check in: ${u.items.length} habit${u.items.length > 1 ? 's' : ''} waiting`,
      html: `<h2>Hey ${esc(u.name)}</h2><ul>${u.items.join('')}</ul>
             <a href="${process.env.APP_URL}/today">Check in now</a>`,
    })
    if (error) console.error('reminder failed', u.email, error.message)
  }
  return Response.json({ sent: due.size })
}
```

Resend's `send` does not throw on API errors; it returns `{ data, error }`, so check `error`.

Scheduling: on Vercel, add the cron to `vercel.json` (`{"crons":[{"path":"/api/cron/reminders","schedule":"*/15 * * * *"}]}`) and set `CRON_SECRET`; Vercel sends it as the `Authorization: Bearer` header. Vercel Hobby accounts only allow cron jobs that run once per day, so a 15-minute schedule needs the Pro plan (or any other scheduler that can call the URL with that header).

### Step 4: Expose analytics

```typescript
// app/api/habits/[id]/analytics/route.ts
import { prisma } from '@/lib/db'
import { calculateStreak, getHeatmapData, todayFor } from '@/lib/streaks'
import { getSessionUserId } from '@/lib/auth' // your auth layer

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params // a Promise in current Next.js
  const userId = await getSessionUserId()
  const habit = await prisma.habit.findFirst({
    where: { id, userId }, // ownership check
    include: { user: { select: { timezone: true } } },
  })
  if (!habit) return new Response('Not found', { status: 404 })

  const tz = habit.user.timezone
  const today = todayFor(tz)
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))

  const [streak, heatmap, all] = await Promise.all([
    calculateStreak(id, tz),
    getHeatmapData(id, tz),
    prisma.habitCompletion.findMany({ where: { habitId: id }, select: { date: true } }),
  ])

  const perWeekday = [0, 0, 0, 0, 0, 0, 0] // Sun-Sat
  for (const c of all) perWeekday[c.date.getUTCDay()]++
  const bestDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][perWeekday.indexOf(Math.max(...perWeekday))]

  const daysTracked = Math.max(1, Math.round((today.getTime() - todayFor(tz, habit.createdAt).getTime()) / 86_400_000) + 1)
  return Response.json({
    streak,
    heatmap,
    completionRate: Math.min(100, Math.round((all.length / daysTracked) * 100)),
    thisMonth: all.filter(c => c.date >= monthStart).length,
    bestDay,
  })
}
```

### Step 5: Invite an accountability partner

```typescript
// lib/partners.ts
import { Resend } from 'resend'
import { prisma } from './db'

const resend = new Resend(process.env.RESEND_API_KEY)
const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`)

export async function invitePartner(userId: string, partnerEmail: string) {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } })
  const partner = await prisma.accountabilityPartner.create({ data: { userId, partnerEmail } })
  const { error } = await resend.emails.send({
    from: 'HabitPulse <noreply@habitpulse.app>',
    to: partnerEmail,
    subject: `${user.name} wants you as their accountability partner`,
    html: `<h2>${esc(user.name)} invited you to follow their habit streaks</h2>
           <a href="${process.env.APP_URL}/accept-partner?token=${partner.token}">Accept invitation</a>`,
  })
  if (error) throw new Error(error.message)
  return partner
}
```

The link carries the random `token`, not the row id, and the accept page should also require the invitee to be signed in with that email.

### Step 6: Deploy

Run `npx prisma migrate deploy` and `npx prisma generate` in your build, and set `DATABASE_URL`, `RESEND_API_KEY`, `APP_URL` and `CRON_SECRET`.

## Real-World Example

A solo developer building "HabitPulse" ships the schema and check-off screen on day one, the streak engine with unit tests on day two (cases that matter: check-ins at 23:50 and 00:10 in the user's zone, and a streak whose last check-in was yesterday), and reminders on day three. A tester in Auckland sees the streak reset in the middle of the day when "today" comes from the server clock, which is why Step 2 takes the day from the user's time zone.

## Related Skills

- [prisma](/skills/prisma): schema, migrations and the Prisma 7 client setup
- [resend](/skills/resend): reminder and invite emails
