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

Using **slack-bot-builder**, **telegram-bot-builder**, and **whatsapp-bot-builder** to handle channel-specific APIs, combined with **template-engine** (Jinja2 templates rendered from Python) to define messages once and render them per channel, the team builds a unified notification platform where adding a new alert type means writing one set of templates instead of three implementations.

## Step-by-Step Walkthrough

### 1. Build the unified message template system

Define notification templates that adapt their formatting to each channel's capabilities.

> Use template-engine to create a notification template system. Define a base template for "deployment_complete" with variables for {{service_name}}, {{version}}, {{deploy_time}}, and {{status}}. Render it three ways: Slack (Block Kit JSON with a `text` fallback and action buttons), Telegram (HTML parse mode with an inline keyboard), WhatsApp (an approved template whose body variables {{1}}..{{4}} are filled from the same data). Use Jinja2 and store templates in templates/{alert_type}/{channel}.j2. Escape every variable for its target format: `|tojson` inside the Slack JSON, `|e` for Telegram HTML.

### 2. Implement channel-specific bot connectors

Set up each bot with authentication, message delivery, and error handling.

> Build a Slack app using slack-bot-builder in HTTP mode (customers install it into their own workspaces through OAuth; Socket Mode apps cannot be distributed in the Slack Marketplace), sending with `chat.postMessage` and Block Kit, and verifying request signatures with the signing secret. Build a Telegram bot using telegram-bot-builder with a webhook protected by `secret_token`, inline keyboards for user actions, and message editing on status updates. Build a WhatsApp sender using whatsapp-bot-builder with the Cloud API, approved templates for messages outside the 24-hour window, a webhook that verifies `X-Hub-Signature-256` over the raw body, and media attachments for reports.

### 3. Create the routing and delivery engine

Build a central dispatcher that routes notifications to the correct channel based on customer preferences and handles failures with retry logic.

> Create a notification router that accepts a POST request with {customer_id, alert_type, data}. Look up the customer's preferred channel, render the correct template, and dispatch through the appropriate bot. Implement retry with exponential backoff (3 attempts over 15 minutes), fallback to email if all retries fail, and log delivery status to a database. Support broadcast mode for sending to all customers at once.

The routing engine configuration defines delivery rules, retry behavior, and fallback chains in a single YAML file. This is the router's own format, not a format of Slack, Telegram or WhatsApp. The per-channel limits come from the providers, so keep them in code as sender-side throttles and honor `429` responses instead of trusting a number in a file:

```yaml
# config/notification-routes.yaml
channels:
  slack:     { timeout_ms: 5000, retry: { max: 3, backoff: exponential } }
  telegram:  { timeout_ms: 3000, retry: { max: 3, backoff: exponential } }
  whatsapp:  { timeout_ms: 8000, retry: { max: 3, backoff: exponential } }

fallback_chain: [preferred_channel, email]

alert_types:
  deployment_complete: { priority: high,   batch_window_sec: 0 }
  inventory_low:       { priority: high,   batch_window_sec: 300 }
  weekly_report:       { priority: low,    batch_window_sec: 3600 }
  order_shipped:       { priority: normal, batch_window_sec: 0 }
```

High-priority alerts go out immediately, while lower-priority weekly reports can be batched to reduce noise. On HTTP 429 wait for the `Retry-After` header (Slack, Telegram's `retry_after`) before the next attempt, and make each send idempotent per `(customer_id, alert_id)` so a retry after a timeout cannot notify a customer twice.

### 4. Add interactive responses and channel switching

Let customers interact with notifications and change their preferred channel from within any bot.

> Add interactive handlers so customers can acknowledge alerts, snooze notifications for 1/4/24 hours, or switch their preferred channel by typing "/channel telegram" in Slack or "/channel slack" in Telegram. Sync preferences back to the customer database. Track response rates per channel for analytics.

## Real-World Example

An invented e-commerce platform, "Northwind Supply", used this design for order status notifications. Its 800 customers split across 340 on Slack, 280 on Telegram, and 180 on WhatsApp. When the team added an "inventory low" alert type, one developer wrote the three templates in an afternoon instead of building three separate integrations. In the team's own logs, cross-channel fallback lifted delivery from 91% to 99.4%, and the average time to acknowledge critical alerts fell from 47 minutes to 8 because alerts now reach people on the channel they actually check. These are the example team's numbers, not benchmarks.

## Tips

- WhatsApp requires pre-approved templates for messages sent outside the 24-hour customer service window, and bills per delivered template message (since 1 July 2025). Submit templates for approval before launch day and read the current rate card instead of hard-coding prices.
- Provider limits differ and change: Slack's `chat.postMessage` allows about 1 message per second per channel; Telegram allows about 30 messages per second for broadcasts and about 1 per second per chat; WhatsApp limits depend on your messaging-limit tier and throughput. Throttle each channel separately.
- Log every delivery attempt with the channel, timestamp, and response code. When customers report missing notifications, this log is the only way to diagnose whether the message was sent, delivered, or dropped by the platform. WhatsApp delivery and read receipts arrive in the webhook `statuses` array.
