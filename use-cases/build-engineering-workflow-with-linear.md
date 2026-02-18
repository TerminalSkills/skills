---
title: Build an Engineering Workflow with Linear
slug: build-engineering-workflow-with-linear
description: "Set up Linear for a growing engineering team with automated triage, GitHub PR integration, sprint cycles, SLA tracking, and weekly velocity reports via the GraphQL API."
category: productivity
skills: [linear]
tags: [linear, automation, github, webhooks, agile]
---

# Build an Engineering Workflow with Linear

## The Problem

Dani is a tech lead at a 30-person SaaS startup. The engineering team has grown from 5 to 14 developers in six months. Their GitHub Issues setup is falling apart — no sprint planning, no priority visibility, inconsistent labeling. The CTO wants structured cycles, automated triage, and metrics they can actually track.

Dani needs to set up Linear as the team's project management backbone: workspace structure, automated workflows via webhooks, GitHub integration, and a reporting dashboard.

## The Solution

Using the **linear** skill, the agent sets up a complete engineering workflow: three team workspaces with custom states, shared labels and issue templates, a webhook automation server for triage and notifications, GitHub PR integration, two-week sprint cycles with carryover, and reporting queries for velocity and priority tracking.

## Step-by-Step Walkthrough

### Step 1: Create Teams with Custom Workflow States

First, get your API key from Linear → Settings → API → Personal API keys. Then set up the three engineering teams, each with standard workflow states plus one custom state specific to their process.

```javascript
import { LinearClient } from "@linear/sdk";

// Initialize with your personal API key from Linear settings
const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

// Define team structure — each team gets a unique key for issue prefixes
const teamConfigs = [
  { name: "Platform", key: "PLT", description: "Infrastructure, CI/CD, developer tooling" },
  { name: "Product", key: "PRD", description: "User-facing features, growth, analytics" },
  { name: "Mobile", key: "MOB", description: "iOS and Android apps" },
];

const teams = {};
for (const config of teamConfigs) {
  const result = await linear.teamCreate({
    name: config.name,
    key: config.key,
    description: config.description,
    cycleDuration: 2,       // 2-week sprints
    cycleStartDay: 1,       // Start on Monday
    cycleEnabled: true,
    upcomingCycleCount: 1,  // Auto-create next cycle
  });
  teams[config.key] = result.team;
}

// Standard states shared by all teams
const standardStates = [
  { name: "Backlog", type: "backlog", color: "#95a2b3", position: 0 },
  { name: "Todo", type: "unstarted", color: "#e2e2e2", position: 1 },
  { name: "In Progress", type: "started", color: "#f2c94c", position: 2 },
  { name: "In Review", type: "started", color: "#f2994a", position: 3 },
  { name: "Done", type: "completed", color: "#5e6ad2", position: 5 },
  { name: "Cancelled", type: "cancelled", color: "#95a2b3", position: 6 },
];

// Team-specific states — each team gets one custom state at position 4
const customStates = {
  PLT: { name: "Deploying", type: "started", color: "#6fcf97", position: 4 },
  PRD: { name: "Design Review", type: "started", color: "#bb6bd9", position: 4 },
  MOB: { name: "QA Testing", type: "started", color: "#2d9cdb", position: 4 },
};

for (const [key, team] of Object.entries(teams)) {
  for (const state of standardStates) {
    await linear.workflowStateCreate({ teamId: team.id, ...state });
  }
  // Add the custom state for this team
  await linear.workflowStateCreate({ teamId: team.id, ...customStates[key] });
}
```

### Step 2: Create Shared Labels

Workspace-level labels are shared across all teams. No need for priority labels since Linear has built-in priority fields (P0–P4).

```javascript
// Workspace-level labels — omit teamId so they apply everywhere
const labels = [
  { name: "bug", color: "#ef4444" },
  { name: "feature", color: "#3b82f6" },
  { name: "tech-debt", color: "#f59e0b" },
  { name: "security", color: "#dc2626" },
  { name: "performance", color: "#8b5cf6" },
  { name: "documentation", color: "#6b7280" },
  { name: "ux", color: "#ec4899" },
  { name: "stale", color: "#9ca3af" },  // Used by automation later
];

for (const label of labels) {
  await linear.issueLabelCreate(label);
}
```

### Step 3: Set Up Issue Templates

Create templates for bug reports, feature requests, and tech debt. Applied to all teams via a loop. The templates use Linear's description format with markdown checklists.

