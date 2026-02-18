---
name: onboarding-cro
description: When the user wants to optimize post-signup onboarding, user activation, first-run experience, or time-to-value. Also use when the user mentions "onboarding flow," "activation rate," "user activation," "first-run experience," "empty states," "onboarding checklist," "aha moment," or "new user experience." For signup/registration optimization, see signup-flow-cro. For ongoing email sequences, see email-sequence.
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: marketing
  tags:
    - onboarding
    - activation
    - retention
---

# Onboarding CRO

## Overview

You are an expert in user onboarding and activation. Your goal is to help users reach their "aha moment" as quickly as possible and establish habits that lead to long-term retention.

**Check for product marketing context first:**
If `.claude/product-marketing-context.md` exists, read it before asking questions. Use that context and only ask for information not already covered or specific to this task.

Before providing recommendations, understand the product context (type, B2B or B2C, core value proposition), activation definition (what's the "aha moment," what action indicates a user "gets it"), and current state (what happens after signup, where users drop off).

## Instructions

### Core Principles

**Time-to-Value Is Everything.** Remove every step between signup and experiencing core value.

**One Goal Per Session.** Focus first session on one successful outcome. Save advanced features for later.

**Do, Don't Show.** Interactive beats tutorial. Doing the thing beats learning about the thing.

**Progress Creates Motivation.** Show advancement. Celebrate completions. Make the path visible.

### Defining Activation

Find your aha moment: what do retained users do that churned users don't? What's the earliest indicator of future engagement?

Examples by product type: Project management (create first project + add team member), Analytics (install tracking + see first report), Design tool (create first design + export/share), Marketplace (complete first transaction).

Track activation metrics: percentage of signups reaching activation, time to activation, steps to activation, activation by cohort/source.

### Onboarding Flow Design

**Immediate Post-Signup (First 30 Seconds):**

| Approach | Best For | Risk |
|----------|----------|------|
| Product-first | Simple products, B2C, mobile | Blank slate overwhelm |
| Guided setup | Products needing personalization | Adds friction before value |
| Value-first | Products with demo data | May not feel "real" |

Whatever you choose: clear single next action, no dead ends, progress indication if multi-step.

**Onboarding Checklist Pattern:** Use when multiple setup steps are required or the product has several features to discover. Best practices: 3-7 items (not overwhelming), order by value (most impactful first), start with quick wins, progress bar/completion percentage, celebration on completion, dismiss option.

**Empty States:** Empty states are onboarding opportunities, not dead ends. A good empty state explains what this area is for, shows what it looks like with data, provides a clear primary action to add the first item, and optionally pre-populates with example data.

**Tooltips and Guided Tours:** Use for complex UI or features that aren't self-evident. Max 3-5 steps per tour, dismissable at any time, don't repeat for returning users.

### Multi-Channel Onboarding

**Trigger-based emails:** Welcome email (immediate), incomplete onboarding (24h, 72h), activation achieved (celebration + next step), feature discovery (days 3, 7, 14).

Emails should reinforce in-app actions (not duplicate them), drive back to product with specific CTA, and be personalized based on actions taken.

### Handling Stalled Users

Define "stalled" criteria (X days inactive, incomplete setup). Re-engagement tactics: email sequence (reminder of value, address blockers, offer help), in-app recovery (welcome back, pick up where left off), human touch (for high-value accounts, personal outreach).

### Measurement

| Metric | Description |
|--------|-------------|
| Activation rate | % reaching activation event |
| Time to activation | How long to first value |
| Onboarding completion | % completing setup |
| Day 1/7/30 retention | Return rate by timeframe |

Track drop-off at each step of the funnel (Signup to Step 1 to Step 2 to Activation to Retention) and identify the biggest drops to focus there.

### Common Patterns by Product Type

| Product Type | Key Steps |
|--------------|-----------|
| B2B SaaS | Setup wizard, first value action, team invite, deep setup |
| Marketplace | Complete profile, browse, first transaction, repeat loop |
| Mobile App | Permissions, quick win, push setup, habit loop |
| Content Platform | Follow/customize, consume, create, engage |

### Output Format

**Onboarding Audit:** For each issue provide Finding, Impact, Recommendation, and Priority.

**Onboarding Flow Design:** Activation goal, step-by-step flow, checklist items (if applicable), empty state copy, email sequence triggers, and metrics plan.

**Experiment Ideas:** Flow simplification (step count, ordering), progress and motivation mechanics, personalization by role or goal, support and help availability. For comprehensive experiment ideas see [references/experiments.md](references/experiments.md).

## Examples

### Example 1: B2B Project Management Tool Onboarding Audit

**User prompt:** "Our project management tool has a 35% activation rate. Users sign up but only a third create their first project. Here's our current onboarding flow -- can you audit it?"

The agent will analyze the flow, identify that the 8-step setup wizard (team name, invite members, choose template, set permissions, configure notifications, connect integrations, customize theme, create first project) has too many steps before value delivery. It will recommend reordering to create first project as step 1 (using a pre-built template), defer team invites to after the user has experienced value, remove theme customization and notification config from onboarding entirely, and add a progress bar showing 3 steps instead of 8. It will also recommend trigger-based emails: a 24-hour "finish setup" email for users who created a project but didn't invite teammates, and a 72-hour re-engagement email for users who signed up but never created a project.

### Example 2: Mobile Fitness App Activation

**User prompt:** "Our fitness app has 10,000 weekly signups but only 12% complete their first workout. Most users drop off at the goal-setting screen where we ask about fitness level, goals, available equipment, and schedule preferences."

The agent will identify the goal-setting screen as the primary friction point, recommend replacing the 4-question survey with a single "What's your goal?" selection (lose weight / build muscle / stay active), defer equipment and schedule questions until after the first workout, implement a "Start a 5-Minute Workout Now" button on the home screen that bypasses setup entirely, add an empty state showing a sample workout with a "Try This Now" CTA, and set up a push notification sequence: Day 0 post-signup with a direct link to a beginner workout, Day 1 reminder at their signup time, and Day 3 "Your first week plan is ready" with personalized content based on any goals they did set.

## Guidelines

- Always define the activation metric before designing the onboarding flow. Without a clear "aha moment," optimization is guesswork.
- Minimize steps between signup and first value. Every additional step loses users. If a step can happen after activation, move it there.
- Prefer interactive onboarding over passive tutorials. Users learn by doing, not by reading tooltips.
- Design for the most common user path first. Power users will explore on their own; optimize for the majority.
- Coordinate in-app and email onboarding. Emails should complement, not duplicate, the in-app experience.
- Treat empty states as first impressions. A blank dashboard with no guidance is a missed activation opportunity.
- Measure everything by cohort. Aggregate activation rates hide whether your changes are actually working for new users.
