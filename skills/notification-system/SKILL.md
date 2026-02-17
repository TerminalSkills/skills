---
name: notification-system
description: >-
  Designs and implements multi-channel notification systems with email,
  push, and in-app delivery. Use when you need to build a notification
  service, set up user notification preferences, create delivery pipelines,
  implement retry logic for failed notifications, or route messages across
  channels. Trigger words: notification system, push notifications, email
  notifications, in-app notifications, notification preferences, delivery
  tracking, unsubscribe, notification routing.
license: Apache-2.0
compatibility: "Node.js 18+, Python 3.9+. Requires a message queue (Redis/BullMQ, RabbitMQ, or SQS) for production use."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["notifications", "messaging", "email"]
---

# Notification System

## Overview

This skill enables AI agents to architect, implement, and configure multi-channel notification systems. It covers channel routing, user preference management, template rendering across formats, delivery tracking, retry logic, and compliance requirements like CAN-SPAM unsubscribe.

## Instructions

### 1. Notification Architecture

Every notification system needs these components:

```
Event Source → Notification Router → Channel Adapters → Delivery
                    ↓                      ↓
            Preference Store         Retry Queue
                                         ↓
                                   Dead Letter Queue
```

**Notification Router**: Receives a typed event, resolves the user's channel preferences, and dispatches to the appropriate channel adapters.

**Channel Adapters**: Pluggable handlers for each delivery channel. Must implement a common interface:

```typescript
interface ChannelAdapter {
  channel: 'email' | 'push' | 'in-app';
  send(notification: FormattedNotification): Promise<DeliveryResult>;
  validateRecipient(userId: string): Promise<boolean>;
}
```

**Preference Store**: Database-backed user preferences with per-notification-type, per-channel toggles. Some notifications (transactional/security) must be non-disableable.

### 2. Notification Type Classification

Always classify notifications into categories that determine default behavior:

| Category | Examples | Can Disable? | Default Channels |
|----------|----------|-------------|-----------------|
| Security | Password reset, 2FA | No | Email |
| Transactional | Order confirm, receipt | No | Email + In-app |
| Activity | Comments, mentions | Yes | Push + In-app |
| Social | New follower, like | Yes | In-app |
| Marketing | Digest, announcements | Yes | Email |

### 3. Channel-Specific Constraints

**Email**:
- Must include unsubscribe link (CAN-SPAM / GDPR)
- Use `List-Unsubscribe` header for one-click unsubscribe
- HTML + plain text versions
- Sender reputation — batch marketing emails separately from transactional

**Push Notifications**:
- Title: max 65 characters, Body: max 178 characters (iOS truncation)
- Include `data` payload for deep linking
- Handle token expiration and refresh
- Respect OS-level notification settings

**In-App**:
- Store in database with read/unread status
- Deliver in real-time via WebSocket if user is online
- Group related notifications (e.g., "3 people commented on your post")
- Paginate the notification feed

### 4. Retry and Failure Handling

Implement exponential backoff per channel:

- **Email**: 3 retries at 1min, 5min, 30min (provider outages are temporary)
- **Push**: 2 retries at 30s, 2min (invalid tokens should fail fast)
- **In-app**: 0 retries (direct DB write, either succeeds or doesn't)

After max retries, move to dead letter queue with full context for debugging.

### 5. Template Strategy

Use a single data context per notification type that renders differently per channel:

```typescript
interface NotificationContext {
  type: 'new-comment';
  actor: { name: string; avatarUrl: string };
  target: { title: string; url: string };
  content: { preview: string; full: string };
}
// → Email: Full HTML with actor avatar, comment preview, and action button
// → Push: "Alex commented: 'Great analysis of the…'"
// → In-app: "Alex commented on Your Post Title" with link
```

### 6. Delivery Tracking

Track these states for every notification:

`queued → sent → delivered → read → failed`

Store in a `notification_deliveries` table with: notification_id, user_id, channel, status, attempted_at, delivered_at, read_at, error_message.

## Examples

### Example 1: Express + BullMQ notification router

**Prompt**: "Build a notification service for my Express app that sends order confirmations via email and in-app."

**Output**: The agent creates a BullMQ-backed router that accepts `{ type: 'order-confirmed', userId, data: { orderId, total, items } }`, checks user preferences, and dispatches to the email adapter (SendGrid) and in-app adapter (PostgreSQL insert + Socket.io emit).

### Example 2: Preference management API

**Prompt**: "Create an API for users to manage their notification preferences with a React settings page."

**Output**: The agent generates REST endpoints for CRUD on notification preferences, a migration for the `notification_preferences` table with a composite unique constraint on (user_id, notification_type, channel), and a React component rendering a matrix of toggles with notification types as rows and channels as columns.

## Guidelines

- Never allow users to disable security notifications (password reset, 2FA codes)
- Always send email notifications from a queue, never synchronously in the request handler
- Batch notification grouping (e.g., "5 new comments") to avoid notification fatigue
- Test with notification-heavy scenarios: a user mentioned in a thread with 50 replies
- Include rate limiting on notifications per user per hour to prevent notification storms
- Log delivery metrics for monitoring: sent/delivered/failed rates by channel
