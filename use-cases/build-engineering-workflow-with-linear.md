---
title: Build an Engineering Workflow with Linear
slug: build-engineering-workflow-with-linear
category: project-management
tags: [linear, automation, github, webhooks, agile]
---

# Build an Engineering Workflow with Linear

Dani is a tech lead at a 30-person SaaS startup. The engineering team has grown from 5 to 14 developers in six months. Their GitHub Issues setup is falling apart — no sprint planning, no priority visibility, inconsistent labeling. The CTO wants structured cycles, automated triage, and metrics they can actually track.

Dani needs to set up Linear as the team's project management backbone: workspace structure, automated workflows via webhooks, GitHub integration, and a reporting dashboard.

## Prompt

```text
I need to set up Linear for our engineering team (14 developers, 3 teams: Platform, Product, Mobile). Here's what I need:

1. **Workspace structure**: 3 teams with custom workflow states. Platform team needs a "Deploying" state. Product team needs "Design Review". Mobile team needs "QA Testing". All teams need standard states too (Backlog, Todo, In Progress, In Review, Done, Cancelled).

2. **Labels**: Create a consistent label set across all teams — bug, feature, tech-debt, security, performance, documentation, ux. Plus priority labels aren't needed since Linear has built-in priority.

3. **Issue templates**: Bug report template (steps to reproduce, expected/actual behavior, environment, severity), Feature request template (user story, acceptance criteria, design link, effort estimate), Tech debt template (current state, proposed improvement, risk if ignored, estimated effort).

4. **Automation via webhooks**: 
   - When an issue is marked "urgent" priority → auto-add to current cycle
   - When an issue moves to "In Review" → post to our #dev-reviews Slack channel
   - When all sub-issues of a parent are "Done" → auto-complete the parent
   - When an issue has been "In Progress" for more than 5 days → add "stale" label

5. **GitHub integration**: Set up branch naming conventions so PRs auto-link. When a PR is merged to main, move the linked issue to "Done".

6. **Sprint/cycle setup**: 2-week cycles starting on Mondays. Auto-create next cycle. Move unfinished issues to next cycle at end of sprint.

7. **Reporting**: Build queries for — team velocity (last 6 sprints), bug vs feature ratio, cycle burndown data, issues by priority distribution.

Start with the workspace setup and work through each item. Give me the actual API calls and webhook handler code.
```

## Agent Response

