---
title: Build an AI-Powered Customer Onboarding Flow
slug: build-ai-powered-customer-onboarding-flow
description: >
  Replace a 14-step signup wizard with an AI-driven conversational onboarding
  that learns user intent, pre-fills forms, and cuts time-to-value from 25
  minutes to under 4 minutes — doubling trial-to-paid conversion.
skills:
  - typescript
  - nextjs
  - vercel-ai-sdk
  - prisma
  - redis
  - zod
  - tailwindcss
category: data-ai
tags:
  - onboarding
  - conversational-ui
  - ai-agent
  - saas
  - conversion
  - ux
---

# Build an AI-Powered Customer Onboarding Flow

## The Problem

Mei is head of growth at a B2B analytics SaaS. Their onboarding flow has 14 steps: account creation, company details, team invites, data source connections, dashboard configuration, and notification preferences. Analytics show 62% of users drop off before completing setup. Average completion time is 25 minutes. The ones who do finish wait 3 days before getting value because they misconfigure dashboards. Support tickets in the first week are 80% onboarding-related. Competitors with simpler products are winning deals because "it just works."

Mei needs:
- **Conversational onboarding** — AI asks questions naturally, fills out configs behind the scenes
- **Intent detection** — understand what the user actually wants to accomplish, not just collect form fields
- **Smart defaults** — pre-configure dashboards based on the user's role, industry, and goals
- **Progressive disclosure** — only ask what's needed now, defer the rest
- **Handoff to human** — escalate to customer success when AI confidence is low
- **A/B testable** — run the new flow against the old wizard with proper metrics

## Step 1: Define the Onboarding State Machine

Model onboarding as a state machine, not a linear wizard. AI can jump between states based on what it learns.

```typescript
// src/onboarding/state-machine.ts
// Onboarding states — AI navigates between them based on conversation

import { z } from 'zod';

export const OnboardingState = z.enum([
  'greeting',          // Initial — understand who they are
  'goal_discovery',    // What are they trying to accomplish?
  'company_profile',   // Industry, size, tech stack
  'data_sources',      // Connect their data
  'dashboard_config',  // Set up their first dashboard
  'team_setup',        // Invite teammates (optional, defer if solo)
  'notifications',     // Alert preferences
  'complete',          // Ready to use
  'handoff',           // Escalate to human CS
]);

export const UserProfile = z.object({
  role: z.enum(['founder', 'engineering', 'product', 'marketing', 'data', 'other']).optional(),
  companySize: z.enum(['solo', '2-10', '11-50', '51-200', '201-1000', '1000+']).optional(),
  industry: z.string().optional(),
  primaryGoal: z.string().optional(),
  techStack: z.array(z.string()).default([]),
  experienceLevel: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});

export const OnboardingContext = z.object({
  userId: z.string().uuid(),
  state: OnboardingState,
  profile: UserProfile,
  completedSteps: z.array(OnboardingState),
  skippedSteps: z.array(OnboardingState),
  confidence: z.number().min(0).max(1).default(1),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
    timestamp: z.string().datetime(),
  })),
  configuredResources: z.object({
    dataSources: z.array(z.string()).default([]),
    dashboards: z.array(z.string()).default([]),
    teamMembers: z.array(z.string()).default([]),
  }),
  startedAt: z.string().datetime(),
});

export type OnboardingContext = z.infer<typeof OnboardingContext>;
export type OnboardingState = z.infer<typeof OnboardingState>;

// State transition rules — which states can follow which
export const transitions: Record<string, string[]> = {
  greeting: ['goal_discovery', 'company_profile'],
  goal_discovery: ['company_profile', 'data_sources', 'dashboard_config'],
  company_profile: ['data_sources', 'dashboard_config', 'goal_discovery'],
  data_sources: ['dashboard_config', 'team_setup', 'notifications'],
  dashboard_config: ['team_setup', 'notifications', 'complete'],
  team_setup: ['notifications', 'complete'],
  notifications: ['complete'],
  complete: [],
  handoff: [],
};
```

## Step 2: AI Onboarding Agent

