---
title: Build AI Lead Scoring for B2B SaaS
slug: build-b2b-lead-scoring-with-ai
description: Automatically enrich, score 0-100, and prioritize every signup using company data and behavioral signals — so your sales team only calls leads that are actually ready to buy.
skills:
  - anthropic-sdk
  - prisma
tags:
  - sales
  - lead-scoring
  - ai
  - b2b-saas
  - crm
---

## The Problem

Jordan runs sales at a B2B SaaS. They get 200 signups a week. The sales team has time to reach out to maybe 40. They've been calling in signup order — first come, first served. Three months ago, a funded startup signed up on a Thursday afternoon. Nobody called them until Monday. They'd already signed with the competitor who reached out the same day.

Jordan needs a way to know within minutes of a signup which leads are worth prioritizing — not based on gut feel, but on real signals: company size, tech stack, what they did in the product, and how well they match the ICP.

## The Solution

Use anthropic-sdk to analyze enriched company profiles and score ICP fit with reasoning. Use prisma to store leads, scores, behavioral events, and CRM sync state. Trigger scoring on signup and update scores as behavioral signals come in.

## Step-by-Step Walkthrough

### Step 1: Define Your ICP and Schema

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Lead {
  id              String    @id @default(cuid())
  email           String    @unique
  name            String?
  company         String?
  
  // Enriched data (from Clearbit/Apollo)
  companySize     Int?      // employee count
  companyRevenue  String?   // annual revenue range
  industry        String?
  techStack       String[]  // tools they use
  jobTitle        String?
  linkedinUrl     String?
  companyDomain   String?
  fundingStage    String?   // seed, series-a, etc.
  
  // Behavioral signals
  pagesViewed     Int       @default(0)
  docsDownloaded  Int       @default(0)
  trialActive     Boolean   @default(false)
  featuresUsed    String[]
  sessionCount    Int       @default(0)
  lastActiveAt    DateTime?
  
  // Scoring
  score           Float     @default(0)    // 0-100
  scoreReason     String?                  // AI reasoning
  icpFit          String?                  // "strong" | "moderate" | "weak"
  scoredAt        DateTime?
  
  // Pipeline
  status          String    @default("new")   // new | contacted | qualified | closed_won | closed_lost
  crmId           String?                     // HubSpot/Salesforce ID
  assignedTo      String?
  
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  events          LeadEvent[]
  
  @@index([score])
  @@index([status, score])
}

model LeadEvent {
  id          String   @id @default(cuid())
  leadId      String
  lead        Lead     @relation(fields: [leadId], references: [id])
  event       String   // 'page_view', 'doc_download', 'feature_used', 'trial_started'
  metadata    Json?
  createdAt   DateTime @default(now())
  
  @@index([leadId, createdAt])
}
```

### Step 2: Enrich Lead Data

```typescript
// enricher/company.ts

export interface EnrichedProfile {
  companySize?: number;
  companyRevenue?: string;
  industry?: string;
  techStack: string[];
  fundingStage?: string;
  jobTitle?: string;
  companyDomain?: string;
}

/**
 * Enrich with Clearbit (premium) or Apollo (has free tier).
 * Falls back gracefully if enrichment fails.
 */
export async function enrichLead(email: string): Promise<EnrichedProfile> {
  const domain = email.split('@')[1];
  
  // Try Clearbit first (highest quality data)
  if (process.env.CLEARBIT_API_KEY) {
    return enrichWithClearbit(email);
  }
  
  // Fall back to Apollo
  if (process.env.APOLLO_API_KEY) {
    return enrichWithApollo(email, domain);
  }

  // Minimal enrichment from domain alone
  return { techStack: [], companyDomain: domain };
}

