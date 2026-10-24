---
name: plunk
description: >-
  Send transactional and marketing emails with Plunk. Use when a user asks to
  send emails from an app, set up email automation, create drip campaigns, or
  use a simple open-source email platform.
license: Apache-2.0
compatibility: 'Any platform via REST API'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  repository: https://github.com/useplunk/plunk
  tags:
    - plunk
    - email
    - transactional
    - marketing
    - automation
---

# Plunk

## Overview

Plunk is an open-source email platform built on Amazon SES. One API covers transactional email, event-triggered workflows (drip sequences), campaigns (newsletters) and inbound email. Use the hosted service at useplunk.com or self-host it with Docker. The hosted free tier allows 1,000 emails a month; beyond that it is $0.001 per email (attachments count double), per the billing docs.

The API base URL in the current documentation is `https://next-api.useplunk.com`. Older tutorials use `https://api.useplunk.com` and the `@plunk/node` package; follow the current docs for new code and use plain `fetch`.

## Instructions

### Step 1: Keys and sending domain

Each project has exactly two keys (Settings -> API Keys in the dashboard): a secret key (`sk_`) for every endpoint except tracking, and a public key (`pk_`) that can only call `POST /v1/track`. Rotating regenerates both at once and the old pair stops working immediately. Keep `sk_` on the server only.

Verify your sending domain first (dashboard, DNS records for SES). `from` must use a verified domain or the send is refused.

```bash
export PLUNK_SECRET_KEY="sk_..."   # from Settings -> API Keys
```

### Step 2: Send a transactional email

`POST /v1/send` needs `to`, plus either `subject` and `body` (HTML) or a `template` ID. `from` is required unless the template sets one.

```typescript
// lib/email.ts
const PLUNK_URL = process.env.PLUNK_API_URL ?? 'https://next-api.useplunk.com'

export async function sendPasswordReset(email: string, resetCode: string) {
  const res = await fetch(`${PLUNK_URL}/v1/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.PLUNK_SECRET_KEY}`,
      'Idempotency-Key': `reset-${email}-${resetCode}`,
    },
    body: JSON.stringify({
      to: email,
      from: { name: 'Northwind Billing', email: 'billing@mail.northwind.dev' },
      subject: 'Your password reset code',
      body: `<p>Your code is <b>${resetCode}</b>. It expires in 15 minutes.</p>`,
    }),
  })
  const json = await res.json()
  if (!json.success) throw new Error(`${json.error.code}: ${json.error.message}`)
  return json.data // { emails: [{ contact: { id, email }, email: <email record ID> }], timestamp }
}
```

Notes from the API reference:

- `to` may be a string, `{ name, email }`, or an array; arrays are processed one recipient at a time, not as a batch.
- Sending is always immediate. To schedule, use a campaign.
- `body` is HTML; Plunk generates the plain-text part itself (there is no text field).
- Send an `Idempotency-Key` header (1-255 printable ASCII chars, kept 24 hours): a repeated key gets `409` instead of a second email.
- Contacts are created or updated on every send. New contacts default to `subscribed: false` on `/v1/send`, so they are not pulled into marketing sends unless you pass `subscribed: true`.
- In `data`, values are saved on the contact and usable as template variables; use `{ "value": "482913", "persistent": false }` for one-shot secrets such as reset codes or magic links so they are not stored.
- Up to 10 attachments, 10 MB total by default.

### Step 3: Track events to trigger workflows

