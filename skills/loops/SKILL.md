---
name: loops
description: >-
  Send marketing and transactional emails with Loops. Use when a user asks to
  set up email marketing for a SaaS, create drip campaigns, send product update
  emails, or use a modern alternative to Mailchimp for startups.
license: Apache-2.0
compatibility: 'Any platform via REST API; official JavaScript SDK `loops` needs Node.js 18+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  repository: https://github.com/Loops-so/loops-js
  tags: "loops, email, marketing, saas, campaigns"
---

# Loops

## Overview

Loops is email for SaaS products: transactional emails, event-triggered automations (called workflows), one-off campaigns and a contact audience, all behind one REST API (`https://app.loops.so/api/v1`, Bearer authentication with an API key from Settings, API). The official JavaScript SDK is the `loops` package (`npm install loops`, Node 18+). The plain `fetch` calls below and the SDK methods map one to one.

## Instructions

### Step 1: Client and key check

```typescript
// lib/loops.ts
import { LoopsClient, APIError, RateLimitExceededError } from 'loops'

export const loops = new LoopsClient(process.env.LOOPS_API_KEY!)

// loops.testApiKey() returns { success: true, teamName } for a valid key
```

Without the SDK, call `GET /v1/api-key` with `Authorization: Bearer $LOOPS_API_KEY`; a missing or wrong key gives 401.

### Step 2: Transactional email

Create the email in the Loops editor, add its data variables, publish it, and copy its ID. Publishing is required: sending an unpublished email returns 400.

```typescript
import { randomUUID } from 'node:crypto'
import { loops } from './lib/loops'

await loops.sendTransactionalEmail({
  transactionalId: 'clfq6dinn000yl70fgwwyp82l',   // ID shown in the Loops dashboard
  email: 'maria.lopez@northwind.io',
  dataVariables: { firstName: 'Maria', planName: 'Pro' },
  headers: { 'Idempotency-Key': randomUUID() },   // a retry within 24 h returns 409 instead of a second email
})
```

Raw equivalent: `POST /v1/transactional` with JSON `{ email, transactionalId, dataVariables, addToAudience? }`. Every required data variable of the template must be present, otherwise the API answers 400 naming the missing field. Attachments only work after Loops support enables them for the account.

### Step 3: Events that trigger workflows

```typescript
await loops.sendEvent({
  email: 'maria.lopez@northwind.io',   // or userId; at least one is required
  eventName: 'plan_upgraded',
  eventProperties: { plan: 'pro', mrr: 49 },          // usable inside the emails this event sends
  contactProperties: { plan: 'pro' },                  // optional: updates the contact at the same time
})
```

Raw equivalent: `POST /v1/events/send`. A workflow in the Loops dashboard with the "event received" trigger sends the emails.

### Step 4: Contacts

```typescript
await loops.updateContact({            // PUT /v1/contacts/update; creates the contact if it does not exist
  email: 'maria.lopez@northwind.io',
  properties: {                        // the SDK nests fields under `properties`; the raw REST body is flat
    firstName: 'Maria',
    userGroup: 'pro-users',
    plan: 'pro',                       // custom property: create it first in Settings or POST /v1/contacts/properties
  },
})
```

Other calls: `createContact` (`POST /v1/contacts/create`, fails if the contact exists), `findContact` (`GET /v1/contacts/find?email=`), `deleteContact` (`POST /v1/contacts/delete`), `createContactProperty`. Built-in fields (flat in the REST body, inside `properties` in the SDK) are `email`, `firstName`, `lastName`, `source`, `subscribed`, `userGroup`, `userId` and `mailingLists` (`{ listId: true|false }`).

### Step 5: Errors and rate limits

```typescript
try {
  await loops.sendEvent({ email: 'maria.lopez@northwind.io', eventName: 'signup' })
} catch (error) {
  if (error instanceof RateLimitExceededError) {
    // error.limit requests per second were exceeded: wait, then retry
  } else if (error instanceof APIError) {
    console.error(error.statusCode, error.json)   // e.g. 400 { success: false, message: '...' }
  } else {
    throw error
  }
}
```

## Examples

### Example 1: Welcome email after signup
**User prompt:** "When someone signs up, send them our welcome email from Loops and add them to the audience."

The agent will:
1. Ask for the transactional email ID of the published "Welcome" template and the names of its data variables
2. Add `sendTransactionalEmail({ transactionalId, email, addToAudience: true, dataVariables: { firstName } })` to the signup handler, with an `Idempotency-Key` built from the user ID so retries do not send twice
3. Wrap the call in the `APIError` handling from Step 5 so a Loops outage does not fail the signup

Result: the API returns `{ "success": true }` and the email is sent; the address is added to the audience.

### Example 2: Upgrade nurture sequence
**User prompt:** "After a customer upgrades to Pro, start a 3-email onboarding sequence."

The agent will:
1. Tell the user to build a workflow in the dashboard with the trigger event `plan_upgraded` and three timed emails (the sequence itself is built in the Loops UI, not in code)
2. Call `sendEvent` with `eventName: 'plan_upgraded'` and `eventProperties: { plan: 'pro' }` from the billing webhook handler
3. Check the workflow's activity in the dashboard to see the contact enter it

Result: the contact enters the workflow and receives the first email according to its delay.

## Guidelines

- Free plan (checked on loops.so/pricing, October 2026): unlimited stored contacts, 4,000 marketing plus transactional sends per rolling 30 days to the first 1,000 contacts, up to 10 emails per second, Loops branding in emails. Paid plans are priced by subscribed contacts.
- Keep the API key on the server (`LOOPS_API_KEY`); never ship it to a browser.
- Use `Idempotency-Key` (a UUID up to 100 characters) on transactional and event sends from any code that retries.
- Create custom contact properties in Loops before an API call uses them, as the API reference requires.
- Use transactional emails for one-to-one messages the user triggered (receipts, password resets) and events plus workflows for lifecycle sequences. Marketing sends go to subscribed contacts only.
- For transactional-only needs a plain email API such as Resend is simpler; Loops is the better fit when marketing and product emails share one audience.