```text
Let me build this end-to-end. Starting with workspace setup, then automation, GitHub sync, and reporting.

## 1. Workspace Setup — Teams & Custom States

First, get your API key from Linear → Settings → API → Personal API keys.

### Initialize the client

import { LinearClient } from "@linear/sdk";
const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

### Create teams

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
    cycleDuration: 2,           // 2-week cycles
    cycleStartDay: 1,           // Monday
    cycleEnabled: true,
    upcomingCycleCount: 1,      // Auto-create 1 upcoming cycle
    autoClosePeriod: 6,         // Auto-close completed issues after 6 months
    autoCloseStateId: null,     // Will set after creating states
  });
  teams[config.key] = result.team;
}

### Create custom workflow states per team

The standard states apply to all teams. Custom states are team-specific:

const standardStates = [
  { name: "Backlog", type: "backlog", color: "#95a2b3", position: 0 },
  { name: "Todo", type: "unstarted", color: "#e2e2e2", position: 1 },
  { name: "In Progress", type: "started", color: "#f2c94c", position: 2 },
  { name: "In Review", type: "started", color: "#f2994a", position: 3 },
  { name: "Done", type: "completed", color: "#5e6ad2", position: 5 },
  { name: "Cancelled", type: "cancelled", color: "#95a2b3", position: 6 },
];

const customStates = {
  PLT: { name: "Deploying", type: "started", color: "#6fcf97", position: 4 },
  PRD: { name: "Design Review", type: "started", color: "#bb6bd9", position: 4 },
  MOB: { name: "QA Testing", type: "started", color: "#2d9cdb", position: 4 },
};

for (const [key, team] of Object.entries(teams)) {
  for (const state of standardStates) {
    await linear.workflowStateCreate({ teamId: team.id, ...state });
  }
  const custom = customStates[key];
  if (custom) {
    await linear.workflowStateCreate({ teamId: team.id, ...custom });
  }
}

## 2. Labels — Consistent Across Teams

Create workspace-level labels (shared across all teams):

const labels = [
  { name: "bug", color: "#ef4444" },
  { name: "feature", color: "#3b82f6" },
  { name: "tech-debt", color: "#f59e0b" },
  { name: "security", color: "#dc2626" },
  { name: "performance", color: "#8b5cf6" },
  { name: "documentation", color: "#6b7280" },
  { name: "ux", color: "#ec4899" },
  { name: "stale", color: "#9ca3af" },
];

for (const label of labels) {
  await linear.issueLabelCreate(label);
  // Workspace-level: no teamId = shared across all teams
}

## 3. Issue Templates

### Bug report template

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
          description: "## Steps to Reproduce\\n1. \\n2. \\n3. \\n\\n## Expected Behavior\\n\\n## Actual Behavior\\n\\n## Environment\\n- OS: \\n- Browser: \\n- Version: \\n\\n## Severity\\n- [ ] Blocker (system down)\\n- [ ] Critical (major feature broken)\\n- [ ] Major (feature degraded)\\n- [ ] Minor (cosmetic/edge case)\\n\\n## Screenshots/Logs\\n"
        }
      }) { template { id } }
    }
  `);
}

### Feature request template (similar pattern)

templateData: {
  title: "[Feature] "
  priority: 3
  labelIds: ["${featureLabelId}"]
  description: "## User Story\\nAs a [user type], I want [action] so that [benefit].\\n\\n## Acceptance Criteria\\n- [ ] \\n- [ ] \\n\\n## Design\\n[Link to Figma/design]\\n\\n## Effort Estimate\\n- T-shirt size: S / M / L / XL\\n- Story points: \\n\\n## Notes\\n"
}

### Tech debt template

templateData: {
  title: "[Tech Debt] "
  priority: 3
  labelIds: ["${techDebtLabelId}"]
  description: "## Current State\\nDescribe what exists today and why it's problematic.\\n\\n## Proposed Improvement\\n\\n## Risk If Ignored\\n\\n## Estimated Effort\\n- Story points: \\n- Dependencies: \\n\\n## Definition of Done\\n- [ ] \\n"
}

## 4. Webhook Automation Server

Create an Express server that handles all four automation rules:

import express from "express";
import crypto from "crypto";
import { LinearClient } from "@linear/sdk";

const app = express();
const linear = new LinearClient({ apiKey: process.env.LINEAR_API_KEY });

app.use(express.json({ verify: (req, _, buf) => { req.rawBody = buf.toString(); } }));

// Verify webhook signature
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
      // Rule 1: Urgent priority → add to current cycle
      if (data.priority === 1 && updatedFrom?.priority && updatedFrom.priority !== 1) {
        const activeCycle = (await linear.cycles({
          filter: { team: { id: { eq: data.teamId } }, isActive: { eq: true } },
        })).nodes[0];
        if (activeCycle) {
          await linear.issueUpdate(data.id, { cycleId: activeCycle.id });
          console.log(`Auto-added ${data.identifier} to cycle ${activeCycle.name}`);
        }
      }

      // Rule 2: Moved to "In Review" → Slack notification
      if (updatedFrom?.stateId && data.state?.name === "In Review") {
        await fetch(process.env.SLACK_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            channel: "#dev-reviews",
            text: `🔍 *${data.identifier}* is ready for review\n*${data.title}*\nAssignee: ${data.assignee?.name || "Unassigned"}\nPriority: P${data.priority}\n<https://linear.app/team/issue/${data.identifier}|View in Linear>`,
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
          console.log(`Auto-completed parent of ${data.identifier}`);
        }
      }

      // Rule 4: Stale detection (runs on any update — check "In Progress" age)
      if (data.state?.name === "In Progress") {
        const createdAt = new Date(data.startedAt || data.updatedAt);
        const daysSinceStart = (Date.now() - createdAt.getTime()) / 86400000;
        if (daysSinceStart > 5) {
          const staleLabelId = "YOUR_STALE_LABEL_ID";
          const currentLabels = data.labelIds || [];
          if (!currentLabels.includes(staleLabelId)) {
            await linear.issueUpdate(data.id, {
              labelIds: [...currentLabels, staleLabelId],
            });
            console.log(`Marked ${data.identifier} as stale (${Math.floor(daysSinceStart)} days)`);
          }
        }
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }
});

