---
title: Add SMS Verification and Transactional Notifications
slug: add-sms-verification-and-notifications
description: >-
  A fintech app needs SMS-based 2FA for login and transactional notifications
  (payment confirmations, low balance alerts). They use Twilio Verify for
  phone verification, Twilio SMS for notifications, and SendGrid for email
  receipts — building a multi-channel notification layer with delivery tracking.
skills:
  - twilio
  - sendgrid
  - nextjs
category: backend
tags:
  - sms
  - 2fa
  - notifications
  - email
  - security
  - twilio
  - sendgrid
---

# Add SMS Verification and Transactional Notifications

Leo runs engineering at a fintech startup. Their app handles money transfers, so security is critical — they need SMS-based two-factor authentication for login and sensitive actions (large transfers, password changes). They also need to notify users about transaction events: payment sent, payment received, low balance warnings. Different channels for different urgency levels: SMS for security codes and urgent alerts, email for receipts and summaries.

## Step 1: Phone Number Verification on Signup

When users create an account, they must verify their phone number. This confirms ownership and enables 2FA later.

```typescript
// lib/verification.ts — Phone verification service using Twilio Verify
// Twilio handles code generation, delivery, expiry, and rate limiting

import twilio from 'twilio'

const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
const VERIFY_SID = process.env.TWILIO_VERIFY_SERVICE_SID!

export async function sendPhoneVerification(phoneNumber: string): Promise<{ success: boolean }> {
  /**
   * Send a 6-digit verification code to the user's phone via SMS.
   * Twilio Verify handles:
   * - Code generation (cryptographically random)
   * - 10-minute expiry
   * - Rate limiting (5 attempts per phone per 10 min)
   * - Fraud detection (blocks known fraud numbers)
   *
   * Args:
   *   phoneNumber: E.164 format (+15551234567)
   */
  try {
    const verification = await client.verify.v2
      .services(VERIFY_SID)
      .verifications.create({
        to: phoneNumber,
        channel: 'sms',
      })
    return { success: verification.status === 'pending' }
  } catch (err: any) {
    // Handle common errors
    if (err.code === 60203) return { success: false }    // max attempts reached
    if (err.code === 60200) return { success: false }    // invalid phone number
    throw err
  }
}

export async function verifyCode(phoneNumber: string, code: string): Promise<boolean> {
  /**
   * Check if the user-entered code matches.
   * Returns true if approved, false if wrong or expired.
   */
  try {
    const check = await client.verify.v2
      .services(VERIFY_SID)
      .verificationChecks.create({ to: phoneNumber, code })
    return check.status === 'approved'
  } catch {
    return false
  }
}
```

```typescript
// app/api/auth/verify-phone/route.ts — API endpoints for phone verification flow
import { NextRequest, NextResponse } from 'next/server'
import { sendPhoneVerification, verifyCode } from '@/lib/verification'

// POST /api/auth/verify-phone — Send verification code
export async function POST(req: NextRequest) {
  const { phoneNumber, action } = await req.json()

  if (action === 'send') {
    const result = await sendPhoneVerification(phoneNumber)
    if (!result.success) {
      return NextResponse.json({ error: 'Could not send code. Try again later.' }, { status: 429 })
    }
    return NextResponse.json({ sent: true })
  }

  if (action === 'verify') {
    const { code } = await req.json()
    const verified = await verifyCode(phoneNumber, code)

    if (verified) {
      // Mark phone as verified in database
      await db.users.update({ phoneNumber }, { phoneVerified: true, phoneVerifiedAt: new Date() })
      return NextResponse.json({ verified: true })
    }

    return NextResponse.json({ verified: false, error: 'Invalid or expired code' }, { status: 400 })
  }
}
```

## Step 2: Two-Factor Authentication for Login

Once verified, the phone number is used for 2FA on every login attempt.

```typescript
// lib/auth-2fa.ts — 2FA enforcement for login and sensitive actions
import { sendPhoneVerification, verifyCode } from './verification'

export async function initiate2FA(userId: string): Promise<{ challengeId: string }> {
  /**
   * Start a 2FA challenge after password verification.
   * Sends an SMS code to the user's verified phone number.
   */
  const user = await db.users.findById(userId)
  if (!user.phoneVerified) throw new Error('Phone not verified')

  await sendPhoneVerification(user.phoneNumber)

  // Create a short-lived challenge record
  const challenge = await db.authChallenges.create({
    userId,
    type: '2fa_login',
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),    // 10 minutes
  })

  return { challengeId: challenge.id }
}

export async function complete2FA(challengeId: string, code: string): Promise<{ token: string } | null> {
  const challenge = await db.authChallenges.findById(challengeId)
  if (!challenge || challenge.expiresAt < new Date()) return null

  const user = await db.users.findById(challenge.userId)
  const verified = await verifyCode(user.phoneNumber, code)

  if (!verified) return null

  // Mark challenge as completed
  await db.authChallenges.delete(challengeId)

  // Generate session token
  const token = await generateSessionToken(user.id)
  return { token }
}
```

