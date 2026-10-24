---
title: "Build an Appointment Booking System Like Calendly"
description: "Build a full-featured booking system with availability management, calendar sync, automated reminders via email/SMS, and video meeting link generation."
skills: [prisma, resend, twilio]
difficulty: intermediate
time_estimate: "6 hours"
tags: [booking, calendar, scheduling, reminders, google-calendar, zoom, twilio, resend, prisma]
---

# Build an Appointment Booking System Like Calendly

**Persona:** You're an independent consultant booking 20 discovery calls per week. You're tired of the "what time works for you?" email chain and want a public booking page that handles availability, confirmations, and reminders automatically.

## What You'll Build

- **Availability engine:** working hours, buffer time and blocked slots, computed in your own time zone
- **Booking API:** re-checks the slot on the server, and a database constraint refuses overlapping bookings, so two visitors cannot take the same time
- **Google Calendar and Meet:** an event with a Meet link and an invitation to the guest
- **Reminders:** 24h and 1h before, by email (Resend) and SMS (Twilio), queued at the providers and cancellable

The code targets Next.js 15 or newer (App Router), Prisma 7 with PostgreSQL, `resend`, `twilio`, `googleapis`, `date-fns` and `date-fns-tz`. The snippets type-check against those packages; the calls to Google, Resend and Twilio need your own accounts to run.

```bash
npm i @prisma/client@7 @prisma/adapter-pg@7 pg date-fns date-fns-tz resend twilio googleapis && npm i -D prisma@7
```

Environment (`.env.local`, never committed): `DATABASE_URL`, `RESEND_API_KEY`, `MAIL_FROM` (an address on a domain verified in Resend), `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_MESSAGING_SERVICE_SID`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_REFRESH_TOKEN`, `OWNER_TZ`.

## Data Model (Prisma 7)

Pin `prisma@7`: the npm `latest` tag of the CLI currently points at a Prisma 8 release candidate, which has different commands. Prisma 7 wants an explicit `output` for the generated client, a driver adapter, and the database URL in `prisma.config.ts` rather than in the schema.

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Booking {
  id         String        @id @default(cuid())
  name       String
  email      String
  phone      String?
  notes      String?
  startTime  DateTime
  endTime    DateTime
  meetingUrl String?
  calEventId String?
  reminderIds Json?
  status     BookingStatus @default(CONFIRMED)

  @@index([startTime])
}

model BlockedSlot {
  id String @id @default(cuid())
  startTime DateTime
  endTime DateTime
}

model Settings {
  id                String @id @default("singleton")
  workingHoursStart Int    @default(9)
  workingHoursEnd   Int    @default(17)
  slotDuration      Int    @default(60)
  bufferTime        Int    @default(15)
  timezone          String @default("America/New_York")
}

enum BookingStatus {
  CONFIRMED
  CANCELLED
  COMPLETED
}
```

```ts
// prisma.config.ts
import { defineConfig, env } from 'prisma/config';
export default defineConfig({ schema: 'prisma/schema.prisma', datasource: { url: env('DATABASE_URL') } });
```

```ts
// lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/** True when PostgreSQL rejected a write with the booking_no_overlap exclusion constraint (23P01). */
export function isOverlap(e: unknown) {
  const meta = (e as { meta?: { driverAdapterError?: { cause?: { originalCode?: string } } } })?.meta;
  return meta?.driverAdapterError?.cause?.originalCode === '23P01';
}
```

Prisma cannot express an exclusion constraint in the schema, so add it to the migration by hand. Create the migration without applying it, append the constraint to the generated `migration.sql`, then apply it:

```bash
npx prisma migrate dev --name init --create-only
cat >> prisma/migrations/*_init/migration.sql <<'SQL'

ALTER TABLE "Booking" ADD CONSTRAINT booking_no_overlap
  EXCLUDE USING gist (tsrange("startTime", "endTime") WITH &&) WHERE (status = 'CONFIRMED');
SQL
npx prisma migrate dev
```

PostgreSQL now refuses any second confirmed booking that overlaps an existing one, even when two requests pass the server check at the same moment. Cancelled bookings do not block the slot. Prisma does not report drift for it.

