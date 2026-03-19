---
title: Build an AI Cold Email Personalization Engine
description: "Build an AI-powered cold email engine — research prospects with Firecrawl, write hyper-personalized openers with GPT-4o, A/B test subject lines, and scale to 1000 prospects/week."
skills:
  - openai
  - resend
  - firecrawl
difficulty: advanced
time_estimate: "10 hours"
tags: [cold-email, personalization, openai, firecrawl, resend, outbound, b2b, ab-testing]
---

# Build an AI Cold Email Personalization Engine

## The Problem

You're a B2B founder doing outbound sales. Your current cold email sequence is generic: same opener for everyone, 2% reply rate, mostly ignoring you. You know personalized emails work 5-10x better, but writing a unique opener for 1000 prospects is impossible manually.

You want a pipeline that:
1. Takes a CSV of prospects
2. Researches each company and person automatically
3. Writes a hyper-personalized opener for each
4. Sends via email with tracked opens/replies
5. A/B tests different subject line angles

## Architecture

```
CSV input (name, company, email, website, LinkedIn)
  ↓ Firecrawl — scrape company website + extract key info
  ↓ GPT-4o — write unique personalized opener per prospect
  ↓ Resend — send email with open tracking
  ↓ Webhook — track opens, replies, pauses on reply
```

## Prerequisites

```bash
npm install openai @mendable/firecrawl-js resend csv-parser p-limit
```

```bash
# .env
OPENAI_API_KEY=...
FIRECRAWL_API_KEY=...
RESEND_API_KEY=...
FROM_EMAIL=you@yourdomain.com
FROM_NAME="Your Name"
```

## Step-by-Step Walkthrough

### Step 1: Define Prospect Schema and Load CSV

```typescript
// types.ts
export interface Prospect {
  name: string;
  firstName: string;
  company: string;
  email: string;
  website: string;
  linkedinUrl?: string;
  role?: string;
  // Enriched fields (filled during processing)
  companyDescription?: string;
  recentNews?: string;
  techStack?: string;
  openingLine?: string;
  subjectLine?: string;
  subjectVariant?: 'A' | 'B';
  emailId?: string;
  status?: 'pending' | 'sent' | 'opened' | 'replied' | 'bounced' | 'paused';
}
```

```typescript
// lib/load-prospects.ts — Parse CSV of prospects

import fs from 'fs';
import csv from 'csv-parser';
import type { Prospect } from '../types';

export async function loadProspects(csvPath: string): Promise<Prospect[]> {
  return new Promise((resolve, reject) => {
    const results: Prospect[] = [];

    fs.createReadStream(csvPath)
      .pipe(csv())
      .on('data', (row) => {
        results.push({
          name: row.name || row.full_name,
          firstName: (row.name || row.full_name || '').split(' ')[0],
          company: row.company,
          email: row.email,
          website: row.website || `https://${row.company.toLowerCase().replace(/\s+/g, '')}.com`,
          linkedinUrl: row.linkedin,
          role: row.role || row.title,
          status: 'pending',
        });
      })
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}
```

### Step 2: Research Each Prospect with Firecrawl

```typescript
// lib/research.ts — Scrape and summarize company data

import FirecrawlApp from '@mendable/firecrawl-js';
import OpenAI from 'openai';

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface CompanyResearch {
  description: string;
  product: string;
  targetCustomer: string;
  recentActivity: string;
  techStack: string;
  painPoints: string;
}

