---
title: "Build a Multi-Channel Notification Bot for Slack, Telegram, and WhatsApp"
slug: build-multi-channel-notification-bot-platform
description: "Create a unified bot platform that sends order updates, alerts, and customer notifications across Slack, Telegram, and WhatsApp from a single API."
skills:
  - slack-bot-builder
  - telegram-bot-builder
  - whatsapp-bot-builder
  - template-engine
category: automation
tags:
  - chatbots
  - notifications
  - multi-channel
  - messaging
---

# Build a Multi-Channel Notification Bot for Slack, Telegram, and WhatsApp

## The Problem

A SaaS company with 800 customers sends notifications through three channels: Slack for enterprise clients, Telegram for developer users, and WhatsApp for small business owners. Each channel is managed separately with its own codebase, message formats, and deployment. When the product team adds a new alert type, three developers must implement it independently. Messages look different on each channel, delivery failures go unnoticed, and customers who switch their preferred channel require manual migration.

## The Solution

Using **slack-bot-builder**, **telegram-bot-builder**, and **whatsapp-bot-builder** to handle channel-specific APIs, combined with **template-engine** to define messages once and render them per channel, the team builds a unified notification platform where adding a new alert type means writing one template instead of three implementations.

## Step-by-Step Walkthrough

### 1. Build the unified message template system

Define notification templates that adapt their formatting to each channel's capabilities.

> Use template-engine to create a notification template system. Define a base template for "deployment_complete" with variables for {{service_name}}, {{version}}, {{deploy_time}}, and {{status}}. Render it three ways: Slack (Block Kit JSON with colored sidebar and action buttons), Telegram (Markdown with inline keyboard), WhatsApp (plain text with line breaks and a status emoji). Store templates in /templates/{alert_type}/{channel}.hbs.

### 2. Implement channel-specific bot connectors

Set up each bot with authentication, message delivery, and error handling.

> Build a Slack bot using slack-bot-builder with OAuth2 for workspace installation, Socket Mode for events, and Block Kit for rich messages. Build a Telegram bot using telegram-bot-builder with webhook mode, inline keyboards for user actions, and support for message editing on status updates. Build a WhatsApp bot using whatsapp-bot-builder with the Cloud API, template message approval for out-of-window delivery, and media attachments for reports.

### 3. Create the routing and delivery engine

Build a central dispatcher that routes notifications to the correct channel based on customer preferences and handles failures with retry logic.

> Create a notification router that accepts a POST request with {customer_id, alert_type, data}. Look up the customer's preferred channel, render the correct template, and dispatch through the appropriate bot. Implement retry with exponential backoff (3 attempts over 15 minutes), fallback to email if all retries fail, and log delivery status to a database. Support broadcast mode for sending to all customers at once.

The routing engine configuration defines delivery rules, retry behavior, and fallback chains in a single YAML file:

```yaml
# config/notification-routes.yaml
channels:
  slack:     { rate_limit: 50/sec, timeout_ms: 5000, retry: { max: 3, backoff: exponential } }
  telegram:  { rate_limit: 30/sec, timeout_ms: 3000, retry: { max: 3, backoff: exponential } }
  whatsapp:  { rate_limit: 20/sec, timeout_ms: 8000, retry: { max: 3, backoff: exponential } }

fallback_chain: [preferred_channel, email, webhook]

alert_types:
  deployment_complete: { priority: high,   batch_window_sec: 0 }
  inventory_low:       { priority: high,   batch_window_sec: 300 }
  weekly_report:       { priority: low,    batch_window_sec: 3600 }
  order_shipped:       { priority: normal, batch_window_sec: 0 }
```

This configuration ensures high-priority alerts like inventory warnings are delivered immediately, while lower-priority weekly reports can be batched to reduce noise.

### 4. Add interactive responses and channel switching

Let customers interact with notifications and change their preferred channel from within any bot.

> Add interactive handlers so customers can acknowledge alerts, snooze notifications for 1/4/24 hours, or switch their preferred channel by typing "/channel telegram" in Slack or "/channel slack" in Telegram. Sync preferences back to the customer database. Track response rates per channel for analytics.

## Real-World Example

An e-commerce platform integrated the multi-channel bot for order status notifications. Their 800 customers split across 340 on Slack, 280 on Telegram, and 180 on WhatsApp. When they launched a new "inventory low" alert type, a single developer wrote one template in 20 minutes instead of three separate implementations. Delivery success rates improved from 91% to 99.4% thanks to cross-channel fallback. The average time for customers to acknowledge critical alerts dropped from 47 minutes to 8 minutes because notifications now reach people on the channel they actually check.

## Tips

- WhatsApp requires pre-approved message templates for messages sent outside the 24-hour customer service window. Submit your templates for approval before launch day to avoid delays.
- Test each channel's rate limits independently. Slack allows 50 messages per second per workspace, but WhatsApp's Cloud API limits vary by business tier and can be as low as 80 messages per second.
- Log every delivery attempt with the channel, timestamp, and response code. When customers report missing notifications, this log is the only way to diagnose whether the message was sent, delivered, or dropped by the platform.