## Step 1: Availability

Build the working day in the owner's zone, not the server's: a server in UTC would otherwise offer 9:00 UTC instead of 9:00 New York. The buffer is applied after existing calls as well as before them.

```ts
// lib/slots.ts
import { addMinutes } from 'date-fns';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import { prisma } from './prisma';

/** Free slots for one calendar day (YYYY-MM-DD) in the owner's time zone. */
export async function freeSlots(day: string) {
  const s = await prisma.settings.upsert({ where: { id: 'singleton' }, update: {}, create: {} });
  const at = (h: number) => fromZonedTime(`${day}T${String(h).padStart(2, '0')}:00:00`, s.timezone);
  const [dayStart, dayEnd] = [at(s.workingHoursStart), at(s.workingHoursEnd)];
  const overlap = { startTime: { lt: dayEnd }, endTime: { gt: dayStart } };
  const busy = (await Promise.all([
    prisma.booking.findMany({ where: { ...overlap, status: 'CONFIRMED' } }),
    prisma.blockedSlot.findMany({ where: overlap }),
  ])).flat();
  const slots: { start: string; end: string }[] = [];
  for (let start = dayStart; addMinutes(start, s.slotDuration) <= dayEnd; start = addMinutes(start, s.slotDuration + s.bufferTime)) {
    const end = addMinutes(start, s.slotDuration);
    const clash = busy.some((b) => start < addMinutes(b.endTime, s.bufferTime) && end > b.startTime);
    if (!clash && start > new Date()) slots.push({ start: start.toISOString(), end: end.toISOString() });
  }
  return slots;
}

export async function ownerDay(at: Date) {
  const s = await prisma.settings.upsert({ where: { id: 'singleton' }, update: {}, create: {} });
  return formatInTimeZone(at, s.timezone, 'yyyy-MM-dd');
}
```

`app/api/availability/route.ts` is a `GET` handler that checks `?date=YYYY-MM-DD` with a regex (400 otherwise) and returns `Response.json({ slots: await freeSlots(day) })`.

## Step 2: Create the Booking and a Google Meet Link

A service account cannot invite attendees or create Meet conferences on a personal Google calendar. Authorize once as yourself with OAuth (scope `https://www.googleapis.com/auth/calendar.events`), and store the refresh token in `GOOGLE_REFRESH_TOKEN`. The Meet link is requested with `conferenceDataVersion: 1`; the response can carry it as `pending`, so if `hangoutLink` is empty, read the event again a moment later.

```ts
// lib/google.ts
import { google } from 'googleapis';

const oauth = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);
oauth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

export const calendar = google.calendar({ version: 'v3', auth: oauth });

export async function createMeetEvent(p: { summary: string; start: string; end: string; attendee: string }) {
  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,
    sendUpdates: 'all',
    requestBody: {
      summary: p.summary,
      start: { dateTime: p.start },
      end: { dateTime: p.end },
      attendees: [{ email: p.attendee }],
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    },
  });
  return { eventId: data.id ?? null, meetingUrl: data.hangoutLink ?? null };
}
```

The booking route does not trust the browser: it recomputes the free slots and takes the end time from your settings. It then inserts the booking first, so the database constraint decides who wins a race, and only the winner gets a calendar event.

```ts
// app/api/bookings/route.ts
import { prisma, isOverlap } from '@/lib/prisma';
import { freeSlots, ownerDay } from '@/lib/slots';
import { createMeetEvent } from '@/lib/google';
import { sendConfirmation, scheduleReminders } from '@/lib/notify';

export async function POST(req: Request) {
  const { name, email, phone, notes, startTime } = await req.json();
  const start = new Date(startTime);

  const day = await ownerDay(start);
  const slot = (await freeSlots(day)).find((s) => s.start === start.toISOString());
  if (!slot) return Response.json({ error: 'That time is no longer available' }, { status: 409 });

  let booking;
  try {
    booking = await prisma.booking.create({
      data: { name, email, phone, notes, startTime: new Date(slot.start), endTime: new Date(slot.end) },
    });
  } catch (e) {
    if (isOverlap(e)) return Response.json({ error: 'That time is no longer available' }, { status: 409 });
    throw e;
  }

  try {
    const { eventId, meetingUrl } = await createMeetEvent({
      summary: `Discovery Call: ${name}`, start: slot.start, end: slot.end, attendee: email,
    });
    booking = await prisma.booking.update({ where: { id: booking.id }, data: { meetingUrl, calEventId: eventId } });
  } catch (e) {
    await prisma.booking.delete({ where: { id: booking.id } });
    throw e;
  }

  await sendConfirmation(booking);
  const reminderIds = await scheduleReminders(booking);
  await prisma.booking.update({ where: { id: booking.id }, data: { reminderIds } });
  return Response.json({ booking });
}
```

