---
name: cal-com
description: >-
  Cal.com is an open-source scheduling platform for booking pages, availability and calendar sync, with an embed, a REST API v2 and webhooks. Use when the user wants to add a booking widget to a React or plain site, create event types, list free slots, create, cancel or reschedule bookings through the Cal.com API, verify booking webhooks, set up round-robin team events, or self-host a community edition (Cal.diy) with Docker.
license: Apache-2.0
compatibility: "Node.js 18+ and a Cal.com account with an API key for the API; Docker for self-hosting"
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/calcom/cal.com
  tags: "scheduling, calendar, booking, webhooks, api"
---

# Cal.com — Scheduling Infrastructure

## Overview

Cal.com lets people book time on your calendars. You can use it three ways: share a booking link, embed the booker in your site (`@calcom/embed-react`), or drive it from code through API v2 at `https://api.cal.com/v2` and webhooks. Authentication is an API key (`Authorization: Bearer cal_live_...`, created under Settings > Security) or OAuth; Cal.com recommends OAuth for apps that act for other users. API keys are limited to 120 requests per minute.

Two things changed recently. API v2 versions each endpoint family separately through a required `cal-api-version` header, and a wrong or missing value silently selects an older, different shape. The Platform plan no longer takes new signups (since 15 December 2025), so the managed-user and `x-cal-client-id` flows are for existing customers only. Self-hosting now means Cal.diy, an MIT community edition without Teams, Organizations, workflows or SSO.

## Instructions

### Embed in React

```bash
npm install @calcom/embed-react
```

```tsx
// src/components/BookingWidget.tsx
import Cal, { getCalApi } from "@calcom/embed-react";
import { useEffect } from "react";

export function BookingWidget() {
  useEffect(() => {
    (async () => {
      const cal = await getCalApi({ namespace: "discovery-call" });
      cal("ui", {
        theme: "light",
        hideEventTypeDetails: false,
        layout: "month_view",
      });
    })();
  }, []);

  return (
    <Cal
      namespace="discovery-call"
      calLink="maria-lopez/discovery-call"
      style={{ width: "100%", height: "100%", overflow: "scroll" }}
      config={{ layout: "month_view", name: "Dmitri Volkov", email: "dmitri@northwind-logistics.eu" }}
    />
  );
}
```

`calLink` is `maria-lopez/discovery-call` (or `team/sales-eu/product-demo` for a team event). Pass the same `namespace` to `getCalApi` and `<Cal>` when a page has more than one embed. Use `calOrigin` for a self-hosted instance. The package is at 1.5.3 and supports React 18 and 19. Prefilling goes in `config` (`name`, `email`, `notes`, custom field slugs).

### API v2: pick the right version header

Send `cal-api-version` on every call. The values documented today:

| Endpoint family | `cal-api-version` |
|---|---|
| `/v2/bookings` (create, get, cancel, reschedule) | `2026-02-25` |
| `/v2/event-types`, `/v2/teams/{teamId}/event-types` | `2026-06-12` |
| `/v2/slots` | `2024-09-04` |
| `/v2/schedules` | `2024-06-11` |

