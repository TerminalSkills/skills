---
title: "Build a Multi-Channel Notification System with AI"
slug: build-notification-system
description: "Design and implement a notification system supporting email, push, and in-app channels with user preferences and delivery tracking."
skills: [notification-system, template-engine]
category: development
tags: [notifications, email, push-notifications, in-app, messaging]
---

# Build a Multi-Channel Notification System with AI

## The Problem

Your application needs to notify users through multiple channels — transactional emails for password resets, push notifications for time-sensitive alerts, and in-app notifications for activity feeds. Building this from scratch means dealing with channel-specific APIs, user preference management, template rendering, delivery tracking, retry logic, and the nightmare of keeping notification content consistent across email, push, and in-app formats. Most teams either over-notify users (driving them to disable everything) or build a fragile system that silently drops messages.

## The Solution

Use the **notification-system** skill to architect and implement the delivery pipeline with channel routing and preference management, and the **template-engine** skill to create consistent notification templates across all channels. Install both:

```bash
npx terminal-skills install notification-system template-engine
```

## Step-by-Step Walkthrough

### 1. Define your notification types and channels

```
Analyze my application in src/ and identify all places where we notify users. Group them into notification types: transactional (password reset, email verification, order confirmation), activity (new comment, mention, follower), and marketing (weekly digest, feature announcement). For each type, recommend which channels to use (email, push, in-app) and the default user preference.
```

The agent scans your codebase for email sends, socket emissions, and notification-related code:

```
Notification Inventory:
- password-reset       → email (always, cannot disable)
- email-verification   → email (always, cannot disable)
- order-confirmation   → email + in-app (default: both on)
- new-comment          → push + in-app (default: both on)
- mention              → push + in-app (default: both on)
- new-follower         → in-app only (default: on)
- weekly-digest        → email (default: on, can disable)
- feature-announcement → email + in-app (default: on, can disable)

Total: 8 notification types across 3 channels
```

### 2. Generate the notification service architecture

```
Create a notification service with these components: a NotificationRouter that accepts a notification event and routes it to the correct channels based on user preferences, channel-specific adapters for email (via SendGrid), push (via Firebase Cloud Messaging), and in-app (via PostgreSQL + WebSocket), a preference store in PostgreSQL, and a retry queue using a job system. Use TypeScript and make the adapters pluggable so we can swap providers later.
```

The agent generates the full service structure: `src/notifications/router.ts`, channel adapters in `src/notifications/channels/`, preference management in `src/notifications/preferences.ts`, and job queue integration.

### 3. Create notification templates

```
Using the template engine, create templates for all 8 notification types. Each template should render for three formats: email (HTML with inline CSS), push (title + body limited to 178 characters), and in-app (short message with action URL). Use a shared data schema per notification type so one event triggers consistent content across all channels.
```

The agent generates template files with a shared context interface per notification type, ensuring the email says "Alex commented on your post" with the full comment preview, while the push notification says "Alex commented: 'Great analysis of the…'" truncated properly with an ellipsis.

### 4. Implement user preference management

```
Create a preferences API with endpoints: GET /api/notifications/preferences (returns current settings), PATCH /api/notifications/preferences (updates channel toggles per notification type), and POST /api/notifications/unsubscribe/:token (one-click email unsubscribe per CAN-SPAM). Include a React component that renders the preference matrix as a table with toggles. Transactional notifications should show as locked/always-on.
```

### 5. Add delivery tracking and failure handling

```
Add delivery tracking to the notification system. Store delivery status (queued, sent, delivered, failed, read) in PostgreSQL. Implement retry with exponential backoff: 3 retries for email (1min, 5min, 30min), 2 retries for push (30s, 2min), no retry for in-app. Add a dead letter queue for permanently failed notifications. Create a monitoring query that shows delivery success rates by channel and notification type for the last 7 days.
```

## Real-World Example

A product engineer at an early-stage project management SaaS receives complaints: users miss critical deadline reminders because they're only sent via in-app notifications, while other users are overwhelmed by email noise from every comment on every task.

1. They ask the agent to audit their existing notification code — it finds 12 different places sending notifications with no central routing and no user preferences
2. The agent generates a notification router with channel adapters, consolidating all 12 notification paths into a single pipeline
3. Templates are created for all notification types, ensuring push notifications are properly truncated and emails have unsubscribe links
4. The preference UI lets users control exactly which notifications they receive on which channel, with deadline reminders defaulting to email + push
5. Delivery tracking reveals their push notification provider has a 12% failure rate on Android — they switch to a different provider using the pluggable adapter pattern

User complaints about missed notifications drop by 80% in the first week. Email unsubscribe rates drop from 8% to under 1% because users can now fine-tune their preferences instead of unsubscribing entirely.

## Related Skills

- [template-engine](../skills/template-engine/) — Powers consistent notification content across channels
- [email-drafter](../skills/email-drafter/) — Helps craft effective transactional email copy