async function enrichWithClearbit(email: string): Promise<EnrichedProfile> {
  const response = await fetch(
    `https://person-stream.clearbit.com/v2/combined/find?email=${email}`,
    { headers: { Authorization: `Bearer ${process.env.CLEARBIT_API_KEY}` } }
  );

  if (!response.ok) return { techStack: [] };
  const data = await response.json() as Record<string, any>;

  return {
    companySize: data.company?.metrics?.employees,
    companyRevenue: data.company?.metrics?.estimatedAnnualRevenue,
    industry: data.company?.category?.industry,
    techStack: data.company?.tech || [],
    fundingStage: data.company?.metrics?.raised ? 'funded' : undefined,
    jobTitle: data.person?.employment?.title,
    companyDomain: data.company?.domain,
  };
}

async function enrichWithApollo(email: string, domain: string): Promise<EnrichedProfile> {
  const response = await fetch('https://api.apollo.io/v1/people/match', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({ email, reveal_personal_emails: false }),
  });

  if (!response.ok) return { techStack: [], companyDomain: domain };
  const data = await response.json() as Record<string, any>;
  const person = data.person;

  return {
    companySize: person?.organization?.num_employees,
    industry: person?.organization?.industry,
    techStack: person?.organization?.technologies?.map((t: Record<string, any>) => t.name) || [],
    fundingStage: person?.organization?.funding_stage,
    jobTitle: person?.title,
    companyDomain: person?.organization?.primary_domain || domain,
  };
}
```

### Step 3: Score ICP Fit with Claude

```typescript
// scorer/icp.ts
import Anthropic from '@anthropic-ai/sdk';
import type { Lead } from '@prisma/client';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Define your ICP — customize this for your product
const ICP_DEFINITION = `
Ideal Customer Profile for [Your Product]:
- Company size: 10-500 employees (sweet spot: 50-200)
- Industries: SaaS, tech-enabled businesses, agencies
- Tech stack signals: GitHub, Jira, Slack, AWS/GCP/Azure (signals technical team)
- Job titles: Engineering Manager, CTO, VP Engineering, Product Manager
- Buying signals: funded startup, recent growth, technical decision maker
- Disqualify: solo founders with <5 employees, enterprise >5000 employees (wrong sales motion), non-technical companies
`;

export interface ScoringResult {
  score: number;         // 0-100
  icpFit: 'strong' | 'moderate' | 'weak';
  reasoning: string;
  strengths: string[];
  weaknesses: string[];
  urgency: 'low' | 'medium' | 'high';
  recommendedAction: string;
}