The agent uses structured output to decide what to ask, what to configure, and when to advance.

```typescript
// src/onboarding/agent.ts
// AI agent that drives the onboarding conversation

import { generateObject } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import type { OnboardingContext } from './state-machine';
import { transitions } from './state-machine';

const AgentAction = z.object({
  response: z.string().describe('What to say to the user'),
  extractedInfo: z.object({
    role: z.string().optional(),
    companySize: z.string().optional(),
    industry: z.string().optional(),
    primaryGoal: z.string().optional(),
    techStack: z.array(z.string()).optional(),
  }).describe('Info extracted from user message'),
  nextState: z.string().optional().describe('State to transition to, if ready'),
  actionsToTake: z.array(z.object({
    type: z.enum(['create_dashboard', 'connect_source', 'invite_member', 'set_preference', 'skip_step']),
    params: z.record(z.string(), z.unknown()),
  })).describe('Background actions to perform'),
  confidence: z.number().min(0).max(1).describe('Confidence in understanding user needs'),
  shouldHandoff: z.boolean().describe('True if human CS should take over'),
});

export async function processMessage(
  ctx: OnboardingContext,
  userMessage: string
): Promise<{
  response: string;
  updatedContext: OnboardingContext;
  actions: Array<{ type: string; params: Record<string, unknown> }>;
}> {
  const systemPrompt = buildSystemPrompt(ctx);

  const { object: action } = await generateObject({
    model: openai('gpt-4o-mini'),  // fast + cheap for onboarding
    schema: AgentAction,
    system: systemPrompt,
    messages: [
      ...ctx.conversationHistory.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userMessage },
    ],
    temperature: 0.3,  // low temperature for consistent extraction
  });

  // Update context with extracted info
  const updatedProfile = { ...ctx.profile };
  if (action.extractedInfo.role) updatedProfile.role = action.extractedInfo.role as any;
  if (action.extractedInfo.companySize) updatedProfile.companySize = action.extractedInfo.companySize as any;
  if (action.extractedInfo.industry) updatedProfile.industry = action.extractedInfo.industry;
  if (action.extractedInfo.primaryGoal) updatedProfile.primaryGoal = action.extractedInfo.primaryGoal;
  if (action.extractedInfo.techStack?.length) {
    updatedProfile.techStack = [...new Set([...updatedProfile.techStack, ...action.extractedInfo.techStack])];
  }

  // Determine next state
  let nextState = ctx.state;
  if (action.shouldHandoff) {
    nextState = 'handoff';
  } else if (action.nextState && transitions[ctx.state]?.includes(action.nextState)) {
    nextState = action.nextState as any;
  }

  const updatedContext: OnboardingContext = {
    ...ctx,
    state: nextState,
    profile: updatedProfile,
    confidence: action.confidence,
    completedSteps: action.nextState && action.nextState !== ctx.state
      ? [...ctx.completedSteps, ctx.state]
      : ctx.completedSteps,
    conversationHistory: [
      ...ctx.conversationHistory,
      { role: 'user', content: userMessage, timestamp: new Date().toISOString() },
      { role: 'assistant', content: action.response, timestamp: new Date().toISOString() },
    ],
  };

  return {
    response: action.response,
    updatedContext,
    actions: action.actionsToTake,
  };
}

function buildSystemPrompt(ctx: OnboardingContext): string {
  return `You are an onboarding assistant for DataPulse, a B2B analytics platform.

Current state: ${ctx.state}
User profile so far: ${JSON.stringify(ctx.profile, null, 2)}
Completed steps: ${ctx.completedSteps.join(', ') || 'none'}
Possible next states: ${transitions[ctx.state]?.join(', ') || 'none'}

Your job:
1. Have a natural conversation — don't interrogate with a list of questions
2. Extract user info from their messages (role, company, goals, tech stack)
3. When you have enough context, pre-configure their workspace behind the scenes
4. Skip steps that aren't relevant (solo founder doesn't need team invites)
5. If the user seems confused or frustrated, set shouldHandoff=true
6. Keep responses short (2-3 sentences max) and actionable