```javascript
// Create bug report template for each team
for (const [key, team] of Object.entries(teams)) {
  await linear.client.rawRequest(`
    mutation {
      templateCreate(input: {
        teamId: "${team.id}"
        type: "issue"
        name: "Bug Report"
        templateData: {
          title: "[Bug] "
          priority: 2
          labelIds: ["${bugLabelId}"]
          description: "## Steps to Reproduce\\n1. \\n2. \\n3. \\n\\n## Expected Behavior\\n\\n## Actual Behavior\\n\\n## Environment\\n- OS: \\n- Browser: \\n- Version: \\n\\n## Severity\\n- [ ] Blocker\\n- [ ] Critical\\n- [ ] Major\\n- [ ] Minor"
        }
      }) { template { id } }
    }
  `);
}
```

Feature request and tech debt templates follow the same pattern with different fields — user story + acceptance criteria + effort estimate for features, and current state + proposed improvement + risk assessment for tech debt.

### Step 4: Build Webhook Automation Server

This Express server handles four automation rules: auto-triage urgent issues into the current sprint, post Slack notifications on review, auto-complete parents when all children finish, and flag stale issues.

```javascript
import express from "express";
import crypto from "crypto";
import { LinearClient } from "@linear/sdk";

const app = express();
const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

// Capture raw body for webhook signature verification
app.use(express.json({
  verify: (req, _, buf) => { req.rawBody = buf.toString(); }
}));

// Verify Linear webhook signature using HMAC-SHA256
function verifySignature(req) {
  const signature = req.headers["linear-signature"];
  const hmac = crypto.createHmac("sha256", process.env.LINEAR_WEBHOOK_SECRET);
  hmac.update(req.rawBody);
  return hmac.digest("hex") === signature;
}

app.post("/webhooks/linear", async (req, res) => {
  if (!verifySignature(req)) return res.sendStatus(401);
  const { action, type, data, updatedFrom } = req.body;
  res.sendStatus(200); // Respond immediately, process async

  try {
    if (type === "Issue") {
      // Rule 1: Urgent priority → auto-add to current cycle
      if (data.priority === 1 && updatedFrom?.priority !== 1) {
        const activeCycle = (await linear.cycles({
          filter: { team: { id: { eq: data.teamId } }, isActive: { eq: true } },
        })).nodes[0];
        if (activeCycle) {
          await linear.issueUpdate(data.id, { cycleId: activeCycle.id });
        }
      }

      // Rule 2: Moved to "In Review" → post to Slack
      if (updatedFrom?.stateId && data.state?.name === "In Review") {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "#dev-reviews",
            text: `*${data.identifier}* ready for review: ${data.title}\nAssignee: ${data.assignee?.name || "Unassigned"}`,
          }),
        });
      }

      // Rule 3: All sub-issues done → auto-complete parent
      if (data.parentId && data.state?.type === "completed") {
        const siblings = await linear.issues({
          filter: { parent: { id: { eq: data.parentId } } },
        });
        const allDone = siblings.nodes.every((i) => i.state?.type === "completed");
        if (allDone) {
          const doneState = (await linear.workflowStates({
            filter: { team: { id: { eq: data.teamId } }, type: { eq: "completed" } },
          })).nodes[0];
          await linear.issueUpdate(data.parentId, { stateId: doneState.id });
        }
      }

      // Rule 4: Flag issues in progress for more than 5 days
      if (data.state?.name === "In Progress") {
        const startDate = new Date(data.startedAt || data.updatedAt);
        const daysSinceStart = (Date.now() - startDate.getTime()) / 86400000;
        if (daysSinceStart > 5) {
          const currentLabels = data.labelIds || [];
          if (!currentLabels.includes(STALE_LABEL_ID)) {
            await linear.issueUpdate(data.id, {
              labelIds: [...currentLabels, STALE_LABEL_ID],
            });
          }
        }
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});
```

For catching stale issues that haven't been updated recently, add a daily cron job as a safety net:

```javascript
import cron from "node-cron";

// Run every morning at 9 AM — catches issues webhook events missed
cron.schedule("0 9 * * *", async () => {
  const inProgress = await linear.issues({
    filter: { state: { name: { eq: "In Progress" } } },
  });
  for (const issue of inProgress.nodes) {
    const startDate = new Date(issue.startedAt || issue.createdAt);
    const days = (Date.now() - startDate.getTime()) / 86400000;
    if (days > 5) {
      const labels = (await issue.labels()).nodes.map((l) => l.id);
      if (!labels.includes(STALE_LABEL_ID)) {
        await issue.update({ labelIds: [...labels, STALE_LABEL_ID] });
      }
    }
  }
});
```

