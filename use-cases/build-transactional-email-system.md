---
title: Build a Transactional Email System
slug: build-transactional-email-system
description: >-
  Build a complete transactional email system with React Email for templates,
  Resend for delivery, Postmark as a fallback provider, a BullMQ queue for
  reliable sending, and webhooks that keep your list clean.
skills:
  - react-email
  - resend
  - postmark
  - job-queue
category: productivity
tags:
  - email
  - transactional
  - templates
  - delivery
  - saas
---

# Build a Transactional Email System

Amal's SaaS sends welcome emails, password resets, invoices, weekly reports and team invitations. Today emails are sent inline during API requests (blocking the response), templates are HTML strings with string interpolation (unmaintainable), and nothing tracks delivery. A single failed provider call makes the user's action fail. She rebuilds the email system properly.

The stack: **React Email** renders templates, a **BullMQ** queue (via the `job-queue` skill, backed by Redis 6.2+) decouples sending from requests, **Resend** delivers, **Postmark** is the second provider for when Resend is down, and a signed Resend webhook reports bounces and complaints.

```console
$ npm install bullmq resend postmark react-email react react-dom
$ npm install -D typescript @types/react @types/node
```

Components come from the single `react-email` package; `@react-email/components` is deprecated on npm.

## Step 1: Email Templates with React Email

Instead of HTML strings, Amal builds templates as React components: type-safe, composable and previewable locally with `npx email dev`.

```tsx
// src/emails/invite.tsx
import { Html, Head, Preview, Body, Container, Heading, Text, Button, Section, Hr } from "react-email";

export interface InviteProps {
  inviterName: string;
  teamName: string;
  inviteUrl: string;
  role: "admin" | "member" | "viewer";
}

export default function InviteTeamMember({ inviterName, teamName, inviteUrl, role }: InviteProps) {
  return (
    <Html>
      <Head />
      <Preview>{`${inviterName} invited you to join ${teamName}`}</Preview>
      <Body style={{ fontFamily: "Helvetica, Arial, sans-serif", backgroundColor: "#f6f6f6" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "24px", maxWidth: "560px" }}>
          <Heading as="h1" style={{ fontSize: "24px" }}>You are invited</Heading>
          <Text style={{ fontSize: "16px", lineHeight: "24px", color: "#333333" }}>
            <strong>{inviterName}</strong> invited you to join <strong>{teamName}</strong> as {role} on MyApp.
          </Text>
          <Section style={{ textAlign: "center", margin: "32px 0" }}>
            <Button href={inviteUrl} style={{ backgroundColor: "#000000", color: "#ffffff", padding: "14px 28px", borderRadius: "6px" }}>
              Accept invitation
            </Button>
          </Section>
          <Hr />
          <Text style={{ fontSize: "13px", color: "#777777" }}>
            This invitation expires in 7 days. If you did not expect it, ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
```

## Step 2: Queue-Based Sending with a Fallback Provider

Emails are never sent inline. Every email goes through a BullMQ queue, which gives automatic retries, a rate limit and a place to absorb provider outages. Four details matter:

- **Templates come from a registry, not from the job.** The job names a template key; it never carries a file path, so nothing user-controlled reaches `import()`.
- **Resend does not throw on API errors.** `resend.emails.send()` returns `{ data, error }`; check `error`, or failed sends look like successes.
- **Retries must not double-send.** The `idempotencyKey` option makes a repeated request with the same key return the first result instead of sending again, and the queue's `jobId` is deterministic per logical email.
- **Retry only what can succeed.** A 4xx other than 429 means the payload is bad, so the worker throws `UnrecoverableError` and BullMQ stops retrying. On the last attempt for a transient error (5xx, 429, network), the worker sends through Postmark instead.

