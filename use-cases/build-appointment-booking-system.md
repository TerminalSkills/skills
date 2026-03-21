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

---

## What You'll Build

- **Availability engine:** working hours, buffer time, blocked slots
- **Public booking page:** date picker, time slots, contact form
- **Google Calendar sync:** create events, import blocked times
- **Automated reminders:** 24h and 1h before via email + SMS
- **Video meeting link:** auto-generate Zoom/Google Meet link per booking

---

## Data Model (Prisma)

```prisma
// prisma/schema.prisma
model Booking {
  id          String   @id @default(cuid())
  name        String
  email       String
  phone       String?
  notes       String?
  startTime   DateTime
  endTime     DateTime
  meetingUrl  String?
  calEventId  String?
  status      BookingStatus @default(CONFIRMED)
  createdAt   DateTime @default(now())
}

model BlockedSlot {
  id        String   @id @default(cuid())
  startTime DateTime
  endTime   DateTime
  reason    String?
}

model Settings {
  id             String @id @default("singleton")
  workingHoursStart Int  @default(9)   // 9 AM
  workingHoursEnd   Int  @default(17)  // 5 PM
  slotDuration      Int  @default(60)  // minutes
  bufferTime        Int  @default(15)  // minutes between calls
  timezone          String @default("America/New_York")
}

enum BookingStatus { CONFIRMED CANCELLED COMPLETED }
```

```bash
npx prisma migrate dev --name init
```

---

## Step 1: Availability API

```ts
// app/api/availability/route.ts
import { prisma } from '@/lib/prisma';
import { addMinutes, eachMinuteOfInterval, format, startOfDay, endOfDay } from 'date-fns';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const date = new Date(searchParams.get('date')!);
  const settings = await prisma.settings.findUnique({ where: { id: 'singleton' } });

  const dayStart = new Date(date);
  dayStart.setHours(settings!.workingHoursStart, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(settings!.workingHoursEnd, 0, 0, 0);

  // Get existing bookings and blocked slots
  const [bookings, blocked] = await Promise.all([
    prisma.booking.findMany({ where: { startTime: { gte: dayStart, lt: dayEnd }, status: 'CONFIRMED' } }),
    prisma.blockedSlot.findMany({ where: { startTime: { gte: dayStart, lt: dayEnd } } }),
  ]);

  // Generate all possible slots
  const slots = [];
  let cursor = dayStart;
  while (addMinutes(cursor, settings!.slotDuration) <= dayEnd) {
    const slotEnd = addMinutes(cursor, settings!.slotDuration);
    const busyUntil = addMinutes(slotEnd, settings!.bufferTime);

    const isBooked = bookings.some(b => cursor < b.endTime && slotEnd > b.startTime);
    const isBlocked = blocked.some(b => cursor < b.endTime && slotEnd > b.startTime);

    if (!isBooked && !isBlocked) {
      slots.push({ start: cursor.toISOString(), end: slotEnd.toISOString() });
    }
    cursor = addMinutes(cursor, settings!.slotDuration + settings!.bufferTime);
  }

  return Response.json({ slots });
}
```

---

## Step 2: Create Booking + Google Meet Link

```ts
// app/api/bookings/route.ts
import { google } from 'googleapis';
import { prisma } from '@/lib/prisma';
import { sendConfirmationEmail } from '@/lib/email';
import { scheduleReminders } from '@/lib/reminders';

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!),
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

export async function POST(req: Request) {
  const { name, email, phone, notes, startTime, endTime } = await req.json();

  // Create Google Calendar event with Meet link
  const calendar = google.calendar({ version: 'v3', auth });
  const event = await calendar.events.insert({
    calendarId: process.env.GOOGLE_CALENDAR_ID!,
    conferenceDataVersion: 1,
    requestBody: {
      summary: `Discovery Call — ${name}`,
      start: { dateTime: startTime },
      end: { dateTime: endTime },
      attendees: [{ email }],
      conferenceData: {
        createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    },
  });

  const meetingUrl = event.data.conferenceData?.entryPoints?.[0]?.uri;

  const booking = await prisma.booking.create({
    data: { name, email, phone, notes, startTime: new Date(startTime), endTime: new Date(endTime), meetingUrl, calEventId: event.data.id },
  });

  await sendConfirmationEmail({ booking });
  await scheduleReminders({ booking });

  return Response.json({ booking });
}
```

---

## Step 3: Email Confirmations with Resend

```ts
// lib/email.ts
import { Resend } from 'resend';
import { format } from 'date-fns';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendConfirmationEmail({ booking }: { booking: any }) {
  await resend.emails.send({
    from: 'You <hello@yoursite.com>',
    to: booking.email,
    subject: `Your call is confirmed — ${format(booking.startTime, 'MMM d, h:mm a')}`,
    html: `
      <h2>You're booked! 🎉</h2>
      <p>Hi ${booking.name},</p>
      <p>Your discovery call is confirmed for <strong>${format(booking.startTime, 'EEEE, MMMM d at h:mm a')}</strong>.</p>
      <p><a href="${booking.meetingUrl}">Join Google Meet</a></p>
    `,
  });
}
```

---

## Step 4: SMS Reminders with Twilio

```ts
// lib/reminders.ts
import twilio from 'twilio';
import { prisma } from '@/lib/prisma';

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

export async function scheduleReminders({ booking }: { booking: any }) {
  if (!booking.phone) return;

  const times = [
    { label: '24h', ms: 24 * 60 * 60 * 1000 },
    { label: '1h', ms: 60 * 60 * 1000 },
  ];

  for (const { label, ms } of times) {
    const sendAt = new Date(booking.startTime.getTime() - ms);
    if (sendAt > new Date()) {
      // In production, use a job queue (BullMQ/Inngest) instead of setTimeout
      setTimeout(async () => {
        await client.messages.create({
          body: `Reminder: Your call is in ${label}. Join here: ${booking.meetingUrl}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: booking.phone,
        });
      }, sendAt.getTime() - Date.now());
    }
  }
}
```

> **Production tip:** Replace `setTimeout` with [Inngest](https://inngest.com) or BullMQ for reliable scheduled jobs.

---

## Step 5: iCal Export

```ts
// app/api/bookings/[id]/ical/route.ts
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  const ical = `BEGIN:VCALENDAR\nVERSION:2.0\nBEGIN:VEVENT\nSUMMARY:Discovery Call\nDTSTART:${toIcalDate(booking!.startTime)}\nDTEND:${toIcalDate(booking!.endTime)}\nDESCRIPTION:${booking!.meetingUrl}\nEND:VEVENT\nEND:VCALENDAR`;
  return new Response(ical, { headers: { 'Content-Type': 'text/calendar', 'Content-Disposition': 'attachment; filename="booking.ics"' } });
}

function toIcalDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
}
```

---

## Key Outcomes

- No more back-and-forth scheduling emails
- Google Meet link auto-generated per booking
- Guests get email + SMS reminders automatically
- Calendar stays in sync — no double-bookings
- iCal download for any calendar app
