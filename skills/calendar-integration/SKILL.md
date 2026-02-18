---
name: calendar-integration
description: >-
  Integrate with Google Calendar and Microsoft Outlook Calendar for scheduling,
  event management, and availability tracking. Use when someone asks to "create
  calendar events", "check availability", "schedule meetings", "sync calendars",
  "Google Calendar API", "Outlook Calendar API", "booking system", "find free slots",
  or "manage recurring events". Covers Google Calendar API v3, Microsoft Graph
  Calendar API, event CRUD, availability/free-busy queries, recurring events,
  and building scheduling features.
license: Apache-2.0
compatibility: "Google Calendar API v3, Microsoft Graph API v1.0. Node.js/Python examples."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["calendar", "google-calendar", "outlook", "scheduling", "microsoft-graph", "api"]
---

# Calendar Integration

## Overview

This skill helps AI agents integrate with Google Calendar and Microsoft Outlook Calendar. It covers authentication, event CRUD, recurring events, availability/free-busy queries, calendar sharing, webhook notifications, and building scheduling features like booking pages and meeting coordinators.

## Instructions

### Google Calendar API v3

#### Authentication
```typescript
// Option 1: OAuth 2.0 (user context — access their calendars)
import { google } from 'googleapis';

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/calendar',         // Full read/write
    'https://www.googleapis.com/auth/calendar.events',   // Events only
    'https://www.googleapis.com/auth/calendar.readonly',  // Read only
  ],
});

const { tokens } = await oauth2Client.getToken(authorizationCode);
oauth2Client.setCredentials(tokens);

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

// Option 2: Service Account (server-to-server, domain-wide delegation)
const auth = new google.auth.GoogleAuth({
  keyFile: '/path/to/service-account-key.json',
  scopes: ['https://www.googleapis.com/auth/calendar'],
  clientOptions: {
    subject: 'user@company.com', // Impersonate user (requires domain-wide delegation)
  },
});
const calendar = google.calendar({ version: 'v3', auth });
```

#### List Calendars
```typescript
const { data } = await calendar.calendarList.list();
data.items.forEach(cal => {
  console.log(`${cal.summary} (${cal.id}) — ${cal.accessRole}`);
});

// Primary calendar ID is usually the user's email or 'primary'
```

#### Create Events
```typescript
// Simple event
const event = await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'Sprint Planning',
    description: 'Plan sprint 14 tasks and capacity.',
    location: 'Conference Room B / Google Meet',
    start: {
      dateTime: '2026-03-01T14:00:00',
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: '2026-03-01T15:00:00',
      timeZone: 'America/New_York',
    },
    attendees: [
      { email: 'sarah@company.com' },
      { email: 'mike@company.com' },
      { email: 'team-room@resource.calendar.google.com' }, // Room resource
    ],
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 15 },
        { method: 'email', minutes: 60 },
      ],
    },
    conferenceData: {
      createRequest: {
        requestId: 'unique-request-id-' + Date.now(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  },
  conferenceDataVersion: 1, // Required for creating Meet link
  sendUpdates: 'all', // Notify attendees: 'all', 'externalOnly', 'none'
});

console.log('Event created:', event.data.htmlLink);
console.log('Meet link:', event.data.conferenceData?.entryPoints?.[0]?.uri);

// All-day event
await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'Company Holiday',
    start: { date: '2026-03-17' }, // date (not dateTime) for all-day
    end: { date: '2026-03-18' },   // End is exclusive
    transparency: 'transparent',    // Don't block availability
  },
});

// Recurring event
await calendar.events.insert({
  calendarId: 'primary',
  requestBody: {
    summary: 'Daily Standup',
    start: {
      dateTime: '2026-03-01T09:30:00',
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: '2026-03-01T09:45:00',
      timeZone: 'America/New_York',
    },
    recurrence: [
      'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR;UNTIL=20260630T000000Z',
    ],
    attendees: [
      { email: 'team@company.com' },
    ],
  },
});
```

#### RRULE Reference (Recurrence Rules)
```
Daily:          RRULE:FREQ=DAILY;COUNT=30
Weekly:         RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
Biweekly:       RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU
Monthly:        RRULE:FREQ=MONTHLY;BYMONTHDAY=1
Monthly (day):  RRULE:FREQ=MONTHLY;BYDAY=2TU          (2nd Tuesday)
Yearly:         RRULE:FREQ=YEARLY;BYMONTH=3;BYMONTHDAY=17
With end date:  RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261231T000000Z
With count:     RRULE:FREQ=DAILY;COUNT=10
```

