---
name: loops
description: >-
  Send marketing and transactional emails with Loops. Use when a user asks to
  set up email marketing for a SaaS, create drip campaigns, send product update
  emails, or use a modern alternative to Mailchimp for startups.
license: Apache-2.0
compatibility: 'Any platform via REST API'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
    - loops
    - email
    - marketing
    - saas
    - campaigns
---

# Loops

## Overview

Loops is email marketing built for SaaS. Clean UI, event-based automations, transactional emails, and marketing campaigns. Designed as a modern Mailchimp alternative for startups and product teams.

## Instructions

### Step 1: Transactional Email

```typescript
// lib/loops.ts — Send transactional email via Loops API
export async function sendTransactional(
  email: string,
  transactionalId: string,
  data: Record<string, string>
) {
  await fetch('https://app.loops.so/api/v1/transactional', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
    },
    body: JSON.stringify({
      email,
      transactionalId,    // template ID from Loops dashboard
      dataVariables: data,
    }),
  })
}

// Usage: send welcome email
await sendTransactional('user@example.com', 'welcome_email', {
  firstName: 'John',
  planName: 'Pro',
})
```

### Step 2: Track Events

```typescript
// Track events to trigger automated sequences
await fetch('https://app.loops.so/api/v1/events/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
  },
  body: JSON.stringify({
    email: 'user@example.com',
    eventName: 'plan_upgraded',
    eventProperties: { plan: 'pro', mrr: 49 },
  }),
})
```

### Step 3: Contact Management

```typescript
// Create or update contact
await fetch('https://app.loops.so/api/v1/contacts/update', {
  method: 'PUT',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.LOOPS_API_KEY}`,
  },
  body: JSON.stringify({
    email: 'user@example.com',
    firstName: 'John',
    userGroup: 'pro-users',
    plan: 'pro',
  }),
})
```

## Guidelines

- Free tier: 1,000 contacts, 2,000 emails/month.
- Event-based automations: trigger email sequences from app events (signup, upgrade, churn risk).
- Built for SaaS — has concepts like user groups, event properties, and lifecycle stages.
- For transactional-only needs, Resend is simpler. For full marketing, Loops is better.
