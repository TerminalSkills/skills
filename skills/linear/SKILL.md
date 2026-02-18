---
name: linear
description: >-
  Manage projects and issues with Linear. Use when a user asks to set up Linear
  workspaces, create issues and projects, automate workflows, build Linear
  integrations, sync issues with GitHub, manage sprints and cycles, set up
  triage processes, build custom views, use Linear's GraphQL API, create
  webhooks, automate issue transitions, or build tools on top of Linear.
  Covers workspace configuration, team workflows, API automation, and
  integration patterns.
license: Apache-2.0
compatibility: "Node.js 18+ or any HTTP client (GraphQL API)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: project-management
  tags: ["linear", "project-management", "issue-tracker", "graphql", "automation", "agile"]
---

# Linear

## Overview

Automate and extend Linear — the streamlined issue tracker for modern software teams. This skill covers workspace setup, team workflow configuration, the GraphQL API for full CRUD on issues/projects/cycles, webhooks for real-time events, GitHub/GitLab sync, and automation patterns for triage, labeling, and sprint management.

## Instructions

### Step 1: Authentication & SDK Setup

Set up API access. Linear uses personal API keys or OAuth2 apps:

**Personal API key** (Settings → API → Personal API keys):
```bash
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxxxxxxxxxx"
```

**Install the SDK** (optional but recommended):
```bash
npm install @linear/sdk
```

**Basic SDK client:**
```typescript
import { LinearClient } from "@linear/sdk";

const linear = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});

// Test connection
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

For OAuth2 apps (multi-user integrations), register at linear.app/settings/api/applications. Use Authorization Code flow with PKCE.

### Step 2: Workspace & Team Configuration

Understand Linear's hierarchy: **Workspace → Teams → Projects → Issues**.

**List teams:**
```typescript
const teams = await linear.teams();
teams.nodes.forEach((team) => {
  console.log(`${team.key}: ${team.name} (${team.id})`);
});
```

**Create workflow states** (customize per team):
```graphql
mutation {
  workflowStateCreate(input: {
    teamId: "TEAM_ID"
    name: "In Review"
    type: "started"
    color: "#f59e0b"
    position: 3
  }) {
    workflowState { id name }
  }
}
```

Standard state types: `backlog`, `unstarted`, `started`, `completed`, `cancelled`.

**Create labels** for categorization:
```typescript
await linear.issueLabelCreate({
  teamId: "TEAM_ID",
  name: "bug",
  color: "#ef4444",
});
```

**Set up templates** for recurring issue types:
```graphql
mutation {
  templateCreate(input: {
    teamId: "TEAM_ID"
    type: "issue"
    name: "Bug Report"
    templateData: {
      title: "[Bug] "
      priority: 2
      labelIds: ["LABEL_ID"]
      description: "## Steps to Reproduce\n\n## Expected Behavior\n\n## Actual Behavior\n\n## Environment\n"
    }
  }) {
    template { id name }
  }
}
```

### Step 3: Issues — CRUD & Bulk Operations

**Create an issue:**
```typescript
const issue = await linear.issueCreate({
  teamId: "TEAM_ID",
  title: "Implement user authentication",
  description: "Add OAuth2 login flow with Google and GitHub providers.",
  priority: 2, // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  stateId: "STATE_ID",
  assigneeId: "USER_ID",
  labelIds: ["LABEL_ID"],
  estimate: 3, // story points
  dueDate: "2026-03-15",
});
console.log(`Created: ${issue.issue?.identifier}`);
```

**Query issues with filters:**
```typescript
const issues = await linear.issues({
  filter: {
    team: { key: { eq: "ENG" } },
    state: { type: { in: ["started", "unstarted"] } },
    assignee: { email: { eq: "dev@company.com" } },
    priority: { lte: 2 }, // urgent + high
  },
  orderBy: LinearDocument.PaginationOrderBy.UpdatedAt,
  first: 50,
});
```

**Bulk update issues** (e.g., move all to a new state):
```typescript
const backlogIssues = await linear.issues({
  filter: {
    team: { key: { eq: "ENG" } },
    state: { type: { eq: "backlog" } },
    label: { name: { eq: "stale" } },
  },
});

