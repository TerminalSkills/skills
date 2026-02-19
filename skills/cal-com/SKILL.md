---
name: cal-com
description: >-
  Add scheduling and booking with Cal.com. Use when a user asks to add appointment
  booking, build a scheduling page, embed a calendar widget, create meeting
  types, integrate with Google Calendar, or build a Calendly alternative.
license: Apache-2.0
compatibility: 'Self-hosted (Docker) or Cal.com Cloud, any frontend via embed'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - cal-com
    - scheduling
    - booking
    - calendar
    - appointments
---

# Cal.com

## Overview

Cal.com is open-source scheduling infrastructure — the self-hostable Calendly. Embed booking widgets, create event types, sync with Google/Outlook calendars, handle payments, and build custom scheduling flows via API.

## Instructions

### Step 1: Self-Hosted Deployment

```bash
git clone https://github.com/calcom/cal.com.git
cd cal.com
cp .env.example .env
# Edit .env with DATABASE_URL, NEXTAUTH_SECRET, etc.
npm install
npx prisma db push
npm run build
npm start
```

### Step 2: Embed Booking Widget

```html
<!-- Embed Cal.com booking in any website -->
<script src="https://app.cal.com/embed/embed.js" async></script>
<button data-cal-link="username/meeting-type">Book a Call</button>
```

```tsx
// React embed
import Cal, { getCalApi } from '@calcom/embed-react'

export function BookingWidget() {
  return <Cal calLink="username/30min" style={{ width: '100%', height: '100%' }} />
}
```

### Step 3: API Integration

```typescript
// lib/cal.ts — Create bookings programmatically
const CAL_API = 'https://api.cal.com/v1'
const CAL_KEY = process.env.CAL_API_KEY

// List event types
const eventTypes = await fetch(`${CAL_API}/event-types?apiKey=${CAL_KEY}`).then(r => r.json())

// Get available slots
const slots = await fetch(
  `${CAL_API}/slots?apiKey=${CAL_KEY}&eventTypeId=123&startTime=2025-03-01&endTime=2025-03-07`
).then(r => r.json())

// Create booking
await fetch(`${CAL_API}/bookings?apiKey=${CAL_KEY}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    eventTypeId: 123,
    start: '2025-03-05T10:00:00Z',
    responses: { name: 'John', email: 'john@example.com' },
  }),
})
```

## Guidelines

- Cal.com Cloud is free for individuals (1 event type). Self-hosting is free with all features.
- Supports Google Calendar, Outlook, Apple Calendar sync — prevents double-booking.
- Use webhooks to trigger actions on booking (send confirmation, create task, update CRM).
- Stripe/PayPal integration for paid bookings is built in.
