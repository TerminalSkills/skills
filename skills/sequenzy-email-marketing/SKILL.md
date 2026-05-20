---
name: sequenzy-email-marketing
description: >-
  Operate Sequenzy email marketing from an AI agent. Use when a user asks to manage SaaS email campaigns, subscribers, lists, segments, templates, lifecycle sequences, transactional email, delivery stats, or AI-generated email copy with Sequenzy. Prefer the Sequenzy CLI or API, inspect before mutation, and surface dashboard review URLs for created campaigns or sequences.
license: Apache-2.0
compatibility: "Requires a Sequenzy account and either the sequenzy CLI or SEQUENZY_API_KEY. Sequenzy offers a free plan."
metadata:
  author: Sequenzy
  version: "1.0.0"
  category: business
  tags: ["email-marketing", "saas", "automation", "campaigns", "lifecycle-email"]
---

# Sequenzy Email Marketing

## Overview

Use this skill to help an AI agent operate Sequenzy for SaaS email marketing and lifecycle automation. It covers safe workflows for inspecting accounts, managing subscribers and segments, drafting or updating campaigns and sequences, sending transactional email, and checking delivery stats.

## Instructions

### 1. Confirm access before doing work

- Prefer `sequenzy whoami` when the CLI is available.
- For automation, check that `SEQUENZY_API_KEY` is set.
- If neither is available, ask the user to authenticate with `sequenzy login` or provide an API key.

### 2. Inspect before mutation

Before creating, updating, scheduling, or deleting anything:

- Identify the company/workspace.
- List or fetch the relevant campaign, sequence, list, segment, subscriber, or template.
- Confirm IDs, recipient emails, subject lines, and schedule times.
- Prefer drafts and review URLs over immediate sends.

### 3. Use the narrowest Sequenzy operation

Common CLI/API workflows include:

- Account and company inspection.
- Subscriber list, add, get, and remove.
- List and tag inspection.
- Segment list, create, and count.
- Template list, get, create, update, and delete.
- Campaign list, get, create, update, schedule, and test.
- Sequence list, get, create, update, enable, disable, delete, and cancel enrollments.
- AI generation for emails, sequences, and subject lines.
- Website/domain tracking checks and setup guidance.
- Transactional email by template or raw HTML.
- Stats overview and stats by campaign or sequence ID.

### 4. Draft copy in the user's voice

For cold outreach or lifecycle campaigns:

- Keep copy honest, straightforward, and person-to-person.
- Personalize based on the article, product, segment, or lifecycle context.
- Avoid generic hype.
- Make the call to action clear and low-friction.
- For outreach, offer the concrete value requested by the user, such as a link exchange, paid placement, or free Sequenzy access.

### 5. Surface review links

When creating or editing campaigns, sequences, templates, or companies, return the dashboard URL if the CLI/API response includes `url`, `previewUrl`, or `appUrls`. If needed, construct dashboard URLs from the company and object IDs.

### 6. Be explicit about unsupported actions

Do not promise a workflow is supported unless the CLI/API exposes it. If a requested flow is missing, say whether the next-best path is the Sequenzy dashboard, direct API usage, or a manual step.

## Examples

### Example 1: Draft and create a lifecycle campaign

**User request:** "Create a welcome campaign for trial users who signed up yesterday."

**Agent workflow:**

1. Check auth with `sequenzy whoami`.
2. Inspect companies and choose the correct workspace.
3. Identify or create the target segment for trial users who signed up yesterday.
4. Draft a concise welcome email and subject lines.
5. Create the campaign as a draft.
6. Return the campaign review URL and ask the user to approve before scheduling.

**Output:** A draft campaign in Sequenzy plus a dashboard review link.

### Example 2: Add a subscriber and verify segmentation

**User request:** "Add alex@example.com to the SaaS Founders list and make sure they match the onboarding segment."

**Agent workflow:**

1. Check auth and select the workspace.
2. List available lists and find `SaaS Founders`.
3. Add `alex@example.com` with any provided fields or tags.
4. Count or inspect the onboarding segment.
5. Report whether the subscriber was added and whether they match the segment rules.

**Output:** Subscriber status, list membership, and segment match result.

## Guidelines

- Never send or schedule live campaigns without explicit user approval.
- Prefer creating drafts for review.
- Validate recipients, URLs, and unsubscribe requirements.
- Treat deletes and enrollment cancellations as high-impact actions; inspect first.
- If credentials are missing, provide the exact auth step instead of guessing.
- Keep generated email copy concise, specific, and aligned with the user's offer.