for (const issue of backlogIssues.nodes) {
  await issue.update({ stateId: "CANCELLED_STATE_ID" });
}
```

**Sub-issues (child tasks):**
```typescript
await linear.issueCreate({
  teamId: "TEAM_ID",
  title: "Write unit tests for auth module",
  parentId: "PARENT_ISSUE_ID",
});
```

**Relations between issues:**
```typescript
await linear.issueRelationCreate({
  issueId: "ISSUE_A",
  relatedIssueId: "ISSUE_B",
  type: "blocks", // blocks, duplicate, related
});
```

### Step 4: Projects & Roadmaps

**Create a project:**
```typescript
const project = await linear.projectCreate({
  teamIds: ["TEAM_ID"],
  name: "Q1 Auth Overhaul",
  description: "Replace legacy auth with OAuth2 + MFA",
  targetDate: "2026-03-31",
  startDate: "2026-01-15",
  state: "started", // planned, started, paused, completed, cancelled
  icon: "Shield",
  color: "#3b82f6",
});
```

**Add milestones to a project:**
```graphql
mutation {
  projectMilestoneCreate(input: {
    projectId: "PROJECT_ID"
    name: "Beta release"
    targetDate: "2026-02-28"
    sortOrder: 1
  }) {
    projectMilestone { id name }
  }
}
```

**Link issues to a project:**
```typescript
await issue.update({ projectId: "PROJECT_ID" });
```

**Query project progress:**
```typescript
const project = await linear.project("PROJECT_ID");
console.log(`Progress: ${project.progress}%`);
console.log(`Scope: ${project.scopeCount} issues`);
console.log(`Completed: ${project.completedScopeCount}`);
```

### Step 5: Cycles (Sprints)

**Create a cycle:**
```typescript
const cycle = await linear.cycleCreate({
  teamId: "TEAM_ID",
  name: "Sprint 14",
  startsAt: "2026-02-17T00:00:00Z",
  endsAt: "2026-03-02T00:00:00Z",
});
```

**Add issues to a cycle:**
```typescript
await issue.update({ cycleId: "CYCLE_ID" });
```

**Get cycle metrics:**
```typescript
const cycle = await linear.cycle("CYCLE_ID");
console.log(`Scope: ${cycle.scopeCount}`);
console.log(`Completed: ${cycle.completedScopeCount}`);
console.log(`In progress: ${cycle.inProgressScopeCount}`);
console.log(`Unstarted: ${cycle.uncompletedScopeCount}`);
```

**Auto-assign unfinished issues to the next cycle:**
```typescript
const activeCycle = (await linear.cycles({
  filter: { team: { key: { eq: "ENG" } }, isActive: { eq: true } },
})).nodes[0];

const nextCycle = (await linear.cycles({
  filter: {
    team: { key: { eq: "ENG" } },
    startsAt: { gt: activeCycle.endsAt },
  },
  first: 1,
})).nodes[0];

const unfinished = await linear.issues({
  filter: {
    cycle: { id: { eq: activeCycle.id } },
    state: { type: { in: ["unstarted", "started"] } },
  },
});

for (const issue of unfinished.nodes) {
  await issue.update({ cycleId: nextCycle.id });
}
```

### Step 6: Webhooks & Real-Time Events

**Create a webhook** (Settings → API → Webhooks, or via API):
```graphql
mutation {
  webhookCreate(input: {
    url: "https://your-server.com/linear/webhook"
    teamId: "TEAM_ID"
    resourceTypes: ["Issue", "Comment", "Project"]
    enabled: true
  }) {
    webhook { id enabled }
  }
}
```

**Webhook payload structure:**
```json
{
  "action": "update",
  "type": "Issue",
  "data": {
    "id": "issue-id",
    "title": "Fix login bug",
    "state": { "name": "In Progress" },
    "assignee": { "name": "Alice" },
    "priority": 1,
    "updatedAt": "2026-02-18T10:00:00Z"
  },
  "updatedFrom": {
    "stateId": "previous-state-id",
    "priority": 3
  }
}
```

**Verify webhook signatures:**
```typescript
import crypto from "crypto";

function verifyLinearWebhook(body: string, signature: string, secret: string): boolean {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(body);
  return hmac.digest("hex") === signature;
}