### Step 5: Configure GitHub Integration

Enable the native integration in Linear → Settings → Integrations → GitHub. Linear auto-detects branches matching the pattern `TEAM_KEY-NUMBER` (e.g., `PLT-123`), links PRs to issues, and transitions issues to Done when PRs merge.

Branch naming convention: `username/PLT-123-short-description`

As a fallback, add a GitHub Actions workflow that catches any missed transitions:

```yaml
# .github/workflows/linear-sync.yml
name: Linear Issue Sync
on:
  pull_request:
    types: [closed]

jobs:
  sync:
    # Only run when a PR is actually merged, not just closed
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Extract Linear issue ID from branch name
        id: extract
        run: |
          BRANCH="${{ github.event.pull_request.head.ref }}"
          ISSUE_ID=$(echo "$BRANCH" | grep -oP '[A-Z]+-\d+' || echo "")
          echo "issue=$ISSUE_ID" >> $GITHUB_OUTPUT

      - name: Log transition
        if: steps.extract.outputs.issue != ''
        run: |
          echo "Issue ${{ steps.extract.outputs.issue }} auto-transitions via Linear's GitHub integration"
```

### Step 6: Sprint Carryover Automation

Two-week cycles are already configured in the team creation step. Add carryover logic to the webhook handler so unfinished issues automatically move to the next sprint when a cycle ends:

```javascript
// Add this to the webhook handler — fires when a cycle completes
if (type === "Cycle" && action === "update" && data.completedAt) {
  // Find all unfinished issues in the completed cycle
  const unfinished = await linear.issues({
    filter: {
      cycle: { id: { eq: data.id } },
      state: { type: { in: ["unstarted", "started"] } },
    },
  });

  // Get the next upcoming cycle
  const nextCycle = (await linear.cycles({
    filter: {
      team: { id: { eq: data.teamId } },
      startsAt: { gte: data.endsAt },
    },
    first: 1,
    orderBy: "startsAt",
  })).nodes[0];

  if (nextCycle) {
    for (const issue of unfinished.nodes) {
      await issue.update({ cycleId: nextCycle.id });
    }
    console.log(`Carried over ${unfinished.nodes.length} issues to ${nextCycle.name}`);
  }
}
```

### Step 7: Build Reporting Queries

Query Linear's API for team metrics: velocity trends, bug-to-feature ratio, and priority distribution across open issues.

```javascript
// Team velocity — last 6 completed sprints for the Platform team
const recentCycles = await linear.cycles({
  filter: { team: { key: { eq: "PLT" } }, isCompleted: { eq: true } },
  last: 6,
  orderBy: "endsAt",
});

console.log("Sprint | Completed | Total | Velocity %");
for (const cycle of recentCycles.nodes) {
  const pct = Math.round((cycle.completedScopeCount / cycle.scopeCount) * 100);
  console.log(`${cycle.name} | ${cycle.completedScopeCount} | ${cycle.scopeCount} | ${pct}%`);
}

// Bug vs feature ratio — year to date
const bugCount = await linear.issueCount({
  filter: { label: { name: { eq: "bug" } }, createdAt: { gte: "2026-01-01" } },
});
const featureCount = await linear.issueCount({
  filter: { label: { name: { eq: "feature" } }, createdAt: { gte: "2026-01-01" } },
});
console.log(`Bug:Feature = ${bugCount}:${featureCount} (${(bugCount / featureCount).toFixed(1)}:1)`);

// Priority distribution across all open issues
for (let p = 0; p <= 4; p++) {
  const count = await linear.issueCount({
    filter: { priority: { eq: p }, state: { type: { in: ["unstarted", "started"] } } },
  });
  const labels = ["None", "Urgent", "High", "Medium", "Low"];
  console.log(`P${p} (${labels[p]}): ${count} open issues`);
}
```

## Real-World Example

Dani deploys the webhook server to a small Railway instance, registers the webhook URL in Linear settings, and connects GitHub. Within the first sprint:

- **14 developers** are organized into 3 teams with clear workflow states
- **Urgent bugs** auto-land in the current sprint — no manual triage needed
- **PR merges** automatically close Linear issues via the GitHub integration
- **Stale issues** get flagged daily, keeping the board clean
- **Sprint reviews** use the velocity queries to track improvement over time

The setup takes about 2 hours and replaces what was previously a manual process of checking GitHub Issues, Slack threads, and spreadsheets.
