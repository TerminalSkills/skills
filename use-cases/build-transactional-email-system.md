---
title: Build a Transactional Email System
slug: build-transactional-email-system
description: >-
  Build a complete transactional email system with React Email for templates,
  Resend/Postmark for delivery, queue-based sending for reliability, and
  engagement tracking for optimization.
skills:
  - react-email-advanced
  - resend
  - postmark
  - bullmq
category: communication
tags:
  - email
  - transactional
  - templates
  - delivery
  - saas
---

# Build a Transactional Email System

Amal's SaaS sends 50,000 emails per month — welcome emails, password resets, invoices, weekly reports, and team invitations. Currently, emails are sent inline during API requests (blocking the response), templates are HTML strings with string interpolation (unmaintainable), and there's no tracking of delivery or engagement. A single failed email provider API call causes the user's action to fail. She rebuilds the email system properly.

## Step 1: Email Templates with React Email

Instead of HTML strings, Amal builds email templates as React components — type-safe, composable, and previewable locally.

```tsx
// emails/InviteTeamMember.tsx — Team invitation email
import { Heading, Text, Button, Section, Hr } from '@react-email/components'
import { Layout } from './components/Layout'

interface InviteProps {
  inviterName: string
  teamName: string
  inviteUrl: string
  role: 'admin' | 'member' | 'viewer'
}

export default function InviteTeamMember({ inviterName, teamName, inviteUrl, role }: InviteProps) {
  return (
    <Layout preview={`${inviterName} invited you to join ${teamName}`}>
      <Heading as="h1" style={{ fontSize: '24px', fontWeight: 'bold' }}>
        You're invited! 🎉
      </Heading>

      <Text style={{ fontSize: '16px', lineHeight: '24px', color: '#333' }}>
        <strong>{inviterName}</strong> has invited you to join <strong>{teamName}</strong> as
        a <strong>{role}</strong> on MyApp.
      </Text>

      {role === 'admin' && (
        <Text style={{ fontSize: '14px', color: '#666', backgroundColor: '#f0f0f0', padding: '12px', borderRadius: '6px' }}>
          As an admin, you'll be able to manage team members, projects, and billing.
        </Text>
      )}

      <Section style={{ textAlign: 'center', margin: '32px 0' }}>
        <Button href={inviteUrl} style={{
          backgroundColor: '#000', color: '#fff', padding: '14px 28px',
          borderRadius: '6px', fontSize: '16px', fontWeight: '600',
        }}>
          Accept Invitation
        </Button>
      </Section>

      <Hr style={{ borderColor: '#eaeaea', margin: '24px 0' }} />

      <Text style={{ fontSize: '13px', color: '#999' }}>
        This invitation expires in 7 days. If you didn't expect this, you can safely ignore it.
      </Text>
    </Layout>
  )
}
```

## Step 2: Queue-Based Email Sending

Emails are never sent inline. Every email goes through a BullMQ queue — this decouples email sending from API responses, provides automatic retries on failure, and enables rate limiting.

```typescript
// services/email/queue.ts — Email queue with BullMQ
import { Queue, Worker } from 'bullmq'
import { render } from '@react-email/render'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const connection = { host: 'localhost', port: 6379 }

// Queue
export const emailQueue = new Queue('emails', {
  connection,
  defaultJobOptions: {
    attempts: 3,                    // retry 3 times
    backoff: { type: 'exponential', delay: 60000 },  // 1min, 2min, 4min
    removeOnComplete: { age: 86400 },    // clean up after 24h
    removeOnFail: { age: 604800 },       // keep failures for 7 days
  },
})

// Worker
const emailWorker = new Worker('emails', async (job) => {
  const { to, subject, template, props, tags } = job.data

  // Dynamically import and render template
  const EmailComponent = (await import(`../../emails/${template}`)).default
  const html = await render(EmailComponent(props))

  const result = await resend.emails.send({
    from: 'MyApp <notifications@myapp.com>',
    to,
    subject,
    html,
    tags: tags?.map(t => ({ name: t.name, value: t.value })),
  })

  return { messageId: result.data?.id }
}, { connection, concurrency: 10 })    // process 10 emails concurrently

emailWorker.on('failed', (job, err) => {
  console.error(`Email failed after ${job.attemptsMade} attempts:`, {
    to: job.data.to,
    template: job.data.template,
    error: err.message,
  })
})
```

## Step 3: Email Service API

```typescript
// services/email/index.ts — Clean API for sending emails
import { emailQueue } from './queue'

export const EmailService = {
  async sendWelcome(user: { email: string; name: string }) {
    await emailQueue.add('welcome', {
      to: user.email,
      subject: `Welcome to MyApp, ${user.name}!`,
      template: 'WelcomeEmail',
      props: {
        name: user.name,
        loginUrl: `https://myapp.com/login`,
      },
      tags: [{ name: 'category', value: 'onboarding' }],
    })
  },

  async sendInvite(params: {
    inviterName: string
    teamName: string
    recipientEmail: string
    role: 'admin' | 'member' | 'viewer'
    token: string
  }) {
    await emailQueue.add('invite', {
      to: params.recipientEmail,
      subject: `${params.inviterName} invited you to ${params.teamName}`,
      template: 'InviteTeamMember',
      props: {
        inviterName: params.inviterName,
        teamName: params.teamName,
        inviteUrl: `https://myapp.com/invite/${params.token}`,
        role: params.role,
      },
      tags: [{ name: 'category', value: 'invitation' }],
    }, { priority: 1 })    // invitations are high priority
  },

  async sendPasswordReset(email: string, resetUrl: string) {
    await emailQueue.add('password-reset', {
      to: email,
      subject: 'Reset your password',
      template: 'PasswordReset',
      props: { resetUrl },
      tags: [{ name: 'category', value: 'auth' }],
    }, { priority: 1 })    // auth emails are high priority
  },

  async sendWeeklyReport(user: { email: string; name: string }, stats: object) {
    await emailQueue.add('weekly-report', {
      to: user.email,
      subject: `Your weekly report — ${new Date().toLocaleDateString()}`,
      template: 'WeeklyReport',
      props: { name: user.name, ...stats },
      tags: [{ name: 'category', value: 'report' }],
    }, { priority: 5 })    // reports are low priority
  },
}

// Usage in API routes — non-blocking
app.post('/api/auth/signup', async (req, res) => {
  const user = await createUser(req.body)
  await EmailService.sendWelcome(user)    // queued, doesn't block response
  res.json(user)
})
```

## Results

Email sending no longer blocks API responses — the signup endpoint drops from 800ms (inline sending) to 50ms (queue only). Failed emails automatically retry with exponential backoff — delivery rate improves from 94% to 99.2%. React Email templates are maintainable and consistent — new templates take 15 minutes instead of 2 hours of fighting with HTML tables. The priority queue ensures password resets and invitations send within seconds, while weekly reports batch during off-peak hours. Bull Board dashboard shows queue health: 50,000 emails/month processed with 0.3% failure rate (all temporary, recovered on retry).
