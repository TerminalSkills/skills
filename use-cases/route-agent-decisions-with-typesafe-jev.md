---
title: Route Agent Decisions With TypeSafe Jev
slug: route-agent-decisions-with-typesafe-jev
description: Replace slow, free-text LLM classification in your agent or support pipeline with typed decisions and confidence scores from TypeSafe's Jev, and escalate to a human when the model is unsure.
skills:
  - jev
category: data-ai
tags:
  - ai-agents
  - classification
  - routing
  - typesafe-ai
---

# Route Agent Decisions With TypeSafe Jev

## The Problem

A support team of six gets about 800 tickets a day. Today an LLM prompt reads each ticket and answers "I think this is probably a billing issue", which a regex then tries to parse. Some days the format drifts and routing breaks. The model never says how sure it is, so a ticket that is half billing and half outage goes confidently to the wrong queue, and nobody notices until the customer writes back angry. Every call also waits for a full text generation just to get one word.

## The Solution

Use the `jev` skill to call Jev, TypeSafe AI's System One model. Instead of generating text, Jev answers typed questions: a `choice` for the team, a `score` for frustration and a `noul` (its yes/no type) for "needs a same-day fix". Each answer comes back as structured JSON with probabilities, and choice and score answers include a `confidence` from 0 to 1. The code routes on the answer and escalates to a human when confidence is low.

## Step-by-Step Walkthrough

### Step 1: Describe the decision as questions

Ask: "Use jev to classify support tickets into billing, technical, sales or other, rate frustration on three levels, and flag same-day urgency." The agent builds the `questions` object with a `criteria` map for the choice, an ordered list for the score, and a plain instruction for the `noul`. It adds `other` so unmatched tickets have somewhere to go.

### Step 2: Call the API

The agent sends `POST https://api.typesafe.ai/v1/systemone` with `Authorization: Bearer $TYPESAFE_API_KEY`, the ticket as `state`, and a pinned `model` of `jev-1.13.0`. The key stays in an environment variable.

### Step 3: Gate on confidence

For a ticket with a 0.61 billing and 0.35 technical split, the confidence is about 0.42, below the 0.6 floor, so the ticket goes to the human triage queue. Clear tickets (one option near 1.0) go straight to their team. High-stakes actions such as automatic refunds get a stricter bar, in the docs' example above 0.85, with a confirmation step in between.

### Step 4: Calibrate on your own data

Run 200 tickets you have already labelled, compare Jev's choice with the human label, and move the thresholds until the share of wrongly auto-routed tickets is acceptable. Keep that set to re-run after any model upgrade.

## Real-World Example

Mira runs support engineering at a 40-person SaaS company. She asks her coding agent to swap the regex-parsed LLM call in the ticket pipeline for Jev. The agent writes a 30-line `triage()` function with three questions and a 0.6 confidence floor. On a replay of last week's 1,120 tickets, most land in the right queue automatically, the unsure ones show up in a `human-triage` queue with their probabilities attached, and the parsing step is gone because the response is already JSON. Mira pins `jev-1.13.0` and adds the replay set as a regression test, since model aliases such as `jev-latest` can move to new releases.

## Related Skills

- [jev](/skills/jev) -- the API shape, primitives and confidence rules used here
