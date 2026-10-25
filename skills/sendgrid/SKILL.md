---
name: sendgrid
description: >-
  SendGrid (by Twilio) sends transactional and marketing email through an HTTP
  API or SMTP. Use when a user asks to send emails programmatically, set up
  transactional email delivery, send bulk email with dynamic templates, verify
  Event Webhook signatures, track opens, clicks and bounces, handle
  unsubscribes, or set up SPF and DKIM domain authentication. Covers the
  @sendgrid/mail Node.js client, personalizations for bulk sends, sandbox mode
  and deliverability setup.
license: Apache-2.0
compatibility: "Node.js 18+ with @sendgrid/mail 8.x; Python sendgrid package; any HTTP client; SendGrid account and API key"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "sendgrid, email, transactional, webhooks, deliverability"
  repository: https://github.com/sendgrid/sendgrid-nodejs
---

# SendGrid

## Overview

SendGrid delivers email at scale through the v3 Mail Send API (`POST https://api.sendgrid.com/v3/mail/send`) or SMTP. This skill covers sending with `@sendgrid/mail` (8.1.x), dynamic templates, bulk sends with personalizations, the signed Event Webhook, and domain authentication. API reference: https://www.twilio.com/docs/sendgrid/api-reference/mail-send/mail-send.

## Instructions

### Step 1: Setup

Create an API key with the "Mail Send" permission only (Settings, API Keys) and keep it in an environment variable. The `from` address must belong to an authenticated domain or a verified single sender, otherwise the API returns 403.

```bash
npm install @sendgrid/mail          # Python: pip install sendgrid
export SENDGRID_API_KEY="SG.xxxxxxxx"   # set in your secret manager, never commit it
```

```typescript
// lib/email.ts
import sgMail from '@sendgrid/mail'

sgMail.setApiKey(process.env.SENDGRID_API_KEY!)
export { sgMail }
```

### Step 2: Send a single email

```typescript
import { sgMail } from './lib/email'

await sgMail.send({
  to: 'maria.lopez@northwind-logistics.com',
  from: { email: 'noreply@northwind-logistics.com', name: 'Northwind Logistics' },
  subject: 'Welcome to Northwind',
  text: 'Thanks for signing up!',
  html: '<h1>Welcome!</h1><p>Thanks for signing up.</p>',
})

// Dynamic template: subject and body live in the template (IDs start with "d-")
await sgMail.send({
  to: 'maria.lopez@northwind-logistics.com',
  from: { email: 'noreply@northwind-logistics.com', name: 'Northwind Logistics' },
  templateId: 'd-2f9a1c0b7e4d4c5a8b3e6d1f0a9b8c7d',
  dynamicTemplateData: { name: 'Maria', action_url: 'https://app.northwind-logistics.com/verify?token=8f3a' },
})
```

`send` resolves with `[response, body]`; a 202 means accepted for processing, not delivered. Failures throw an error whose `response.body.errors` lists the reasons.

To test without delivering, add `mailSettings: { sandboxMode: { enable: true } }`; the API validates the request and returns 200.

### Step 3: Bulk sending

Pick the right method:

- `sgMail.sendMultiple({ to: [a, b, c], ... })` sends one separate email per recipient (recipients do not see each other), same content, one API request.
- `sgMail.send({ to: [a, b, c], ... })` puts all addresses in one visible "to" list. Do not use it for bulk mail.
- `sgMail.send([msg1, msg2, ...])` sends the messages in parallel as separate API requests, one request per message. Avoid it for thousands of recipients: it can hit rate limits.
- For different data per recipient in one request, use `personalizations` (the API accepts up to 1000 per request):

```typescript
const customers = [
  { email: 'maria.lopez@northwind-logistics.com', name: 'Maria', plan: 'Pro', usage: 8120 },
  { email: 'james.okafor@brightwave.io', name: 'James', plan: 'Team', usage: 2310 },
]

for (let i = 0; i < customers.length; i += 1000) {
  await sgMail.send({
    from: { email: 'billing@northwind-logistics.com', name: 'Northwind Billing' },
    templateId: 'd-2f9a1c0b7e4d4c5a8b3e6d1f0a9b8c7d',
    personalizations: customers.slice(i, i + 1000).map((c) => ({
      to: [{ email: c.email }],
      dynamicTemplateData: { name: c.name, plan: c.plan, usage: c.usage },
    })),
  })
}
```

