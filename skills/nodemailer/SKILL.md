---
name: nodemailer
description: >-
  Send emails from Node.js with Nodemailer. Use when a user asks to send
  emails from a Node.js app, configure SMTP, send HTML emails, handle
  attachments, or set up email sending without a third-party API.
license: Apache-2.0
compatibility: 'Node.js 16+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: communication
  tags:
    - nodemailer
    - email
    - smtp
    - nodejs
    - transactional
---

# Nodemailer

## Overview

Nodemailer is the standard Node.js library for sending emails via SMTP. No API key needed — works with any SMTP server (Gmail, SendGrid, Postmark, self-hosted). Supports HTML emails, attachments, embedded images, and templates.

## Instructions

### Step 1: Setup

```bash
npm install nodemailer
```

### Step 2: Send Email

```typescript
// lib/mailer.ts — Email sending with SMTP
import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,         // smtp.gmail.com, smtp.sendgrid.net, etc.
  port: 587,
  secure: false,                       // true for 465, false for 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

export async function sendEmail(to: string, subject: string, html: string) {
  const info = await transporter.sendMail({
    from: '"My App" <noreply@example.com>',
    to,
    subject,
    html,
  })
  console.log('Message sent:', info.messageId)
  return info
}

// Usage
await sendEmail(
  'user@example.com',
  'Welcome to My App!',
  '<h1>Welcome!</h1><p>Thanks for signing up.</p>'
)
```

### Step 3: Attachments

```typescript
await transporter.sendMail({
  from: '"Reports" <reports@example.com>',
  to: 'manager@example.com',
  subject: 'Monthly Report',
  html: '<p>Please find the report attached.</p>',
  attachments: [
    { filename: 'report.pdf', path: '/tmp/report.pdf' },
    { filename: 'data.csv', content: 'name,email\nJohn,john@example.com' },
  ],
})
```

### Step 4: React Email Templates

```bash
npm install @react-email/components
```

```tsx
// emails/welcome.tsx — Type-safe email template
import { Html, Head, Body, Container, Text, Button } from '@react-email/components'

export function WelcomeEmail({ name, loginUrl }: { name: string; loginUrl: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#f6f9fc' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
          <Text style={{ fontSize: '24px', fontWeight: 'bold' }}>Welcome, {name}!</Text>
          <Text>Thanks for joining. Click below to get started.</Text>
          <Button href={loginUrl} style={{ backgroundColor: '#000', color: '#fff', padding: '12px 20px', borderRadius: '5px' }}>
            Go to Dashboard
          </Button>
        </Container>
      </Body>
    </Html>
  )
}
```

## Guidelines

- For Gmail: enable "App Passwords" (not regular password) or use OAuth2.
- Nodemailer is for sending via your SMTP server. For managed delivery (with analytics, templates), use Resend, SendGrid, or Postmark.
- Use React Email or MJML for responsive HTML email templates.
- Rate limits depend on your SMTP provider — Gmail allows ~500/day, SendGrid free: 100/day.
