---
name: cal-com
category: Real-Time & Collaboration
tags: [scheduling, calendar, booking, appointments, api, self-hosted]
version: 1.0.0
author: terminal-skills
---

# Cal.com — Scheduling Infrastructure

You are an expert in Cal.com, the open-source scheduling platform for building booking and appointment systems. You help developers integrate Cal.com's embed widgets, REST API, and webhooks to add scheduling capabilities to their applications.

## Core Capabilities

### Embed Widget

Add a booking widget to any website:

```tsx
// src/components/BookingWidget.tsx — Embed Cal.com scheduling in a React app
import Cal, { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";

export function BookingWidget() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi();
      // Configure the embed appearance
      cal("ui", {
        theme: "light",
        styles: { branding: { brandColor: "#6366f1" } },
        hideEventTypeDetails: false,
        layout: "month_view",       // "month_view" | "week_view" | "column_view"
      });
    })();
  }, []);

  return (
    <Cal
      calLink="your-team/discovery-call"   // Your Cal.com event link
      style={{ width: "100%", height: "100%", overflow: "scroll" }}
      config={{
        layout: "month_view",
        name: "Customer Name",              // Pre-fill guest name
        email: "customer@example.com",      // Pre-fill guest email
        notes: "Interested in Enterprise plan",
      }}
    />
  );
}

// Floating button that opens calendar in a popup
export function BookingButton() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi();
      cal("floatingButton", {
        calLink: "your-team/discovery-call",
        buttonText: "Book a Demo",
        buttonColor: "#6366f1",
        buttonTextColor: "#ffffff",
        buttonPosition: "bottom-right",
      });
    })();
  }, []);

  return null;   // The floating button renders itself
}
```

### REST API Integration

Manage bookings, event types, and availability programmatically:

```typescript
// src/cal/client.ts — Cal.com API client for server-side operations
const CAL_API_URL = "https://api.cal.com/v2";
const CAL_API_KEY = process.env.CAL_API_KEY!;

async function calFetch(path: string, options?: RequestInit) {
  const response = await fetch(`${CAL_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "cal-api-version": "2024-08-13",       // Pin API version for stability
      Authorization: `Bearer ${CAL_API_KEY}`,
      ...options?.headers,
    },
  });
  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Cal.com API error: ${error.message}`);
  }
  return response.json();
}

// Create a new event type (e.g., "30-min Discovery Call")
async function createEventType(params: {
  title: string;
  slug: string;
  lengthInMinutes: number;
  description?: string;
  locations?: { type: string; link?: string }[];
}) {
  return calFetch("/event-types", {
    method: "POST",
    body: JSON.stringify({
      title: params.title,
      slug: params.slug,
      lengthInMinutes: params.lengthInMinutes,
      description: params.description,
      locations: params.locations ?? [
        { type: "integrations:google:meet" },  // Default: Google Meet
      ],
      bookingFields: [
        { name: "company", type: "text", label: "Company Name", required: true },
        { name: "teamSize", type: "select", label: "Team Size",
          options: ["1-10", "11-50", "51-200", "200+"], required: true },
      ],
    }),
  });
}

// Get available time slots for a date range
async function getAvailability(params: {
  eventTypeId: number;
  startTime: string;   // ISO 8601
  endTime: string;
  timeZone: string;
}) {
  const query = new URLSearchParams({
    eventTypeId: String(params.eventTypeId),
    startTime: params.startTime,
    endTime: params.endTime,
    timeZone: params.timeZone,
  });
  return calFetch(`/slots?${query}`);
}

// Create a booking
async function createBooking(params: {
  eventTypeId: number;
  start: string;         // ISO 8601 datetime
  attendee: { name: string; email: string; timeZone: string };
  metadata?: Record<string, string>;
}) {
  return calFetch("/bookings", {
    method: "POST",
    body: JSON.stringify({
      eventTypeId: params.eventTypeId,
      start: params.start,
      attendee: params.attendee,
      metadata: params.metadata,
      language: "en",
    }),
  });
}

// Cancel a booking
async function cancelBooking(bookingUid: string, reason?: string) {
  return calFetch(`/bookings/${bookingUid}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

// Reschedule a booking
async function rescheduleBooking(bookingUid: string, newStart: string) {
  return calFetch(`/bookings/${bookingUid}/reschedule`, {
    method: "POST",
    body: JSON.stringify({ start: newStart }),
  });
}
```

### Webhooks

React to booking events in real time:

```typescript
// app/api/cal-webhook/route.ts — Handle Cal.com webhook events
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

const WEBHOOK_SECRET = process.env.CAL_WEBHOOK_SECRET!;

