---
name: resend
category: Backend Development
tags: [email, api, transactional, react-email, typescript, developer-first]
version: 1.0.0
author: terminal-skills
---

# Resend — Modern Email API for Developers

You are an expert in Resend, the developer-first email API. You help developers send transactional and marketing emails using React Email templates, TypeScript SDK, webhooks for delivery tracking, batch sending, and audience management — replacing legacy email services (SendGrid, Mailgun) with a modern, type-safe developer experience.

## Core Capabilities

### Sending Emails

```typescript
import { Resend } from "resend";
import { WelcomeEmail } from "@/emails/welcome";

const resend = new Resend(process.env.RESEND_API_KEY);

// Send with React Email template
const { data, error } = await resend.emails.send({
  from: "Acme <noreply@acme.com>",
  to: "user@example.com",
  subject: "Welcome to Acme",
  react: WelcomeEmail({ name: "Alice", loginUrl: "https://app.acme.com" }),
});

// Send with HTML
await resend.emails.send({
  from: "Acme <noreply@acme.com>",
  to: ["user1@example.com", "user2@example.com"],
  cc: "admin@acme.com",
  bcc: "archive@acme.com",
  subject: "Your invoice",
  html: "<h1>Invoice #123</h1><p>Amount: $99.99</p>",
  attachments: [{
    filename: "invoice.pdf",
    content: pdfBuffer,
  }],
  tags: [
    { name: "category", value: "billing" },
    { name: "user_id", value: "usr-42" },
  ],
});

// Batch send
const { data } = await resend.batch.send([
  { from: "noreply@acme.com", to: "user1@example.com", subject: "Digest", react: DigestEmail({ items: user1Items }) },
  { from: "noreply@acme.com", to: "user2@example.com", subject: "Digest", react: DigestEmail({ items: user2Items }) },
]);

// Schedule
await resend.emails.send({
  from: "noreply@acme.com",
  to: "user@example.com",
  subject: "Reminder",
  react: ReminderEmail({}),
  scheduledAt: "2026-03-15T09:00:00Z",    // Send at specific time
});
```

### React Email Templates

```tsx
// emails/welcome.tsx — Type-safe email templates
import { Html, Head, Body, Container, Heading, Text, Button, Hr, Img } from "@react-email/components";

interface WelcomeEmailProps {
  name: string;
  loginUrl: string;
}

export function WelcomeEmail({ name, loginUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f4f4f5" }}>
        <Container style={{ maxWidth: 600, margin: "0 auto", padding: 20, backgroundColor: "#fff" }}>
          <Img src="https://acme.com/logo.png" width={120} height={40} alt="Acme" />
          <Heading as="h1">Welcome, {name}!</Heading>
          <Text>Thanks for signing up. Get started by logging in:</Text>
          <Button
            href={loginUrl}
            style={{ backgroundColor: "#000", color: "#fff", padding: "12px 24px", borderRadius: 6 }}>
            Get Started
          </Button>
          <Hr />
          <Text style={{ fontSize: 12, color: "#666" }}>
            If you didn't create this account, ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

// Preview: npx email dev (opens browser preview at localhost:3000)
```

## Installation

```bash
npm install resend
npm install @react-email/components react-email  # For templates
npx email dev                              # Preview templates
```

## Best Practices

1. **React Email templates** — Build emails with React components; type-safe, previewable, reusable
2. **Tags for analytics** — Add tags to every email; track delivery rates by category, campaign, user segment
3. **Webhooks for tracking** — Set up webhooks for delivered/bounced/complained events; update user records
4. **Batch for volume** — Use `batch.send` for newsletters/digests; up to 100 emails per batch call
5. **Domain verification** — Verify your sending domain with DNS records (SPF, DKIM, DMARC); improves deliverability
6. **Preview before send** — Use `npx email dev` to preview templates in the browser; iterate fast
7. **Scheduled sends** — Use `scheduledAt` for time-zone-aware delivery; better open rates
8. **Error handling** — Check `error` in response; handle bounces gracefully, update user preferences
