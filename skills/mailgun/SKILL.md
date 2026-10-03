---
name: mailgun
description: >-
  Mailgun is an email API for sending, receiving and tracking transactional
  and bulk email. Use when a user asks to send email through Mailgun, send
  batch emails with per-recipient variables, set up inbound routes, validate
  email addresses, or verify Mailgun webhooks for delivery, open, click and
  bounce events.
license: Apache-2.0
compatibility: 'Any language (REST API); official Node SDK mailgun.js needs Node 18+'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags:
    - mailgun
    - email
    - api
    - bulk
    - marketing
---

# Mailgun

## Overview

Mailgun is a developer-focused email API (closed source, hosted) for sending, receiving and tracking email over HTTPS or SMTP. It offers batch sending with per-recipient variables, inbound routes, address validation, event webhooks and logs. Accounts live in one of two regions, US (`https://api.mailgun.net`) or EU (`https://api.eu.mailgun.net`); the region is fixed per domain and the API key only works against its own region. Checked against the Mailgun documentation and mailgun.js 14.0.1 (August 2026).

## Instructions

### Step 1: Prepare a domain

Add a sending domain in the dashboard, preferably a subdomain such as `mg.acmeshop.io`, and publish the SPF and DKIM DNS records Mailgun shows until the domain verifies. A sandbox domain works without DNS but only delivers to recipients you authorize. Use a separate subdomain for marketing mail so its reputation does not affect receipts and password resets. Keep the Private API key in `MAILGUN_API_KEY` and the HTTP webhook signing key (a different secret) in `MAILGUN_WEBHOOK_SIGNING_KEY`.

### Step 2: Send with mailgun.js

```bash
npm install mailgun.js
```

Since version 3 the constructor takes a FormData implementation; on Node 18+ the built-in global `FormData` works, no `form-data` package needed.

```typescript
// lib/mailgun.ts
import Mailgun from 'mailgun.js'

const mailgun = new Mailgun(FormData)
export const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY!,
  url: 'https://api.eu.mailgun.net', // omit for a US-region account
})

await mg.messages.create('mg.acmeshop.io', {
  from: 'Acme Shop <noreply@mg.acmeshop.io>',
  to: ['dana.ortiz@fastmail.com'],
  subject: 'Your order #4821 has shipped',
  text: 'Order #4821 shipped today.',
  html: '<h1>Order #4821 has shipped</h1>',
  'o:tag': ['order-shipped'],
  'o:tracking-opens': 'yes',
  'o:tracking-clicks': 'yes',
})
```

The first argument is the sending domain, not the From address. A resolved promise only means Mailgun accepted the message; delivery is reported by events.

### Step 3: Batch sending

Up to 1,000 recipients per call. Pass `recipient-variables` (JSON keyed by address) or every recipient sees the whole `to` list; reference values as `%recipient.name%`.

```typescript
await mg.messages.create('mg.acmeshop.io', {
  from: 'Acme Shop <news@mg.acmeshop.io>',
  to: ['dana.ortiz@fastmail.com', 'li.wei@protonmail.com'],
  subject: 'Hi %recipient.first%, your points expire soon',
  text: 'You have %recipient.points% points left.',
  'recipient-variables': JSON.stringify({
    'dana.ortiz@fastmail.com': { first: 'Dana', points: 320 },
    'li.wei@protonmail.com': { first: 'Li', points: 90 },
  }),
})
```

### Step 4: Validate addresses

```typescript
const check = await mg.validate.get('dana.ortiz@fastmail.com')
console.log(check.result, check.risk) // e.g. "deliverable" "low"
if (check.result === 'undeliverable') { /* do not send */ }
```

Result values include `deliverable`, `undeliverable`, `do_not_send`, `catch_all` and `unknown`; risk is `low`, `medium`, `high` or `unknown`. Validation is a separately metered service, so confirm your plan includes it before running it over a list.

### Step 5: Inbound routes

```typescript
await mg.routes.create({
  priority: 1,
  description: 'Support mailbox to the helpdesk',
  expression: 'match_recipient("support@mg.acmeshop.io")',
  action: ['forward("https://acmeshop.io/inbound/mailgun")', 'stop()'],
})
```

The domain's MX records must point to Mailgun for routes to receive mail.

### Step 6: Webhooks

Configure webhook URLs per event (delivered, opened, clicked, failed, complained, unsubscribed) in the dashboard or API. Each JSON payload has `signature` (`timestamp`, `token`, `signature`) and `event-data`. The signature is a hex HMAC-SHA256 of `timestamp + token` keyed with the webhook signing key.

```typescript
// routes/webhooks/mailgun.ts
import crypto from 'crypto'

const seenTokens = new Set<string>() // use Redis with a TTL in production

function isValid({ timestamp, token, signature }: { timestamp: string; token: string; signature: string }) {
  const expected = crypto.createHmac('sha256', process.env.MAILGUN_WEBHOOK_SIGNING_KEY!)
    .update(timestamp + token).digest('hex')
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) < 300
  return fresh && !seenTokens.has(token) &&
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
}

export async function handleMailgunWebhook(req: { body: any }) {
  const { signature, 'event-data': event } = req.body
  if (!isValid(signature)) return { status: 401 }
  seenTokens.add(signature.token)

  switch (event.event) {
    case 'failed':
      if (event.severity === 'permanent') await suppressAddress(event.recipient)
      break
    case 'complained':
    case 'unsubscribed':
      await unsubscribeUser(event.recipient)
      break
    case 'delivered':
      await markDelivered(event.message.headers['message-id'])
      break
  }
  return { status: 200 }
}
```

## Examples

### Example 1: Order-shipped email from a Node app

**User request:** "Send a shipping confirmation from our checkout service with Mailgun. We are on the EU region."

The agent installs `mailgun.js`, creates `lib/mailgun.ts` with `url: 'https://api.eu.mailgun.net'` and the key from `MAILGUN_API_KEY`, and calls `mg.messages.create('mg.acmeshop.io', {...})` with `from`, `to`, `subject`, `text`, `html` and `o:tag: ['order-shipped']`. A successful call returns an object like `{ id: '<20261003091500.1.4F2A@mg.acmeshop.io>', message: 'Queued. Thank you.' }`; the Mailgun log then shows the delivered event.

### Example 2: Stop mailing bounced and complaining users

**User request:** "Hard bounces keep hurting our sender score. Wire Mailgun webhooks into our user table."

The agent adds the signed-webhook handler above on `POST /webhooks/mailgun`, registers the URL for `failed` and `complained` events, and on a permanent failure or complaint sets `email_suppressed = true` for the recipient. Sending a test event from the dashboard returns 200, and a request with a wrong signature fails authentication.

## Guidelines

- Match the API base URL to the account region; a US key against the EU endpoint fails authentication.
- Verify every webhook with the signing key, reject stale timestamps and reuse of a token, and compare in constant time.
- Suppress permanent bounces and complaints; Mailgun also keeps its own suppression lists.
- Tracking pixels (`o:tracking-opens`) are unreliable because mail clients preload images; use clicks and deliveries for decisions.
- Use `o:testmode: 'yes'` to exercise the API without delivering mail.
- The free plan is limited (100 emails per day at last check) and plans and prices change; read mailgun.com/pricing instead of hard-coding limits.
- Never put the private API key in front-end code or the repository.