// In your handler:
const isValid = verifyLinearWebhook(
  rawBody,
  req.headers["linear-signature"] as string,
  process.env.LINEAR_WEBHOOK_SECRET!
);
```

**Webhook handler example** (Express):
```typescript
app.post("/linear/webhook", (req, res) => {
  const { action, type, data, updatedFrom } = req.body;

  if (type === "Issue" && action === "update") {
    // Detect state changes
    if (updatedFrom?.stateId) {
      console.log(`Issue ${data.identifier} moved to ${data.state.name}`);
    }
    // Detect priority escalation
    if (updatedFrom?.priority && data.priority < updatedFrom.priority) {
      notifySlack(`🚨 ${data.identifier} escalated to priority ${data.priority}`);
    }
  }

  res.sendStatus(200);
});
```

### Step 7: GitHub/GitLab Integration

Linear syncs with GitHub/GitLab for branch tracking and auto-closing issues.

**Enable in Linear:** Settings → Integrations → GitHub → Connect.

**Branch naming convention** (auto-linked):
```
git checkout -b username/eng-123-fix-login-bug
```

When a PR is merged, Linear automatically moves the linked issue to "Done" (configurable).

**Automate via GitHub Actions** (create Linear issue on bug label):
```yaml
name: Sync GitHub Issues to Linear
on:
  issues:
    types: [labeled]

jobs:
  sync:
    if: contains(github.event.label.name, 'bug')
    runs-on: ubuntu-latest
    steps:
      - name: Create Linear Issue
        run: |
          curl -X POST https://api.linear.app/graphql \
            -H "Authorization: ${{ secrets.LINEAR_API_KEY }}" \
            -H "Content-Type: application/json" \
            -d '{
              "query": "mutation($input: IssueCreateInput!) { issueCreate(input: $input) { issue { identifier url } } }",
              "variables": {
                "input": {
                  "teamId": "'"$TEAM_ID"'",
                  "title": "'"${{ github.event.issue.title }}"'",
                  "description": "Synced from GitHub: ${{ github.event.issue.html_url }}",
                  "priority": 2
                }
              }
            }'
```

### Step 8: Automation Rules & Triage

**Set up auto-assignment by label:**
```typescript
// Webhook handler: auto-assign based on label
if (type === "Issue" && action === "create") {
  const labels = data.labels?.map((l: any) => l.name) || [];

  const assignmentMap: Record<string, string> = {
    frontend: "FRONTEND_LEAD_ID",
    backend: "BACKEND_LEAD_ID",
    infra: "INFRA_LEAD_ID",
  };

  for (const [label, assigneeId] of Object.entries(assignmentMap)) {
    if (labels.includes(label)) {
      await linear.issueUpdate(data.id, { assigneeId });
      break;
    }
  }
}
```

**Auto-triage: move high-priority issues to current cycle:**
```typescript
if (type === "Issue" && data.priority <= 1) {
  const activeCycle = (await linear.cycles({
    filter: { team: { id: { eq: data.teamId } }, isActive: { eq: true } },
  })).nodes[0];

  if (activeCycle) {
    await linear.issueUpdate(data.id, { cycleId: activeCycle.id });
  }
}
```

**SLA tracking** (flag overdue issues):
```typescript
const slaDays: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14 }; // priority → max days

const openIssues = await linear.issues({
  filter: {
    state: { type: { in: ["unstarted", "started"] } },
    priority: { lte: 3 },
  },
});

const now = Date.now();
for (const issue of openIssues.nodes) {
  const maxDays = slaDays[issue.priority] || 14;
  const ageDays = (now - new Date(issue.createdAt).getTime()) / 86400000;

  if (ageDays > maxDays) {
    await issue.update({
      labelIds: [...(await issue.labels()).nodes.map((l) => l.id), "SLA_BREACH_LABEL_ID"],
    });
  }
}
```

### Step 9: Custom Views & Reporting

**Query team velocity:**
```graphql
query {
  cycles(filter: { team: { key: { eq: "ENG" } }, isCompleted: { eq: true } }, last: 6) {
    nodes {
      name
      completedScopeCount
      scopeCount
      startsAt
      endsAt
    }
  }
}
```

**Issue distribution by state:**
```typescript
const teams = await linear.teams();
for (const team of teams.nodes) {
  const states = await team.states();
  for (const state of states.nodes) {
    const count = await linear.issueCount({
      filter: { team: { id: { eq: team.id } }, state: { id: { eq: state.id } } },
    });
    console.log(`${team.key} | ${state.name}: ${count}`);
  }
}
```

**Export issues to CSV:**
```typescript
import { createWriteStream } from "fs";

const writer = createWriteStream("issues.csv");
writer.write("Identifier,Title,State,Priority,Assignee,Created\n");

let hasMore = true;
let cursor: string | undefined;

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