#### Query Events
```typescript
// List upcoming events
const { data } = await calendar.events.list({
  calendarId: 'primary',
  timeMin: new Date().toISOString(),
  timeMax: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // Next 7 days
  singleEvents: true,   // Expand recurring events into instances
  orderBy: 'startTime',
  maxResults: 50,
});

data.items.forEach(event => {
  const start = event.start.dateTime || event.start.date;
  console.log(`${start} — ${event.summary} (${event.status})`);
});

// Search events by text
const { data: searchResults } = await calendar.events.list({
  calendarId: 'primary',
  q: 'sprint planning', // Full-text search
  timeMin: '2026-01-01T00:00:00Z',
  singleEvents: true,
  orderBy: 'startTime',
});
```

#### Update & Delete
```typescript
// Update event
await calendar.events.patch({
  calendarId: 'primary',
  eventId: eventId,
  requestBody: {
    summary: 'Sprint Planning (MOVED)',
    start: { dateTime: '2026-03-02T14:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-02T15:00:00', timeZone: 'America/New_York' },
  },
  sendUpdates: 'all',
});

// Delete event
await calendar.events.delete({
  calendarId: 'primary',
  eventId: eventId,
  sendUpdates: 'all',
});

// Cancel a single instance of recurring event
await calendar.events.patch({
  calendarId: 'primary',
  eventId: instanceEventId, // Specific instance ID
  requestBody: { status: 'cancelled' },
});
```

#### Free/Busy Query (Availability)
```typescript
const { data } = await calendar.freebusy.query({
  requestBody: {
    timeMin: '2026-03-01T09:00:00-05:00',
    timeMax: '2026-03-01T18:00:00-05:00',
    timeZone: 'America/New_York',
    items: [
      { id: 'sarah@company.com' },
      { id: 'mike@company.com' },
      { id: 'conference-room-b@resource.calendar.google.com' },
    ],
  },
});

// data.calendars['sarah@company.com'].busy → array of { start, end } blocks
// Empty busy array = fully available in that window

// Find common free slots
function findFreeSlots(busyData, startTime, endTime, durationMin) {
  const allBusy = Object.values(busyData.calendars)
    .flatMap(cal => cal.busy)
    .map(b => ({ start: new Date(b.start), end: new Date(b.end) }))
    .sort((a, b) => a.start - b.start);

  const slots = [];
  let current = new Date(startTime);
  const end = new Date(endTime);
  const durationMs = durationMin * 60 * 1000;

  for (const busy of allBusy) {
    if (busy.start - current >= durationMs) {
      slots.push({ start: new Date(current), end: new Date(busy.start) });
    }
    if (busy.end > current) current = busy.end;
  }
  if (end - current >= durationMs) {
    slots.push({ start: new Date(current), end });
  }

  return slots;
}
```

#### Watch for Changes (Webhooks)
```typescript
// Set up push notifications
const { data } = await calendar.events.watch({
  calendarId: 'primary',
  requestBody: {
    id: 'unique-channel-id-' + Date.now(),
    type: 'web_hook',
    address: 'https://your-app.com/api/calendar-webhook',
    expiration: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days max
  },
});

// Webhook handler
app.post('/api/calendar-webhook', async (req, res) => {
  const channelId = req.headers['x-goog-channel-id'];
  const resourceState = req.headers['x-goog-resource-state'];
  
  if (resourceState === 'sync') {
    // Initial sync notification — ignore
    return res.status(200).send();
  }

  // Fetch updated events using sync token
  const { data } = await calendar.events.list({
    calendarId: 'primary',
    syncToken: savedSyncToken, // From previous list call
  });

  for (const event of data.items) {
    console.log(`Event ${event.status}: ${event.summary}`);
  }

  // Save new sync token
  savedSyncToken = data.nextSyncToken;
  res.status(200).send();
});

// Stop watching
await calendar.channels.stop({
  requestBody: {
    id: channelId,
    resourceId: resourceId, // From watch response
  },
});
```

### Microsoft Outlook Calendar (Graph API)