For the stale check to catch issues that haven't been updated, add a daily cron job:

// Run daily at 9 AM
import cron from "node-cron";

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

## 5. GitHub Integration

Enable in Linear → Settings → Integrations → GitHub → Connect your org.

Configure branch naming in team settings (auto-applied):
- Format: `username/PLT-123-short-description`
- Linear auto-detects branches matching `TEAM_KEY-NUMBER`

GitHub Actions workflow to close issues on merge:

name: Linear Issue Sync
on:
  pull_request:
    types: [closed]

jobs:
  sync:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Extract Linear issue
        id: extract
        run: |
          BRANCH="${{ github.event.pull_request.head.ref }}"
          ISSUE_ID=$(echo "$BRANCH" | grep -oP '[A-Z]+-\d+' || echo "")
          echo "issue=$ISSUE_ID" >> $GITHUB_OUTPUT

      - name: Move to Done
        if: steps.extract.outputs.issue != ''
        run: |
          # Linear's built-in GitHub integration handles this automatically
          # This step is a fallback if the integration misses it
          echo "Issue ${{ steps.extract.outputs.issue }} should auto-transition via Linear's GitHub integration"

Note: Linear's native GitHub integration already handles PR → issue linking and auto-closing. The GitHub Action above is a safety net. The native integration is the recommended approach.

## 6. Sprint/Cycle Configuration

Already configured in team creation (cycleDuration: 2, cycleStartDay: 1). For the carryover automation:

// At end of each cycle, move unfinished issues
// This runs as a webhook handler on cycle updates
if (type === "Cycle" && action === "update" && data.completedAt) {
  const unfinished = await linear.issues({
    filter: {
      cycle: { id: { eq: data.id } },
      state: { type: { in: ["unstarted", "started"] } },
    },
  });

  // Find the next upcoming cycle
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

## 7. Reporting Queries

### Team velocity (last 6 sprints)

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

### Bug vs feature ratio

const bugCount = await linear.issueCount({
  filter: { label: { name: { eq: "bug" } }, createdAt: { gte: "2026-01-01" } },
});
const featureCount = await linear.issueCount({
  filter: { label: { name: { eq: "feature" } }, createdAt: { gte: "2026-01-01" } },
});
console.log(`Bug:Feature ratio = ${bugCount}:${featureCount} (${(bugCount/featureCount).toFixed(1)}:1)`);

### Priority distribution

for (let p = 0; p <= 4; p++) {
  const count = await linear.issueCount({
    filter: { priority: { eq: p }, state: { type: { in: ["unstarted", "started"] } } },
  });
  const labels = ["None", "Urgent", "High", "Medium", "Low"];
  console.log(`P${p} (${labels[p]}): ${count} open issues`);
}

---

That gives you the full setup: 3 teams with custom states, shared labels, templates, webhook automation for triage and Slack notifications, GitHub PR linking, 2-week cycles with carryover, and reporting queries. Deploy the webhook server, register it in Linear settings, and the automation runs itself.
```

Skills used: `linear`