```typescript
await fetch('https://next-api.useplunk.com/v1/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.PLUNK_SECRET_KEY}`, // pk_ key is also accepted here
  },
  body: JSON.stringify({
    event: 'user-signed-up',
    email: 'maria.keller@northwind.dev',
    data: { firstName: 'Maria', plan: 'free' },
  }),
})
```

Then, in the dashboard, create a workflow with an `EVENT` trigger named `user-signed-up`: send the welcome email, wait 3 days, send onboarding tips. Workflows can also start on a schedule or manually (`POST /workflows/:id/executions`). Workflows are created disabled: switch `enabled` on or nothing fires. The trigger event name cannot be changed after the first execution. Event names matching `email.*`, `contact.subscribed`, `contact.unsubscribed` or `segment.<slug>.entry|exit` are reserved and rejected. New contacts from `/v1/track` default to subscribed.

Use the public key in browser code, because it can only track events:

```javascript
fetch('https://next-api.useplunk.com/v1/track', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + PLUNK_PUBLIC_KEY },
  body: JSON.stringify({ event: 'pricing-viewed', email: currentUser.email }),
})
```

### Step 4: Contacts and verification

```bash
# Upsert a contact by email
curl -X POST https://next-api.useplunk.com/contacts \
  -H "Authorization: Bearer $PLUNK_SECRET_KEY" -H "Content-Type: application/json" \
  -d '{"email":"maria.keller@northwind.dev","subscribed":true,"data":{"firstName":"Maria","plan":"pro"}}'
```

`POST /v1/verify` checks an address for typos, disposable domains and MX records. List endpoints use cursor pagination (`limit` up to 100, `cursor`, `hasMore`). The full OpenAPI spec is at `https://docs.useplunk.com/openapi.json`, and every docs page is available as Markdown by appending `.md`.

### Step 5: Self-host (optional)

Download `docker-compose.yml` from the `next` branch of the repository, set `.env` and run `docker compose up -d`:

```bash
curl -fsSLO https://raw.githubusercontent.com/useplunk/plunk/next/docker-compose.yml
docker compose up -d
```

Required variables include `JWT_SECRET` (generate with `openssl rand -base64 32`), `DB_PASSWORD`, the `API_DOMAIN`, `DASHBOARD_DOMAIN`, `LANDING_DOMAIN`, `WIKI_DOMAIN` hostnames, and AWS SES credentials (`AWS_SES_REGION`, `AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`, `SES_CONFIGURATION_SET`). The stack runs plunk, PostgreSQL 16, Redis 7, MinIO and ntfy; only port 80 (and 465/587 for SMTP) needs exposing. Health check: `GET /health` on the API domain. Point your client at your own API domain instead of `next-api.useplunk.com`.

## Examples

### Example 1: "Send a receipt after Stripe checkout"

Call `/v1/send` from the webhook handler with an idempotency key built from the Stripe event ID so webhook retries never send twice:

```bash
curl -X POST https://next-api.useplunk.com/v1/send \
  -H "Authorization: Bearer $PLUNK_SECRET_KEY" \
  -H "Idempotency-Key: stripe-evt_1QxK2LHn7" \
  -H "Content-Type: application/json" \
  -d '{"to":"maria.keller@northwind.dev","from":"billing@mail.northwind.dev","subject":"Receipt for order #4812","body":"<p>Thanks! Total: $49.00</p>"}'
```

Result: `{"success":true,"data":{"emails":[{"contact":{"id":"...","email":"maria.keller@northwind.dev"},"email":"..."}],"timestamp":"..."}}`. (`/v1/track` returns `data: { contact, event, timestamp }` with string IDs.) Replaying the same key returns `409`.

### Example 2: "Three-email onboarding sequence"

Track `user-signed-up` from the signup handler (Step 3), then build a workflow triggered by that event: Send email (welcome), Delay 3 days, Send email (tips), Delay 4 days, Send email (upgrade offer). Each contact runs through the workflow independently.

## Guidelines

- `sk_` keys never go in client bundles; use `pk_` with `/v1/track` only. A wrong-prefix key returns `401 INVALID_API_KEY`.
- Check `success` in the response body; errors carry `code`, `message`, `requestId` and a `suggestion`.
- Free-tier projects get a Plunk footer in marketing emails and 1,000 sends a month; inbound mail counts too. Set per-category caps in Settings -> Billing to stop a runaway campaign eating transactional capacity.
- Self-hosting means running SES, Postgres, Redis and DNS yourself; for a small app the hosted plan is simpler. For features Plunk lacks, consider Resend or Postmark.
