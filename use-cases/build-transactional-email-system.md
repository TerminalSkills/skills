---
title: Build a Transactional Email System with Resend
slug: build-transactional-email-system
description: "Set up a production transactional email pipeline with Resend — React email templates, domain verification, delivery tracking, and a queue for reliable sending with retry logic."
skills: [resend]
category: automation
tags: [resend, email, transactional, react-email, templates, automation]
---

# Build a Transactional Email System with Resend

## The Problem

A SaaS application sends transactional emails — welcome emails, password resets, invoice receipts, team invitations, and usage alerts — through a shared Gmail SMTP account. This worked for the first 50 users, but now causes three recurring problems.

First, Gmail rate limits outgoing mail at 500 per day (2,000 with Workspace), and the app hits this ceiling twice a month during batch operations like monthly invoices. Emails queue silently with no delivery confirmation, so the team doesn't know when sends fail until a customer complains.

Second, email templates are embedded as string literals in the codebase — raw HTML concatenated with user data. Changing a button color means editing three different templates, testing by sending real emails to a personal inbox, and hoping the HTML renders correctly across Gmail, Outlook, and Apple Mail. Nobody wants to touch the email templates, so they've looked the same since launch.

Third, deliverability is declining. The Gmail "sent from" address doesn't match the app's domain, SPF and DKIM aren't configured for the app's domain, and emails increasingly land in spam folders. Two enterprise prospects mentioned they never received the invitation email — it was caught by their corporate spam filter.

## The Solution

Use the **resend** skill to build a modern email pipeline: React-based templates that render to cross-client HTML, domain authentication for deliverability, the Resend API for reliable sending with delivery tracking, and a queue for batch operations.

## Step-by-Step Walkthrough

### Step 1: Set Up Resend and Verify the Domain

```text
Set up Resend for transactional emails from our SaaS app. We need to:
1. Verify our domain (app.example.com) for deliverability
2. Build React-based email templates for: welcome, password reset, invoice, team invite, usage alert
3. Track delivery status for every email
4. Handle batch sends (monthly invoices) without hitting rate limits
```

Sign up at resend.com (free tier: 3,000 emails/month, 100/day), create an API key, and verify the sending domain:

```bash
npm install resend react-email @react-email/components
```

Domain verification requires adding three DNS records — Resend provides the exact values in the dashboard:

```
Type    Name                    Value
TXT     _resend.example.com     v=spf1 include:resend.dev ~all
CNAME   resend._domainkey       [provided by Resend]
CNAME   resend2._domainkey      [provided by Resend]
```

Once verified, emails sent from `anything@example.com` pass SPF, DKIM, and DMARC checks — the difference between inbox and spam folder.

### Step 2: Build React Email Templates

React Email lets you build templates with components and props, just like a React app. Each template is a `.tsx` file that renders to cross-client HTML:

```tsx
// emails/welcome.tsx — Welcome email sent after signup

import {
  Html, Head, Body, Container, Section, Text, Button, Img, Hr, Preview,
} from '@react-email/components';

interface WelcomeEmailProps {
  userName: string;
  loginUrl: string;
  trialDaysLeft: number;
}

export default function WelcomeEmail({ userName, loginUrl, trialDaysLeft }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to AppName — your {trialDaysLeft}-day trial starts now</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Img src="https://example.com/logo.png" width={120} height={40} alt="AppName" />

          <Section style={sectionStyle}>
            <Text style={headingStyle}>Welcome, {userName}!</Text>
            <Text style={textStyle}>
              Your account is ready. You have {trialDaysLeft} days to explore everything
              on the Growth plan — no credit card required.
            </Text>

            <Button href={loginUrl} style={buttonStyle}>
              Open your dashboard
            </Button>
          </Section>

          <Hr style={hrStyle} />

          <Section style={sectionStyle}>
            <Text style={subheadingStyle}>Getting started</Text>
            <Text style={textStyle}>
              <strong>1. Connect your data source</strong> — Import from CSV, API, or database.{'\n'}
              <strong>2. Create your first dashboard</strong> — Templates get you started in 2 minutes.{'\n'}
              <strong>3. Invite your team</strong> — Collaboration is included on all plans.
            </Text>
          </Section>

          <Text style={footerStyle}>
            Questions? Reply to this email — it goes straight to our founders.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Inline styles — required for email client compatibility
const bodyStyle = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const containerStyle = { margin: '0 auto', padding: '40px 20px', maxWidth: '560px' };
const sectionStyle = { padding: '24px 0' };
const headingStyle = { fontSize: '24px', fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 16px' };
const subheadingStyle = { fontSize: '18px', fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 12px' };
const textStyle = { fontSize: '16px', lineHeight: '24px', color: '#4a4a4a', margin: '0 0 16px' };
const buttonStyle = { backgroundColor: '#2563eb', color: '#ffffff', padding: '12px 24px', borderRadius: '6px', fontSize: '16px', textDecoration: 'none', display: 'inline-block' };
const hrStyle = { borderColor: '#e5e7eb', margin: '0' };
const footerStyle = { fontSize: '14px', color: '#9ca3af', marginTop: '32px' };
```