#### Authentication
```typescript
// Same Azure AD app as Teams/SharePoint
import { ClientSecretCredential } from '@azure/identity';
import { Client } from '@microsoft/microsoft-graph-client';
import { TokenCredentialAuthenticationProvider } from '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials';

// Permissions needed:
//   Calendars.ReadWrite — read/write user's calendars
//   Calendars.ReadWrite.Shared — access shared calendars

const credential = new ClientSecretCredential(
  process.env.AZURE_TENANT_ID,
  process.env.AZURE_CLIENT_ID,
  process.env.AZURE_CLIENT_SECRET
);

const authProvider = new TokenCredentialAuthenticationProvider(credential, {
  scopes: ['https://graph.microsoft.com/.default'],
});

const graphClient = Client.initWithMiddleware({ authProvider });
```

#### Create Events
```typescript
// Create event with Teams meeting
const event = await graphClient.api(`/users/${userId}/events`)
  .post({
    subject: 'Sprint Planning',
    body: {
      contentType: 'HTML',
      content: '<p>Plan sprint 14 tasks and capacity.</p>',
    },
    start: {
      dateTime: '2026-03-01T14:00:00',
      timeZone: 'America/New_York',
    },
    end: {
      dateTime: '2026-03-01T15:00:00',
      timeZone: 'America/New_York',
    },
    location: {
      displayName: 'Conference Room B',
    },
    attendees: [
      {
        emailAddress: { address: 'sarah@company.com', name: 'Sarah' },
        type: 'required',
      },
      {
        emailAddress: { address: 'mike@company.com', name: 'Mike' },
        type: 'optional',
      },
    ],
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    allowNewTimeProposals: true,
  });

console.log('Event:', event.webLink);
console.log('Teams link:', event.onlineMeeting?.joinUrl);

// Recurring event
await graphClient.api(`/users/${userId}/events`)
  .post({
    subject: 'Daily Standup',
    start: { dateTime: '2026-03-01T09:30:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-01T09:45:00', timeZone: 'America/New_York' },
    recurrence: {
      pattern: {
        type: 'weekly',
        interval: 1,
        daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
      },
      range: {
        type: 'endDate',
        startDate: '2026-03-01',
        endDate: '2026-06-30',
      },
    },
  });
```

#### Query Events
```typescript
// List events in date range
const events = await graphClient.api(`/users/${userId}/calendarView`)
  .query({
    startDateTime: '2026-03-01T00:00:00Z',
    endDateTime: '2026-03-07T23:59:59Z',
  })
  .select('subject,start,end,location,attendees,isOnlineMeeting,onlineMeeting')
  .orderby('start/dateTime')
  .top(50)
  .get();

// Search events
const searchResults = await graphClient.api(`/users/${userId}/events`)
  .filter("contains(subject, 'sprint')")
  .select('subject,start,end')
  .orderby('start/dateTime')
  .get();
```

#### Free/Busy (Scheduling Assistant)
```typescript
// Get availability for multiple users
const availability = await graphClient.api('/users/${userId}/calendar/getSchedule')
  .post({
    schedules: ['sarah@company.com', 'mike@company.com', 'room-b@company.com'],
    startTime: {
      dateTime: '2026-03-01T09:00:00',
      timeZone: 'America/New_York',
    },
    endTime: {
      dateTime: '2026-03-01T18:00:00',
      timeZone: 'America/New_York',
    },
    availabilityViewInterval: 30, // Minutes per slot
  });

// Response contains:
// scheduleItems[].availabilityView — string of 0s (free) and other digits (busy/tentative/OOF)
// scheduleItems[].scheduleItems — detailed busy blocks with subject (if permitted)

// Find meeting times (Microsoft's smart scheduling)
const suggestions = await graphClient.api('/users/${userId}/findMeetingTimes')
  .post({
    attendees: [
      { emailAddress: { address: 'sarah@company.com' }, type: 'required' },
      { emailAddress: { address: 'mike@company.com' }, type: 'required' },
    ],
    timeConstraint: {
      timeslots: [{
        start: { dateTime: '2026-03-01T09:00:00', timeZone: 'America/New_York' },
        end: { dateTime: '2026-03-05T18:00:00', timeZone: 'America/New_York' },
      }],
    },
    meetingDuration: 'PT1H', // ISO 8601 duration: 1 hour
    maxCandidates: 5,
    isOrganizerOptional: false,
    returnSuggestionReasons: true,
  });

// suggestions.meetingTimeSuggestions — ranked list of available slots
```