## Step 3: Confirmation and Reminders

Resend schedules an email with `scheduledAt` (up to 30 days ahead). Twilio schedules an SMS with `scheduleType: 'fixed'` and `sendAt` (15 minutes to 35 days ahead), and only does so when the message is sent through a Messaging Service. Both providers hold the job, so nothing is lost when your server restarts, unlike a `setTimeout`. The ids are saved on the booking so a cancellation can revoke the reminders.

```ts
// lib/notify.ts
import { Resend } from 'resend';
import twilio from 'twilio';
import { formatInTimeZone } from 'date-fns-tz';

const resend = new Resend(process.env.RESEND_API_KEY);
const sms = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

type B = { name: string; email: string; phone: string | null; startTime: Date; meetingUrl: string | null };
const when = (b: B) => formatInTimeZone(b.startTime, process.env.OWNER_TZ ?? 'America/New_York', "EEEE, MMMM d 'at' h:mm a zzz");

export async function sendConfirmation(b: B) {
  const { error } = await resend.emails.send({
    from: process.env.MAIL_FROM!, to: b.email, subject: 'Your call is confirmed',
    text: `Hi ${b.name}, your discovery call is on ${when(b)}.${b.meetingUrl ? ` Join Google Meet: ${b.meetingUrl}` : ''}`,
  });
  if (error) throw new Error(error.message); // the SDK returns errors, it does not throw
}

/** Queue the 24h and 1h reminders at the providers and return their ids, so a cancel can revoke them. */
export async function scheduleReminders(b: B) {
  const ids: { email: string[]; sms: string[] } = { email: [], sms: [] };
  for (const hours of [24, 1]) {
    const sendAt = new Date(b.startTime.getTime() - hours * 3600_000);
    if (sendAt.getTime() - Date.now() < 16 * 60_000) continue;
    const text = `Reminder: your call is in ${hours}h (${when(b)}).${b.meetingUrl ? ` Join: ${b.meetingUrl}` : ''}`;

    const mail = await resend.emails.send({
      from: process.env.MAIL_FROM!, to: b.email, subject: `Your call is in ${hours}h`,
      text, scheduledAt: sendAt.toISOString(),
    });
    if (mail.data) ids.email.push(mail.data.id);

    if (b.phone) {
      const m = await sms.messages.create({
        to: b.phone, body: text,
        messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID!,
        scheduleType: 'fixed', sendAt,
      });
      ids.sms.push(m.sid);
    }
  }
  return ids;
}

export async function cancelReminders(ids: { email: string[]; sms: string[] }) {
  await Promise.all([
    ...ids.email.map((id) => resend.emails.cancel(id)),
    ...ids.sms.map((sid) => sms.messages(sid).update({ status: 'canceled' })),
  ]);
}
```

When a guest cancels, set `status: 'CANCELLED'`, call `cancelReminders(booking.reminderIds)` and delete the calendar event with `calendar.events.delete({ calendarId: 'primary', eventId: booking.calEventId, sendUpdates: 'all' })`.

SMS to US numbers needs a registered sender (A2P 10DLC or a verified toll-free number) before it is delivered; plan for that approval time.

## Related Skills

- [prisma](../skills/prisma/): schema, migrations and the typed client
- [resend](../skills/resend/): confirmation and scheduled reminder emails
- [twilio](../skills/twilio/): scheduled SMS reminders
