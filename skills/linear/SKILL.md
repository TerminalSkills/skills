---
name: linear
description: >-
  Manage projects and issues with Linear. Use when a user asks to set up Linear
  workspaces, create issues and projects, automate workflows, build Linear
  integrations, sync issues with GitHub, manage sprints and cycles, set up
  triage processes, build custom views, use Linear's GraphQL API, create
  webhooks, automate issue transitions, or build tools on top of Linear. Covers
  workspace configuration, team workflows, API automation, and integration
  patterns.
license: Apache-2.0
compatibility: Node.js 18+ or any HTTP client (GraphQL API)
metadata:
  author: terminal-skills
  version: 1.1.0
  category: productivity
  repository: https://github.com/linear/linear
  tags:
    - linear
    - project-management
    - issue-tracker
    - graphql
    - automation
---

# Linear

## Overview

Automate and extend Linear — the streamlined issue tracker for modern software teams. This skill covers workspace setup, team workflow configuration, the GraphQL API for full CRUD on issues/projects/cycles, webhooks for real-time events, GitHub/GitLab sync, and automation patterns for triage, labeling, and sprint management.

## Instructions

### Step 1: Authentication & SDK Setup

**Personal API key** (Settings → API → Personal API keys):
```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxxxxxxxxxx"
```

**SDK setup** (recommended):
```bash
npm install @linear/sdk
```

```typescript
import { LinearClient } from "@linear/sdk";
const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });
const me = await linear.viewer;
console.log(`Authenticated as: ${me.name} (${me.email})`);
```

**Raw GraphQL** (no SDK needed):
```bash
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"query": "{ viewer { id name email } }"}'
```

Personal API keys go in the `Authorization` header as-is; OAuth access tokens use `Authorization: Bearer <token>` (with the SDK: `new LinearClient({ accessToken })`).

For OAuth2 apps (multi-user), register at linear.app/settings/api/applications and use the Authorization Code flow (PKCE supported; token endpoint `https://api.linear.app/oauth/token`). Request the narrowest scopes (`read`, `write`, `issues:create`, `comments:create`; `admin` only when needed, e.g. to create webhooks). Pass `actor=app` to act as the app itself (agents, service accounts); refresh tokens are supported.

**Hosted MCP server** — to let an agent use Linear without writing code:
```bash
claude mcp add --transport http linear-server https://mcp.linear.app/mcp
```
Then run `/mcp` in Claude Code to sign in. Use `https://mcp.linear.app/mcp/readonly` for read-only access.

### Step 2: Teams, Labels & Templates

Linear hierarchy: **Workspace → Teams → Projects → Issues**.

```typescript
// List teams
const teams = await linear.teams();
teams.nodes.forEach((t) => console.log(`${t.key}: ${t.name} (${t.id})`));

// Create label
await linear.issueLabelCreate({ teamId: "TEAM_ID", name: "bug", color: "#ef4444" });
```

**Custom workflow states** (GraphQL):
```graphql
mutation { workflowStateCreate(input: {
  teamId: "TEAM_ID", name: "In Review", type: "started", color: "#f59e0b", position: 3
}) { workflowState { id name } } }
```

State types: `backlog`, `unstarted`, `started`, `completed`, `cancelled`.

### Step 3: Issues — CRUD & Bulk Operations

```typescript
// Create an issue
const issue = await linear.issueCreate({
  teamId: "TEAM_ID", title: "Implement user authentication",
  description: "Add OAuth2 login flow with Google and GitHub providers.",
  priority: 2, assigneeId: "USER_ID", labelIds: ["LABEL_ID"],
  estimate: 3, dueDate: "2026-03-15",
});

// Query issues with filters
const issues = await linear.issues({
  filter: {
    team: { key: { eq: "ENG" } },
    state: { type: { in: ["started", "unstarted"] } },
    priority: { lte: 2 },
  }, first: 50,
});

// Bulk cancel stale backlog issues
const stale = await linear.issues({
  filter: { state: { type: { eq: "backlog" } }, label: { name: { eq: "stale" } } },
});
for (const issue of stale.nodes) {
  await issue.update({ stateId: "CANCELLED_STATE_ID" });
}

// Sub-issues and relations
await linear.issueCreate({ teamId: "TEAM_ID", title: "Write auth tests", parentId: "PARENT_ID" });
await linear.issueRelationCreate({ issueId: "A", relatedIssueId: "B", type: "blocks" });
```

