---
name: calendar-integration
description: >-
  Integrate with Google Calendar and Microsoft Outlook Calendar for scheduling,
  event management, and availability tracking. Use when someone asks to "create
  calendar events", "check availability", "schedule meetings", "sync calendars",
  "Google Calendar API", "Outlook Calendar API", "booking system", "find free
  slots", or "manage recurring events". Covers Google Calendar API v3, Microsoft
  Graph Calendar API, event CRUD, availability/free-busy queries, recurring
  events, and building scheduling features.
license: Apache-2.0
compatibility: 'Google Calendar API v3, Microsoft Graph API v1.0. Node.js/Python examples.'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - calendar
    - google-calendar
    - outlook
    - microsoft-graph
    - scheduling
---

# Calendar Integration

## Overview

This skill helps AI agents integrate with Google Calendar and Microsoft Outlook Calendar. It covers authentication, event CRUD, recurring events, availability/free-busy queries, webhook notifications, and building scheduling features like booking pages and meeting coordinators.

## Instructions

### Google Calendar API v3

#### Authentication
```typescript
import { google } from 'googleapis';

// OAuth 2.0 (user context)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar'],
});
const { tokens } = await oauth2Client.getToken(authorizationCode);
oauth2Client.setCredentials(tokens);
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Service Account (server-to-server, domain-wide delegation)
const auth = new google.auth.GoogleAuth({
  keyFile: '/path/to/service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
  clientOptions: { subject: 'user@company.com' },
});
```

#### Create Events
```typescript
// Timed event with attendees and Meet link
const event = await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'Sprint Planning',
    description: 'Plan sprint 14 tasks and capacity.',
    start: { dateTime: '2026-03-01T14:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-01T15:00:00', timeZone: 'America/New_York' },
    attendees: [{ email: 'sarah@company.com' }, { email: 'mike@company.com' }],
    conferenceData: {
      createRequest: { requestId: 'req-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
    },
  },
  conferenceDataVersion: 1,
  sendUpdates: 'all',
});

// Recurring event
await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'Daily Standup',
    start: { dateTime: '2026-03-01T09:30:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-01T09:45:00', timeZone: 'America/New_York' },
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20260630T000000Z'],
  },
});
```

#### RRULE Reference
```
Daily:          RRULE:FREQ=DAILY;COUNT=30
Weekly:         RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
Biweekly:       RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU
Monthly (date): RRULE:FREQ=MONTHLY;BYMONTHDAY=1
Monthly (day):  RRULE:FREQ=MONTHLY;BYDAY=2TU
With end date:  RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T000000Z
```

#### Query, Update, Delete
```typescript
// List upcoming events (next 7 days)
const { data } = await calendar.events.list({
  calendarId: 'primary',
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  singleEvents: true, orderBy: 'startTime', maxResults: 50,
});

// Update event
await calendar.events.patch({
  calendarId: 'primary', eventId,
  requestBody: { summary: 'Sprint Planning (MOVED)', start: { dateTime: '2026-03-02T14:00:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-03-02T15:00:00', timeZone: 'America/New_York' } },
  sendUpdates: 'all',
});

// Delete event
await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
```

#### Free/Busy Query
```typescript
const { data } = await calendar.freebusy.query({
  requestBody: {
    timeMin: '2026-03-01T09:00:00-05:00',
    timeMax: '2026-03-01T18:00:00-05:00',
    timeZone: 'America/New_York',
    items: [{ id: 'sarah@company.com' }, { id: 'mike@company.com' }],
  },
});
// data.calendars['sarah@company.com'].busy → array of { start, end } blocks
```

### Microsoft Outlook Calendar (Graph API)

#### Authentication
```typescript
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID, process.env.AZURE_CLIENT_ID, process.env.AZURE_CLIENT_SECRET
);
const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});
const graphClient = Client.initWithMiddleware({ authProvider });
```

#### Create Events & Query
```typescript
// Create event with Teams meeting
const event = await graphClient.api(`/users/${userId}/events`).post({
  subject: 'Sprint Planning',
  start: { dateTime: '2026-03-01T14:00:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-03-01T15:00:00', timeZone: 'America/New_York' },
  attendees: [
    { emailAddress: { address: 'sarah@company.com' }, type: 'required' },
  ],
  isOnlineMeeting: true,
  onlineMeetingProvider: 'teamsForBusiness',
});

// List events in date range
const events = await graphClient.api(`/users/${userId}/calendarView`)
  .query({ startDateTime: '2026-03-01T00:00:00Z', endDateTime: '2026-03-07T23:59:59Z' })
  .select('subject,start,end,location,isOnlineMeeting')
  .orderby('start/dateTime').top(50).get();

// Find meeting times (smart scheduling)
const suggestions = await graphClient.api(`/users/${userId}/findMeetingTimes`).post({
  attendees: [
    { emailAddress: { address: 'sarah@company.com' }, type: 'required' },
  ],
  timeConstraint: { timeslots: [{
    start: { dateTime: '2026-03-01T09:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-05T18:00:00', timeZone: 'America/New_York' },
  }] },
  meetingDuration: 'PT1H',
  maxCandidates: 5,
});
```

### API Comparison

| Feature | Google Calendar | Outlook (Graph) |
|---------|----------------|-----------------|
| Auth | Google OAuth 2.0 | Azure AD OAuth 2.0 |
| Video meeting | Google Meet | Teams (isOnlineMeeting) |
| Free/busy | freebusy.query | getSchedule / findMeetingTimes |
| Webhooks | Push notifications (7 day max) | Subscriptions (3 day max) |
| Recurring | RRULE strings | Structured recurrence object |
| Smart scheduling | Not built-in | findMeetingTimes (ranked) |

## Examples

### Example 1: Schedule a team meeting across calendars
**User prompt:** "Find a 1-hour slot next week when Sarah, Mike, and Conference Room B are all free, then create a Sprint Planning meeting with a Google Meet link."

The agent will:
1. Call `calendar.freebusy.query` with all three calendar IDs for next week's business hours
2. Parse the busy blocks to find common free 1-hour windows
3. Present the available slots to the user
4. Create the event with `calendar.events.insert` including attendees, Meet link (`conferenceDataVersion: 1`), and send notifications to all attendees

### Example 2: Set up a recurring standup with Outlook
**User prompt:** "Create a daily standup meeting at 9:30 AM ET on weekdays in Microsoft Teams for our engineering team, running through June 2026."

The agent will:
1. Authenticate with Microsoft Graph API using the configured Azure AD credentials
2. Call `graphClient.api('/users/{userId}/events').post()` with `isOnlineMeeting: true`, `onlineMeetingProvider: 'teamsForBusiness'`, and a weekly recurrence pattern for Monday-Friday
3. Set the recurrence range with `startDate: '2026-03-01'` and `endDate: '2026-06-30'`
4. Add all engineering team members as required attendees and return the Teams join URL

## Guidelines

- Always specify `timeZone` — never rely on server timezone for calendar operations
- Use `singleEvents: true` (Google) or `calendarView` (Outlook) to expand recurring events
- Free/busy before creating — check availability, don't just double-book
- Webhook renewal — both Google (7d max) and Outlook (3d max) require renewal jobs
- Use sync tokens (Google) / delta queries (Outlook) for efficient polling
- Buffer time between events — back-to-back meetings are a UX problem
- ISO 8601 for all date handling — never parse dates as strings manually
- Send meeting updates to attendees (`sendUpdates: 'all'`) — silent changes cause confusion
- Rate limits: Google ~10 QPS per user, Graph ~10,000 per 10 min per app per tenant