```tsx
// emails/invoice.tsx — Monthly invoice receipt

import { Html, Head, Body, Container, Section, Text, Row, Column, Hr, Preview } from '@react-email/components';

interface InvoiceItem { description: string; quantity: number; unitPrice: number; }

interface InvoiceEmailProps {
  customerName: string;
  invoiceNumber: string;
  invoiceDate: string;
  items: InvoiceItem[];
  total: number;
  invoiceUrl: string;
}

export default function InvoiceEmail(props: InvoiceEmailProps) {
  const { customerName, invoiceNumber, invoiceDate, items, total, invoiceUrl } = props;

  return (
    <Html>
      <Head />
      <Preview>Invoice {invoiceNumber} — ${total.toFixed(2)}</Preview>
      <Body style={bodyStyle}>
        <Container style={containerStyle}>
          <Text style={headingStyle}>Invoice {invoiceNumber}</Text>
          <Text style={textStyle}>Hi {customerName}, here's your invoice for {invoiceDate}.</Text>

          <Section style={{ backgroundColor: '#f9fafb', borderRadius: '8px', padding: '16px' }}>
            {items.map((item, i) => (
              <Row key={i} style={{ marginBottom: '8px' }}>
                <Column style={{ width: '60%' }}>
                  <Text style={{ ...textStyle, margin: '0' }}>{item.description}</Text>
                </Column>
                <Column style={{ width: '15%', textAlign: 'right' }}>
                  <Text style={{ ...textStyle, margin: '0' }}>×{item.quantity}</Text>
                </Column>
                <Column style={{ width: '25%', textAlign: 'right' }}>
                  <Text style={{ ...textStyle, margin: '0' }}>
                    ${(item.quantity * item.unitPrice).toFixed(2)}
                  </Text>
                </Column>
              </Row>
            ))}
            <Hr style={hrStyle} />
            <Row>
              <Column style={{ width: '75%' }}>
                <Text style={{ ...textStyle, fontWeight: 'bold', margin: '0' }}>Total</Text>
              </Column>
              <Column style={{ width: '25%', textAlign: 'right' }}>
                <Text style={{ ...textStyle, fontWeight: 'bold', margin: '0' }}>
                  ${total.toFixed(2)}
                </Text>
              </Column>
            </Row>
          </Section>

          <Text style={{ ...textStyle, marginTop: '24px' }}>
            <a href={invoiceUrl} style={{ color: '#2563eb' }}>View and download invoice →</a>
          </Text>

          <Text style={footerStyle}>
            This is an automated receipt. No action needed unless you have questions.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const bodyStyle = { backgroundColor: '#f6f9fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' };
const containerStyle = { margin: '0 auto', padding: '40px 20px', maxWidth: '560px' };
const headingStyle = { fontSize: '22px', fontWeight: 'bold', color: '#1a1a1a', margin: '0 0 8px' };
const textStyle = { fontSize: '15px', lineHeight: '22px', color: '#4a4a4a', margin: '0 0 16px' };
const hrStyle = { borderColor: '#e5e7eb', margin: '12px 0' };
const footerStyle = { fontSize: '13px', color: '#9ca3af', marginTop: '32px' };
```