// Verify the webhook signature to ensure it's from Cal.com
function verifySignature(payload: string, signature: string): boolean {
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const payload = await request.text();
  const signature = request.headers.get("x-cal-signature-256") ?? "";

  if (!verifySignature(payload, signature)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload);

  switch (event.triggerEvent) {
    case "BOOKING_CREATED":
      // New booking — send confirmation, update CRM, notify sales
      await handleNewBooking({
        bookingId: event.payload.bookingId,
        attendeeName: event.payload.attendees[0]?.name,
        attendeeEmail: event.payload.attendees[0]?.email,
        startTime: event.payload.startTime,
        eventType: event.payload.eventTitle,
        metadata: event.payload.metadata,
      });
      break;

    case "BOOKING_CANCELLED":
      // Booking cancelled — update CRM, free up resources
      await handleCancellation({
        bookingId: event.payload.bookingId,
        reason: event.payload.cancellationReason,
      });
      break;

    case "BOOKING_RESCHEDULED":
      // Booking moved — update calendar integrations
      await handleReschedule({
        bookingId: event.payload.bookingId,
        oldTime: event.payload.previousStartTime,
        newTime: event.payload.startTime,
      });
      break;

    case "MEETING_ENDED":
      // Meeting finished — trigger follow-up sequence
      await triggerFollowUp(event.payload.bookingId);
      break;
  }

  return NextResponse.json({ received: true });
}

async function handleNewBooking(booking: any) {
  // Example: Create a deal in your CRM
  await crm.createDeal({
    name: `Demo: ${booking.attendeeName}`,
    contact: booking.attendeeEmail,
    stage: "discovery",
    source: "website-booking",
    metadata: booking.metadata,
  });

  // Notify the sales team via Slack
  await slack.postMessage({
    channel: "#sales-notifications",
    text: `📅 New ${booking.eventType} booked!\n👤 ${booking.attendeeName} (${booking.attendeeEmail})\n🕐 ${new Date(booking.startTime).toLocaleString()}`,
  });
}
```

### Managing Team Availability

Configure round-robin scheduling and team calendars:

```typescript
// src/cal/team-setup.ts — Configure team scheduling rules
async function setupTeamScheduling() {
  // Create a team event type with round-robin assignment
  const eventType = await calFetch("/event-types", {
    method: "POST",
    body: JSON.stringify({
      title: "Product Demo",
      slug: "product-demo",
      lengthInMinutes: 45,
      schedulingType: "ROUND_ROBIN",     // Rotate among team members
      hosts: [
        { userId: 101, isFixed: false },  // Participates in rotation
        { userId: 102, isFixed: false },
        { userId: 103, isFixed: true },   // Always included (e.g., sales engineer)
      ],
      beforeEventBuffer: 15,              // 15-min buffer before meetings
      afterEventBuffer: 10,               // 10-min buffer after
      minimumBookingNotice: 120,          // Minimum 2 hours notice
      slotInterval: 15,                   // Show slots every 15 minutes
      locations: [
        { type: "integrations:zoom" },    // Auto-create Zoom meeting
      ],
    }),
  });

  // Set working hours for the team
  await calFetch("/schedules", {
    method: "POST",
    body: JSON.stringify({
      name: "Business Hours",
      timeZone: "America/New_York",
      isDefault: true,
      availability: [
        // Monday-Friday 9 AM to 5 PM
        { days: [1, 2, 3, 4, 5], startTime: "09:00", endTime: "17:00" },
      ],
      // Block specific dates (holidays, company events)
      dateOverrides: [
        { date: "2026-12-25", startTime: null, endTime: null },  // Christmas — unavailable
        { date: "2026-12-31", startTime: "09:00", endTime: "12:00" },  // NYE — morning only
      ],
    }),
  });
}
```

## Installation

```bash
# React embed
npm install @calcom/embed-react

# For self-hosted Cal.com (Docker)
git clone https://github.com/calcom/cal.com.git
cd cal.com
cp .env.example .env
docker compose up -d
```

## Best Practices

1. **Use embed for public booking** — The React embed handles time zones, availability, and confirmations automatically
2. **Pin API versions** — Include `cal-api-version` header to avoid breaking changes when Cal.com updates
3. **Verify webhook signatures** — Always validate `x-cal-signature-256` to prevent spoofed events
4. **Buffer time between meetings** — Set `beforeEventBuffer` and `afterEventBuffer` to prevent back-to-back meetings
5. **Pre-fill known data** — Pass name, email, and context via embed config to reduce friction for returning users
6. **Use metadata for attribution** — Pass UTM params, plan interest, or referral codes through booking metadata
7. **Handle all webhook events** — Don't just handle BOOKING_CREATED; cancellations and reschedules need cleanup too
8. **Self-host for compliance** — If you need data residency (GDPR, HIPAA), self-host Cal.com with Docker
