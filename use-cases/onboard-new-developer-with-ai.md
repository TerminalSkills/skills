---
title: Onboard New Developers with AI
slug: onboard-new-developer-with-ai
description: >-
  Cut developer onboarding from weeks to days using AI-generated codebase guides, visual architecture maps, and self-service Q&A.
skills:
  - understand-onboard
  - understand-chat
  - understand-explain
  - understand-dashboard
category: development
tags: [onboarding, developer-experience, documentation, knowledge-graph, team]
---

# Onboard New Developers with AI

## The Problem

You are hiring fast and three new developers start on Monday. Your codebase is 150k lines of TypeScript evolved over 4 years with undocumented architectural decisions everywhere. Your README says "run `npm install` and `npm dev`" and nothing else. Each new hire will spend 2-3 weeks figuring out where things live and how they connect, burning months of productivity and exhausting your senior devs with repeated questions.

## The Solution

Use the understand-anything skill suite to generate a comprehensive onboarding guide from your codebase's knowledge graph. New developers get a structured architecture walkthrough, a visual dependency map, and self-service Q&A that answers architecture questions grounded in real code. Senior devs stop being the bottleneck.

## Step-by-Step Walkthrough

### 1. Build the knowledge graph

Before new hires arrive, generate the codebase knowledge graph:

```
/understand
```

This produces `.understand-anything/knowledge-graph.json` with every file, function, class, and their relationships mapped. Takes 2-10 minutes depending on codebase size.

### 2. Generate the onboarding guide

Run the onboarding skill to create a structured guide:

```
/understand-onboard
```

This generates `docs/ONBOARDING.md` containing: project overview (tech stack, frameworks, design decisions), architecture layers (with key files per layer), a guided tour (step-by-step walkthrough of the codebase), a file map (what each key file does), and complexity hotspots (files new devs should approach carefully).

### 3. Walk through architecture visually

On day one, walk new hires through the dashboard:

```
/understand-dashboard
```

Open `http://localhost:5173` together and show the layer view, follow a request flow through the system, highlight dependency clusters, and point out complexity hotspots. Visual exploration builds a mental model far better than reading code alone.

### 4. Set up self-service Q&A

Give every new hire a way to answer their own architecture questions:

```
/understand-chat how does the permission system work?
/understand-chat where is email sending handled?
/understand-chat what happens when a subscription expires?
```

The chat skill searches the knowledge graph and answers with specific file paths, function names, layer context, and related components. This alone cuts "quick question" interruptions by 50%.

### 5. Deep-dive on assigned areas

When a new developer gets their first ticket, use explain to understand the relevant code:

```
/understand-explain src/billing/subscription.ts
/understand-explain src/auth/session.ts:createSession
```

This provides the component's role in the architecture, internal structure, external connections, data flow, and complexity notes.

## Real-World Example

A team lead onboards 3 developers onto a 150k-line TypeScript monorepo (Next.js, Prisma, tRPC). On Friday before they start, they run `/understand` and `/understand-onboard` to generate a 6-layer architecture guide with a 8-step guided tour. On Monday, day-one walkthrough with `/understand-dashboard` takes 45 minutes. By Tuesday, each new developer is using `/understand-chat` to answer their own questions. By Wednesday, they run `/understand-explain` on their assigned areas and submit their first PRs. By Friday, all three have merged production code. Onboarding time drops from 3 weeks to 4 days.

## Related Skills

- [understand-onboard](../skills/understand-onboard/SKILL.md) -- Generate the onboarding guide
- [understand-chat](../skills/understand-chat/SKILL.md) -- Self-service architecture Q&A
- [understand-explain](../skills/understand-explain/SKILL.md) -- Deep-dive on specific components
- [understand-dashboard](../skills/understand-dashboard/SKILL.md) -- Visual architecture explorer
- [understand-diff](../skills/understand-diff/SKILL.md) -- Understand impact of first PRs
