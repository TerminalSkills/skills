---
title: "Build an AI-Powered Landing Page Optimizer"
description: "A/B test headlines and CTAs with statistical significance, use Claude to generate copy variants from your best performers, track heatmaps, and auto-pause losing variants."
skills: [anthropic-sdk, posthog]
difficulty: advanced
time_estimate: "10 hours"
tags: [a-b-testing, landing-page, conversion-optimization, posthog, ai, growth, analytics, cro]
---

# Build an AI-Powered Landing Page Optimizer

Your landing page converts at 3%. The industry average is 5%. Elite pages hit 10%+. The difference isn't design — it's relentless testing with rapid iteration. AI lets you generate 20 variants where a human would write 2.

## Persona

**Alex** is a growth hacker at a B2B SaaS. Trial signups are at 3.2%. Her goal: 8% by Q2. She has PostHog for analytics, an Anthropic API key, and enough traffic for statistical significance in 2 weeks per test.

---

## Architecture

```
Landing page (Next.js)
  ↓ Variant assignment (PostHog feature flags)
  ↓ User sees: headline A or B or C
  ↓ Events: pageview, cta_click, signup_start, trial_start
  ↓ PostHog experiment → statistical significance
  ↓ Winner detected → Claude generates new variants
  ↓ Auto-pause losers → auto-promote winner
```

---

## Step 1: PostHog Experiment Setup

```typescript
// lib/experiments.ts
import PostHog from 'posthog-node';

const posthog = new PostHog(process.env.POSTHOG_API_KEY!, {
  host: 'https://app.posthog.com',
});

// Assign variant server-side for SSR (no flicker)
export async function getVariant(
  userId: string,
  experimentKey: string,
  fallback: string
): Promise<string> {
  const flags = await posthog.getFeatureFlag(experimentKey, userId);
  return (flags as string) ?? fallback;
}

// Track conversion events
export function trackEvent(
  userId: string,
  event: string,
  properties?: Record<string, unknown>
) {
  posthog.capture({ distinctId: userId, event, properties });
}
```

```tsx
// app/page.tsx — server component with experiment
import { cookies } from 'next/headers';
import { getVariant } from '../lib/experiments';
import { LandingPage } from '../components/LandingPage';

const EXPERIMENTS = {
  headline: {
    control: "The project management tool that doesn't slow you down",
    variant_b: "Ship 2x faster. Zero meetings required.",
    variant_c: "Your team's second brain — organized, fast, always on.",
  },
  cta: {
    control: "Start free trial",
    variant_b: "Get started — free for 14 days",
    variant_c: "Try it free →",
  },
};

export default async function Home() {
  const userId = cookies().get('user_id')?.value ?? generateId();

  const [headlineVariant, ctaVariant] = await Promise.all([
    getVariant(userId, 'homepage-headline', 'control'),
    getVariant(userId, 'homepage-cta', 'control'),
  ]);

  const headline = EXPERIMENTS.headline[headlineVariant as keyof typeof EXPERIMENTS.headline]
    ?? EXPERIMENTS.headline.control;
  const cta = EXPERIMENTS.cta[ctaVariant as keyof typeof EXPERIMENTS.cta]
    ?? EXPERIMENTS.cta.control;

  return (
    <LandingPage
      headline={headline}
      ctaText={cta}
      userId={userId}
      variants={{ headline: headlineVariant, cta: ctaVariant }}
    />
  );
}
```

---

## Step 2: Track the Full Conversion Funnel

```typescript
// components/LandingPage.tsx
'use client';
import { useEffect } from 'react';
import posthog from 'posthog-js';

posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  api_host: 'https://app.posthog.com',
  capture_pageview: false, // Manual control
});

export function LandingPage({
  headline, ctaText, userId, variants
}: {
  headline: string;
  ctaText: string;
  userId: string;
  variants: Record<string, string>;
}) {
  useEffect(() => {
    posthog.identify(userId);
    posthog.capture('$pageview', {
      page: 'landing',
      ...variants,
    });
  }, [userId]);

  function handleCTAClick() {
    posthog.capture('cta_click', {
      cta_text: ctaText,
      cta_variant: variants.cta,
      headline_variant: variants.headline,
    });
    // Navigate to signup
    window.location.href = '/signup';
  }

  return (
    <main>
      <h1>{headline}</h1>
      <button onClick={handleCTAClick}>{ctaText}</button>

      {/* Track scroll depth for heatmap data */}
      <ScrollTracker userId={userId} />
    </main>
  );
}

function ScrollTracker({ userId }: { userId: string }) {
  useEffect(() => {
    const thresholds = [25, 50, 75, 90, 100];
    const fired = new Set<number>();

    function handleScroll() {
      const scrollPct = Math.round(
        (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100
      );
      thresholds.forEach(t => {
        if (scrollPct >= t && !fired.has(t)) {
          fired.add(t);
          posthog.capture('scroll_depth', { depth: t, userId });
        }
      });
    }

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [userId]);

  return null;
}
```

---

