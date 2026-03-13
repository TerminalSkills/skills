---
name: react-email
description: >-
  You are an expert in React Email, the library for building responsive HTML
  emails using React components. You help developers create beautiful,
  cross-client-compatible email templates with type-safe components, live
  preview, and integration with email providers (Resend, SendGrid, Postmark,
  AWS SES) — replacing fragile HTML table layouts with a modern
  component-based workflow.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - email
    - react
    - components
    - templates
    - html
    - responsive
---

# React Email — Build Emails with React Components

You are an expert in React Email, the library for building responsive HTML emails using React components. You help developers create beautiful, cross-client-compatible email templates with type-safe components, live preview, and integration with email providers (Resend, SendGrid, Postmark, AWS SES) — replacing fragile HTML table layouts with a modern component-based workflow.

## Core Capabilities

### Email Components

```tsx
// emails/welcome.tsx
import {
  Html, Head, Body, Container, Section, Row, Column,
  Heading, Text, Button, Link, Img, Hr, Preview,
  Font, Tailwind,
} from "@react-email/components";

interface WelcomeEmailProps {
  name: string;
  teamName: string;
  inviteUrl: string;
}

export default function WelcomeEmail({ name, teamName, inviteUrl }: WelcomeEmailProps) {
  return (
    <Html>
      <Head>
        <Font fontFamily="Inter" fallbackFontFamily="Arial"
          webFont={{ url: "https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700", format: "woff2" }} />
      </Head>
      <Preview>You've been invited to join {teamName}</Preview>
      <Tailwind>
        <Body className="bg-gray-50 font-sans">
          <Container className="mx-auto max-w-[600px] p-8">
            <Section className="bg-white rounded-xl p-8 shadow-sm">
              <Img src="https://app.example.com/logo.png" width={120} height={40} alt="Logo" className="mb-6" />

              <Heading className="text-2xl font-bold text-gray-900 mb-4">
                Welcome aboard, {name}! 🎉
              </Heading>

              <Text className="text-gray-600 text-base leading-relaxed mb-6">
                You've been invited to join <strong>{teamName}</strong>. Click below to accept
                your invitation and get started.
              </Text>

              <Button href={inviteUrl}
                className="bg-blue-600 text-white font-semibold px-6 py-3 rounded-lg text-base">
                Accept Invitation
              </Button>

              <Hr className="my-6 border-gray-200" />

              <Section>
                <Heading as="h3" className="text-lg font-semibold mb-3">What's next?</Heading>
                <Row>
                  <Column className="w-1/3 text-center p-2">
                    <Text className="text-3xl mb-1">📋</Text>
                    <Text className="text-sm text-gray-600">Set up your profile</Text>
                  </Column>
                  <Column className="w-1/3 text-center p-2">
                    <Text className="text-3xl mb-1">👥</Text>
                    <Text className="text-sm text-gray-600">Meet the team</Text>
                  </Column>
                  <Column className="w-1/3 text-center p-2">
                    <Text className="text-3xl mb-1">🚀</Text>
                    <Text className="text-sm text-gray-600">Start building</Text>
                  </Column>
                </Row>
              </Section>

              <Hr className="my-6 border-gray-200" />

              <Text className="text-xs text-gray-400 text-center">
                If you didn't expect this email, you can safely ignore it.
                <br />
                <Link href="https://example.com/unsubscribe" className="text-gray-400 underline">
                  Unsubscribe
                </Link>
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
```

### Rendering and Sending

```typescript
import { render } from "@react-email/render";
import WelcomeEmail from "./emails/welcome";

// Render to HTML string
const html = await render(WelcomeEmail({
  name: "Alice",
  teamName: "Acme Engineering",
  inviteUrl: "https://app.example.com/invite/abc123",
}));

// Render plain text version
const text = await render(WelcomeEmail({ name: "Alice", teamName: "Acme", inviteUrl: "..." }), {
  plainText: true,
});

// Send with any provider
await resend.emails.send({ from: "team@example.com", to: "alice@example.com", subject: "Welcome!", html, text });
```

### Preview Server

```bash
npx email dev                             # Opens http://localhost:3000
# Live preview of all emails in /emails directory
# Hot reload on file changes
# Send test emails directly from preview UI
```

## Installation

```bash
npm install @react-email/components react-email
npm install -D react-email                 # CLI for preview
```

## Best Practices

1. **Tailwind in emails** — Wrap with `<Tailwind>` component; React Email inlines styles for email client compatibility
2. **Preview text** — Use `<Preview>` component; shows in inbox preview without appearing in email body
3. **Test across clients** — Preview in Gmail, Outlook, Apple Mail; React Email handles quirks but test edge cases
4. **Plain text fallback** — Always render plain text version; improves deliverability and accessibility
5. **Responsive layout** — Use `<Row>` and `<Column>` for grid layouts; they render as tables for email client support
6. **Web fonts** — Use `<Font>` with fallback; not all clients support web fonts
7. **Props for personalization** — Pass data via props; type-safe, reusable across different sends
8. **Preview server** — Run `email dev` during development; hot reload + test sends from the browser