#### Update & Delete
```typescript
// Update
await graphClient.api(`/users/${userId}/events/${eventId}`)
  .patch({
    subject: 'Sprint Planning (RESCHEDULED)',
    start: { dateTime: '2026-03-02T14:00:00', timeZone: 'America/New_York' },
    end: { dateTime: '2026-03-02T15:00:00', timeZone: 'America/New_York' },
  });

// Delete
await graphClient.api(`/users/${userId}/events/${eventId}`)
  .delete();

// Accept/decline meeting
await graphClient.api(`/users/${userId}/events/${eventId}/accept`)
  .post({ sendResponse: true, comment: 'Looking forward to it!' });

await graphClient.api(`/users/${userId}/events/${eventId}/decline`)
  .post({ sendResponse: true, comment: 'Conflict — can we move to Thursday?' });
```

#### Webhooks (Change Notifications)
```typescript
// Subscribe to calendar changes
const subscription = await graphClient.api('/subscriptions')
  .post({
    changeType: 'created,updated,deleted',
    notificationUrl: 'https://your-app.com/api/outlook-calendar-webhook',
    resource: `/users/${userId}/events`,
    expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    clientState: 'your-secret-token',
  });

// Renew before expiry (max 3 days for Outlook resources)
await graphClient.api(`/subscriptions/${subscription.id}`)
  .patch({
    expirationDateTime: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
  });
```

### Building a Scheduling Feature

Common pattern for booking/scheduling apps:

```typescript
// 1. Define available hours
const BUSINESS_HOURS = {
  start: 9,  // 9 AM
  end: 17,   // 5 PM
  days: [1, 2, 3, 4, 5], // Mon-Fri
  timezone: 'America/New_York',
  slotDuration: 30, // minutes
  bufferBetween: 15, // minutes between meetings
};

// 2. Get busy times from calendar
async function getBusySlots(calendarId, startDate, endDate) {
  // Use Google freeBusy or Outlook getSchedule
  // Returns array of { start, end } busy blocks
}

// 3. Generate available slots
function getAvailableSlots(busyBlocks, date, config) {
  const slots = [];
  let current = new Date(date);
  current.setHours(config.start, 0, 0, 0);
  
  const dayEnd = new Date(date);
  dayEnd.setHours(config.end, 0, 0, 0);

  while (current < dayEnd) {
    const slotEnd = new Date(current.getTime() + config.slotDuration * 60000);
    
    const isAvailable = !busyBlocks.some(busy =>
      new Date(busy.start) < slotEnd && new Date(busy.end) > current
    );

    if (isAvailable) {
      slots.push({
        start: new Date(current),
        end: slotEnd,
      });
    }

    current = new Date(current.getTime() + (config.slotDuration + config.bufferBetween) * 60000);
  }

  return slots;
}

// 4. Book a slot (create event + block calendar)
async function bookSlot(slot, attendeeEmail, subject) {
  return await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary: subject,
      start: { dateTime: slot.start.toISOString(), timeZone: BUSINESS_HOURS.timezone },
      end: { dateTime: slot.end.toISOString(), timeZone: BUSINESS_HOURS.timezone },
      attendees: [{ email: attendeeEmail }],
      conferenceData: {
        createRequest: { requestId: 'book-' + Date.now(), conferenceSolutionKey: { type: 'hangoutsMeet' } },
      },
    },
    conferenceDataVersion: 1,
    sendUpdates: 'all',
  });
}
```

## API Comparison

| Feature | Google Calendar | Outlook (Graph) |
|---------|----------------|-----------------|
| Auth | Google OAuth 2.0 | Azure AD OAuth 2.0 |
| Video meeting | Google Meet (auto-create) | Teams (isOnlineMeeting) |
| Free/busy | freebusy.query | getSchedule / findMeetingTimes |
| Webhooks | Push notifications (7 day max) | Subscriptions (3 day max) |
| Recurring | RRULE strings | Structured recurrence object |
| Smart scheduling | Not built-in | findMeetingTimes (ranked suggestions) |
| Room booking | Resource calendars | Room lists + findRooms |

## Best Practices

- Always specify `timeZone` — never rely on server timezone for calendar operations
- Use `singleEvents: true` (Google) or `calendarView` (Outlook) to expand recurring events
- Free/busy before creating — check availability, don't just double-book
- Webhook renewal — both Google (7d max) and Outlook (3d max) require renewal jobs
- Use sync tokens (Google) / delta queries (Outlook) for efficient polling
- Buffer time between events — back-to-back meetings are a UX problem
- ISO 8601 for all date handling — never parse dates as strings manually
- Send meeting updates to attendees (`sendUpdates: 'all'`) — silent changes cause confusion
- Store calendar IDs, not emails — calendar ID can differ from email address
- Rate limits: Google ~10 QPS per user, Graph ~10,000 per 10 min per app per tenant