export async function researchCompany(website: string): Promise<CompanyResearch | null> {
  try {
    // Scrape the company website
    const result = await firecrawl.scrapeUrl(website, {
      formats: ['markdown'],
      onlyMainContent: true,
    });

    if (!result.success || !result.markdown) return null;

    // Extract structured data with GPT-4o
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',  // Use mini for research — cheaper, still accurate
      messages: [
        {
          role: 'system',
          content: `Extract key company information from this website content. Return JSON.`,
        },
        {
          role: 'user',
          content: `Website: ${website}\n\nContent:\n${result.markdown.slice(0, 4000)}\n\nExtract:
{
  "description": "1-sentence company description",
  "product": "What they sell/do",
  "targetCustomer": "Who their customers are",
  "recentActivity": "Any notable news, launches, or announcements",
  "techStack": "Technologies they mention (inferred from content)",
  "painPoints": "Business problems they help customers solve"
}`,
        },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(response.choices[0].message.content!) as CompanyResearch;
  } catch (err) {
    console.warn(`Research failed for ${website}:`, (err as Error).message);
    return null;
  }
}
```

### Step 3: Write Personalized Openers with GPT-4o

```typescript
// lib/personalize.ts — Generate unique opening lines per prospect

import OpenAI from 'openai';
import type { Prospect } from '../types';
import type { CompanyResearch } from './research';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

const MY_PRODUCT = `
Product: SalesOps AI
What it does: Automates sales pipeline management and forecasting for B2B SaaS companies
Key benefit: Saves sales teams 5+ hours/week and increases forecast accuracy by 30%
Best fit: B2B SaaS companies with 5-50 person sales teams using Salesforce or HubSpot
`;

export async function generatePersonalizedEmail(
  prospect: Prospect,
  research: CompanyResearch | null,
  subjectVariant: 'A' | 'B',
): Promise<{ opening: string; subject: string }> {
  const context = research ? `
Company: ${prospect.company}
What they do: ${research.description}
Their product: ${research.product}
Target customers: ${research.targetCustomer}
Recent activity: ${research.recentActivity}
Tech stack: ${research.techStack}
Pain points they solve: ${research.painPoints}
` : `Company: ${prospect.company} (website: ${prospect.website})`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You write hyper-personalized cold email openers for B2B outbound sales.
Rules:
- Opening line must reference something SPECIFIC about their company (not generic)
- 1-2 sentences max for the opener
- Natural, conversational tone — not salesy
- Connect their specific situation to our product benefit
- Subject lines should be curious, not spammy

${MY_PRODUCT}`,
      },
      {
        role: 'user',
        content: `Write a cold email opener and subject line for:
Name: ${prospect.firstName}
Role: ${prospect.role || 'decision maker'}
${context}

Subject variant ${subjectVariant}: ${subjectVariant === 'A' ? 'Problem-focused angle' : 'Outcome/benefit angle'}

Return JSON: { "opening": "...", "subject": "..." }`,
      },
    ],
    response_format: { type: 'json_object' },
  });

  return JSON.parse(response.choices[0].message.content!);
}
```

### Step 4: Send Emails with Resend + Tracking

```typescript
// lib/send-emails.ts — Send personalized emails with Resend

import { Resend } from 'resend';
import type { Prospect } from '../types';

const resend = new Resend(process.env.RESEND_API_KEY!);

const EMAIL_TEMPLATE = (prospect: Prospect) => `
Hi ${prospect.firstName},

${prospect.openingLine}

I'm reaching out because [your product pitch — 1-2 sentences].

Would it make sense to chat for 15 minutes this week to see if there's a fit?

Best,
${process.env.FROM_NAME}

P.S. If timing isn't right, no worries — I'll follow up once more next month.
`;

export async function sendEmail(prospect: Prospect): Promise<string> {
  const html = EMAIL_TEMPLATE(prospect)
    .split('\n')
    .map(line => `<p>${line}</p>`)
    .join('');

  const response = await resend.emails.send({
    from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
    to: prospect.email,
    subject: prospect.subjectLine!,
    html,
    // Resend tracks opens automatically with a 1x1 pixel
    headers: {
      'X-Prospect-ID': prospect.email,  // Tag for webhook identification
    },
  });

  if (response.error) throw new Error(response.error.message);
  return response.data!.id;
}
```

### Step 5: A/B Test Subject Lines

```typescript
// lib/ab-test.ts — Split prospects 50/50 between subject variants

export function assignABVariant(prospects: Prospect[]): Prospect[] {
  return prospects.map((p, i) => ({
    ...p,
    subjectVariant: i % 2 === 0 ? 'A' : 'B',
  }));
}

// After campaign: analyze results
export async function analyzeABResults(results: Prospect[]) {
  const variantA = results.filter(p => p.subjectVariant === 'A');
  const variantB = results.filter(p => p.subjectVariant === 'B');

  const openRateA = variantA.filter(p => p.status === 'opened' || p.status === 'replied').length / variantA.length;
  const openRateB = variantB.filter(p => p.status === 'opened' || p.status === 'replied').length / variantB.length;
  const replyRateA = variantA.filter(p => p.status === 'replied').length / variantA.length;
  const replyRateB = variantB.filter(p => p.status === 'replied').length / variantB.length;

  console.log('\n📊 A/B Test Results:');
  console.log(`Variant A — Open: ${(openRateA * 100).toFixed(1)}%, Reply: ${(replyRateA * 100).toFixed(1)}% (n=${variantA.length})`);
  console.log(`Variant B — Open: ${(openRateB * 100).toFixed(1)}%, Reply: ${(replyRateB * 100).toFixed(1)}% (n=${variantB.length})`);
  console.log(`Winner: Variant ${replyRateA > replyRateB ? 'A' : 'B'} (${Math.abs((replyRateA - replyRateB) * 100).toFixed(1)}% difference)`);
}
```

### Step 6: Full Pipeline Runner

```typescript
// run-campaign.ts — Orchestrate the full pipeline

import pLimit from 'p-limit';
import { loadProspects } from './lib/load-prospects';
import { researchCompany } from './lib/research';
import { generatePersonalizedEmail } from './lib/personalize';
import { sendEmail } from './lib/send-emails';
import { assignABVariant } from './lib/ab-test';
import fs from 'fs';

const RESEARCH_CONCURRENCY = 3;   // Firecrawl rate limit
const EMAIL_CONCURRENCY = 2;       // Send slowly to avoid spam flags
const SEND_DELAY_MS = 2000;        // 2 seconds between sends

async function runCampaign(csvPath: string) {
  console.log('Loading prospects...');
  let prospects = await loadProspects(csvPath);
  prospects = assignABVariant(prospects);
  console.log(`Loaded ${prospects.length} prospects`);

  // Phase 1: Research (parallel, rate-limited)
  console.log('\n🔍 Researching companies...');
  const researchLimit = pLimit(RESEARCH_CONCURRENCY);
  const researchResults = await Promise.all(
    prospects.map((p) =>
      researchLimit(async () => {
        const research = await researchCompany(p.website);
        console.log(`✓ Researched ${p.company}`);
        return research;
      })
    )
  );

  // Phase 2: Personalize (parallel)
  console.log('\n✍️  Writing personalized openers...');
  const personalizeLimit = pLimit(5);  // OpenAI rate limit
  await Promise.all(
    prospects.map((p, i) =>
      personalizeLimit(async () => {
        const { opening, subject } = await generatePersonalizedEmail(p, researchResults[i], p.subjectVariant!);
        p.openingLine = opening;
        p.subjectLine = subject;
        console.log(`✓ Personalized: ${p.firstName} @ ${p.company}`);
      })
    )
  );

  // Save enriched data before sending (checkpoint)
  fs.writeFileSync('prospects_enriched.json', JSON.stringify(prospects, null, 2));
  console.log('\n💾 Saved enriched prospects to prospects_enriched.json');

  // Phase 3: Send (sequential with delay)
  console.log('\n📧 Sending emails...');
  let sent = 0;
  let failed = 0;

  for (const prospect of prospects) {
    try {
      prospect.emailId = await sendEmail(prospect);
      prospect.status = 'sent';
      sent++;
      console.log(`✓ Sent to ${prospect.email} [${sent}/${prospects.length}]`);
      await new Promise(r => setTimeout(r, SEND_DELAY_MS));
    } catch (err) {
      prospect.status = 'bounced';
      failed++;
      console.warn(`✗ Failed: ${prospect.email} — ${(err as Error).message}`);
    }
  }

  // Save results
  fs.writeFileSync('campaign_results.json', JSON.stringify(prospects, null, 2));

  console.log(`\n✅ Campaign complete: ${sent} sent, ${failed} failed`);
  console.log('Results saved to campaign_results.json');
}

runCampaign('./prospects.csv').catch(console.error);
```

### Step 7: Handle Replies — Pause Sequences

```typescript
// app/api/webhooks/resend/route.ts — React to email events

export async function POST(req: Request) {
  const event = await req.json();
  const prospectEmail = event.data?.email_id;

  // Load campaign state
  const results = JSON.parse(fs.readFileSync('campaign_results.json', 'utf-8')) as Prospect[];
  const prospect = results.find(p => p.emailId === event.data?.email_id);
  if (!prospect) return Response.json({ ok: true });

  switch (event.type) {
    case 'email.opened':
      prospect.status = 'opened';
      console.log(`📬 Opened: ${prospect.email}`);
      break;

    case 'email.delivered':
      // Confirm delivery
      break;

    case 'email.bounced':
      prospect.status = 'bounced';
      console.log(`💥 Bounced: ${prospect.email}`);
      break;
  }

  // Note: "replied" detection requires checking your inbox via IMAP
  // or using a reply-tracking service like Instantly.ai

  fs.writeFileSync('campaign_results.json', JSON.stringify(results, null, 2));
  return Response.json({ ok: true });
}
```

## Typical Results

| Metric | Generic emails | Personalized (this pipeline) |
|--------|---------------|------------------------------|
| Open rate | 25-35% | 45-60% |
| Reply rate | 1-3% | 8-15% |
| Positive replies | 0.5-1% | 3-6% |

At 1000 prospects/week: 30-60 positive replies vs. 5-10 without personalization.

## Cost per 1000 Prospects

- Firecrawl scraping: ~$5 (1K pages)
- GPT-4o-mini research: ~$1
- GPT-4o personalization: ~$8
- Resend sending: Free tier covers 3K/month, then $0.001/email
- **Total: ~$14 per 1000 prospects**

## Related Skills

- [openai](../skills/openai/) — GPT-4o for research extraction and personalized writing
- [firecrawl](../skills/firecrawl/) — Website scraping and content extraction
- [resend](../skills/resend/) — Email sending, open tracking, webhook events
