---
title: Build an AI Outbound Sales Pipeline That Books Meetings on Autopilot
slug: build-ai-outbound-sales-pipeline
description: Build an automated outbound sales system using Clay for lead enrichment, Resend for personalized cold email sequences, and OpenAI for generating hyper-personalized messages — turning a solo founder's manual prospecting into an AI pipeline that sends 500 personalized emails per week and books 12 qualified meetings per month.
skills: [clay, resend, openai-realtime, n8n-workflow-sdk]
category: business
tags: [outbound-sales, lead-generation, cold-email, personalization, automation, b2b]
---

# Build an AI Outbound Sales Pipeline That Books Meetings on Autopilot

Mila is a solo founder selling a developer tool for API monitoring. She knows her ICP: engineering managers at B2B SaaS companies with 20-100 employees who have at least 5 public API endpoints. She spends 15 hours per week on manual prospecting — finding companies on LinkedIn, researching their tech stack, writing personalized cold emails, and following up. She books 3 meetings per month. She needs 15 to hit her growth target.

The bottleneck isn't the product — it's that Mila can only research and email 50 people per week manually. She builds an AI pipeline that finds leads, enriches them with real data, generates hyper-personalized emails, and sends multi-step sequences automatically.

## Step 1: Lead Discovery and Enrichment with Clay

Clay is a data enrichment platform that pulls from 75+ data sources to build rich profiles of prospects. Mila sets up a Clay table that automatically finds companies matching her ICP and enriches them with tech stack, funding, headcount, and key contacts.

```typescript
// src/pipeline/enrich-leads.ts — Fetch enriched leads from Clay via API
interface EnrichedLead {
  company: string;
  domain: string;
  employeeCount: number;
  funding: string;                    // "Series A, $12M"
  techStack: string[];                // ["Node.js", "AWS", "PostgreSQL"]
  apiEndpoints: number;               // Count of public API endpoints
  recentNews: string | null;          // Latest press release or blog post
  contact: {
    name: string;
    title: string;
    email: string;
    linkedin: string;
    recentActivity: string | null;    // Latest LinkedIn post or talk
  };
}

async function getEnrichedLeads(): Promise<EnrichedLead[]> {
  // Clay enriches leads automatically via configured table
  // This fetches the latest batch of qualified leads
  const response = await fetch("https://api.clay.com/v1/tables/{tableId}/rows", {
    headers: { "Authorization": `Bearer ${process.env.CLAY_API_KEY}` },
  });

  const rows = await response.json();

  // Filter to ICP: 20-100 employees, 5+ API endpoints, B2B SaaS
  return rows.data
    .filter((row: any) => (
      row.employeeCount >= 20 &&
      row.employeeCount <= 100 &&
      row.apiEndpoints >= 5 &&
      row.contact?.email
    ))
    .map((row: any): EnrichedLead => ({
      company: row.company,
      domain: row.domain,
      employeeCount: row.employeeCount,
      funding: row.funding,
      techStack: row.techStack || [],
      apiEndpoints: row.apiEndpoints,
      recentNews: row.recentNews,
      contact: {
        name: row.contactName,
        title: row.contactTitle,
        email: row.contactEmail,
        linkedin: row.contactLinkedin,
        recentActivity: row.recentLinkedInPost,
      },
    }));
}
```

## Step 2: AI-Generated Personalized Emails

Generic cold emails get 1-2% reply rates. Hyper-personalized emails that reference specific details about the prospect's company get 8-15%. The AI uses enrichment data to write emails that feel hand-crafted.

```typescript
// src/pipeline/generate-email.ts — AI email generation
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";

const emailSchema = z.object({
  subject: z.string().describe("Email subject line, max 50 chars, no spam words"),
  body: z.string().describe("Email body, 80-120 words, casual professional tone"),
  personalizationHook: z.string().describe("The specific detail that makes this feel personal"),
});

async function generateColdEmail(
  lead: EnrichedLead,
  sequence: "initial" | "followup1" | "followup2" | "breakup"
): Promise<z.infer<typeof emailSchema>> {
  const sequencePrompts: Record<string, string> = {
    initial: `Write the first cold email. Lead with a specific observation about their company.
