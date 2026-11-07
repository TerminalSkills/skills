---
title: "Automate Feature Rollout with AI-Assisted Code Generation"
slug: automate-feature-rollout-with-ai-agent
description: "Use feature flags with an AI coding agent to implement, wrap, and safely roll out new features with minimal manual scaffolding."
skills:
  - feature-flag-manager
  - coding-agent
category: development
tags:
  - feature-flags
  - rollout
  - code-generation
  - automation
---

# Automate Feature Rollout with AI-Assisted Code Generation

## The Problem

Shipping a new feature behind a feature flag requires touching multiple files: the flag definition, the backend evaluation, the conditional rendering, an assignment log for measuring impact, and a plan for removing the flag later. For a team shipping 3-4 flagged features per sprint, the scaffolding alone takes hours per feature.

Developers skip the tedious parts, or forget cleanup entirely, and flags that reached 100% months ago stay in the code. The overhead discourages adoption: engineers shortcut the process by shipping without a flag, which is exactly how the last production incident happened.

## The Solution

Use **feature-flag-manager** to design the flag: a self-hosted definition with deterministic bucketing, targeting rules and a kill switch. Use **coding-agent** to hand each well-scoped piece of scaffolding to a headless Claude Code run (`claude -p`) that wraps the feature in flag checks. You review the diff of every run before it merges.

## Step-by-Step Walkthrough

### 1. Define the flag

The flag shape comes from feature-flag-manager: `enabled` is the global kill switch, `allocation` is the percentage per variant, and `targeting` rules are checked in order, each with its own allocation override.

```typescript
const bulkCsvExport: FeatureFlag = {
  key: 'bulk-csv-export',
  type: 'boolean',
  enabled: true,                      // set to false to kill the feature everywhere
  variants: ['off', 'on'],
  allocation: [100, 0],               // default (free plan): nobody
  targeting: [
    { attribute: 'email', operator: 'contains', values: ['@acme.example'], allocation: [0, 100] },
    { attribute: 'plan',  operator: 'eq',       values: ['pro'],           allocation: [90, 10] },
  ],
  createdAt: new Date(), updatedAt: new Date(),
};
```

Bucketing hashes `flagKey:userId` with SHA-256, so the same user always gets the same answer and different flags are independent. Running the skill's `assignVariant` over 20,000 simulated user IDs with a 90/10 split puts about 2,000 of them (10%, give or take a few dozen) in `on`, which confirms the distribution before anything ships. Do this check for every new flag.

### 2. Generate the flagged backend

Give the coding agent one narrow task and pre-approve only the tools it needs:

```bash
LOG=$(mktemp /tmp/claude-agent.XXXXXX)
timeout 900 claude -p "Implement POST /api/exports/csv in src/routes/exports.ts. \
Call evaluateFlag('bulk-csv-export', req.user.id, req.user) and return 404 when the variant is 'off'. \
Stream the CSV with a cursor so 10,000 rows never sit in memory. \
Log an assignment event and an export_completed event with row count and duration. \
Do not modify other files." \
  --permission-mode acceptEdits \
  --allowedTools "Read" "Edit" "Write" "Bash(npx tsc --noEmit)" \
  --max-budget-usd 2 --output-format text > "$LOG" 2>&1 &
AGENT_PID=$!
```

When it finishes (`wait $AGENT_PID`, then read `$LOG`), read the diff and run the type check and tests yourself. The flag check returns 404, not 403, so users without access cannot tell the feature exists.

### 3. Generate the frontend integration

Flags are evaluated on the server only: a client-side SDK leaks experiment details and flickers. The agent task therefore passes the evaluated result down instead of calling a flag service from the browser:

```bash
timeout 900 claude -p "Add a 'Bulk Export' button to the RecordsTable component. \
Render it only when the prop flags['bulk-csv-export'] === 'on'; the server already \
puts evaluated flags into the page payload. Show progress while the export runs. \
Do not touch other components." \
  --permission-mode acceptEdits --allowedTools "Read" "Edit" "Write" \
  --max-budget-usd 2 --output-format text > "$LOG" 2>&1
```

When the flag is `off` the component is not rendered at all; it is not hidden with CSS.

### 4. Generate the cleanup plan before shipping

A read-only run lists everything that must go when the flag is retired:

```bash
timeout 600 claude -p "List every file and line that references 'bulk-csv-export' and the \
code to delete once it is at 100%. Output a markdown checklist." \
  --allowedTools "Read" "Grep" "Glob" --output-format text > cleanup-bulk-csv-export.md
```

Attach the checklist to a ticket created before the rollout starts. feature-flag-manager tracks the lifecycle (CREATED, TESTING, RAMPING, DECIDED, ARCHIVED) and alerts when a flag has sat in DECIDED for more than 14 days, which is what keeps orphaned flags from piling up.

### 5. Ramp up through the admin API

Move through the lifecycle with the skill's admin endpoints, changing the Pro allocation in steps (5, 25, 50, 100). `PATCH` takes the whole `targeting` array in this example, so send every rule you want to keep (including the internal-email rule from step 1). Keep each step only while your own error-rate dashboard stays flat against the `off` group:

```bash
curl -X PATCH "$FLAGS_API/api/flags/bulk-csv-export" -H "Authorization: Bearer $FLAGS_ADMIN_TOKEN" \
  -H 'content-type: application/json' -d '{"targeting":[{"attribute":"plan","operator":"eq","values":["pro"],"allocation":[75,25]}]}'

# kill switch
curl -X PATCH "$FLAGS_API/api/flags/bulk-csv-export/toggle" -H "Authorization: Bearer $FLAGS_ADMIN_TOKEN"
```

The endpoints are the ones feature-flag-manager defines for the flag service you build; the paths and auth are yours to match to that service. Because the config is cached for about 30 seconds, a toggle takes effect everywhere within that window.

## Real-World Example

A product team at a B2B analytics company ships four features per sprint behind flags. Each feature used to need a couple of hours of scaffolding, so engineers sometimes skipped the flag. With the flag definition tested up front and the four agent tasks above run per feature, the team's measure of scaffolding time (their own numbers, from sprint retros) fell to under an hour, and the review of the agent's diffs became the main cost.

Every flagged feature now ships with an assignment log and a cleanup ticket created before the rollout. Flags in DECIDED for more than 14 days page the owning team, so the backlog of dead flags shrinks sprint by sprint instead of growing. When flagging takes less effort than shipping without one, the correct path is also the easy one.

## Related Skills

- [feature-flag-manager](/skills/feature-flag-manager)
- [coding-agent](/skills/coding-agent)
