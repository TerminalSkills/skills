---
title: Build an Engineering Workflow with Linear
slug: build-engineering-workflow-with-linear
description: "Set up Linear for a growing engineering team with teams and workflow states, two-week cycles, GitHub PR integration, webhook automation, and velocity reports via the GraphQL API."
category: productivity
skills: [linear]
tags: [linear, automation, github, webhooks, agile]
---

# Build an Engineering Workflow with Linear

## The Problem

Dani is a tech lead at a 30-person SaaS startup. The engineering team has grown from 5 to 14 developers in six months. Their GitHub Issues setup is falling apart: no sprint planning, no priority visibility, inconsistent labeling. The CTO wants structured cycles, automated triage, and metrics they can actually track.

Dani needs to set up Linear as the team's project management backbone: workspace structure, automated workflows via webhooks, GitHub integration, and reporting.

## The Solution

Using the **linear** skill, the agent sets up the workflow in two layers. Linear's built-in automations cover what they can (cycle rollover, parent auto-close, GitHub status updates), so the agent only writes code for what Linear does not do: creating the team structure through the API, a small webhook service for urgent-issue triage and review notifications, a daily stale-issue job, and reporting queries.

All code below uses `@linear/sdk` 99.x (ESM, Node.js 22 or newer) and was type-checked against it; it needs a personal API key from Linear under Settings, API (`LINEAR_API_KEY`).

## Step-by-Step Walkthrough

### Step 1: Create Teams, Cycles and Labels

Each team gets two-week cycles starting Monday. New teams come with Backlog, Todo, In Progress, Done and Canceled states, so the script only adds one team-specific state. Priority is a built-in field (0 No priority, 1 Urgent, 2 High, 3 Medium, 4 Low), so there are no priority labels. The script creates five workspace-level labels; the reporting step also expects labels named `bug` and `feature`, so create those too if your workspace does not have them.

```typescript
import { LinearClient } from "@linear/sdk";

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

const teamConfigs = [
  { name: "Platform", key: "PLT", description: "Infrastructure, CI/CD, developer tooling",
    state: { name: "Deploying", color: "#6fcf97" } },
  { name: "Product", key: "PRD", description: "User-facing features, growth, analytics",
    state: { name: "Design Review", color: "#bb6bd9" } },
  { name: "Mobile", key: "MOB", description: "iOS and Android apps",
    state: { name: "QA Testing", color: "#2d9cdb" } },
];

for (const cfg of teamConfigs) {
  const created = await linear.createTeam({
    name: cfg.name,
    key: cfg.key,
    description: cfg.description,
    cyclesEnabled: true,
    cycleDuration: 2,                 // weeks
    cycleStartDay: 1,                 // 0 = Sunday, 1 = Monday
    upcomingCycleCount: 2,            // cycles created ahead of time
    cycleIssueAutoAssignStarted: true, // started issues without a cycle join the current one
  });
  const team = await created.team;
  if (!team) throw new Error(`Team ${cfg.key} was not created`);

  // New teams come with Backlog, Todo, In Progress, Done and Canceled states.
  // Add only the team-specific state; "started" places it between In Progress and Done.
  await linear.createWorkflowState({
    teamId: team.id, name: cfg.state.name, color: cfg.state.color, type: "started",
  });
  console.log(`Created team ${team.key} (${team.id})`);
}

const labels = [
  { name: "tech-debt", color: "#f59e0b" },
  { name: "security", color: "#dc2626" },
  { name: "performance", color: "#8b5cf6" },
  { name: "documentation", color: "#6b7280" },
  { name: "stale", color: "#9ca3af" },
];
for (const label of labels) {
  await linear.createIssueLabel(label); // no teamId = workspace-level label
}
```

Create an "In Review" status for each team under Settings, Teams, Workflow if it is not there yet; the Slack rule in Step 3 keys on it.

### Step 2: Create Issue Templates

Create the bug report, feature request and tech debt templates in the Linear app (Settings, Teams, your team, Templates, or workspace-level templates). Give the bug template a default priority of High and the checklist sections Steps to Reproduce, Expected, Actual, Environment and Severity. Templates are configured in the app because the stored template format is not a documented part of the API.

### Step 3: Webhook Automation Service

Linear sends signed webhooks for issue changes. The service verifies the `Linear-Signature` header (HMAC-SHA256 of the raw body), rejects payloads whose `webhookTimestamp` is more than 60 seconds old, and answers within the 5-second limit before doing any work. Register the URL under Settings, API, Webhooks (admin only) or with the `webhookCreate` mutation, choosing the Issue resource type, and put the signing secret in `LINEAR_WEBHOOK_SECRET`.

```typescript
import crypto from "node:crypto";
import express from "express";
import { LinearClient } from "@linear/sdk";

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
const app = express();

function verify(rawBody: Buffer, signature: string | undefined): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", process.env.LINEAR_WEBHOOK_SECRET!)
    .update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

app.post("/webhooks/linear", express.raw({ type: "application/json" }), (req, res) => {
  const body = JSON.parse(req.body.toString("utf8"));
  const fresh = Math.abs(Date.now() - body.webhookTimestamp) < 60_000; // replay protection
  if (!verify(req.body, req.get("linear-signature")) || !fresh) {
    res.sendStatus(401);
    return;
  }
  res.sendStatus(200); // Linear waits 5 seconds at most; do the work after answering
  handle(body).catch((err) => console.error("webhook error", err));
});

async function handle(event: any) {
  if (event.type !== "Issue" || event.action !== "update") return;
  const { data, updatedFrom } = event;

  // Rule 1: priority changed to Urgent (1) -> put the issue into the team's active cycle
  if (data.priority === 1 && updatedFrom?.priority !== undefined && !data.cycleId) {
    const cycles = await linear.cycles({
      filter: { team: { id: { eq: data.teamId } }, isActive: { eq: true } },
    });
    const active = cycles.nodes[0];
    if (active) await linear.updateIssue(data.id, { cycleId: active.id });
  }

  // Rule 2: moved into "In Review" -> post to Slack (incoming webhook bound to one channel)
  if (updatedFrom?.stateId && data.state?.name === "In Review") {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*${data.identifier}* is ready for review: ${data.title}\n${data.url}`,
      }),
    });
  }
}