```typescript
// src/cal/client.ts
const CAL_API_URL = "https://api.cal.com/v2";

export async function calFetch(path: string, version: string, init: RequestInit = {}) {
  const response = await fetch(`${CAL_API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "cal-api-version": version,
      Authorization: `Bearer ${process.env.CAL_API_KEY}`,
      ...init.headers,
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Cal.com ${response.status}: ${JSON.stringify(body)}`);
  return body.data;
}
```

Responses are `{ "status": "success", "data": ... }`; the helper returns `data`.

### Event types, slots, bookings

```typescript
// Create an event type. Required fields: title, slug, lengthInMinutes.
const eventType = await calFetch("/event-types", "2026-06-12", {
  method: "POST",
  body: JSON.stringify({
    title: "Discovery Call",
    slug: "discovery-call",
    lengthInMinutes: 30,
    locations: [{ type: "integration", integration: "google-meet" }],
    bookingFields: [
      { field: "custom", type: "shortText", slug: "company", label: "Company", required: true },
      { field: "custom", type: "select", slug: "team-size", label: "Team size",
        options: ["1-10", "11-50", "51-200", "200+"], required: true },
    ],
  }),
});

// Free slots: query is start/end (UTC ISO 8601 or a date), not startTime/endTime.
const slots = await calFetch(
  `/slots?${new URLSearchParams({
    eventTypeId: String(eventType.id),
    start: "2026-11-02",
    end: "2026-11-06",
    timeZone: "Europe/Berlin",
  })}`,
  "2024-09-04",
);
// slots = { "2026-11-02": [{ start: "2026-11-02T09:00:00.000+01:00" }, ...], ... }

// Book one. attendee needs name and timeZone; email is the usual contact.
const booking = await calFetch("/bookings", "2026-02-25", {
  method: "POST",
  body: JSON.stringify({
    eventTypeId: eventType.id,
    start: "2026-11-02T08:00:00Z",
    attendee: { name: "Dmitri Volkov", email: "dmitri@northwind-logistics.eu", timeZone: "Europe/Berlin", language: "en" },
    bookingFieldsResponses: { company: "Northwind Logistics", "team-size": "51-200" },
    metadata: { utm_source: "pricing-page" },
  }),
});

// Rescheduling cancels the old booking and returns a new one with a new uid.
const moved = await calFetch(`/bookings/${booking.uid}/reschedule`, "2026-02-25", {
  method: "POST",
  body: JSON.stringify({ start: "2026-11-03T08:00:00Z", reschedulingReason: "Customer asked for Tuesday" }),
});
// Cancel the new uid; the original one is already cancelled and would be rejected.
await calFetch(`/bookings/${moved.uid}/cancel`, "2026-02-25", {
  method: "POST",
  body: JSON.stringify({ cancellationReason: "Duplicate booking" }),
});
```

`start` is UTC. Custom field values go in `bookingFieldsResponses` keyed by slug. A location of type `integration` only works if that app is already installed on the account (via API only Google Meet, Teams and Zoom can be installed; Cal Video is the default). Rescheduling creates a new booking with a new `uid`. If the event type has seats or recurrence, the cancel and create bodies differ (`seatUid`, `recurrenceCount`); read the booking reference.

### Team round-robin and schedules

Team event types are created at `POST /v2/teams/{teamId}/event-types` (organization and team plan). Scheduling types are lowercase: `collective`, `roundRobin`, `managed`.

```typescript
await calFetch("/teams/4217/event-types", "2026-06-12", {
  method: "POST",
  body: JSON.stringify({
    title: "Product Demo",
    slug: "product-demo",
    lengthInMinutes: 45,
    schedulingType: "roundRobin",
    hosts: [
      { userId: 101 },
      { userId: 102 },
      { userId: 103, mandatory: true },   // fixed host, always attends
    ],
    beforeEventBuffer: 15,
    afterEventBuffer: 10,
    minimumBookingNotice: 120,            // minutes
    slotInterval: 15,
  }),
});

await calFetch("/schedules", "2024-06-11", {
  method: "POST",
  body: JSON.stringify({
    name: "Business Hours",
    timeZone: "America/New_York",
    isDefault: true,
    availability: [{ days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"], startTime: "09:00", endTime: "17:00" }],
    overrides: [{ date: "2026-12-31", startTime: "09:00", endTime: "12:00" }],
  }),
});
```

Days are names, not numbers. An override replaces that date's availability with the given window.

### Webhooks

Create a subscription at `/settings/developer/webhooks` (or per event type): a subscriber URL, triggers, and an optional secret. On Cal.com cloud the URL must be HTTPS and public. The signature is HMAC-SHA256 of the raw body in the `x-cal-signature-256` header.

```typescript
// app/api/cal-webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";

function validSignature(rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const expected = crypto.createHmac("sha256", process.env.CAL_WEBHOOK_SECRET!).update(rawBody).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  if (!validSignature(rawBody, request.headers.get("x-cal-signature-256"))) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  const event = JSON.parse(rawBody);

  switch (event.triggerEvent) {
    case "BOOKING_CREATED":
      await saveBooking(event.payload.uid, event.payload.attendees[0], event.payload.startTime);
      break;
    case "BOOKING_CANCELLED":
      await markCancelled(event.payload.uid, event.payload.cancellationReason);
      break;
    case "BOOKING_RESCHEDULED":
      await moveBooking(event.payload.rescheduleUid, event.payload.uid, event.payload.startTime);
      break;
    case "MEETING_ENDED":
      await sendFollowUp(event.uid);   // flat payload: no "payload" wrapper
      break;
  }
  return NextResponse.json({ received: true });
}
```

`MEETING_STARTED` and `MEETING_ENDED` have a flat payload (booking fields at the top level next to `triggerEvent`); all other triggers wrap the booking in `payload`. The payload version is in the `x-cal-webhook-version` header. Other triggers include `BOOKING_REQUESTED`, `BOOKING_REJECTED`, `BOOKING_PAID`, `BOOKING_NO_SHOW_UPDATED` and `FORM_SUBMITTED`. For seated events `attendees` holds only the seat that triggered the call.

### Self-hosting (Cal.diy)

The `calcom/cal.com` repository README now points self-hosters to `calcom/cal.diy`: MIT, no Enterprise features, no hosted version, and the maintainers call it unsuitable for production use. Teams, Organizations, Insights and workflows are removed.

```bash
git clone --recursive https://github.com/calcom/cal.diy.git
cd cal.diy
cp .env.example .env
openssl rand -base64 32   # put in NEXTAUTH_SECRET
openssl rand -base64 24   # put in CALENDSO_ENCRYPTION_KEY (32 bytes for AES-256)
docker compose pull
docker compose up -d
```

The image is `calcom/cal.diy` (use the `-arm` tag suffix on ARM). Push notifications need VAPID keys from `npx web-push generate-vapid-keys`. For local development, `yarn dx` starts Postgres in Docker and seeds test users with well-known passwords; never expose that.

## Examples

### Example 1: Demo booking on the pricing page

**User request:** "Put a Cal.com booking widget on our pricing page and prefill the visitor's name and email when they are logged in."

Install `@calcom/embed-react`, render `<Cal calLink="maria-lopez/discovery-call" namespace="discovery-call" config={{ name, email }} />` with the values from the session, and call `getCalApi({ namespace: "discovery-call" })` once to set `theme` and `layout`. The page shows the month view with the visitor's details already filled in; confirmation goes to their email.

### Example 2: Sync bookings into a CRM

**User request:** "When someone books, cancels or moves a call, update our CRM."

Add the route from the Webhooks section, set `CAL_WEBHOOK_SECRET` in the environment and the same value in the Cal.com webhook form, and subscribe to Booking Created, Cancelled, Rescheduled. A test delivery with a wrong secret returns 401; a real booking creates one `saveBooking` call keyed by `payload.uid`, and the response `{ "received": true }` marks it delivered. Use `uid` (not the numeric `bookingId`) as the key, since a reschedule produces a new uid and carries the old one in `rescheduleUid`.

## Guidelines

1. Always send `cal-api-version` and use the value for that endpoint family; otherwise an older shape is returned or the call 404s.
2. Verify `x-cal-signature-256` against the raw request body before parsing; compare buffers of equal length with `timingSafeEqual`.
3. Respond to webhooks quickly with 2xx and do heavy work asynchronously; deduplicate by `uid` and `idempotencyKey`.
4. Keep API keys on the server in environment variables; never ship them to the browser. Prefer OAuth for multi-user apps.
5. Stay under 120 requests per minute per API key; cache slot queries.
6. All times in requests are UTC ISO 8601; pass `timeZone` for display and attendee.
7. For compliance-driven self-hosting, check that Cal.diy has the features you need (no Teams or SSO); the hosted product or an enterprise license is the supported production route.
