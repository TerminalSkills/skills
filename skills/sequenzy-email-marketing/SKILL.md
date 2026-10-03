---
name: sequenzy-email-marketing
description: >-
  Operate Sequenzy email marketing from an AI agent. Use when a user asks to manage SaaS email campaigns, subscribers, lists, segments, templates, lifecycle sequences, transactional email, delivery stats, or AI-generated email copy with Sequenzy. Prefer the Sequenzy CLI or API, inspect before mutation, and surface dashboard review URLs for created campaigns or sequences.
license: Apache-2.0
compatibility: "Requires a Sequenzy account and either the sequenzy CLI or SEQUENZY_API_KEY. Sequenzy offers a free plan."
metadata:
  author: Sequenzy
  version: "1.1.0"
  category: business
  tags: ["email-marketing", "saas", "automation", "campaigns", "lifecycle-email"]
---

# Sequenzy Email Marketing

## Overview

Use this skill to help an AI agent operate Sequenzy for SaaS email marketing and lifecycle automation. It covers safe workflows for inspecting accounts, managing subscribers and segments, drafting or updating campaigns and sequences, sending transactional email, and checking delivery stats.

## Instructions

### 1. Install and confirm access before doing work

The CLI is the scoped package `@sequenzy/cli` (the unscoped `sequenzy` npm package is only a TypeScript API client, not the CLI):

```bash
npm install -g @sequenzy/cli
# or run it without installing:
npx @sequenzy/cli --help
```

```bash
sequenzy login     # opens a browser with an approval code; works headless
sequenzy account   # confirms the credential actually reaches Sequenzy
sequenzy whoami     # checks the stored credential locally only
```

For automation set `SEQUENZY_API_KEY` (and `SEQUENZY_WORKSPACE_ID` to pick a workspace):

```bash
export SEQUENZY_API_KEY=seq_user_51f6c2a8d9b347e0912a
export SEQUENZY_WORKSPACE_ID=comp_7f2e1a9c
```

Keys are sent as `Authorization: Bearer ...` to `https://api.sequenzy.com/api/v1`. Personal keys start with `seq_user_` and need the target workspace in the `x-company-id` header (or `--company` on the CLI); workspace keys start with `seq_live_`. Key permissions are presets (read-only, safer agent access, AI drafting, data ingest, transactional sender) — sending needs explicit permissions such as `campaigns:send` or `sequences:activate`; the default "safer agent access" preset can draft but not send or delete. An MCP server is also available: `codex mcp add sequenzy --env SEQUENZY_API_KEY=seq_user_51f6c2a8d9b347e0912a -- npx -y @sequenzy/mcp`, or the remote URL `https://api.sequenzy.com/v1/mcp` for cloud clients.

### 2. Inspect before mutation

Before creating, updating, scheduling, or deleting anything:

- Identify the company/workspace (`sequenzy companies list`).
- List or fetch the relevant object: `campaigns get`, `sequences get`, `lists`, `segments count`, `subscribers list`, `templates list`.
- Confirm IDs, recipient emails, subject lines, and schedule times.
- Prefer drafts and review URLs over immediate sends. Add `--json` when parsing output.
- Delete commands need `--yes` in scripts and agents; they fail without it. Treat that flag as the point where you must have user approval.

### 3. Use the narrowest Sequenzy operation

Verified CLI groups (run `sequenzy <group> --help` for flags):

- Subscribers: `subscribers list|add|update|remove|event|import|import-status|attributes`, `subscribers tags add`. `remove` archives; `--hard` deletes permanently. Cursor paging with `--limit` and `--cursor`.
- Lists: `lists create|update|add-subscribers|remove-subscribers|delete`.
- Segments: `segments list|count|create|update|delete` (filters via `--filter-json`, `--match any|all`).
- Templates and components: `templates list|create|update|render|share`, `components list|create|update`.
- Campaigns: `campaigns create|list|get|update|schedule|unschedule|pause|resume|cancel|test|render|share|delete`. Create from `--html-file`, `--blocks-file` or `--prompt`; target with `--segment`. A/B tests: `campaigns duplicate --mode ab_test`, `ab-tests create`, `ab-tests select-winner`.
- Sequences: `sequences create` (triggers `contact_added`, `event_received`, `tag_added`), `update`, `enable|disable`, `enroll`, `enroll-audience`, `enrollments`, `cancel-enrollments`, `pause-enrollments`, `archive`. Enrollment commands that change data take `--apply`; without it they preview.
- Transactional: `sequenzy send user@host --template NAME --var key=value`, or `--subject` with `--html-file`/`--html`; `--idempotency-key` prevents double sends.
- Stats: `stats [--period 30d] [--campaign ID | --sequence ID | --emails | --clients]`.
- Also: landing pages, forms, popups, webhooks, suppressions, inbox, `blocks` (email block types).

### 4. Draft copy in the user's voice

For cold outreach or lifecycle campaigns:

- Keep copy honest, straightforward, and person-to-person.
- Personalize based on the article, product, segment, or lifecycle context.
- Avoid generic hype.
- Make the call to action clear and low-friction.
- For outreach, offer the concrete value requested by the user, such as a link exchange, paid placement, or free Sequenzy access.

### 5. Surface review links

When creating or editing campaigns, sequences, templates, or companies, return the dashboard URL if the response includes `url`, `previewUrl`, or `appUrls`. For a visual check use `campaigns render ID --out preview.html` or `campaigns share ID`, and send a test with `campaigns test ID --to ADDRESS`.

### 6. Be explicit about unsupported actions

Do not promise a workflow is supported unless the CLI/API exposes it. If a requested flow is missing, say whether the next-best path is the Sequenzy dashboard, direct API usage, or a manual step.

## Examples

### Example 1: Draft and create a lifecycle campaign

**User request:** "Create a welcome campaign for trial users who signed up yesterday."

**Agent workflow:**

1. Check auth with `sequenzy account`.
2. Inspect companies and choose the correct workspace.
3. Identify or create the target segment for trial users who signed up yesterday.
4. Draft a concise welcome email and subject lines.
5. Create the campaign as a draft: `sequenzy campaigns create "Trial welcome" --subject "Welcome aboard" --html-file ./welcome.html --segment seg_abc123`.
6. Return the campaign review URL and ask the user to approve before scheduling.

**Output:** A draft campaign in Sequenzy plus a dashboard review link.

### Example 2: Add a subscriber and verify segmentation

**User request:** "Add alex@northstarrobotics.com to the SaaS Founders list and make sure they match the onboarding segment."

**Agent workflow:**

1. Check auth and select the workspace.
2. List available lists and find `SaaS Founders`.
3. Add the subscriber: `sequenzy subscribers add alex@northstarrobotics.com --first-name Alex --tag founder`, then `sequenzy lists add-subscribers list_123 --email alex@northstarrobotics.com`.
4. Run `sequenzy segments count seg_abc123` and `sequenzy subscribers list --segment onboarding --json` to confirm membership.
5. Report whether the subscriber was added and whether they match the segment rules.

**Output:** Subscriber status, list membership, and segment match result.

## Guidelines

- Never send or schedule live campaigns without explicit user approval.
- Prefer creating drafts for review.
- Validate recipients, URLs, and unsubscribe requirements.
- Personal `seq_user_` keys are account-wide: always pass the workspace explicitly.
- Treat deletes and enrollment cancellations as high-impact actions; inspect first.
- If credentials are missing, provide the exact auth step instead of guessing.
- Keep generated email copy concise, specific, and aligned with the user's offer.