export async function scoreLead(lead: Lead): Promise<ScoringResult> {
  const profile = `
Name: ${lead.name || 'Unknown'}
Company: ${lead.company || 'Unknown'}
Email: ${lead.email}
Job Title: ${lead.jobTitle || 'Unknown'}
Company Size: ${lead.companySize || 'Unknown'} employees
Industry: ${lead.industry || 'Unknown'}
Funding: ${lead.fundingStage || 'Unknown'}
Tech Stack: ${lead.techStack.join(', ') || 'Unknown'}
Pages Viewed: ${lead.pagesViewed}
Docs Downloaded: ${lead.docsDownloaded}
Trial Active: ${lead.trialActive}
Features Used: ${lead.featuresUsed.join(', ') || 'None'}
Session Count: ${lead.sessionCount}
Last Active: ${lead.lastActiveAt?.toISOString() || 'Never'}
`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 800,
    messages: [
      {
        role: 'user',
        content: `Score this lead for sales prioritization.

${ICP_DEFINITION}

LEAD PROFILE:
${profile}

Score from 0-100 based on:
- ICP fit (company size, industry, tech stack, title): 40 points
- Behavioral engagement (pages, docs, sessions, features): 35 points  
- Buying intent signals (trial active, role is decision maker, company funded): 25 points

Return JSON:
{
  score: 0-100,
  icpFit: "strong" | "moderate" | "weak",
  reasoning: string,           // 2-3 sentences explaining the score
  strengths: string[],         // 2-4 positive signals
  weaknesses: string[],        // 1-3 negative signals or unknowns
  urgency: "low" | "medium" | "high",
  recommendedAction: string    // what sales should do: "Call today", "Email follow-up", "Nurture sequence"
}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== 'text') throw new Error('Unexpected response');
  return JSON.parse(content.text.replace(/```json\n?|\n?```/g, '').trim());
}
```

### Step 4: Sync Scores to HubSpot/Salesforce

```typescript
// crm/hubspot.ts

export async function pushScoreToHubSpot(
  email: string,
  score: number,
  icpFit: string,
  reasoning: string,
  crmId?: string
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`,
    'Content-Type': 'application/json',
  };

  const properties = {
    ai_lead_score: score.toString(),
    ai_icp_fit: icpFit,
    ai_score_reasoning: reasoning,
    ai_scored_at: new Date().toISOString(),
  };

  if (crmId) {
    // Update existing contact
    await fetch(`https://api.hubapi.com/crm/v3/objects/contacts/${crmId}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties }),
    });
    return crmId;
  }

  // Create or update by email
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/upsert', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      idProperty: 'email',
      inputs: [{ id: email, properties }],
    }),
  });

  const data = await response.json() as { results?: Array<{ id: string }> };
  return data.results?.[0]?.id || '';
}
```

### Step 5: Orchestrate Scoring on Signup Events

```typescript
// index.ts — Triggered on each new signup
import { PrismaClient } from '@prisma/client';
import { enrichLead } from './enricher/company';
import { scoreLead } from './scorer/icp';
import { pushScoreToHubSpot } from './crm/hubspot';

const prisma = new PrismaClient();

export async function scoreNewLead(email: string, name?: string, company?: string) {
  // 1. Create lead record
  let lead = await prisma.lead.upsert({
    where: { email },
    create: { email, name, company },
    update: { name, company },
  });

  // 2. Enrich company data
  console.log(`Enriching ${email}...`);
  const enriched = await enrichLead(email);
  lead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      companySize: enriched.companySize,
      industry: enriched.industry,
      techStack: enriched.techStack,
      fundingStage: enriched.fundingStage,
      jobTitle: enriched.jobTitle,
      companyDomain: enriched.companyDomain,
    },
  });

  // 3. Score with AI
  console.log(`Scoring ${email}...`);
  const scoreResult = await scoreLead(lead);
  
  // 4. Save score
  lead = await prisma.lead.update({
    where: { id: lead.id },
    data: {
      score: scoreResult.score,
      icpFit: scoreResult.icpFit,
      scoreReason: scoreResult.reasoning,
      scoredAt: new Date(),
      status: scoreResult.score >= 70 ? 'hot' : scoreResult.score >= 40 ? 'warm' : 'cold',
    },
  });

  // 5. Sync to CRM
  const crmId = await pushScoreToHubSpot(
    email,
    scoreResult.score,
    scoreResult.icpFit,
    scoreResult.reasoning,
    lead.crmId || undefined
  );

  if (crmId && !lead.crmId) {
    await prisma.lead.update({ where: { id: lead.id }, data: { crmId } });
  }

  console.log(`Scored: ${email} → ${scoreResult.score}/100 (${scoreResult.icpFit}) — ${scoreResult.recommendedAction}`);

  // 6. Alert sales for hot leads
  if (scoreResult.score >= 70) {
    console.log(`🔥 HOT LEAD: ${email} — ${scoreResult.recommendedAction}`);
    // Trigger Slack notification or email alert here
  }

  return { lead, score: scoreResult };
}

// Also expose a batch re-scorer for existing leads
export async function rescoreAllLeads() {
  const leads = await prisma.lead.findMany({
    where: { status: { in: ['new', 'warm', 'cold'] } },
    orderBy: { createdAt: 'desc' },
  });

  for (const lead of leads) {
    await scoreLead(lead);
    await new Promise(r => setTimeout(r, 500));  // rate limit
  }
}
```

## What You've Built

A lead scoring system that runs within minutes of every signup: enriches company profiles, scores 0-100 using Claude's ICP analysis with reasoning, syncs to HubSpot/Salesforce, and alerts sales when a hot lead arrives.

**Next steps:** Add webhook from your product database for behavioral event updates (feature used, trial started). Build a daily leaderboard email to sales showing top-scored uncontacted leads. Add A/B testing to compare scored vs. unscored outreach conversion rates.