```typescript
// src/email/queue.ts
import { Queue, Worker, UnrecoverableError, type JobsOptions } from "bullmq";
import { createElement, type ComponentType } from "react";
import { render } from "react-email";
import { Resend } from "resend";
import { ServerClient } from "postmark";
import InviteTeamMember, { type InviteProps } from "../emails/invite";

const templates = {
  invite: InviteTeamMember,
} satisfies Record<string, ComponentType<any>>;
type Templates = { invite: InviteProps };

export interface EmailJob<T extends keyof Templates = keyof Templates> {
  to: string;
  subject: string;
  template: T;
  props: Templates[T];
  category: string; // Resend tag values allow only ASCII letters, numbers, _ and -
}

const connection = { host: "127.0.0.1", port: 6379 };
const resend = new Resend(process.env.RESEND_API_KEY);
const postmark = new ServerClient(process.env.POSTMARK_API_TOKEN!);
const from = "MyApp <notifications@myapp.com>"; // domain verified at both providers

const defaultJobOptions: JobsOptions = {
  attempts: 4,
  backoff: { type: "exponential", delay: 60_000 }, // 1, 2, 4 minutes between attempts
  removeOnComplete: { age: 24 * 3600 },
  removeOnFail: { age: 7 * 24 * 3600 },
};
export const emailQueue = new Queue<EmailJob>("emails", { connection, defaultJobOptions });

export const emailWorker = new Worker<EmailJob>("emails", async (job) => {
  const { to, subject, template, props, category } = job.data;
  const Component = templates[template] as ComponentType<typeof props>;
  const element = createElement(Component, props);
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

  const { error } = await resend.emails.send(
    { from, to, subject, html, text, tags: [{ name: "category", value: category }] },
    { idempotencyKey: `email-${job.id}` },
  );
  if (!error) return;
  if (error.statusCode !== null && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 429) {
    throw new UnrecoverableError(`Resend rejected ${job.id}: ${error.message}`); // bad payload: do not retry
  }
  if (job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
    await postmark.sendEmail({
      From: from, To: to, Subject: subject, HtmlBody: html, TextBody: text,
      MessageStream: "outbound", Tag: category,
    });
    return;
  }
  throw new Error(`Resend: ${error.message}`);
}, { connection, concurrency: 10, limiter: { max: 10, duration: 1000 } }); // Resend's default is 10 requests/second per team

emailWorker.on("failed", (job, err) => {
  console.error(`email ${job?.id} failed after ${job?.attemptsMade} attempts: ${err.message}`);
});
```

Redis binds to `127.0.0.1` here; never expose it on a public interface. Postmark's `sendEmail` throws on API errors (with `ErrorCode` and `Message`), which fails the job and is logged by the `failed` handler. Add more entries to `templates` for the welcome, reset and report emails.

## Step 3: A Clean Service API

```typescript
// src/email/index.ts
import { emailQueue } from "./queue";

export const EmailService = {
  async sendInvite(p: { inviterName: string; teamName: string; recipientEmail: string;
                        role: "admin" | "member" | "viewer"; inviteId: string; token: string }) {
    // A deterministic jobId means the same invitation is never queued twice
    await emailQueue.add("invite", {
      to: p.recipientEmail,
      subject: `${p.inviterName} invited you to ${p.teamName}`,
      template: "invite",
      props: { inviterName: p.inviterName, teamName: p.teamName, role: p.role,
               inviteUrl: `https://myapp.com/invite/${p.token}` },
      category: "invitation",
    }, { jobId: `invite-${p.inviteId}`, priority: 1 }); // lower number = higher priority
  },
};
```

In an API route, `await EmailService.sendInvite(...)` returns as soon as the job is in Redis, so the response no longer waits for the provider. Give auth emails (password reset, verification) `priority: 1` and weekly reports a larger number so they never queue behind a batch.

## Step 4: Bounces and Complaints

Sending to addresses that bounce or complain damages your sender reputation. Resend publishes thresholds to stay under (bounce rate below 4%, spam complaints below 0.08%), so Amal subscribes a webhook to `email.bounced` and `email.complained` and marks those addresses undeliverable. The handler verifies the signature against the raw body with `resend.webhooks.verify` before trusting anything in it. Store the endpoint's signing secret in `RESEND_WEBHOOK_SECRET`.

```typescript
// Fetch-API route handler (e.g. a Next.js app/api/resend-webhook/route.ts)
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const payload = await req.text(); // verify the raw body, not parsed JSON
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
    if (event.type === "email.bounced" || event.type === "email.complained") {
      await markUndeliverable(event.data.to); // your database call
    }
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }
  return new Response("ok");
}
```

Check `emailValid` before queuing any email to a user, and test the path locally by sending to Resend's `bounced@resend.dev` test address.

## Results

Sending no longer blocks API responses: the request only writes a job to Redis, so latency no longer depends on the provider. A provider error or timeout is retried with exponential backoff, a payload the provider rejects stops immediately, and after the last retry Postmark delivers instead. Idempotency keys and deterministic job IDs keep a retry from sending an email twice. New templates are a React component and one registry line, previewable with `npx email dev` before they ship. Amal watches the queue with `emailQueue.getJobCounts()` (or a dashboard such as Bull Board) and the `failed` log for anything that exhausted its attempts.

## Related Skills

- **react-email**: builds the templates and renders HTML plus a plain-text version from the `react-email` package.
- **resend**: primary delivery with `{ data, error }` results, idempotency keys, tags and signed bounce webhooks.
- **postmark**: second provider on the `outbound` transactional stream, used on the final retry when Resend is unavailable.
- **job-queue**: BullMQ queue with retries, backoff, priorities, rate limiting and deterministic job IDs.