Preview templates during development:

```bash
npx react-email dev --dir emails
# Opens http://localhost:3000 with a visual preview of all templates
```

### Step 3: Build the Email Service

The email service wraps Resend with template rendering, error handling, and delivery tracking:

```typescript
// src/email/service.ts — Email service with Resend API and React templates

import { Resend } from 'resend';
import { render } from '@react-email/render';
import WelcomeEmail from '../../emails/welcome';
import InvoiceEmail from '../../emails/invoice';

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_ADDRESS = 'AppName <hello@example.com>';
const REPLY_TO = 'support@example.com';

interface SendResult {
  id: string;           // Resend message ID for tracking
  success: boolean;
}

/** Send a welcome email to a new user.
 *
 * @param to - Recipient email address.
 * @param userName - User's display name.
 * @param loginUrl - Direct login link.
 * @param trialDaysLeft - Number of trial days.
 */
async function sendWelcomeEmail(
  to: string,
  userName: string,
  loginUrl: string,
  trialDaysLeft = 14,
): Promise<SendResult> {
  const html = await render(WelcomeEmail({ userName, loginUrl, trialDaysLeft }));

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    replyTo: REPLY_TO,
    subject: `Welcome to AppName, ${userName}!`,
    html,
    tags: [
      { name: 'type', value: 'welcome' },
      { name: 'user', value: userName },
    ],
  });

  if (error) {
    console.error('Failed to send welcome email:', error);
    return { id: '', success: false };
  }

  return { id: data!.id, success: true };
}

/** Send a monthly invoice receipt.
 *
 * @param to - Customer email.
 * @param props - Invoice data (number, date, items, total, URL).
 */
async function sendInvoiceEmail(
  to: string,
  props: {
    customerName: string;
    invoiceNumber: string;
    invoiceDate: string;
    items: Array<{ description: string; quantity: number; unitPrice: number }>;
    total: number;
    invoiceUrl: string;
  },
): Promise<SendResult> {
  const html = await render(InvoiceEmail(props));

  const { data, error } = await resend.emails.send({
    from: FROM_ADDRESS,
    to,
    subject: `Invoice ${props.invoiceNumber} — $${props.total.toFixed(2)}`,
    html,
    tags: [
      { name: 'type', value: 'invoice' },
      { name: 'invoice', value: props.invoiceNumber },
    ],
  });

  if (error) {
    console.error('Failed to send invoice email:', error);
    return { id: '', success: false };
  }

  return { id: data!.id, success: true };
}

export { sendWelcomeEmail, sendInvoiceEmail };
```

### Step 4: Add a Queue for Batch Sends

Monthly invoices mean sending 200+ emails at once. A simple queue with concurrency control prevents rate limit issues:

