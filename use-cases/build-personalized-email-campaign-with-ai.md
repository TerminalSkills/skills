---
title: "Build a Personalized Email Campaign with AI"
description: "Use Claude to write truly unique emails per audience segment — not just name merges. A/B test, track engagement, and automate follow-ups for a product launch campaign."
skills: [resend, anthropic-sdk, prisma]
difficulty: intermediate
time_estimate: "5 hours"
tags: [email, marketing, ai, personalization, resend, a-b-testing, automation, saas, campaign]
---

# Build a Personalized Email Campaign with AI

**Persona:** You're a SaaS marketer launching a new feature to 10,000 users. Cookie-cutter blast emails get 15% open rates. You want AI to write unique emails for each segment — startup founders get a different pitch than enterprise IT managers — and automatically follow up with non-openers on day 3.

---

## What You'll Build

- **Segmentation engine:** group contacts by behavior, company size, industry
- **AI email writer:** Claude crafts unique copy per segment (not just `Hi {name}`)
- **A/B testing:** test subject lines + CTAs, pick winners automatically
- **Resend delivery:** bulk send with open/click tracking
- **Follow-up automation:** re-engage non-openers 3 days later

---

## Data Model (Prisma)

```prisma
// prisma/schema.prisma
model Contact {
  id          String   @id @default(cuid())
  email       String   @unique
  name        String
  company     String?
  companySize String?  // "1-10", "11-50", "51-200", "201+"
  industry    String?
  plan        String?  // "free", "pro", "enterprise"
  lastLogin   DateTime?
  featureUses Int      @default(0)
  createdAt   DateTime @default(now())
  sends       EmailSend[]
}

model Campaign {
  id          String   @id @default(cuid())
  name        String
  status      CampaignStatus @default(DRAFT)
  createdAt   DateTime @default(now())
  sends       EmailSend[]
}

model EmailSend {
  id          String   @id @default(cuid())
  contactId   String
  campaignId  String
  variant     String   // "A" or "B"
  subject     String
  body        String
  sentAt      DateTime?
  openedAt    DateTime?
  clickedAt   DateTime?
  resendId    String?
  contact     Contact  @relation(fields: [contactId], references: [id])
  campaign    Campaign @relation(fields: [campaignId], references: [id])
}

enum CampaignStatus { DRAFT SENDING SENT }
```

---

## Step 1: Segment Your Contacts

```ts
// lib/segmentation.ts
import { prisma } from './prisma';

export type Segment = {
  label: string;
  contacts: Awaited<ReturnType<typeof prisma.contact.findMany>>;
  context: string; // passed to AI for personalization
};

export async function buildSegments(): Promise<Segment[]> {
  const [startups, enterprise, powerUsers, dormant] = await Promise.all([
    prisma.contact.findMany({ where: { companySize: { in: ['1-10', '11-50'] }, plan: 'free' } }),
    prisma.contact.findMany({ where: { companySize: '201+', plan: 'enterprise' } }),
    prisma.contact.findMany({ where: { featureUses: { gte: 50 }, plan: 'pro' } }),
    prisma.contact.findMany({ where: { lastLogin: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } }),
  ]);

  return [
    {
      label: 'startups',
      contacts: startups,
      context: 'Early-stage startup founders and small teams. They care about speed, cost savings, and shipping fast. They don\'t have time for complexity.',
    },
    {
      label: 'enterprise',
      contacts: enterprise,
      context: 'Enterprise IT managers and CTOs. They care about security, compliance, SLAs, and integration with existing tools.',
    },
    {
      label: 'power-users',
      contacts: powerUsers,
      context: 'Power users who love the product. They want advanced features, early access, and recognition as super-users.',
    },
    {
      label: 'dormant',
      contacts: dormant,
      context: 'Users who haven\'t logged in for 30+ days. They may have forgotten about the product or hit friction. Win them back with a compelling reason to return.',
    },
  ];
}
```

---

## Step 2: AI Email Writer per Segment