## Step 3: Statistical Significance Check

```typescript
// lib/stats.ts

// Two-proportion z-test for conversion rates
export function calculateSignificance(
  controlConversions: number,
  controlVisitors: number,
  variantConversions: number,
  variantVisitors: number
): {
  pValue: number;
  isSignificant: boolean;
  uplift: string;
  confidence: string;
} {
  const p1 = controlConversions / controlVisitors;
  const p2 = variantConversions / variantVisitors;
  const pooled = (controlConversions + variantConversions) / (controlVisitors + variantVisitors);

  const se = Math.sqrt(pooled * (1 - pooled) * (1/controlVisitors + 1/variantVisitors));
  const zScore = Math.abs(p2 - p1) / se;

  // Normal CDF approximation
  const pValue = 2 * (1 - normalCDF(zScore));
  const uplift = p1 > 0 ? (((p2 - p1) / p1) * 100).toFixed(1) + '%' : 'N/A';

  return {
    pValue,
    isSignificant: pValue < 0.05,
    uplift,
    confidence: ((1 - pValue) * 100).toFixed(1) + '%',
  };
}

function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989423 * Math.exp(-z * z / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.7814779 + t * (-1.8212560 + t * 1.3302744))));
  return z > 0 ? 1 - p : p;
}
```

---

## Step 4: AI Generates New Copy Variants

```typescript
// lib/generate-variants.ts
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export async function generateCopyVariants(
  element: 'headline' | 'cta' | 'subheadline',
  currentBest: string,
  conversionRate: string,
  productContext: string,
  count = 5
): Promise<string[]> {
  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a conversion rate optimization expert.

Product: ${productContext}
Element type: ${element}
Current best performer: "${currentBest}"
Current conversion rate: ${conversionRate}

Generate ${count} new variants to beat this. Each should:
- Test a different psychological angle (urgency, social proof, outcome-focused, curiosity, etc.)
- Be concise and punchy
- Be authentically different — not just synonyms
- For CTA: max 6 words
- For headline: max 12 words

Return each variant on its own line, no numbering or explanation.`,
    }],
  });

  const text = message.content[0].type === 'text' ? message.content[0].text : '';
  return text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, count);
}
```

---

## Step 5: Auto-Pause Losers, Promote Winners

```typescript
// scripts/manage-experiments.ts
import { posthog as PostHogAdmin } from '../lib/posthog-admin';

interface ExperimentResult {
  variantKey: string;
  visitors: number;
  conversions: number;
  conversionRate: number;
}

async function getExperimentResults(experimentId: string): Promise<ExperimentResult[]> {
  // Fetch from PostHog Experiments API
  const res = await fetch(
    `https://app.posthog.com/api/projects/${process.env.POSTHOG_PROJECT_ID}/experiments/${experimentId}/results/`,
    {
      headers: { Authorization: `Bearer ${process.env.POSTHOG_PERSONAL_API_KEY}` },
    }
  );
  return (await res.json()).results;
}

export async function runExperimentManagement() {
  const experiments = await getActiveExperiments();

  for (const exp of experiments) {
    const results = await getExperimentResults(exp.id);

    // Need min 100 visitors per variant before making decisions
    if (results.some(r => r.visitors < 100)) continue;

    const control = results.find(r => r.variantKey === 'control')!;

    for (const variant of results.filter(r => r.variantKey !== 'control')) {
      const stats = calculateSignificance(
        control.conversions, control.visitors,
        variant.conversions, variant.visitors
      );

      if (!stats.isSignificant) continue;

      const isWinner = variant.conversionRate > control.conversionRate;
      const isLoser = variant.conversionRate < control.conversionRate * 0.85; // >15% worse

      if (isWinner) {
        console.log(`🏆 Winner: ${variant.variantKey} (${stats.uplift} uplift, ${stats.confidence} confidence)`);

        // Generate next round of variants from this winner
        const newVariants = await generateCopyVariants(
          exp.element,
          variant.variantKey,
          `${(variant.conversionRate * 100).toFixed(1)}%`,
          'B2B project management SaaS',
          5
        );
        console.log('New variants to test:', newVariants);

      } else if (isLoser) {
        console.log(`❌ Pausing loser: ${variant.variantKey} (${stats.uplift} vs control)`);
        await pauseVariant(exp.id, variant.variantKey);
      }
    }
  }
}
```

---

## Experiment Prioritization

Focus tests on highest-impact elements:

| Element | Typical Conversion Lift |
|---------|------------------------|
| Headline | 10–40% |
| CTA button text | 5–30% |
| Hero image | 5–20% |
| Social proof placement | 5–15% |
| Form field count | 10–25% |

---

## Results

Alex ran 3 headline tests and 2 CTA tests over 8 weeks. Conversion rate went from 3.2% → 7.8% — a 144% improvement. The winning headline was AI-generated on the second round, after Claude analyzed what made the first winner work.

> "I used to agonize over every word for hours. Now I ship 5 variants, wait for data, and let Claude figure out what to test next." — Alex
