---
title: "Build a Real-Time Notification System with WebSockets and Redis"
slug: build-realtime-notifications-with-redis
description: "Implement push notifications, in-app alerts, and real-time updates using WebSockets for delivery, Redis for pub/sub, and a persistent database for history."
skills:
  - notification-system
  - realtime-database
  - websocket-builder
category: development
tags:
  - notifications
  - websocket
  - redis
  - real-time
  - push-notifications
---

# Build a Real-Time Notification System with WebSockets and Redis

## The Problem

Your SaaS platform sends notifications via email only. Users do not see that a teammate commented on their task until they check their inbox 45 minutes later. Product asks for in-app notifications, push notifications on mobile, and real-time updates so a user sees new comments instantly without refreshing. The system must handle 5,000 concurrent users, deliver notifications within 500ms, and persist them so users can review their notification history. Building this on polling would hammer the database with 5,000 queries every few seconds.

## The Solution

Use the **websocket-builder** skill to establish persistent connections for instant delivery, **realtime-database** to sync notification state across devices and persist history, and the **notification-system** skill to orchestrate multi-channel delivery (in-app, push, email) with user preferences and batching.

## Step-by-Step Walkthrough

### 1. Design the notification infrastructure

Set up the WebSocket server with Redis pub/sub for horizontal scaling.

> Design a notification system for our Node.js app with 5,000 concurrent users. Set up a WebSocket server that authenticates connections via JWT. Use Redis pub/sub so notifications are delivered regardless of which server instance the user is connected to. Include connection tracking so we know which users are online.

Redis pub/sub ensures that when a notification is published on server A, it reaches a user connected to server B. Without this, scaling to multiple server instances would silently drop notifications.

### 2. Implement multi-channel delivery

Not every notification should go through every channel. A comment mention goes in-app immediately, with an email fallback after 5 minutes if unread.

> Build a notification dispatcher that routes notifications through channels based on type and user preferences. In-app via WebSocket is always first. Push notification goes to mobile if the user is offline. Email is sent for high-priority notifications (assigned a task, mentioned in a comment) if unread after 5 minutes. Users can configure which types they receive per channel.

### 3. Add notification persistence and history

Users need to see past notifications, mark them as read, and clear them.

> Set up notification persistence with a read/unread status per user. Store notifications in PostgreSQL with indexes for fast retrieval by user and timestamp. Implement cursor-based pagination for the notification feed. Add endpoints for mark-as-read (single and bulk), and an unread count that updates in real time via the WebSocket connection.

### 4. Handle edge cases and batching

Prevent notification storms from flooding users.

> Implement notification batching: if 15 people comment on the same task within 2 minutes, send one notification saying "15 new comments on Task #234" instead of 15 separate notifications. Add rate limiting per user (max 30 notifications per minute). Handle the reconnection case where a user comes back online after 3 hours and needs to catch up without receiving 200 individual pings.

## Real-World Example

A project management SaaS with 3,200 daily active users had a notification delay problem. Users received email notifications for task comments 5 minutes after they were posted. Teammates in different time zones would wait hours for responses because nobody knew a comment had been left. After building the real-time system, in-app notifications arrived in 180ms on average. The notification batching prevented a common complaint: when a popular task got 30 comments in a meeting, users received one summary notification instead of 30 separate pings. Notification engagement (users clicking on notifications) increased from 12% with email-only to 64% with in-app real-time delivery.