### Step 4: Projects & Cycles

```typescript
// Create a project
const project = await linear.projectCreate({
  teamIds: ["TEAM_ID"], name: "Q1 Auth Overhaul",
  description: "Replace legacy auth with OAuth2 + MFA",
  targetDate: "2026-03-31", startDate: "2026-01-15",
  // statusId: "PROJECT_STATUS_ID",  // `state` is deprecated; use statusId
});

// Link issue to project and check progress
await issue.update({ projectId: "PROJECT_ID" });
const proj = await linear.project("PROJECT_ID");
console.log(`Scope done: ${proj.completedScopeCount}/${proj.scopeCount}`); // proj.progress is a 0-1 fraction

// Create a cycle (sprint)
await linear.cycleCreate({
  teamId: "TEAM_ID", name: "Sprint 14",
  startsAt: "2026-02-17T00:00:00Z", endsAt: "2026-03-02T00:00:00Z",
});

// Roll unfinished issues to next cycle
const active = (await linear.cycles({
  filter: { team: { key: { eq: "ENG" } }, isActive: { eq: true } },
})).nodes[0];
const next = (await linear.cycles({
  filter: { team: { key: { eq: "ENG" } }, startsAt: { gt: active.endsAt } }, first: 1,
})).nodes[0];
const unfinished = await linear.issues({
  filter: { cycle: { id: { eq: active.id } }, state: { type: { in: ["unstarted", "started"] } } },
});
for (const issue of unfinished.nodes) await issue.update({ cycleId: next.id });
```

### Step 5: Webhooks & Automation

**Create a webhook** (Settings → API → Webhooks, or via GraphQL):
```graphql
mutation { webhookCreate(input: {
  url: "https://hooks.northwind.dev/linear/webhook", teamId: "TEAM_ID",  # or allPublicTeams: true
  resourceTypes: ["Issue", "Comment", "Project"], enabled: true
}) { webhook { id } } }
```

Creating webhooks requires a workspace admin or an OAuth app with the `admin` scope. Resource types include Issue, Comment, IssueLabel, Project, Cycle, Reaction, Document, User and more.

**Verify and handle webhooks.** The `Linear-Signature` header is a hex HMAC-SHA256 of the *raw* request body, keyed with the webhook's signing secret. Compare in constant time and reject payloads whose `webhookTimestamp` (ms) is more than a minute old:
```typescript
import crypto from "crypto";
import express from "express";

function verifyLinearWebhook(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

app.post("/linear/webhook", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyLinearWebhook(req.body, req.header("linear-signature") ?? "", process.env.LINEAR_WEBHOOK_SECRET!);
  const payload = JSON.parse(req.body.toString());
  if (!ok || Math.abs(Date.now() - payload.webhookTimestamp) > 60_000) return res.sendStatus(401);
  const { action, type, data, updatedFrom } = payload;
  if (type === "Issue" && action === "update" && updatedFrom?.stateId) {
    console.log(`${data.identifier} moved to ${data.state.name}`);
  }
  if (type === "Issue" && action === "create") {
    // Auto-assign by label
    const labels = data.labels?.map((l: any) => l.name) || [];
    const map: Record<string, string> = { frontend: "LEAD_A", backend: "LEAD_B" };
    for (const [label, id] of Object.entries(map)) {
      if (labels.includes(label)) { linear.issueUpdate(data.id, { assigneeId: id }); break; }
    }
  }
  // Auto-triage urgent issues into active cycle
  if (type === "Issue" && data.priority <= 1) {
    linear.cycles({ filter: { team: { id: { eq: data.teamId } }, isActive: { eq: true } } })
      .then(c => { if (c.nodes[0]) linear.issueUpdate(data.id, { cycleId: c.nodes[0].id }); });
  }
  res.sendStatus(200);
});
```

