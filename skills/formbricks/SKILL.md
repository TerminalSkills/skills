---
name: formbricks
description: >-
  Collect user feedback and run in-app surveys with Formbricks — open-source
  experience management platform. Use when someone asks to "add surveys to my
  app", "Formbricks", "in-app feedback", "NPS survey", "user research",
  "product feedback tool", or "open-source Typeform alternative". Covers
  in-app surveys, website popups, link surveys, targeting, and analytics.
license: Apache-2.0
compatibility: "React/Next.js SDK. REST API. Self-hostable or cloud."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["surveys", "feedback", "formbricks", "nps", "user-research"]
---

# Formbricks

## Overview

Formbricks is an open-source survey and feedback platform — embed surveys directly in your app, trigger them based on user actions, and collect targeted feedback. Unlike Typeform (generic forms) or Hotjar (page-level), Formbricks targets specific users at the right moment: after checkout, on feature use, at churn risk. NPS, CSAT, feature requests, bug reports — all in-context.

## When to Use

- Collecting in-app feedback (NPS, CSAT, feature requests)
- Understanding why users churn or don't convert
- Running product research surveys targeted at specific segments
- A/B testing messaging or onboarding flows
- Need an open-source alternative to Typeform/SurveyMonkey

## Instructions

### Setup

```bash
# Self-host
docker compose up -d  # From formbricks/formbricks repo

# Or install SDK for in-app surveys
npm install @formbricks/js
```

### In-App Survey Integration

```typescript
// app/layout.tsx — Initialize Formbricks in Next.js
import formbricks from "@formbricks/js/app";

if (typeof window !== "undefined") {
  formbricks.init({
    environmentId: process.env.NEXT_PUBLIC_FORMBRICKS_ENV_ID!,
    apiHost: "https://formbricks.myapp.com",  // Or cloud URL
  });
}

// Identify the user (for targeted surveys)
formbricks.setUserId("user_123");
formbricks.setAttributes({
  plan: "pro",
  signupDate: "2026-01-15",
  company: "Acme Inc",
});
```

### Track Custom Actions (Triggers)

```typescript
// components/Checkout.tsx — Trigger survey after checkout
import formbricks from "@formbricks/js/app";

function CheckoutSuccess() {
  useEffect(() => {
    // Track the action — surveys configured to trigger on "checkout_completed" will fire
    formbricks.track("checkout_completed", {
      orderValue: 99.99,
      plan: "pro",
    });
  }, []);

  return <div>Thanks for your purchase!</div>;
}

// Other trigger examples:
formbricks.track("feature_used", { feature: "export" });
formbricks.track("support_ticket_created");
formbricks.track("trial_ending");
```

### API Usage

```typescript
// api/surveys.ts — Create and manage surveys via API
const response = await fetch("https://formbricks.myapp.com/api/v1/surveys", {
  method: "POST",
  headers: {
    "x-api-key": process.env.FORMBRICKS_API_KEY!,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    name: "Post-Purchase NPS",
    type: "app",  // In-app survey
    questions: [
      {
        type: "nps",
        headline: "How likely are you to recommend us?",
        lowerLabel: "Not likely",
        upperLabel: "Very likely",
      },
      {
        type: "openText",
        headline: "What's the main reason for your score?",
        placeholder: "Tell us more...",
      },
    ],
    triggers: [{ actionClass: "checkout_completed" }],
    // Target only pro users who signed up > 30 days ago
    segment: {
      filters: [
        { attributeKey: "plan", condition: "equals", value: "pro" },
      ],
    },
  }),
});
```

## Examples

### Example 1: Add NPS survey after onboarding

**User prompt:** "Add an NPS survey that appears after a user completes onboarding."

The agent will set up Formbricks SDK, create an NPS survey triggered on the "onboarding_completed" action, and configure follow-up questions based on the score.

### Example 2: Feature request collection

**User prompt:** "Let users submit feature requests from inside the app."

The agent will create a feedback survey with categorized questions, trigger it from a "Give Feedback" button, and set up webhook notifications to the product team.

## Guidelines

- **In-app surveys > email surveys** — 6x higher response rate
- **Trigger on actions** — show surveys at the right moment, not randomly
- **Target specific segments** — pro users, churning users, new signups
- **NPS + follow-up** — always ask "why" after the score
- **Don't over-survey** — Formbricks has frequency limits per user
- **Self-host for privacy** — data stays on your infrastructure
- **Webhooks for real-time** — send responses to Slack, Notion, etc.
- **A/B test survey copy** — different headlines for different segments
- **Close the loop** — respond to feedback, users notice
