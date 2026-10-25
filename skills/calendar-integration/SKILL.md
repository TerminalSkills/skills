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
  version: 1.1.0
  repository: https://github.com/googleapis/google-api-nodejs-client
  category: development
  tags: "calendar, google-calendar, outlook, microsoft-graph, scheduling"
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
  prompt: 'consent', // Google returns a refresh token only on first consent unless you force it
  scope: [
    'https://www.googleapis.com/auth/calendar.events',     // event CRUD
    'https://www.googleapis.com/auth/calendar.freebusy',   // freebusy.query does not accept calendar.events
  ],
});
const { tokens } = await oauth2Client.getToken(authorizationCode);
oauth2Client.setCredentials(tokens);
const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Service account (server-to-server). Without domain-wide delegation it only sees calendars
// shared with the service account's e-mail; with it, impersonate a Workspace user via `subject`.
const auth = new google.auth.GoogleAuth({
  keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS, // path to the key file, never committed
  scopes: ['https://www.googleapis.com/auth/calendar'],
  clientOptions: { subject: 'sarah@company.com' },
});
const calendarAsSarah = google.calendar({ version: 'v3', auth });
```

#### Create Events
```typescript
// Timed event with attendees and Meet link
const event = await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'Sprint Planning',
    description: 'Plan sprint 14 tasks and capacity.',
    start: { dateTime: '2026-11-02T14:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-11-02T15:00:00', timeZone: 'America/New_York' },
    attendees: [{ email: 'sarah@company.com' }, { email: 'mike@company.com' }],
    // Service accounts need domain-wide delegation to populate the attendee list
    conferenceData: {
      createRequest: { requestId: crypto.randomUUID(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
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
    start: { dateTime: '2026-11-02T09:30:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-11-02T09:45:00', timeZone: 'America/New_York' },
    recurrence: ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20261231T000000Z'],
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
  requestBody: { summary: 'Sprint Planning (MOVED)', start: { dateTime: '2026-11-03T14:00:00', timeZone: 'America/New_York' }, end: { dateTime: '2026-11-03T15:00:00', timeZone: 'America/New_York' } },
  sendUpdates: 'all',
});

// Delete event
await calendar.events.delete({ calendarId: 'primary', eventId, sendUpdates: 'all' });
```

#### Free/Busy Query
```typescript
const { data } = await calendar.freebusy.query({
  requestBody: {
    timeMin: '2026-11-02T09:00:00-05:00',
    timeMax: '2026-11-02T18:00:00-05:00',
    timeZone: 'America/New_York',
    items: [{ id: 'sarah@company.com' }, { id: 'mike@company.com' }],
  },
});
// data.calendars['sarah@company.com'].busy → array of { start, end } blocks
```

#### Push notifications
`calendar.events.watch({ calendarId, requestBody: { id: crypto.randomUUID(), type: 'web_hook', address: 'https://hooks.company.com/gcal', token: 'target=sprint-calendar' } })`. The address must be HTTPS with a valid certificate. A channel expires at the time you request or at Google's own limit (whichever is sooner), there is no auto-renewal, and a notification carries no event data: on each one, run `events.list` with your stored `syncToken`. Check the `X-Goog-Channel-Expiration` header and replace the channel (new `id`) before it lapses.

### Microsoft Outlook Calendar (Graph API)

#### Authentication
App-only (below) needs the **application** permission `Calendars.ReadWrite` granted by an admin; restrict which mailboxes the app can reach with RBAC for Applications in Exchange Online (it replaces Application Access Policies). `findMeetingTimes` does **not** support app-only tokens (delegated `Calendars.Read.Shared` only), so with this credential use `getSchedule` (application `Calendars.ReadBasic` or higher) instead. For `findMeetingTimes`, sign the user in with a delegated flow.
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
  start: { dateTime: '2026-11-02T14:00:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-11-02T15:00:00', timeZone: 'America/New_York' },
  attendees: [
    { emailAddress: { address: 'sarah@company.com' }, type: 'required' },
  ],
  isOnlineMeeting: true,
  onlineMeetingProvider: 'teamsForBusiness',
});

// List events in date range
const events = await graphClient.api(`/users/${userId}/calendarView`)
  .query({ startDateTime: '2026-11-02T00:00:00Z', endDateTime: '2026-11-08T23:59:59Z' })
  .select('subject,start,end,location,isOnlineMeeting')
  .orderby('start/dateTime').top(50).get();

// Availability for several people (works app-only); availabilityView: 0 free or working elsewhere, 1 tentative, 2 busy, 3 OOF
const schedule = await graphClient.api(`/users/${userId}/calendar/getSchedule`).post({
  schedules: ['sarah@company.com', 'mike@company.com'],
  startTime: { dateTime: '2026-11-02T09:00:00', timeZone: 'America/New_York' },
  endTime: { dateTime: '2026-11-02T18:00:00', timeZone: 'America/New_York' },
  availabilityViewInterval: 60,
});

// Find meeting times (smart scheduling) - delegated sign-in only, not the app-only client above
const suggestions = await graphClient.api(`/users/${userId}/findMeetingTimes`).post({
  attendees: [
    { emailAddress: { address: 'sarah@company.com' }, type: 'required' },
  ],
  timeConstraint: { timeslots: [{
    start: { dateTime: '2026-11-02T09:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-11-06T18:00:00', timeZone: 'America/New_York' },
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
| Free/busy | freebusy.query | getSchedule (app or delegated) / findMeetingTimes (delegated only) |
| Webhooks | Watch channels (expire per request/Google limit; renew by creating a new channel) | Subscriptions (under 7 days; 1 day with resource data) |
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
**User prompt:** "Create a daily standup meeting at 9:30 AM ET on weekdays in Microsoft Teams for our engineering team, running through December 2026."

The agent will:
1. Authenticate with Microsoft Graph API using the configured Azure AD credentials
2. Call `graphClient.api(`/users/${userId}/events`).post()` with `isOnlineMeeting: true`, `onlineMeetingProvider: 'teamsForBusiness'` and this recurrence:
   `recurrence: { pattern: { type: 'weekly', interval: 1, daysOfWeek: ['monday','tuesday','wednesday','thursday','friday'] }, range: { type: 'endDate', startDate: '2026-11-02', endDate: '2026-12-31' } }`
3. Use start `2026-11-02T09:30:00` and end `2026-11-02T09:45:00` in `America/New_York`; the recurrence range supplies the dates
4. Add all engineering team members as required attendees and return the Teams join URL

## Guidelines

- Always specify `timeZone` — never rely on server timezone for calendar operations
- Use `singleEvents: true` (Google) or `calendarView` (Outlook) to expand recurring events
- Free/busy before creating — check availability, don't just double-book
- Webhook renewal - Google channels and Graph subscriptions (under 7 days, 1 day with resource data) both lapse silently; run a renewal job and answer Graph's validation request (echo `validationToken`) within 10 seconds
- Use sync tokens (Google) / `calendarView/delta` (Outlook) for efficient polling; a notification only says something changed
- Use one client secret per environment, kept in env vars or a vault; scope Google OAuth to `calendar.events` plus `calendar.freebusy` (free/busy queries) when you do not need calendar-list access
- Buffer time between events — back-to-back meetings are a UX problem
- ISO 8601 for all date handling — never parse dates as strings manually
- Send meeting updates to attendees (`sendUpdates: 'all'`) — silent changes cause confusion
- Rate limits: Google Calendar allows 10,000 requests/min per project and 600/min per user per project, and also throttles bursts of writes to one calendar (back off exponentially on 403 `rateLimitExceeded`/429). Outlook via Graph: 10,000 requests per 10 minutes and 4 concurrent requests per app and mailbox pair (back off on 429 `Retry-After`)