```typescript
// src/email/queue.ts — Email queue with concurrency control and retry logic

interface QueuedEmail {
  id: string;
  sendFn: () => Promise<SendResult>;
  retries: number;
  maxRetries: number;
}

class EmailQueue {
  private queue: QueuedEmail[] = [];
  private processing = 0;
  private concurrency: number;
  private delayMs: number;

  /** Create an email queue.
   *
   * @param concurrency - Max parallel sends (Resend free: 2/s, pro: 50/s).
   * @param delayMs - Delay between sends to stay under rate limits.
   */
  constructor(concurrency = 2, delayMs = 600) {
    this.concurrency = concurrency;
    this.delayMs = delayMs;
  }

  /** Add an email to the queue. Returns a promise that resolves when sent. */
  enqueue(id: string, sendFn: () => Promise<SendResult>, maxRetries = 3): Promise<SendResult> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id,
        sendFn: async () => {
          try {
            const result = await sendFn();
            resolve(result);
            return result;
          } catch (err) {
            reject(err);
            return { id: '', success: false };
          }
        },
        retries: 0,
        maxRetries,
      });
      this.processNext();
    });
  }

  private async processNext() {
    if (this.processing >= this.concurrency || this.queue.length === 0) return;

    this.processing++;
    const email = this.queue.shift()!;

    try {
      const result = await email.sendFn();
      if (!result.success && email.retries < email.maxRetries) {
        email.retries++;
        const backoffMs = this.delayMs * Math.pow(2, email.retries);
        setTimeout(() => {
          this.queue.push(email);
          this.processNext();
        }, backoffMs);
      }
    } catch (err) {
      console.error(`Email ${email.id} failed:`, err);
      if (email.retries < email.maxRetries) {
        email.retries++;
        this.queue.push(email);
      }
    }

    await new Promise(r => setTimeout(r, this.delayMs));
    this.processing--;
    this.processNext();
  }
}

// Usage: send monthly invoices
const queue = new EmailQueue(2, 600);  // 2 concurrent, 600ms delay = ~3/sec

async function sendMonthlyInvoices(invoices: Invoice[]) {
  const results = await Promise.allSettled(
    invoices.map(inv =>
      queue.enqueue(inv.id, () =>
        sendInvoiceEmail(inv.customerEmail, {
          customerName: inv.customerName,
          invoiceNumber: inv.number,
          invoiceDate: inv.date,
          items: inv.items,
          total: inv.total,
          invoiceUrl: `https://app.example.com/invoices/${inv.id}`,
        })
      )
    )
  );

  const sent = results.filter(r => r.status === 'fulfilled').length;
  const failed = results.filter(r => r.status === 'rejected').length;
  console.log(`Invoices sent: ${sent} succeeded, ${failed} failed`);
}
```

### Step 5: Track Delivery

Resend provides delivery events via webhooks — configure at dashboard.resend.com:

```typescript
// src/email/tracking.ts — Delivery tracking webhook handler

app.post('/api/webhooks/resend', express.json(), async (req, res) => {
  const event = req.body;

  switch (event.type) {
    case 'email.delivered':
      await db.emailLogs.update(event.data.email_id, {
        status: 'delivered',
        deliveredAt: event.created_at,
      });
      break;

    case 'email.bounced':
      await db.emailLogs.update(event.data.email_id, {
        status: 'bounced',
        bounceReason: event.data.bounce?.message,
      });
      // Mark email address as invalid to prevent future sends
      await db.users.update({ email: event.data.to }, { emailBounced: true });
      break;

    case 'email.complained':
      // Recipient marked as spam — stop sending immediately
      await db.users.update({ email: event.data.to }, { emailOptedOut: true });
      break;

    case 'email.opened':
      await db.emailLogs.update(event.data.email_id, {
        openedAt: event.created_at,
        openCount: { increment: 1 },
      });
      break;

    case 'email.clicked':
      await db.emailLogs.update(event.data.email_id, {
        clickedAt: event.created_at,
        clickedUrl: event.data.click?.url,
      });
      break;
  }

  res.json({ received: true });
});
```

## Real-World Example

The team sets up Resend on a Tuesday and migrates from Gmail SMTP by Thursday. Domain verification takes 10 minutes (DNS propagation). Building five React email templates takes an afternoon — they preview each template in the browser with `react-email dev`, iterating on design without sending a single test email.

The first real test is the monthly invoice batch: 187 invoices sent through the queue in 2 minutes. Every email lands in the primary inbox — SPF, DKIM, and DMARC all pass. The deliverability difference is immediate: the two enterprise prospects who never received invitation emails now get them within seconds. Open rate tracking shows 68% open rate on welcome emails — up from the 40% they estimated with Gmail (they had no tracking before).

The bounce webhook catches 4 invalid email addresses in the first week that had been silently failing on Gmail SMTP. The addresses are flagged, preventing future wasted sends and protecting the domain's sender reputation.

## Related Skills

- [resend](../skills/resend/) -- Resend API reference for advanced features: audiences, batch sending, domains
- [stripe-billing](../skills/stripe-billing/) -- Trigger invoice emails from Stripe payment events
