---
name: twilio
description: >-
  Add SMS, voice calls, and WhatsApp messaging with Twilio. Use when a user
  asks to send SMS messages, make phone calls programmatically, add two-factor
  authentication via SMS, send WhatsApp messages, build an IVR system, set up
  phone number verification, receive incoming SMS, or build communication
  features into an app. Covers SMS, MMS, WhatsApp, Verify API (2FA), voice
  calls, and webhooks.
license: Apache-2.0
compatibility: 'Node.js 20+ (twilio 6.x), Python 3.7+, any HTTP client'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/twilio/twilio-node
  tags: "twilio, sms, voice, whatsapp, messaging"
---

# Twilio

## Overview

Twilio is a cloud communications platform with REST APIs for messaging, voice and verification. This skill covers sending SMS/MMS messages, WhatsApp messaging, two-factor authentication (Verify API), voice calls, and handling incoming messages via webhooks. Twilio provides phone numbers in 100+ countries and handles carrier-level complexity so you work with a simple API.

## Instructions

### Step 1: Setup

```bash
# Node.js
npm install twilio

# Python
pip install twilio
```

```typescript
// lib/twilio.ts — Client initialization
import twilio from 'twilio'

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)
```

### Step 2: Send SMS

```typescript
// sms.ts — Send and receive SMS messages
import twilio from 'twilio'

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

// Send SMS
const message = await client.messages.create({
  body: 'Your order #1234 has shipped! Track it at: https://track.northwindparcels.com/1234',
  from: process.env.TWILIO_PHONE_NUMBER,    // your Twilio number
  to: '+15551234567',                        // recipient (E.164 format)
})

console.log(message.sid)    // SM1234567890abcdef

// Send MMS (with image) — MMS works on US and Canadian numbers only
await client.messages.create({
  body: 'Check out this photo!',
  from: process.env.TWILIO_PHONE_NUMBER,
  to: '+15551234567',
  mediaUrl: ['https://cdn.northwindparcels.com/photos/box-1234.jpg'],
})
```

### Step 3: Two-Factor Authentication (Verify API)

```typescript
// lib/verify.ts — Phone number verification / 2FA
// Uses Twilio Verify — handles code generation, delivery, and validation

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const VERIFY_SERVICE_SID = process.env.TWILIO_VERIFY_SERVICE_SID!    // create in Twilio console

export async function sendVerificationCode(phoneNumber: string) {
  /**
   * Send a 6-digit verification code via SMS.
   * Twilio handles code generation, expiry (10 min), and rate limiting.
   */
  const verification = await client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verifications.create({
      to: phoneNumber,
      channel: 'sms',    // or 'call', 'email', 'whatsapp'
    })
  return verification.status    // 'pending'
}

export async function checkVerificationCode(phoneNumber: string, code: string) {
  /**
   * Verify a code entered by the user.
   * Returns 'approved' if correct, 'pending' if wrong.
   */
  const check = await client.verify.v2
    .services(VERIFY_SERVICE_SID)
    .verificationChecks.create({
      to: phoneNumber,
      code,
    })
  return check.status    // 'approved' or 'pending'
}
```

### Step 4: WhatsApp Messaging

```typescript
// whatsapp.ts — Send WhatsApp messages via Twilio
// Requires WhatsApp Business API setup in Twilio console

await client.messages.create({
  body: 'Your appointment is confirmed for tomorrow at 2 PM.',
  from: 'whatsapp:+14155238886',    // Twilio WhatsApp sandbox number
  to: 'whatsapp:+15551234567',
})

// WhatsApp with template (required for initiating conversations)
// Use your own approved WhatsApp sender here, not the shared sandbox number
await client.messages.create({
  from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,    // e.g. +14155550123
  to: 'whatsapp:+15551234567',
  contentSid: 'HXb5b62575e6e4ff6129ad7c8efe1f983e',    // approved template SID
  contentVariables: JSON.stringify({ '1': 'John', '2': 'March 15' }),
})
```

### Step 5: Receive Incoming Messages (Webhooks)

