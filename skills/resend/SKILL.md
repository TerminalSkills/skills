---
name: resend
description: >-
  Resend is an email API for developers: send transactional and marketing
  email from Node.js, Python and other SDKs, with React Email templates,
  webhooks for delivery events, batch sending and contact broadcasts. Use when
  someone asks to "send an email with Resend", "set up Resend webhooks",
  "build a React Email template", "send a batch of emails" or to move off
  SendGrid or Mailgun.
license: Apache-2.0
compatibility: 'Node.js 18+ (or any language with a Resend SDK); Resend account and API key'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - email
    - api
    - transactional
    - react-email
    - webhooks
---

# Resend — Modern Email API for Developers

## Overview

Resend sends email over a REST API with official SDKs (Node.js, Python, Go, Ruby, PHP, Java, .NET, Rust). Templates can be written as React components with React Email, delivery events arrive as signed webhooks, and marketing mail goes out as broadcasts to a segment of contacts. This skill covers the Node.js SDK (`resend` 6.x) as of October 2026.

## Instructions

### Install and authenticate

```bash
npm install resend react react-dom
npm install react-email            # templates and the preview server
```

Create an API key in the Resend dashboard and keep it in `RESEND_API_KEY`. Verify a sending domain at resend.com/domains (SPF and DKIM records) before production; `onboarding@resend.dev` is for testing only.

### Send an email

The SDK does not throw on API errors; it returns `{ data, error }`. Node parameter names are camelCase (`scheduledAt`, `replyTo`).

```typescript
import { Resend } from "resend";
import { WelcomeEmail } from "@/emails/welcome";

const resend = new Resend(process.env.RESEND_API_KEY);

const { data, error } = await resend.emails.send({
  from: "Northwind <hello@mail.northwind.io>",
  to: "maria.lopez@gmail.com",
  subject: "Welcome to Northwind",
  react: WelcomeEmail({ name: "Maria", loginUrl: "https://app.northwind.io/login" }),
});
if (error) throw new Error(`Resend: ${error.message}`);
console.log(data.id); // e.g. "49a3999c-0ce1-4ea6-ab68-afcd6dc2e794"
```

Pass the component as a function call (`WelcomeEmail({...})`), not as JSX. Other content options are `html`, `text`, or a stored `template` (`{ id, variables }`). Extras: `cc`, `bcc`, `replyTo`, `headers`, `tags` (name and value use only letters, numbers, `_` and `-`), `attachments` (`filename` plus `content` or `path`), and `scheduledAt` (ISO 8601 or text such as `"in 1 hour"`).

### Batch sending

```typescript
const { data, error } = await resend.batch.send(
  users.map((u) => ({
    from: "Northwind <digest@mail.northwind.io>",
    to: u.email,
    subject: "Your weekly digest",
    react: DigestEmail({ items: u.items }),
  })),
);
// data.data[i].id matches payload[i]
```

A batch holds up to 100 emails. Attachments and `scheduledAt` are not supported in batch requests.

### React Email templates

```tsx
// emails/welcome.tsx
import { Html, Head, Body, Container, Heading, Text, Button, Hr } from "react-email";

export function WelcomeEmail({ name, loginUrl }: { name: string; loginUrl: string }) {
  return (
    <Html>
      <Head />
      <Body style={{ fontFamily: "Arial, sans-serif", backgroundColor: "#f4f4f5" }}>
        <Container style={{ maxWidth: 600, padding: 20, backgroundColor: "#ffffff" }}>
          <Heading as="h1">Welcome, {name}</Heading>
          <Text>Your workspace is ready.</Text>
          <Button href={loginUrl} style={{ backgroundColor: "#000", color: "#fff", padding: "12px 24px" }}>
            Open Northwind
          </Button>
          <Hr />
          <Text style={{ fontSize: 12, color: "#666" }}>Did not sign up? Ignore this email.</Text>
        </Container>
      </Body>
    </Html>
  );
}
```

Preview in the browser with `npx email dev` (serves templates from `emails/` on localhost:3000). The older `@react-email/components` package is deprecated on npm; import components from `react-email`.

### Webhooks

Add an endpoint in the dashboard and store its signing secret as `RESEND_WEBHOOK_SECRET`. Verify against the raw body, not parsed JSON:

```typescript
export async function POST(req: Request) {
  const payload = await req.text();
  try {
    const event = resend.webhooks.verify({
      payload,
      headers: {
        id: req.headers.get("svix-id")!,
        timestamp: req.headers.get("svix-timestamp")!,
        signature: req.headers.get("svix-signature")!,
      },
      webhookSecret: process.env.RESEND_WEBHOOK_SECRET!,
    });
    if (event.type === "email.bounced") await markUndeliverable(event.data.to);
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  return new Response("ok");
}
```

Email events: `email.sent`, `email.scheduled`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.suppressed`, `email.failed`, `email.opened`, `email.clicked`, `email.received`.

### Contacts and broadcasts

Contacts are global to the account and are grouped into segments (the older "audiences" are replaced by segments and topics).

```typescript
await resend.contacts.create({ email: "steve.wozniak@gmail.com", firstName: "Steve", unsubscribed: false });

await resend.broadcasts.create({
  segmentId: "78261eea-8f8b-4381-83c6-79fa7120f1cf",
  from: "Northwind <news@mail.northwind.io>",
  subject: "October release notes",
  html: "Hi {{{contact.first_name|there}}}, read the notes. Unsubscribe: {{{RESEND_UNSUBSCRIBE_URL}}}",
  send: true,
});
```

Leave out `send: true` to save a draft.

## Examples

### Example 1: Send an invoice with a PDF and tags

Request: "Email the customer their invoice PDF and tag it as billing so I can filter in Resend."

```typescript
import { readFile } from "node:fs/promises";

const { data, error } = await resend.emails.send({
  from: "Northwind Billing <billing@mail.northwind.io>",
  to: ["maria.lopez@gmail.com"],
  bcc: "archive@northwind.io",
  subject: "Invoice INV-2026-0142",
  html: "<h1>Invoice INV-2026-0142</h1><p>Amount due: $99.99</p>",
  attachments: [{ filename: "INV-2026-0142.pdf", content: await readFile("./out/INV-2026-0142.pdf") }],
  tags: [{ name: "category", value: "billing" }],
});
```

Result: `data.id` holds the email ID; the message shows up in the Logs page with the `category:billing` tag.

### Example 2: Stop mailing hard bounces

Request: "When an address bounces, flag the user so we stop sending."

Add the webhook route from the Webhooks section, subscribe it to `email.bounced` and `email.complained`, and in the handler set the user's `emailValid` field to false. Test it locally by exposing the dev server with a tunnel and sending to `bounced@resend.dev`.

## Guidelines

- Default rate limit is 10 requests per second per team; a 429 means back off using the `retry-after` header. Use batch sending for volume.
- A single email accepts at most 50 recipients and 40 MB of attachments after Base64 encoding.
- The `Idempotency-Key` header (unique per request, kept for 24 hours) prevents duplicate sends on retries.
- Always check `error`; a failed call resolves normally.
- Verify webhook signatures on the raw request body; any re-serialisation breaks them.
- Send marketing mail through broadcasts so the unsubscribe link and suppression handling are applied.
- Keep the API key server-side only; never ship it to the browser.