Key behaviors:
- After learning their goal, suggest a pre-built dashboard template
- If they mention a data source (PostgreSQL, Stripe, etc.), offer to connect it
- Don't ask about notifications until dashboards are set up
- If company size is "solo" or "2-10", skip team_setup entirely`;
}
```

## Step 3: Smart Defaults Engine

Pre-configure dashboards and settings based on the user's profile instead of making them choose from scratch.

```typescript
// src/onboarding/smart-defaults.ts
// Generates pre-configured dashboards based on user profile

import type { UserProfile } from './state-machine';

interface DashboardTemplate {
  name: string;
  description: string;
  widgets: Array<{
    type: string;
    title: string;
    dataSource: string;
    metric: string;
    visualization: string;
  }>;
}

export function generateDefaultDashboards(profile: UserProfile): DashboardTemplate[] {
  const dashboards: DashboardTemplate[] = [];

  // Every user gets a KPI overview
  dashboards.push({
    name: 'KPI Overview',
    description: 'Your key metrics at a glance',
    widgets: [
      { type: 'metric', title: 'Active Users', dataSource: 'auto', metric: 'active_users', visualization: 'number' },
      { type: 'chart', title: 'Revenue Trend', dataSource: 'auto', metric: 'revenue', visualization: 'line' },
      { type: 'metric', title: 'Churn Rate', dataSource: 'auto', metric: 'churn_rate', visualization: 'gauge' },
    ],
  });

  // Role-specific dashboards
  if (profile.role === 'engineering' || profile.role === 'founder') {
    dashboards.push({
      name: 'Engineering Health',
      description: 'Deployment frequency, error rates, performance',
      widgets: [
        { type: 'chart', title: 'Deploy Frequency', dataSource: 'auto', metric: 'deploys_per_day', visualization: 'bar' },
        { type: 'chart', title: 'Error Rate', dataSource: 'auto', metric: 'error_rate_5xx', visualization: 'line' },
        { type: 'metric', title: 'P95 Latency', dataSource: 'auto', metric: 'p95_latency_ms', visualization: 'number' },
        { type: 'chart', title: 'Uptime', dataSource: 'auto', metric: 'uptime_percent', visualization: 'area' },
      ],
    });
  }

  if (profile.role === 'product' || profile.role === 'marketing') {
    dashboards.push({
      name: 'Product Analytics',
      description: 'User behavior, funnels, retention',
      widgets: [
        { type: 'chart', title: 'Signup Funnel', dataSource: 'auto', metric: 'signup_funnel', visualization: 'funnel' },
        { type: 'chart', title: 'Feature Usage', dataSource: 'auto', metric: 'feature_usage', visualization: 'heatmap' },
        { type: 'chart', title: 'Retention Cohorts', dataSource: 'auto', metric: 'retention_weekly', visualization: 'cohort' },
      ],
    });
  }

  if (profile.role === 'marketing') {
    dashboards.push({
      name: 'Marketing Performance',
      description: 'Campaign ROI, acquisition channels, CAC',
      widgets: [
        { type: 'chart', title: 'Acquisition Channels', dataSource: 'auto', metric: 'signups_by_channel', visualization: 'pie' },
        { type: 'metric', title: 'CAC', dataSource: 'auto', metric: 'customer_acquisition_cost', visualization: 'number' },
        { type: 'chart', title: 'Campaign ROI', dataSource: 'auto', metric: 'campaign_roi', visualization: 'bar' },
      ],
    });
  }

  // Industry-specific additions
  if (profile.industry?.toLowerCase().includes('ecommerce') || profile.industry?.toLowerCase().includes('retail')) {
    dashboards.push({
      name: 'E-Commerce Metrics',
      description: 'GMV, AOV, cart abandonment',
      widgets: [
        { type: 'metric', title: 'GMV', dataSource: 'auto', metric: 'gross_merchandise_value', visualization: 'number' },
        { type: 'metric', title: 'Average Order Value', dataSource: 'auto', metric: 'aov', visualization: 'number' },
        { type: 'chart', title: 'Cart Abandonment', dataSource: 'auto', metric: 'cart_abandonment_rate', visualization: 'line' },
      ],
    });
  }

  return dashboards;
}

// Suggest data sources based on tech stack mentioned in conversation
export function suggestDataSources(profile: UserProfile): string[] {
  const suggestions: string[] = [];
  const stack = profile.techStack.map(s => s.toLowerCase());

  if (stack.some(s => s.includes('postgres'))) suggestions.push('postgresql');
  if (stack.some(s => s.includes('mysql'))) suggestions.push('mysql');
  if (stack.some(s => s.includes('mongo'))) suggestions.push('mongodb');
  if (stack.some(s => s.includes('stripe'))) suggestions.push('stripe');
  if (stack.some(s => s.includes('segment'))) suggestions.push('segment');
  if (stack.some(s => s.includes('amplitude'))) suggestions.push('amplitude');
  if (stack.some(s => s.includes('mixpanel'))) suggestions.push('mixpanel');
  if (stack.some(s => s.includes('google') || s.includes('ga'))) suggestions.push('google-analytics');
  if (stack.some(s => s.includes('shopify'))) suggestions.push('shopify');
  if (stack.some(s => s.includes('hubspot'))) suggestions.push('hubspot');

  return suggestions;
}
```