Each personalization is delivered as its own email. For scheduled sends use `sendAt` (unix seconds, up to 72 hours ahead).

### Step 4: Event Webhook with signature verification

Enable the Event Webhook in Settings, Mail Settings, Event Webhook, choose events (processed, delivered, deferred, bounce, dropped, open, click, spamreport, unsubscribe, group_unsubscribe, group_resubscribe) and turn on Signed Event Webhook Requests to get a public key. SendGrid posts a JSON array of events, signed with ECDSA in the headers `X-Twilio-Email-Event-Webhook-Signature` and `X-Twilio-Email-Event-Webhook-Timestamp`. Verify against the raw request bytes; parsing and re-serializing the JSON breaks the signature.

```bash
npm install @sendgrid/eventwebhook
```

```typescript
// app/api/webhooks/sendgrid/route.ts (Next.js App Router)
import { NextRequest, NextResponse } from 'next/server'
import { EventWebhook, EventWebhookHeader } from '@sendgrid/eventwebhook'

export async function POST(req: NextRequest) {
  const raw = await req.text()
  const signature = req.headers.get(EventWebhookHeader.SIGNATURE())!
  const timestamp = req.headers.get(EventWebhookHeader.TIMESTAMP())!

  const verifier = new EventWebhook()
  const key = verifier.convertPublicKeyToECDSA(process.env.SENDGRID_WEBHOOK_PUBLIC_KEY!)
  if (!verifier.verifySignature(key, raw, signature, timestamp)) {
    return NextResponse.json({ error: 'bad signature' }, { status: 403 })
  }

  for (const e of JSON.parse(raw) as Array<{ email: string; event: string; sg_message_id: string }>) {
    if (e.event === 'bounce' || e.event === 'dropped') await markUndeliverable(e.email)
    if (e.event === 'spamreport' || e.event === 'unsubscribe') await optOut(e.email)
  }
  return NextResponse.json({ received: true })
}
```

`markUndeliverable` and `optOut` are your own database functions. Respond with 2xx quickly; SendGrid retries failed deliveries for up to 24 hours. Open events are unreliable (mail clients prefetch images), so do not base decisions on them.

### Step 5: Domain authentication

In Settings, Sender Authentication, Authenticate Your Domain, SendGrid generates DNS records for your DNS provider. With automated security these are three CNAMEs: a link-branding/return-path host such as `em1234.northwind-logistics.com` pointing to `u1234.wl.sendgrid.net`, and two DKIM hosts `s1._domainkey` and `s2._domainkey` pointing to `s1.domainkey.u1234.wl.sendgrid.net` and `s2.domainkey.u1234.wl.sendgrid.net`. Copy the exact values the dashboard shows (the numbers differ per account), then click Verify. Add a DMARC TXT record yourself, for example `_dmarc` with `v=DMARC1; p=none; rua=mailto:dmarc@northwind-logistics.com`, and tighten the policy once reports look clean.

## Examples

### Example 1: "Send welcome and password-reset emails from my SaaS"

Authenticate the domain, create two dynamic templates (welcome, reset) in the dashboard and note their `d-` IDs. Add `lib/email.ts` from step 1 and a helper `sendTemplate(to, templateId, data)` that calls `sgMail.send` with `dynamicTemplateData`. Result: the API call returns status 202 and the message appears in Email Activity within a minute.

### Example 2: "Announce a price change to 4,200 customers"

Load customers from the database, use the personalizations loop from step 3 (five requests of up to 1000), include an unsubscribe link or SendGrid's subscription tracking, validate the payload first with sandbox mode (it delivers nothing), then send a real test to your own address before the full run.

### Example 3: "Stop sending to bounced addresses"

Deploy the webhook from step 4, store `bounce`, `dropped` and `spamreport` addresses, and filter them out before every send. SendGrid also keeps its own suppression lists (Suppressions in the dashboard, `GET /v3/suppression/bounces`).

## Guidelines

- Authenticate the sending domain before production sends; unauthenticated mail often lands in spam.
- Use a restricted API key per service, rotate it if leaked, and never put it in client-side code.
- Verify webhook signatures and ignore unsigned posts.
- Marketing mail needs an unsubscribe mechanism (CAN-SPAM, GDPR); keep bounce and spam-report suppression immediate.
- Free tiers and quotas change; Twilio currently offers a free trial. Check the pricing page https://www.twilio.com/en-us/sendgrid/pricing before promising a limit.
- Rate limits return 429 with `X-RateLimit-*` headers; back off and retry.
