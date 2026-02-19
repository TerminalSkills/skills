---
name: resend
category: automation
version: 1.0.0
description: >-
  Send transactional and marketing emails with Resend — API sending, React email
  templates, domain verification, delivery tracking, batch sending, audiences,
  and webhooks. Use when tasks involve sending emails from an application,
  building email templates, tracking delivery, or migrating from SMTP.
author: terminal-skills
tags: [resend, email, transactional, react-email, templates, delivery]
---

# Resend

Modern email API for transactional and marketing emails. React-based templates, simple API, built-in delivery tracking.

## Setup

```bash
npm install resend
# For React email templates:
npm install react-email @react-email/components
```

```typescript
// resend.ts — Client initialization
import { Resend } from 'resend';
export const resend = new Resend(process.env.RESEND_API_KEY);
```

## Send Email

### Simple Text/HTML

```typescript
const { data, error } = await resend.emails.send({
  from: 'App <hello@example.com>',
  to: 'user@example.com',
  subject: 'Hello from Resend',
  html: '<p>This is a <strong>test</strong> email.</p>',
});

if (error) {
  console.error('Send failed:', error);
} else {
  console.log('Sent:', data.id);  // Message ID for tracking
}
```

### With React Template

```typescript
import { render } from '@react-email/render';
import WelcomeEmail from './emails/welcome';

const html = await render(WelcomeEmail({ userName: 'Alex', loginUrl: 'https://...' }));

await resend.emails.send({
  from: 'App <hello@example.com>',
  to: 'user@example.com',
  subject: 'Welcome!',
  html,
  tags: [{ name: 'type', value: 'welcome' }],  // For filtering in dashboard
});
```

### Multiple Recipients

```typescript
// To multiple addresses
await resend.emails.send({
  from: 'App <hello@example.com>',
  to: ['user1@example.com', 'user2@example.com'],
  cc: ['manager@example.com'],
  bcc: ['audit@example.com'],
  replyTo: 'support@example.com',
  subject: 'Team update',
  html: '...',
});
```

### With Attachments

```typescript
import { readFileSync } from 'fs';

await resend.emails.send({
  from: 'App <hello@example.com>',
  to: 'user@example.com',
  subject: 'Your report',
  html: '<p>Report attached.</p>',
  attachments: [
    {
      filename: 'report.pdf',
      content: readFileSync('./report.pdf'),
    },
    {
      filename: 'data.csv',
      content: Buffer.from('name,value\nFoo,42\nBar,99'),
    },
  ],
});
```

## Batch Sending

Send up to 100 emails in a single API call:

```typescript
const { data, error } = await resend.batch.send([
  {
    from: 'App <hello@example.com>',
    to: 'user1@example.com',
    subject: 'Invoice #001',
    html: '<p>Invoice attached.</p>',
  },
  {
    from: 'App <hello@example.com>',
    to: 'user2@example.com',
    subject: 'Invoice #002',
    html: '<p>Invoice attached.</p>',
  },
  // ... up to 100 emails
]);
// Returns array of { id } for each email
```

## Domain Verification

Required for production sending. Add DNS records provided by Resend:

```typescript
// List domains
const domains = await resend.domains.list();

// Add a new domain
const { data } = await resend.domains.create({ name: 'example.com' });

// Get DNS records to add
const domain = await resend.domains.get(data.id);
console.log(domain.records);
// [
//   { type: 'TXT', name: '_resend', value: '...' },     // SPF
//   { type: 'CNAME', name: 'resend._domainkey', value: '...' },  // DKIM
//   { type: 'CNAME', name: 'resend2._domainkey', value: '...' }, // DKIM2
// ]

// Verify after adding DNS records
await resend.domains.verify(data.id);
```

## Delivery Tracking

### Check Status

```typescript
// Get email details and delivery status
const email = await resend.emails.get('email-id-from-send');
// { id, from, to, subject, created_at, last_event: 'delivered' }
```

### Webhooks

