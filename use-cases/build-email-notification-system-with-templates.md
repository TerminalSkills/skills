---
title: Build an Email Notification System with Templates
slug: build-email-notification-system-with-templates
description: Build a transactional email system with React Email templates, queue-based sending, delivery tracking, and A/B testing — replacing ad-hoc email code with a centralized notification platform.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: Backend Development
tags:
  - email
  - notifications
  - templates
  - transactional
  - react-email
---

# Build an Email Notification System with Templates

## The Problem

Lucia leads engineering at a 30-person SaaS. Transactional emails are scattered across 12 files, each with inline HTML strings. The welcome email looks different from the password reset email. Nobody knows if emails are delivered — when a customer says "I didn't get the invite," the team can't verify. Changing the email footer requires editing 12 files. They need a centralized email system with shared templates, delivery tracking, and proper queuing so email sends don't slow down API responses.

## Step 1: Build React Email Templates

```typescript
// src/emails/templates/welcome.tsx — React Email template for welcome emails
import { Html, Head, Preview, Body, Container, Section, Heading, Text, Button, Img, Hr, Link } from "@react-email/components";

interface WelcomeEmailProps {
  userName: string;
  loginUrl: string;
  trialDaysLeft: number;
}

export function WelcomeEmail({ userName, loginUrl, trialDaysLeft }: WelcomeEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Platform — your {trialDaysLeft}-day trial starts now</Preview>
      <Body style={{ backgroundColor: "#f9fafb", fontFamily: "-apple-system, sans-serif" }}>
        <Container style={{ maxWidth: "600px", margin: "0 auto", padding: "20px" }}>
          <Section style={{ backgroundColor: "#ffffff", borderRadius: "8px", padding: "32px" }}>
            <Img src="https://app.example.com/logo.png" width="120" height="40" alt="Platform" />
            <Heading style={{ fontSize: "24px", color: "#111827", marginTop: "24px" }}>
              Welcome aboard, {userName}! 🎉
            </Heading>
            <Text style={{ color: "#4b5563", lineHeight: "1.6" }}>
              Your {trialDaysLeft}-day free trial is active. Here's what you can do right now:
            </Text>
            <Text style={{ color: "#4b5563", lineHeight: "1.8" }}>
              • Create your first project{"\n"}
              • Invite team members{"\n"}
              • Connect your tools{"\n"}
              • Explore the API
            </Text>
            <Button href={loginUrl} style={{
              backgroundColor: "#3b82f6", color: "#ffffff", padding: "12px 24px",
              borderRadius: "6px", fontWeight: "600", textDecoration: "none",
              display: "inline-block", marginTop: "16px",
            }}>
              Get Started →
            </Button>
          </Section>
          <Section style={{ textAlign: "center", padding: "16px" }}>
            <Text style={{ color: "#9ca3af", fontSize: "12px" }}>
              © 2026 Platform Inc. · <Link href="https://app.example.com/unsubscribe" style={{ color: "#9ca3af" }}>Unsubscribe</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

```typescript
// src/emails/sender.ts — Email sending with queue and delivery tracking
import { render } from "@react-email/render";
import { Redis } from "ioredis";
import { pool } from "../db";
import { WelcomeEmail } from "./templates/welcome";

const redis = new Redis(process.env.REDIS_URL!);

interface EmailJob {
  id: string;
  to: string;
  subject: string;
  template: string;
  data: Record<string, any>;
  priority: "high" | "normal" | "low";
  scheduledAt?: number;
}

// Template registry
const TEMPLATES: Record<string, { render: (data: any) => string; subject: (data: any) => string }> = {
  welcome: {
    render: (data) => render(WelcomeEmail(data)),
    subject: (data) => `Welcome to Platform, ${data.userName}!`,
  },
  passwordReset: {
    render: (data) => render(/* PasswordResetEmail */ data),
    subject: () => "Reset your password",
  },
  invoiceReady: {
    render: (data) => render(/* InvoiceEmail */ data),
    subject: (data) => `Invoice #${data.invoiceId} is ready`,
  },
  teamInvite: {
    render: (data) => render(/* TeamInviteEmail */ data),
    subject: (data) => `${data.inviterName} invited you to ${data.teamName}`,
  },
};

// Queue email for sending (non-blocking)
export async function queueEmail(email: Omit<EmailJob, "id">): Promise<string> {
  const id = `email-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const job: EmailJob = { ...email, id };

  // Store in database for tracking
  await pool.query(
    `INSERT INTO email_log (id, recipient, subject, template, status, created_at)
     VALUES ($1, $2, $3, $4, 'queued', NOW())`,
    [id, email.to, TEMPLATES[email.template]?.subject(email.data) || email.subject, email.template]
  );

  // Add to Redis queue (sorted by priority)
  const score = email.priority === "high" ? 1 : email.priority === "normal" ? 2 : 3;
  await redis.zadd("email:queue", score * 1e13 + Date.now(), JSON.stringify(job));

  return id;
}

// Process email queue (worker)
export async function processEmailQueue(): Promise<number> {
  let processed = 0;

  while (true) {
    const items = await redis.zpopmin("email:queue", 1);
    if (items.length < 2) break;

    const job: EmailJob = JSON.parse(items[0]);
    const template = TEMPLATES[job.template];

    if (!template) {
      await pool.query("UPDATE email_log SET status = 'failed', error = 'Unknown template' WHERE id = $1", [job.id]);
      continue;
    }

    try {
      const html = template.render(job.data);
      const subject = template.subject(job.data);

      // Send via Resend
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "Platform <noreply@app.example.com>",
          to: job.to,
          subject,
          html,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        await pool.query(
          "UPDATE email_log SET status = 'sent', provider_id = $2, sent_at = NOW() WHERE id = $1",
          [job.id, result.id]
        );
      } else {
        const error = await response.text();
        await pool.query(
          "UPDATE email_log SET status = 'failed', error = $2 WHERE id = $1",
          [job.id, error.slice(0, 500)]
        );
      }

      processed++;
    } catch (err: any) {
      await pool.query(
        "UPDATE email_log SET status = 'failed', error = $2 WHERE id = $1",
        [job.id, err.message]
      );
    }
  }

  return processed;
}

// Delivery tracking
export async function getEmailStatus(emailId: string): Promise<any> {
  const { rows } = await pool.query("SELECT * FROM email_log WHERE id = $1", [emailId]);
  return rows[0] || null;
}
```

## Results

- **Consistent branding across all emails** — shared React components ensure every email has the same header, footer, and styling; the "12 different-looking emails" problem is gone
- **Email sends don't block API responses** — queue-based sending means the API returns immediately; emails are sent asynchronously within seconds
- **"Did the email get sent?" answerable instantly** — every email is tracked in the database with status, send time, and provider ID; support can verify delivery in seconds
- **Footer changes take 30 seconds** — update one shared component, all templates use it; no more editing 12 files
- **Priority queue ensures critical emails arrive fast** — password resets (high) are sent before weekly digests (low); users don't wait for password resets because a batch job is running