## Step 4: Action Executor

Processes the AI's background actions — creating dashboards, connecting sources, etc.

```typescript
// src/onboarding/action-executor.ts
// Executes background actions decided by the AI agent

import { PrismaClient } from '@prisma/client';
import { generateDefaultDashboards, suggestDataSources } from './smart-defaults';
import type { OnboardingContext } from './state-machine';

const prisma = new PrismaClient();

interface Action {
  type: string;
  params: Record<string, unknown>;
}

export async function executeActions(
  ctx: OnboardingContext,
  actions: Action[]
): Promise<OnboardingContext> {
  let updated = { ...ctx };

  for (const action of actions) {
    switch (action.type) {
      case 'create_dashboard': {
        const templates = generateDefaultDashboards(ctx.profile);
        const template = action.params.template as string;
        const match = templates.find(t =>
          t.name.toLowerCase().includes(template?.toLowerCase() ?? '')
        ) ?? templates[0];

        if (match) {
          const dashboard = await prisma.dashboard.create({
            data: {
              userId: ctx.userId,
              name: match.name,
              description: match.description,
              config: JSON.stringify(match.widgets),
              isDefault: updated.configuredResources.dashboards.length === 0,
            },
          });
          updated.configuredResources.dashboards.push(dashboard.id);
        }
        break;
      }

      case 'connect_source': {
        const sourceType = action.params.type as string;
        // Create a pending connection — user will complete OAuth/credentials later
        const source = await prisma.dataSource.create({
          data: {
            userId: ctx.userId,
            type: sourceType,
            status: 'pending_auth',
            config: JSON.stringify(action.params),
          },
        });
        updated.configuredResources.dataSources.push(source.id);
        break;
      }

      case 'invite_member': {
        const email = action.params.email as string;
        if (email) {
          await prisma.teamInvite.create({
            data: {
              invitedBy: ctx.userId,
              email,
              role: (action.params.role as string) ?? 'viewer',
              status: 'pending',
            },
          });
          updated.configuredResources.teamMembers.push(email);
        }
        break;
      }

      case 'skip_step': {
        const step = action.params.step as string;
        if (step && !updated.skippedSteps.includes(step as any)) {
          updated.skippedSteps.push(step as any);
        }
        break;
      }

      case 'set_preference': {
        await prisma.userPreference.upsert({
          where: { userId_key: { userId: ctx.userId, key: action.params.key as string } },
          update: { value: JSON.stringify(action.params.value) },
          create: {
            userId: ctx.userId,
            key: action.params.key as string,
            value: JSON.stringify(action.params.value),
          },
        });
        break;
      }
    }
  }

  return updated;
}
```

## Step 5: Conversational UI Component

