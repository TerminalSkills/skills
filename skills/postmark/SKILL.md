---
name: postmark
description: >-
  Postmark is an email delivery API for transactional mail such as password
  resets, receipts and notifications. Use when a user asks to send reliable
  transactional emails, improve email deliverability, use email templates with
  variables, send batches, receive inbound email by webhook, or set up email
  sending for a SaaS app.
license: Apache-2.0
compatibility: 'Node.js 18+ (postmark 5.x); REST API usable from any language'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  repository: https://github.com/ActiveCampaign/postmark.js
  tags: "postmark, email, transactional, deliverability, templates"
---

# Postmark

## Overview

Postmark is an email delivery service focused on transactional email. Mail is sent through *message streams*: the default `outbound` stream is for transactional mail and a `broadcast` stream is for bulk or marketing mail, each with its own reputation and statistics. Postmark also offers server-side templates, bounce and spam-complaint handling, and inbound email parsing to a webhook. The official Node library is `postmark` (5.x, no dependencies, uses native `fetch`).

## Instructions

### Step 0: Account setup

Create a Server in the Postmark dashboard and copy its **Server API Token** (keep it in `POSTMARK_API_TOKEN`). Every `From` address must belong to a verified Sender Signature or a verified domain (DKIM and Return-Path DNS records); otherwise the API answers with an error. A new account may be held in a restricted state until Postmark approves it, so first sends to outside recipients can be rejected.

### Step 1: Send with Node.js

```bash
npm install postmark
```

```typescript
// lib/postmark.ts
import { ServerClient } from 'postmark'

export const client = new ServerClient(process.env.POSTMARK_API_TOKEN!)

// plain HTML + text
await client.sendEmail({
  From: 'notifications@shipwise.io',
  To: 'maria.lopez@fastmail.com',
  Subject: 'Your order has shipped',
  HtmlBody: '<h1>Order shipped</h1><p>Tracking: 1Z999AA10123456784</p>',
  TextBody: 'Order shipped. Tracking: 1Z999AA10123456784',
  MessageStream: 'outbound',
  Tag: 'order-shipped',
})

// stored template, referenced by alias
await client.sendEmailWithTemplate({
  From: 'notifications@shipwise.io',
  To: 'maria.lopez@fastmail.com',
  TemplateAlias: 'order-shipped',
  TemplateModel: {
    customer_name: 'Maria',
    order_id: 'ORD-2026-0412',
    tracking_url: 'https://track.shipwise.io/1Z999AA10123456784',
    items: [
      { name: 'Standing desk', quantity: 1, price: '$329.00' },
      { name: 'Cable tray', quantity: 2, price: '$24.50' },
    ],
  },
  MessageStream: 'outbound',
})
```

A single request is limited to 10 MB. The call throws an error carrying Postmark's `ErrorCode` and `Message` (for example 406 for an inactive recipient, 422-class codes for bad fields), so catch it and log both. To check payloads without delivering anything, use the literal token `POSTMARK_API_TEST` as the server token.

### Step 2: Batch sending

```typescript
const results = await client.sendEmailBatch([
  { From: 'billing@shipwise.io', To: 'maria.lopez@fastmail.com', Subject: 'Invoice INV-2041',
    HtmlBody: renderInvoice(inv2041), Tag: 'invoice', MessageStream: 'outbound' },
  { From: 'billing@shipwise.io', To: 'tomas.novak@seznam.cz', Subject: 'Invoice INV-2042',
    HtmlBody: renderInvoice(inv2042), Tag: 'invoice', MessageStream: 'outbound' },
])
const failed = results.filter((r) => r.ErrorCode !== 0)
```

The batch endpoint takes up to 500 messages and 50 MB per call and returns HTTP 200 even when individual messages fail, so inspect `ErrorCode` for each result (the order matches the input). `sendEmailBatchWithTemplates` does the same with templates. Version 5.1 also adds `sendBulkEmail` and `getBulkEmailStatus` for the Bulk Email API.

### Step 3: Inbound email

In the server's inbound settings, set a webhook URL (you can use HTTP basic auth in it). Postmark POSTs JSON for each parsed message; answer with a 200 quickly or it retries.

```typescript
// POST /webhooks/inbound-email (Express, express.json() enabled)
app.post('/webhooks/inbound-email', async (req, res) => {
  const { From, Subject, TextBody, StrippedTextReply, MailboxHash, Attachments } = req.body
  await createSupportTicket({
    from: From,
    subject: Subject,
    body: StrippedTextReply || TextBody,   // reply text without the quoted thread
    ticketRef: MailboxHash,                // from yourhash+4821@inbound.postmarkapp.com
    attachments: Attachments.map((a: any) => ({ name: a.Name, content: Buffer.from(a.Content, 'base64') })),
  })
  res.sendStatus(200)
})
```

## Examples

**Request:** "Send a password reset email from our Node API."
Install `postmark`, verify the `shipwise.io` domain, and call `client.sendEmailWithTemplate` with `TemplateAlias: 'password-reset'` and a `TemplateModel` holding the reset URL. The result has `ErrorCode: 0` and a `MessageID` you can look up in the Activity tab.

**Request:** "Email 2,000 customers their January statement."
Split the list into chunks of 500 and call `sendEmailBatch` per chunk, collect results with `ErrorCode !== 0`, and retry or log those. Statements are transactional, so keep them on `outbound`; a promotion would go on a `broadcast` stream.

## Guidelines

- Keep marketing and newsletters off the `outbound` stream; mixing them hurts transactional deliverability.
- Use `Tag` to group mail (invoice, welcome, password-reset) in the statistics.
- Postmark suppresses addresses that hard-bounce or file a spam complaint; sending to a suppressed address returns an error code instead of delivering. Reactivate only after the recipient confirms.
- Never expose the server token in client-side code; the Account token (account-level API) is a separate secret.
- Behind a proxy, `postmark` 5.x ignores `HTTPS_PROXY`; pass a custom `fetch` in the client options.
- Plans: a free tier of 100 emails a month for testing, paid plans from $15 a month for 10,000 emails (check the pricing page for current figures).
