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
  version: 1.0.0
  category: business
  tags:
    - plunk
    - email
    - transactional
    - marketing
    - automation
---

# Plunk

## Overview

Plunk is an open-source email platform for transactional emails (welcome, password reset, receipts) and marketing campaigns (newsletters, drip sequences). Self-hostable or use the cloud version. Simple API, React email templates.

## Instructions

### Step 1: Send Transactional Email

```typescript
// lib/email.ts — Send emails via Plunk API
const PLUNK_API_KEY = process.env.PLUNK_API_KEY!

export async function sendEmail(to: string, subject: string, body: string) {
  await fetch('https://api.useplunk.com/v1/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PLUNK_API_KEY}`,
    },
    body: JSON.stringify({ to, subject, body }),
  })
}

// Usage
await sendEmail('user@example.com', 'Welcome!', '<h1>Welcome to our app</h1>')
```

### Step 2: Track Events (for Automations)

```typescript
// Track user events to trigger automated emails
await fetch('https://api.useplunk.com/v1/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${PLUNK_API_KEY}`,
  },
  body: JSON.stringify({
    event: 'user-signed-up',
    email: 'user@example.com',
    data: { name: 'John', plan: 'free' },
  }),
})
// Configure automation in Plunk dashboard:
// When "user-signed-up" → send welcome email → wait 3 days → send onboarding tips
```

## Guidelines

- Free tier: 100 emails/month. Self-hosted: unlimited.
- Use events + automations for drip campaigns instead of manual sends.
- For higher volume, consider Resend or SendGrid.
- Self-host with Docker for full control and unlimited emails.