```typescript
// src/components/onboarding-chat.tsx
// Conversational onboarding interface

'use client';

import { useState, useRef, useEffect } from 'react';
import type { OnboardingContext } from '@/onboarding/state-machine';

export function OnboardingChat({ initialContext }: { initialContext: OnboardingContext }) {
  const [ctx, setCtx] = useState(initialContext);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEnd = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [ctx.conversationHistory.length]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    setLoading(true);

    const res = await fetch('/api/onboarding/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context: ctx, message: input }),
    });

    const { response, updatedContext, actions } = await res.json();
    setCtx(updatedContext);
    setInput('');
    setLoading(false);
  }

  const progress = (ctx.completedSteps.length / 6) * 100;

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto">
      {/* Progress bar — subtle, not a numbered stepper */}
      <div className="h-1 bg-gray-200">
        <div
          className="h-full bg-blue-500 transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {ctx.conversationHistory.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-md px-4 py-3 rounded-2xl ${
              msg.role === 'user'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 text-gray-900'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 px-4 py-3 rounded-2xl">
              <span className="animate-pulse">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEnd} />
      </div>

      {/* Input */}
      {ctx.state !== 'complete' && (
        <div className="p-4 border-t">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type your message..."
              className="flex-1 px-4 py-3 border rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-6 py-3 bg-blue-500 text-white rounded-full disabled:opacity-50"
            >
              Send
            </button>
          </div>
          <button
            onClick={() => sendMessage()}
            className="mt-2 text-sm text-gray-500 hover:text-gray-700"
          >
            Skip to dashboard →
          </button>
        </div>
      )}

      {/* Completion screen */}
      {ctx.state === 'complete' && (
        <div className="p-8 text-center">
          <h2 className="text-2xl font-bold mb-2">You're all set! 🎉</h2>
          <p className="text-gray-600 mb-6">
            We've configured {ctx.configuredResources.dashboards.length} dashboard(s)
            based on your goals.
          </p>
          <a
            href="/dashboard"
            className="inline-block px-8 py-3 bg-blue-500 text-white rounded-full font-medium"
          >
            Go to Dashboard
          </a>
        </div>
      )}
    </div>
  );
}
```

## Step 6: A/B Test the New Flow

```typescript
// src/lib/ab-test.ts
// Routes users to conversational vs wizard onboarding with tracking

import { Redis } from 'ioredis';

const redis = new Redis(process.env.REDIS_URL!);

export async function assignOnboardingVariant(userId: string): Promise<'conversational' | 'wizard'> {
  // Check if already assigned
  const existing = await redis.get(`ab:onboarding:${userId}`);
  if (existing) return existing as any;

  // 50/50 split
  const variant = Math.random() < 0.5 ? 'conversational' : 'wizard';
  await redis.setex(`ab:onboarding:${userId}`, 86400 * 30, variant);

  // Track assignment for analysis
  await redis.hincrby('ab:onboarding:counts', variant, 1);

  return variant;
}

export async function trackOnboardingEvent(
  userId: string,
  event: 'started' | 'completed' | 'dropped_off' | 'time_to_value',
  metadata?: Record<string, unknown>
): Promise<void> {
  const variant = await redis.get(`ab:onboarding:${userId}`);
  await redis.lpush(`ab:onboarding:events`, JSON.stringify({
    userId, variant, event, metadata, timestamp: Date.now(),
  }));
}
```

## Results

After 6 weeks of A/B testing (1,200 users per variant):

- **Onboarding completion rate**: 89% (conversational) vs 38% (wizard) — **2.3x improvement**
- **Time to complete**: 3.8 minutes (conversational) vs 25 minutes (wizard)
- **Trial-to-paid conversion**: 24% (conversational) vs 11% (wizard) — **2.2x improvement**
- **First-week support tickets**: 12 per 100 users (conversational) vs 64 per 100 (wizard)
- **Dashboard relevance**: 91% of users kept AI-configured dashboards vs 34% of self-configured
- **Handoff rate**: 4% of conversations escalated to human CS (mostly enterprise SSO questions)
- **AI cost**: $0.003 per onboarding session (GPT-4o-mini, ~8 messages average)
- **Steps completed**: average 4.2 steps (conversational, with skips) vs 14 mandatory (wizard)