app.listen(3000, "127.0.0.1"); // put a reverse proxy or tunnel with TLS in front
```

The service listens on 127.0.0.1; expose it through a TLS reverse proxy or tunnel rather than binding it to all interfaces. Slack incoming webhooks post to the channel they were created for, so no channel field is sent.

Two rules from the old design are now handled by Linear itself and need no code: turn on **Parent auto-close** under Settings, Teams, Workflow so a parent finishes when all its sub-issues are done, and rely on cycle rollover (Step 5).

### Step 4: Flag Stale Issues Daily

A webhook only fires when something changes, so it cannot notice an issue that has silently sat in progress. Run this script once a day from cron or a scheduled CI job:

```typescript
import { LinearClient } from "@linear/sdk";

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
const staleLabel = (await linear.issueLabels({ filter: { name: { eq: "stale" } } })).nodes[0];
if (!staleLabel) throw new Error('Create the "stale" label first');

const cutoff = new Date(Date.now() - 5 * 86_400_000).toISOString();
let page = await linear.issues({
  first: 100,
  filter: {
    state: { type: { eq: "started" } },
    startedAt: { lt: cutoff },
    labels: { every: { id: { neq: staleLabel.id } } },
  },
});
let flagged = 0;
for (;;) {
  for (const issue of page.nodes) {
    await linear.issueAddLabel(issue.id, staleLabel.id);
    flagged++;
  }
  if (!page.pageInfo.hasNextPage) break;
  page = await page.fetchNext();
}
console.log(`Flagged ${flagged} issues as stale`);
```

### Step 5: GitHub Integration and Cycles

Enable the GitHub integration under Settings, Integrations, GitHub. Linear then does the work the old workflow tried to script:

- **Linking:** include the issue ID in the branch name (use the Copy git branch name shortcut, Cmd/Ctrl+Shift+.) or the PR title, or put a magic word in the PR description, for example `Fixes PLT-123`.
- **Status:** a closing magic word moves the issue forward when the branch is pushed and to the status set for "On PR or commit merge" when it merges. Non-closing words (`Refs PLT-123`, `Part of PLT-123`) link without closing.
- **Per-branch rules:** set different target statuses per branch under the same settings.

Cycles also run themselves: unfinished open issues roll over to the next cycle automatically (issues moved to backlog, triage, canceled or completed during cooldown are not carried). The `cycleIssueAutoAssignStarted` option set in Step 1 puts started issues without a cycle into the current one. Details: [Linear GitHub docs](https://linear.app/docs/github), [Linear cycles docs](https://linear.app/docs/use-cycles).

### Step 6: Reporting Queries

Velocity per cycle, the bug-to-feature ratio and the priority distribution. Cycle history arrays hold one value per day, so the last element is the final figure; the unit is estimate points when the team uses estimates and issue count otherwise.

```typescript
import { LinearClient } from "@linear/sdk";

type IssueFilter = NonNullable<NonNullable<Parameters<LinearClient["issues"]>[0]>["filter"]>;

const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

// Velocity: last 6 finished cycles of the Platform team
const cycles = await linear.cycles({
  filter: { team: { key: { eq: "PLT" } }, isPast: { eq: true } },
  last: 6,
});
console.log("Cycle | Completed | Scope | %");
for (const c of cycles.nodes) {
  const done = c.completedScopeHistory.at(-1) ?? 0; // history holds one value per day
  const scope = c.scopeHistory.at(-1) ?? 0;          // in estimate points (or issue count)
  console.log(`${c.name ?? `Cycle ${c.number}`} | ${done} | ${scope} | ${scope ? Math.round((100 * done) / scope) : 0}%`);
}

async function countIssues(filter: IssueFilter): Promise<number> {
  let n = 0;
  let page = await linear.issues({ first: 250, filter });
  for (;;) {
    n += page.nodes.length;
    if (!page.pageInfo.hasNextPage) return n;
    page = await page.fetchNext();
  }
}

const since = new Date(new Date().getFullYear(), 0, 1).toISOString();
const bugs = await countIssues({ labels: { name: { eqIgnoreCase: "bug" } }, createdAt: { gte: since } });
const features = await countIssues({ labels: { name: { eqIgnoreCase: "feature" } }, createdAt: { gte: since } });
console.log(`Bug:Feature this year = ${bugs}:${features}`);

const names = ["No priority", "Urgent", "High", "Medium", "Low"];
for (let p = 0; p <= 4; p++) {
  const open = await countIssues({ priority: { eq: p }, state: { type: { in: ["unstarted", "started"] } } });
  console.log(`${names[p]}: ${open} open issues`);
}
```

## Real-World Example

Dani runs the setup script, deploys the webhook service to a small container behind a TLS proxy, registers the webhook URL, and connects GitHub. In the first sprint:

- The 14 developers are organized into 3 teams with their own workflow states and two-week cycles.
- Issues raised to Urgent land in the active cycle without manual triage.
- Developers who write `Fixes PLT-123` in a PR see the issue move to Done when it merges.
- The daily job labels issues that have been in progress for more than five days, so standup can start from that list.
- Sprint reviews use the velocity script to compare cycles.

## Related Skills

- [linear](/skills/linear) - GraphQL API, SDK, webhooks and workspace automation
