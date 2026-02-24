---
name: mailgun
description: >-
  Send and receive emails with Mailgun. Use when a user asks to send bulk
  emails, set up email routing, validate email addresses, track email
  engagement, or handle both transactional and marketing emails.
license: Apache-2.0
compatibility: 'Any language (REST API)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: communication
  tags:
    - mailgun
    - email
    - api
    - bulk
    - marketing
---

# Mailgun

## Overview

Mailgun is a developer-focused email API for sending, receiving, and tracking emails. It handles both transactional and bulk marketing emails, includes email validation, and provides detailed analytics (opens, clicks, bounces, unsubscribes).

## Instructions

### Step 1: Send Email

```typescript
// lib/mailgun.ts — Mailgun client
import Mailgun from 'mailgun.js'
import formData from 'form-data'

const mg = new Mailgun(formData).client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY!,
  url: 'https://api.eu.mailgun.net',    // use EU endpoint for GDPR
})

// Simple send
await mg.messages.create('mg.myapp.com', {
  from: 'MyApp <noreply@mg.myapp.com>',
  to: ['user@example.com'],
  subject: 'Your weekly report',
  html: '<h1>Weekly Report</h1><p>Here are your stats...</p>',
  text: 'Weekly Report\n\nHere are your stats...',
  'o:tag': ['weekly-report'],
  'o:tracking-clicks': 'yes',
  'o:tracking-opens': 'yes',
})
```

### Step 2: Email Validation

```typescript
// Validate before sending (prevents bounces)
const validation = await mg.validate.get('user@example.com')
console.log(validation.result)     // "deliverable", "undeliverable", "risky"
console.log(validation.risk)       // "low", "medium", "high"

if (validation.result === 'undeliverable') {
  console.log('Bad email, skipping')
}
```

### Step 3: Webhook Events

```typescript
// routes/webhooks/mailgun.ts — Track email events
import crypto from 'crypto'

function verifyMailgunWebhook(token: string, timestamp: string, signature: string): boolean {
  const hash = crypto.createHmac('sha256', process.env.MAILGUN_WEBHOOK_KEY!)
    .update(timestamp + token)
    .digest('hex')
  return hash === signature
}

export async function handleMailgunWebhook(req) {
  const { signature, 'event-data': eventData } = req.body

  if (!verifyMailgunWebhook(signature.token, signature.timestamp, signature.signature)) {
    return { status: 401 }
  }

  switch (eventData.event) {
    case 'delivered':
      await markEmailDelivered(eventData.message.headers['message-id'])
      break
    case 'opened':
      await trackEmailOpen(eventData.recipient, eventData.timestamp)
      break
    case 'clicked':
      await trackEmailClick(eventData.recipient, eventData.url)
      break
    case 'failed':
      if (eventData.severity === 'permanent') {
        await removeBouncedEmail(eventData.recipient)
      }
      break
    case 'complained':
      await unsubscribeUser(eventData.recipient)
      break
  }
}
```

## Guidelines

- Always verify Mailgun webhooks with HMAC — prevent fake event injection.
- Use email validation before bulk sends — reduces bounces and protects sender reputation.
- Separate transactional and marketing emails with different domains or subdomains.
- Mailgun's EU endpoint (`api.eu.mailgun.net`) stores data in EU for GDPR compliance.
- Free tier: 100 emails/day for 3 months. Flex plan: $0.80 per 1,000 emails.