### Step 6: GitHub Integration & Reporting

**GitHub sync** — enable in Settings → Integrations → GitHub. Use branch naming:
```
git checkout -b username/eng-123-fix-login-bug
```
Merged PRs auto-move linked issues to "Done".

**Query team velocity:**
```graphql
query { cycles(filter: { team: { key: { eq: "ENG" } }, isCompleted: { eq: true } }, last: 6) {
  nodes { name completedScopeCount scopeCount startsAt endsAt }
} }
```

**Export issues to CSV:**
```typescript
const writer = createWriteStream("issues.csv");
writer.write("Identifier,Title,State,Priority,Assignee,Created\n");
let cursor: string | undefined;
let hasMore = true;
while (hasMore) {
  const page = await linear.issues({ first: 100, after: cursor });
  for (const issue of page.nodes) {
    const assignee = issue.assignee ? (await issue.assignee).name : "Unassigned";
    const state = (await issue.state)?.name || "Unknown";
    writer.write(`${issue.identifier},"${issue.title}",${state},${issue.priority},${assignee},${issue.createdAt}\n`);
  }
  hasMore = page.pageInfo.hasNextPage;
  cursor = page.pageInfo.endCursor;
}
writer.end();
```

## Examples

### Example 1: Sprint rollover and velocity dashboard

**User prompt:** "Our current sprint ends today. Roll any unfinished issues into Sprint 15 and show me a velocity report for the last 4 completed sprints on the ENG team."

The agent will query the active cycle for the ENG team and find all issues with unstarted or started states. It will then look up the next cycle by start date, update each unfinished issue to the new cycle ID, and report how many issues were moved. For the velocity report, it will query the last 4 completed cycles via GraphQL, extract `completedScopeCount` and `scopeCount` for each, and display a table with sprint name, total scope, completed count, and completion percentage.

### Example 2: Auto-triage pipeline with Slack notifications

**User prompt:** "Set up a webhook so that when any issue is created with the 'bug' label on the Platform team, it gets assigned to the on-call engineer and a Slack message is posted to #platform-bugs with the issue title and link."

The agent will create a Linear webhook subscribed to Issue resource types for the Platform team. It will write an Express handler that verifies the webhook signature, checks for `action: "create"` events where the labels include "bug", updates the issue's assignee to the on-call engineer's user ID, and sends a POST to the Slack webhook URL with a message containing the issue identifier, title, and Linear URL.

## Guidelines

- **Use the SDK for type safety** — the `@linear/sdk` package provides typed methods and pagination helpers; prefer it over raw GraphQL for most operations.
- **Paginate all list queries** — Linear caps results at 250 per page; always check `pageInfo.hasNextPage` and pass `after: endCursor` to avoid silently truncating results.
- **Verify webhook signatures** — validate the `Linear-Signature` header (HMAC-SHA256 over the raw body) and the `webhookTimestamp` before processing any payload, to prevent forged or replayed events. Parsing the body before verifying breaks the signature.
- **Scope webhooks to specific teams** — use the `teamId` parameter when creating webhooks to avoid receiving events from unrelated teams in large workspaces.
- **Use branch naming conventions for GitHub sync** — format branches as `username/TEAM-123-description` so Linear auto-links PRs and moves issues on merge.
- **Batch updates carefully** — Linear has rate limits (varies by plan); add small delays in loops that update many issues and handle rate-limit errors with backoff. Limits: 2,500 requests/hour per user with a personal API key, 5,000 with OAuth, plus a complexity budget and a 10,000-point cap per query. Exceeding them returns HTTP 400 with a `RATELIMITED` error code (not 429); watch the `X-RateLimit-Requests-Remaining` header.
