---
name: react-email-advanced
description: >-
  Build email templates with React Email. Use when a user asks to create
  responsive HTML emails with React components, build a transactional email
  system, design email templates with TypeScript, or preview emails locally.
license: Apache-2.0
compatibility: 'React 18+, any email provider'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: communication
  tags:
    - react-email
    - email
    - templates
    - transactional
    - react
---

# React Email (Advanced)

## Overview

React Email lets you build HTML emails using React components. Write emails with the same component model as your app — props, composition, conditional rendering — then render to HTML for any email provider. Includes a dev server for live preview.

## Instructions

### Step 1: Setup

```bash
npx create-email@latest
# or add to existing project
npm install @react-email/components react-email
```

### Step 2: Base Layout

```tsx
// emails/components/Layout.tsx — Shared email layout
import { Html, Head, Preview, Body, Container, Section, Text, Hr, Link } from '@react-email/components'

interface LayoutProps {
  preview: string
  children: React.ReactNode
}

export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="en">
      <Head>
        <style>{`
          @media (prefers-color-scheme: dark) {
            .dark-invert { filter: invert(1); }
          }
        `}</style>
      </Head>
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
        <Container style={{ maxWidth: '600px', margin: '0 auto', padding: '40px 20px' }}>
          {/* Logo */}
          <Section style={{ textAlign: 'center', marginBottom: '32px' }}>
            <img src="https://myapp.com/logo.png" alt="MyApp" width="120" height="40" />
          </Section>

          {/* Content */}
          <Section style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '32px', border: '1px solid #eaeaea' }}>
            {children}
          </Section>

          {/* Footer */}
          <Section style={{ textAlign: 'center', marginTop: '32px' }}>
            <Text style={{ color: '#666', fontSize: '12px' }}>
              MyApp Inc. · 123 Main St · San Francisco, CA 94105
            </Text>
            <Link href="https://myapp.com/unsubscribe" style={{ color: '#666', fontSize: '12px' }}>
              Unsubscribe
            </Link>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}
```

### Step 3: Transactional Emails

```tsx
// emails/WelcomeEmail.tsx — Welcome email template
import { Text, Button, Section, Heading } from '@react-email/components'
import { Layout } from './components/Layout'

interface WelcomeEmailProps {
  name: string
  loginUrl: string
  teamName?: string
}

export default function WelcomeEmail({ name, loginUrl, teamName }: WelcomeEmailProps) {
  return (
    <Layout preview={`Welcome to MyApp${teamName ? ` — you've joined ${teamName}` : ''}`}>
      <Heading as="h1" style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 16px' }}>
        Welcome, {name}! 🎉
      </Heading>

      <Text style={{ fontSize: '16px', lineHeight: '24px', color: '#333' }}>
        {teamName
          ? `You've been invited to join ${teamName} on MyApp. Your team is already using MyApp to manage projects and collaborate.`
          : `Thanks for signing up! MyApp helps teams manage projects, track tasks, and collaborate — all in one place.`
        }
      </Text>

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button
          href={loginUrl}
          style={{
            backgroundColor: '#000000',
            color: '#ffffff',
            padding: '14px 28px',
            borderRadius: '6px',
            fontSize: '16px',
            fontWeight: '600',
            textDecoration: 'none',
          }}
        >
          Get Started
        </Button>
      </Section>

      <Text style={{ fontSize: '14px', color: '#666' }}>
        If the button doesn't work, copy and paste this link:{' '}
        <a href={loginUrl} style={{ color: '#0070f3' }}>{loginUrl}</a>
      </Text>
    </Layout>
  )
}
```

### Step 4: Render and Send

```typescript
// lib/email.ts — Render React Email to HTML and send
import { render } from '@react-email/render'
import { Resend } from 'resend'
import WelcomeEmail from '../emails/WelcomeEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function sendWelcomeEmail(user: { name: string; email: string }) {
  const html = await render(WelcomeEmail({
    name: user.name,
    loginUrl: `https://myapp.com/login?token=${generateToken(user.email)}`,
  }))

  await resend.emails.send({
    from: 'MyApp <hello@myapp.com>',
    to: user.email,
    subject: `Welcome to MyApp, ${user.name}!`,
    html,
  })
}
```

### Step 5: Preview

```bash
# Start dev server with live preview
npx react-email dev

# Opens browser at localhost:3000 with all email templates
# Hot reloads on file changes — design emails like building UI
```

## Guidelines

- Always include a plain-text fallback link below buttons — some email clients don't render buttons.
- Use inline styles, not CSS classes — most email clients strip `<style>` tags.
- Test across clients: Gmail, Outlook, Apple Mail all render differently.
- `<Preview>` text appears in inbox previews — make it compelling (not the first paragraph).
- Use `render()` to get HTML string, then send via any provider (Resend, SendGrid, SMTP).