```typescript
// app/api/webhooks/twilio/route.ts — Handle incoming SMS/WhatsApp messages
import { NextRequest, NextResponse } from 'next/server'
import twilio from 'twilio'

const { MessagingResponse } = twilio.twiml

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const params = Object.fromEntries(
    [...formData.entries()].map(([k, v]) => [k, String(v)])
  )

  // Reject forged requests: the URL must be exactly what is configured in the Twilio console
  const signature = req.headers.get('x-twilio-signature') ?? ''
  const valid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN!,
    signature,
    'https://app.northwindparcels.com/api/webhooks/twilio',
    params
  )
  if (!valid) return new NextResponse('Invalid signature', { status: 403 })

  const { From: from, Body: body, MessageSid: messageSid } = params

  console.log(`Incoming from ${from}: ${body}`)

  // Auto-reply with TwiML
  const response = new MessagingResponse()

  if (body.toLowerCase().includes('status')) {
    response.message('Your order is on its way! Expected delivery: tomorrow.')
  } else if (body.toLowerCase().includes('help')) {
    response.message('Available commands: STATUS, HELP, CANCEL')
  } else {
    response.message('Thanks for your message! Reply HELP for options.')
  }

  return new NextResponse(response.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
```

### Step 6: Voice Calls

```typescript
// voice.ts — Make automated phone calls
// TwiML controls what happens during the call

await client.calls.create({
  url: 'https://app.northwindparcels.com/api/voice/greeting',    // TwiML endpoint
  from: process.env.TWILIO_PHONE_NUMBER!,
  to: '+15551234567',
})

// Voice webhook endpoint
// app/api/voice/greeting/route.ts
import twilio from 'twilio'
const { VoiceResponse } = twilio.twiml

export async function POST() {
  const response = new VoiceResponse()
  response.say({ voice: 'Polly.Joanna-Neural', language: 'en-US' }, 'Hello! Your appointment is confirmed for tomorrow at 2 PM.')
  response.say('Press 1 to confirm, or 2 to reschedule.')

  const gather = response.gather({ numDigits: 1, action: '/api/voice/handle-input' })
  gather.say('Please make your selection.')

  return new Response(response.toString(), {
    headers: { 'Content-Type': 'text/xml' },
  })
}
```

## Examples

### Example 1: Add SMS-based 2FA to a login flow
**User prompt:** "Add phone number verification to our signup flow. Users enter their phone number, receive a code, and verify it."

The agent will:
1. Create a Twilio Verify service in the console.
2. Build API endpoints: `/api/verify/send` and `/api/verify/check`.
3. Frontend flow: phone input → send code → code input → verify.
4. Handle edge cases: rate limiting, expired codes, invalid numbers.

### Example 2: Build an order notification system
**User prompt:** "Send customers an SMS when their order ships, and a WhatsApp message when it's delivered. Include tracking link."

The agent will:
1. Set up SMS and WhatsApp messaging channels.
2. Create notification functions triggered by order status changes.
3. Use WhatsApp templates (required for business-initiated messages).
4. Handle delivery status callbacks via webhooks.

## Guidelines

- Use E.164 format for all phone numbers (`+15551234567`, not `555-123-4567`). Twilio rejects incorrectly formatted numbers.
- Use the Verify API for 2FA instead of sending raw SMS codes — it handles code generation, expiry, rate limiting, and fraud detection.
- WhatsApp requires pre-approved message templates for business-initiated conversations. User-initiated conversations (replies within 24h) allow freeform messages.
- Always validate webhook requests with `twilio.validateRequest(authToken, signatureHeader, fullUrl, params)` (shown in Step 5). It returns `false` on a bad signature and fails if the URL differs from the one configured in Twilio, including a proxy changing the scheme or host.
- US long-code (10DLC) traffic must be registered through A2P 10DLC (or use a toll-free number with toll-free verification, or a short code); unregistered traffic is filtered by carriers and carries extra fees.
- Verify codes expire after 10 minutes; a wrong code leaves the status `pending`, and too many attempts give `max_attempts_reached`.
- Keep `TWILIO_AUTH_TOKEN` server-side only. For production prefer an API key (`twilio(apiKeySid, apiKeySecret, { accountSid })`) so a leaked credential can be revoked without rotating the main token.
- SMS costs vary by country — US SMS costs $0.0083/message plus carrier fees (twilio.com/en-us/sms/pricing/us), international can be 10-50x more. Use WhatsApp for international messaging when possible (often cheaper).
- Set up a status callback URL to track message delivery. Not all SMS messages are delivered — carriers can silently drop them.