Don't pitch the product in the first sentence. Start with their pain, then bridge to the solution.`,

    followup1: `Write a follow-up 3 days after the initial email. Reference the first email briefly.
Add a new angle — maybe a case study or a specific metric. Keep it shorter than the first email.`,

    followup2: `Write a second follow-up 5 days later. This one should provide standalone value —
share a relevant insight about API monitoring that applies to their specific tech stack.`,

    breakup: `Write a final "breakup" email 7 days later. Short and casual.
Something like "Looks like timing isn't right — I'll stop reaching out. If API monitoring
becomes a priority, I'm here." Often gets the highest reply rate due to loss aversion.`,
  };

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: emailSchema,
    prompt: `Generate a cold email for an API monitoring tool.

PROSPECT DATA:
- Name: ${lead.contact.name} (${lead.contact.title})
- Company: ${lead.company} (${lead.employeeCount} employees, ${lead.funding})
- Tech stack: ${lead.techStack.join(", ")}
- Public API endpoints: ${lead.apiEndpoints}
- Recent news: ${lead.recentNews || "None found"}
- Recent LinkedIn activity: ${lead.contact.recentActivity || "None found"}

SEQUENCE STEP: ${sequence}
${sequencePrompts[sequence]}

RULES:
- Sender name: Mila (founder, not a sales rep)
- No "I hope this finds you well" or any filler
- No "I noticed you..." — weave the personalization naturally
- Max 120 words for body
- Subject line: lowercase, no exclamation marks, feels like a friend's email
- Include one specific number or metric that's relevant to their situation
- End with a soft CTA: question or suggestion, not "Book a call"`,
  });

  return object;
}
```

## Step 3: Email Delivery with Resend

Mila uses Resend for delivery because it handles DKIM/SPF/DMARC properly, has high deliverability, and the API is simple. Each email is sent from her personal domain with proper warm-up.

```typescript
// src/pipeline/send-sequence.ts — Send email sequences via Resend
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

interface SequenceConfig {
  steps: Array<{
    type: "initial" | "followup1" | "followup2" | "breakup";
    delayDays: number;          // Days after previous step
  }>;
}

const defaultSequence: SequenceConfig = {
  steps: [
    { type: "initial", delayDays: 0 },
    { type: "followup1", delayDays: 3 },
    { type: "followup2", delayDays: 5 },
    { type: "breakup", delayDays: 7 },
  ],
};

async function sendEmail(
  lead: EnrichedLead,
  email: { subject: string; body: string },
  stepIndex: number,
): Promise<string> {
  // Rate limit: max 50 emails per hour to protect sender reputation
  await rateLimiter.acquire();

  const { data, error } = await resend.emails.send({
    from: "Mila <mila@apipulse.dev>",
    to: [lead.contact.email],
    subject: email.subject,
    text: email.body,                    // Plain text — higher deliverability than HTML
    replyTo: "mila@apipulse.dev",
    headers: {
      "X-Entity-Ref-ID": `${lead.domain}-step${stepIndex}`,  // Unique per sequence
    },
    tags: [
      { name: "campaign", value: "outbound-q1-2026" },
      { name: "sequence_step", value: String(stepIndex) },
      { name: "company", value: lead.company },
    ],
  });

  if (error) throw new Error(`Send failed: ${error.message}`);

  // Track in database
  await db.insert(emailsSent).values({
    leadId: lead.domain,
    messageId: data!.id,
    sequenceStep: stepIndex,
    subject: email.subject,
    sentAt: new Date(),
    status: "sent",
  });

  return data!.id;
}

// Process replies — webhook from Resend
async function handleReply(webhookData: any) {
  const leadDomain = webhookData.tags?.find(t => t.name === "company")?.value;
  if (!leadDomain) return;

  // Pause the sequence immediately when prospect replies
  await db.update(sequences)
    .set({ status: "replied", pausedAt: new Date() })
    .where(eq(sequences.leadDomain, leadDomain));

  // Notify Mila in Slack
  await slack.chat.postMessage({
    channel: "#sales-replies",
    text: `💬 Reply from ${leadDomain}!\n\n${webhookData.text?.substring(0, 200)}`,
  });
}
```

## Step 4: Orchestration with n8n

The entire pipeline runs as an n8n workflow: Clay discovers leads → AI generates emails → Resend delivers them → replies trigger Slack notifications → positive replies auto-create CRM deals.

```javascript
// n8n workflow: Outbound Sales Pipeline
// Trigger: Every Monday at 9 AM

// Node 1: Fetch enriched leads from Clay
const leads = await getEnrichedLeads();  // 100-150 new leads per week

// Node 2: Filter already-contacted leads
const newLeads = leads.filter(l =>
  !existingSequences.includes(l.domain)
);

// Node 3: Generate personalized emails for each lead
for (const lead of newLeads) {
  const email = await generateColdEmail(lead, "initial");

  // Node 4: Quality check — reject if personalization is generic
  if (email.personalizationHook.includes("your company") ||
      email.personalizationHook.includes("your team")) {
    console.log(`Skipping ${lead.company} — generic personalization`);
    continue;
  }

  // Node 5: Send via Resend
  await sendEmail(lead, email, 0);

  // Node 6: Schedule follow-ups
  await scheduleFollowups(lead, defaultSequence);
}
```

## Results After 90 Days

Mila's pipeline sends 500 personalized emails per week across 100 new prospects. The AI-generated emails feel hand-written because they reference specific tech stacks, recent blog posts, and LinkedIn activity.

- **Volume**: 50 emails/week (manual) → 500 emails/week (AI pipeline)
- **Reply rate**: 3.2% (manual generic) → 11.8% (AI personalized)
- **Meetings booked**: 3/month → 14/month
- **Time spent**: 15 hours/week → 2 hours/week (reviewing replies + taking meetings)
- **Cost per meeting**: $520 (manual labor) → $38 (Clay $149/mo + Resend $20/mo + OpenAI ~$30/mo)
- **Pipeline value**: $42K/month in qualified pipeline (up from $9K)