Configure at dashboard.resend.com → Webhooks:

```typescript
// Webhook events:
// email.sent        — Accepted by Resend
// email.delivered   — Delivered to recipient's mail server
// email.bounced     — Rejected by recipient's mail server
// email.complained  — Marked as spam by recipient
// email.opened      — Recipient opened the email (pixel tracking)
// email.clicked     — Recipient clicked a link
```

## React Email Templates

### Development Preview

```bash
npx react-email dev --dir emails --port 3030
# Opens browser with live preview of all templates
```

### Common Components

```tsx
import {
  Html, Head, Body, Container, Section,  // Layout
  Text, Heading, Link, Button,           // Content
  Img, Hr, Preview,                       // Media/formatting
  Row, Column,                            // Tables/grid
} from '@react-email/components';

// Preview text — shows in inbox before opening
<Preview>Your order is confirmed — shipping in 2 days</Preview>

// Responsive button
<Button href="https://..." style={{
  backgroundColor: '#2563eb',
  color: '#fff',
  padding: '12px 24px',
  borderRadius: '6px',
}}>
  Open dashboard
</Button>
```

### Template Pattern

```tsx
// emails/base-layout.tsx — Shared layout for all emails

interface LayoutProps {
  preview: string;
  children: React.ReactNode;
}

export function EmailLayout({ preview, children }: LayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'sans-serif' }}>
        <Container style={{ margin: '0 auto', padding: '40px 20px', maxWidth: '560px' }}>
          <Img src="https://example.com/logo.png" width={120} alt="Logo" />
          {children}
          <Text style={{ fontSize: '12px', color: '#9ca3af', marginTop: '32px' }}>
            © 2025 AppName Inc. 123 Main St, City, ST 12345
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

## Audiences (Marketing)

Manage contacts for marketing emails:

```typescript
// Create an audience
const audience = await resend.audiences.create({ name: 'Newsletter' });

// Add a contact
await resend.contacts.create({
  audienceId: audience.data!.id,
  email: 'subscriber@example.com',
  firstName: 'Alex',
  unsubscribed: false,
});

// Send to audience (broadcast)
await resend.broadcasts.create({
  audienceId: audience.data!.id,
  from: 'Newsletter <news@example.com>',
  subject: 'Weekly digest',
  html: '...',
});
```

## Rate Limits

| Plan | Emails/day | Emails/second | Batch size |
|---|---|---|---|
| Free | 100 | 2 | 100 |
| Pro | 50,000 | 50 | 100 |
| Enterprise | Custom | Custom | 100 |

Implement queue-based sending for batch operations to stay within limits.

## Python

```python
"""send_email.py — Resend with Python."""
import resend

resend.api_key = "re_..."

params = {
    "from": "App <hello@example.com>",
    "to": ["user@example.com"],
    "subject": "Hello",
    "html": "<p>Test email</p>",
}

email = resend.Emails.send(params)
print(email["id"])
```

## cURL

```bash
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer re_..." \
  -H "Content-Type: application/json" \
  -d '{
    "from": "App <hello@example.com>",
    "to": ["user@example.com"],
    "subject": "Test",
    "html": "<p>Hello</p>"
  }'
```

## Guidelines

- **Verify your domain before production** — unverified domains use Resend's shared domain, which hurts deliverability
- **Use React Email for templates** — inline styles are required for email client compatibility, and React components make this manageable
- **Tags on every email** — add tags for filtering and analytics in the dashboard (`type: welcome`, `type: invoice`)
- **Handle bounces and complaints** — stop sending to bounced addresses and opt-out complained addresses to protect sender reputation
- **Queue batch sends** — don't send 500 emails in a tight loop. Use concurrency control and delays.
- **Reply-to header** — set `replyTo` to a monitored inbox. Customers will reply to transactional emails.
- **Preview text matters** — the `<Preview>` component controls the text shown in inbox previews. Make it count.
- **Test with Resend's test mode** — use `re_test_...` API keys during development
