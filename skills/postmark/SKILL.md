---
name: postmark
description: >-
  Send transactional emails with Postmark. Use when a user asks to send
  reliable transactional emails, improve email deliverability, use email
  templates with variables, or set up email sending for a SaaS app.
license: Apache-2.0
compatibility: 'Node.js, Python, Ruby, PHP, Go'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: business
  tags:
    - postmark
    - email
    - transactional
    - deliverability
    - templates
---

# Postmark

## Overview

Postmark is an email delivery service focused on transactional emails (password resets, receipts, notifications). It has the highest deliverability rates in the industry (99%+ inbox placement), dedicated IP pools for transactional vs marketing, and built-in email templates.

## Instructions

### Step 1: Send with Node.js

```typescript
// lib/postmark.ts — Postmark client
import { ServerClient } from 'postmark'

const client = new ServerClient(process.env.POSTMARK_API_TOKEN!)

// Send with HTML
await client.sendEmail({
  From: 'notifications@myapp.com',
  To: 'user@example.com',
  Subject: 'Your order has shipped',
  HtmlBody: '<h1>Order Shipped!</h1><p>Tracking: ABC123</p>',
  TextBody: 'Order Shipped! Tracking: ABC123',
  MessageStream: 'outbound',          // 'outbound' for transactional, 'broadcast' for marketing
})

// Send with template
await client.sendEmailWithTemplate({
  From: 'notifications@myapp.com',
  To: 'user@example.com',
  TemplateAlias: 'order-shipped',
  TemplateModel: {
    customer_name: 'Alice',
    order_id: 'ORD-2025-001',
    tracking_number: 'ABC123',
    tracking_url: 'https://track.example.com/ABC123',
    items: [
      { name: 'Widget Pro', quantity: 2, price: '$29.99' },
      { name: 'Gadget Plus', quantity: 1, price: '$49.99' },
    ],
  },
  MessageStream: 'outbound',
})
```

### Step 2: Batch Sending

```typescript
// Send up to 500 emails in one API call
await client.sendEmailBatch([
  {
    From: 'billing@myapp.com',
    To: 'user1@example.com',
    Subject: 'Invoice #INV-001',
    HtmlBody: renderInvoice(invoice1),
    Tag: 'invoice',
  },
  {
    From: 'billing@myapp.com',
    To: 'user2@example.com',
    Subject: 'Invoice #INV-002',
    HtmlBody: renderInvoice(invoice2),
    Tag: 'invoice',
  },
])
```

### Step 3: Inbound Email Processing

```typescript
// Postmark can forward inbound emails to your webhook
// POST /webhooks/inbound-email
export async function handleInboundEmail(req) {
  const { From, Subject, TextBody, Attachments } = req.body

  // Process support emails
  await createSupportTicket({
    from: From,
    subject: Subject,
    body: TextBody,
    attachments: Attachments.map(a => ({
      name: a.Name,
      content: Buffer.from(a.Content, 'base64'),
    })),
  })
}
```

## Guidelines

- Postmark separates transactional and marketing streams — transactional emails get priority delivery.
- Use server-side templates for consistent formatting; use React Email for complex layouts.
- Tags help track email categories (invoice, welcome, password-reset) in analytics.
- Postmark's bounce and spam complaint handling is automatic — it removes bad addresses.
- Free tier: 100 emails/month. Paid: $15/month for 10,000 emails.
