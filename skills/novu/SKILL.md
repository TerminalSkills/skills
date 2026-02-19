---
name: novu
description: >-
  Build notification infrastructure with Novu. Use when a user asks to add
  notifications to an app, send emails and push notifications, build a
  notification center, manage notification preferences, set up multi-channel
  notifications (email, SMS, push, in-app, chat), create notification workflows,
  or build a notification system with templates and subscriber management.
  Covers providers (SendGrid, Twilio, FCM), workflows, templates, subscriber
  preferences, and the in-app notification center component.
license: Apache-2.0
compatibility: 'Node.js 16+, Docker (self-hosted), or Novu Cloud'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: backend
  tags:
    - novu
    - notifications
    - email
    - push
    - sms
    - in-app
---

# Novu

## Overview

Novu is an open-source notification infrastructure platform for managing multi-channel notifications — email, SMS, push, in-app, and chat (Slack, Discord, Teams). Instead of building notification logic from scratch, Novu provides a unified API, workflow engine, template management, subscriber preferences, and a drop-in notification center UI component. Think of it as Twilio + SendGrid + FCM unified under one API with subscriber preference management.

## Instructions

### Step 1: Setup

```bash
# Cloud (quickest)
# Sign up at https://web.novu.co and get your API key

# Self-hosted with Docker
git clone https://github.com/novuhq/novu.git
cd novu
docker compose up -d

# Install SDK
npm install @novu/node        # Server SDK
npm install @novu/react       # React notification center
```

### Step 2: Configure Providers

```typescript
// Providers are configured in the Novu dashboard or via API
// Each channel type (email, SMS, push) can have multiple providers

// Example: Configure SendGrid for email, Twilio for SMS
import { Novu } from '@novu/node'

const novu = new Novu(process.env.NOVU_API_KEY)

// Providers are typically configured via the dashboard UI:
// Email: SendGrid, Mailgun, Amazon SES, Postmark, Resend
// SMS: Twilio, Vonage, Plivo, MessageBird
// Push: FCM, APNs, Expo, OneSignal
// Chat: Slack, Discord, Microsoft Teams
```

### Step 3: Create Notification Workflows

```typescript
// workflows/welcome.ts — Define a multi-channel notification workflow
// Novu Framework (code-first approach)
import { workflow } from '@novu/framework'

export const welcomeWorkflow = workflow('welcome-onboarding', async ({ step, payload }) => {
  // Step 1: Send in-app notification immediately
  await step.inApp('welcome-inbox', async () => ({
    subject: `Welcome, ${payload.name}! 🎉`,
    body: 'Check out our getting started guide to make the most of your account.',
    avatar: 'https://example.com/logo.png',
    redirect: { url: '/getting-started' },
  }))

  // Step 2: Send email
  await step.email('welcome-email', async () => ({
    subject: `Welcome to Our Platform, ${payload.name}!`,
    body: `
      <h1>Welcome aboard!</h1>
      <p>Hi ${payload.name}, thanks for signing up.</p>
      <p>Here are 3 things to try first:</p>
      <ol>
        <li>Complete your profile</li>
        <li>Create your first project</li>
        <li>Invite your team</li>
      </ol>
      <a href="https://app.example.com/getting-started">Get Started →</a>
    `,
  }))

  // Step 3: Wait 3 days, then send SMS if they haven't been active
  await step.delay('wait-for-activation', { amount: 3, unit: 'days' })

  await step.sms('activation-reminder', async () => ({
    body: `Hi ${payload.name}! Your account is ready. Log in to get started: https://app.example.com`,
  }))
}, {
  payloadSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      email: { type: 'string' },
    },
    required: ['name', 'email'],
  },
})
```

### Step 4: Trigger Notifications

```typescript
// lib/notifications.ts — Trigger notification workflows
import { Novu } from '@novu/node'

const novu = new Novu(process.env.NOVU_API_KEY)

// Trigger welcome workflow for a new user
export async function notifyNewUser(user) {
  await novu.trigger('welcome-onboarding', {
    to: {
      subscriberId: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.name,
    },
    payload: {
      name: user.name,
      email: user.email,
    },
  })
}

// Trigger for multiple subscribers (batch)
export async function notifyTeam(teamMemberIds, message) {
  await novu.bulkTrigger(teamMemberIds.map(id => ({
    name: 'team-notification',
    to: { subscriberId: id },
    payload: { message },
  })))
}

// Override channel for specific trigger
export async function sendUrgentAlert(userId, message) {
  await novu.trigger('urgent-alert', {
    to: { subscriberId: userId },
    payload: { message },
    overrides: {
      sms: { content: `URGENT: ${message}` },
    },
  })
}
```

### Step 5: In-App Notification Center (React)

```tsx
// components/NotificationBell.tsx — Drop-in notification center
import { Inbox } from '@novu/react'

export function NotificationBell() {
  return (
    <Inbox
      applicationIdentifier={process.env.NEXT_PUBLIC_NOVU_APP_ID!}
      subscriberId={currentUser.id}
      appearance={{
        elements: {
          bellContainer: { width: '40px', height: '40px' },
        },
      }}
      onNotificationClick={(notification) => {
        if (notification.redirect?.url) {
          window.location.href = notification.redirect.url
        }
      }}
    />
  )
}
```

### Step 6: Subscriber Preferences

```typescript
// Subscribers can control which channels they receive notifications on
// This is built into Novu's notification center UI

// Programmatically update preferences
await novu.subscribers.updatePreference(subscriberId, templateId, {
  channel: { type: 'email', enabled: false },    // user opts out of email
})

// Get subscriber preferences
const prefs = await novu.subscribers.getPreference(subscriberId)
```

## Examples

### Example 1: Build a notification system for a SaaS app
**User prompt:** "Add notifications to our SaaS app: welcome email on signup, in-app notifications for team activity, and SMS for billing alerts. Users should be able to control their preferences."

The agent will:
1. Set up Novu with SendGrid (email), Twilio (SMS), and the in-app channel.
2. Create workflows: welcome, team-activity, billing-alert.
3. Add the `<Inbox>` React component to the app header.
4. Implement subscriber preference management so users can opt out per channel.

### Example 2: Set up transactional notifications with digest
**User prompt:** "Our users get too many individual notifications. Batch similar ones together and send a digest every 4 hours instead of one per event."

The agent will:
1. Create a workflow with Novu's digest step that batches events over 4 hours.
2. The digest step collects all events, then the email step renders them as a single summary.
3. Individual in-app notifications still fire immediately for real-time awareness.

## Guidelines

- Use Novu's code-first Framework for version-controlled, reviewable notification workflows. Define workflows in TypeScript alongside your application code.
- Configure subscriber preferences from the start — users expect notification controls, and retrofitting them is painful.
- Use the in-app channel for non-urgent updates (team activity, comments, mentions). Reserve email and SMS for important or actionable notifications.
- Novu deduplicates notifications by subscriber + workflow + payload. If you trigger the same notification twice, it won't be sent twice.
- Self-host for data sovereignty, or use Novu Cloud for zero infrastructure management. The API is identical.
- Use digest steps to prevent notification fatigue — batch similar events (like "5 new comments") instead of sending individually.