## Step 3: Transaction Notifications (SMS + Email)

Different events trigger different channels. Payment confirmations go via both SMS and email. Low balance alerts are SMS-only for urgency.

```typescript
// lib/transaction-notifications.ts — Multi-channel notification dispatcher
import twilio from 'twilio'
import sgMail from '@sendgrid/mail'

const smsClient = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
sgMail.setApiKey(process.env.SENDGRID_API_KEY!)

export async function notifyPaymentSent(userId: string, amount: number, recipient: string) {
  /**
   * Notify user that their payment was sent.
   * SMS for immediate awareness + email for the paper trail.
   */
  const user = await db.users.findById(userId)

  // SMS — short, immediate
  await smsClient.messages.create({
    body: `Payment sent: $${(amount / 100).toFixed(2)} to ${recipient}. Balance: $${(user.balance / 100).toFixed(2)}`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: user.phoneNumber,
  })

  // Email — detailed receipt with SendGrid template
  await sgMail.send({
    to: user.email,
    from: { email: 'receipts@finapp.com', name: 'FinApp' },
    templateId: 'd-payment-receipt-template',
    dynamicTemplateData: {
      userName: user.name,
      amount: `$${(amount / 100).toFixed(2)}`,
      recipient,
      balance: `$${(user.balance / 100).toFixed(2)}`,
      date: new Date().toLocaleDateString(),
      transactionId: `TXN-${Date.now()}`,
    },
  })
}

export async function notifyLowBalance(userId: string, balance: number, threshold: number) {
  /**
   * Alert user when balance drops below their configured threshold.
   * SMS only — this is urgent and needs immediate attention.
   */
  const user = await db.users.findById(userId)

  // Check user notification preferences (respect opt-outs)
  if (!user.smsNotificationsEnabled) return

  await smsClient.messages.create({
    body: `⚠️ Low balance alert: Your balance is $${(balance / 100).toFixed(2)}, below your $${(threshold / 100).toFixed(2)} threshold. Top up at https://finapp.com/deposit`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: user.phoneNumber,
  })
}

export async function notifyPaymentReceived(userId: string, amount: number, sender: string) {
  const user = await db.users.findById(userId)

  await smsClient.messages.create({
    body: `💰 You received $${(amount / 100).toFixed(2)} from ${sender}. New balance: $${(user.balance / 100).toFixed(2)}`,
    from: process.env.TWILIO_PHONE_NUMBER!,
    to: user.phoneNumber,
  })

  await sgMail.send({
    to: user.email,
    from: { email: 'receipts@finapp.com', name: 'FinApp' },
    templateId: 'd-payment-received-template',
    dynamicTemplateData: { userName: user.name, amount: `$${(amount / 100).toFixed(2)}`, sender },
  })
}
```

## Step 4: Delivery Tracking

```typescript
// app/api/webhooks/twilio-status/route.ts — Track SMS delivery status
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const messageSid = formData.get('MessageSid') as string
  const status = formData.get('MessageStatus') as string    // sent, delivered, failed, undelivered
  const errorCode = formData.get('ErrorCode') as string

  await db.smsLogs.update({ messageSid }, {
    status,
    errorCode: errorCode || null,
    updatedAt: new Date(),
  })

  // Alert on delivery failures for critical messages (2FA codes)
  if (status === 'failed' || status === 'undelivered') {
    console.error(`SMS delivery failed: ${messageSid}, error: ${errorCode}`)
  }

  return NextResponse.json({ received: true })
}
```

The complete system gives Leo's fintech app bank-grade security (SMS 2FA for every login and sensitive action), real-time transaction notifications across SMS and email, delivery tracking for compliance and debugging, and respect for user preferences. The Twilio Verify API handles the hard parts of 2FA — code generation, rate limiting, and fraud detection — so the team doesn't have to build those from scratch.