```ts
// lib/email-writer.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface WriteEmailOptions {
  featureName: string;
  featureDescription: string;
  segmentContext: string;
  contactName: string;
  variant: 'A' | 'B'; // A/B test: A = feature-focused, B = outcome-focused
}

export async function writePersonalizedEmail(opts: WriteEmailOptions) {
  const variantInstruction = opts.variant === 'A'
    ? 'Focus on what the feature does and how it works.'
    : 'Focus entirely on the outcome and business impact. Mention the feature only briefly.';

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Write a personalized email announcing a new product feature.

Feature: ${opts.featureName}
Description: ${opts.featureDescription}
Recipient name: ${opts.contactName}
Audience context: ${opts.segmentContext}
Tone variant: ${variantInstruction}

Requirements:
- Subject line: compelling, max 9 words, no clickbait
- Body: 3-4 short paragraphs, conversational, no corporate jargon
- CTA: single clear action button text
- Do NOT use filler phrases like "I hope this email finds you well"
- Sound like a human, not a marketing template

Return JSON:
{
  "subject": "...",
  "preview": "...",
  "body_html": "...",
  "cta_text": "..."
}`,
    }],
  });

  const text = (message.content[0] as any).text;
  return JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}');
}
```

---

## Step 3: Send Campaign with Resend

```ts
// lib/campaign-sender.ts
import { Resend } from 'resend';
import { prisma } from './prisma';
import { buildSegments } from './segmentation';
import { writePersonalizedEmail } from './email-writer';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function launchCampaign(campaignId: string, featureName: string, featureDescription: string) {
  const segments = await buildSegments();

  for (const segment of segments) {
    for (const contact of segment.contacts) {
      const variant: 'A' | 'B' = Math.random() > 0.5 ? 'A' : 'B';

      const email = await writePersonalizedEmail({
        featureName,
        featureDescription,
        segmentContext: segment.context,
        contactName: contact.name.split(' ')[0],
        variant,
      });

      // Track open via pixel
      const trackingPixel = `<img src="https://yourapp.com/api/track/open?sid=${contact.id}&cid=${campaignId}" width="1" height="1" />`;

      const { data } = await resend.emails.send({
        from: 'Your Name <hello@yourapp.com>',
        to: contact.email,
        subject: email.subject,
        html: email.body_html + trackingPixel,
        headers: { 'X-Campaign-ID': campaignId, 'X-Variant': variant },
      });

      await prisma.emailSend.create({
        data: {
          contactId: contact.id,
          campaignId,
          variant,
          subject: email.subject,
          body: email.body_html,
          sentAt: new Date(),
          resendId: data?.id,
        },
      });

      await new Promise(r => setTimeout(r, 100)); // ~10 sends/second
    }
  }
}
```

---

## Step 4: A/B Test Analysis

```ts
// lib/ab-analysis.ts
import { prisma } from './prisma';

export async function analyzeABTest(campaignId: string) {
  const sends = await prisma.emailSend.findMany({ where: { campaignId, sentAt: { not: null } } });

  const byVariant = { A: sends.filter(s => s.variant === 'A'), B: sends.filter(s => s.variant === 'B') };

  const stats = (variant: typeof byVariant['A']) => ({
    sent: variant.length,
    opens: variant.filter(s => s.openedAt).length,
    clicks: variant.filter(s => s.clickedAt).length,
    openRate: (variant.filter(s => s.openedAt).length / variant.length * 100).toFixed(1) + '%',
    clickRate: (variant.filter(s => s.clickedAt).length / variant.length * 100).toFixed(1) + '%',
  });

  const winner = byVariant.A.filter(s => s.openedAt).length > byVariant.B.filter(s => s.openedAt).length ? 'A' : 'B';
  return { A: stats(byVariant.A), B: stats(byVariant.B), winner };
}
```

---

## Step 5: Follow-Up to Non-Openers (Day 3)

```ts
// scripts/followup.ts
import { prisma } from '../lib/prisma';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendFollowUp(campaignId: string) {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const nonOpeners = await prisma.emailSend.findMany({
    where: { campaignId, sentAt: { lte: threeDaysAgo }, openedAt: null },
    include: { contact: true },
  });

  console.log(`Sending follow-up to ${nonOpeners.length} non-openers`);

  for (const send of nonOpeners) {
    await resend.emails.send({
      from: 'Your Name <hello@yourapp.com>',
      to: send.contact.email,
      subject: `Quick follow-up: ${send.subject}`,
      html: `<p>Hi ${send.contact.name.split(' ')[0]},</p><p>Wanted to make sure you saw our update. ${send.body}</p>`,
    });
    await new Promise(r => setTimeout(r, 100));
  }
}
```

Schedule with cron: `0 9 * * * npx ts-node scripts/followup.ts`

---

## Key Outcomes

- 10,000 emails sent with unique AI copy per segment
- A/B winner identified automatically by open rate
- Non-openers re-engaged without manual work
- Measurable improvement over generic blast emails
- Full send/open/click audit trail in Prisma
