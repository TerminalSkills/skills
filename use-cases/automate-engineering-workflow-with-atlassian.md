---
title: Automate Engineering Workflow with Atlassian Stack
slug: automate-engineering-workflow-with-atlassian
description: "Build an integration layer that connects Jira, Confluence, and Bitbucket — auto-create Confluence RFCs from Jira epics, link PRs to issues, generate sprint reports, and sync deployment status across the stack."
skills: [jira, confluence, bitbucket]
category: business
tags: [jira, confluence, bitbucket, atlassian, automation, engineering, devops]
---

# Automate Engineering Workflow with Atlassian Stack

## The Problem

Nadia is a tech lead at a 35-person SaaS company using the full Atlassian stack — Jira for issue tracking, Confluence for docs, and Bitbucket for code. But nothing talks to each other beyond basic links.

Engineers create Jira tickets, then manually create matching Confluence pages for RFCs. PRs don't link back to issues unless someone remembers. Sprint retrospective docs are copy-pasted from Jira into Confluence every two weeks. When code deploys, nobody updates the Jira ticket — so the PM asks "is this live yet?" in Slack, and the engineer checks the pipeline manually.

The worst part: stale PRs. Nobody notices when a PR sits untouched for a week because there's no automated nudge. Code reviews fall through the cracks, and features ship late.

Nadia wants a single Express service that listens to webhooks from all three platforms and automates the glue work.

## The Solution

Using the **jira**, **confluence**, and **bitbucket** skills, build a Node.js webhook server that handles five cross-tool workflows: RFC page creation from Jira Epics, automatic PR-to-issue linking, deployment status sync, sprint report generation in Confluence, and daily stale PR reminders. One server, one API token per platform, five automations.

## Step-by-Step Walkthrough

### Step 1: Project Setup and API Clients

The project structure keeps each workflow in its own file under `flows/`, with shared API clients in `clients.ts`:

```bash
mkdir atlassian-glue && cd atlassian-glue
npm init -y
npm install express node-cron
npm install -D typescript @types/node @types/express
```

All three Atlassian products share one API token for Jira and Confluence (same site), while Bitbucket uses a separate App Password. Each client is a thin wrapper around `fetch`:

```typescript
// src/clients.ts
const SITE = process.env.ATLASSIAN_SITE!;
const ATLASSIAN_AUTH = Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`
).toString("base64");
const BB_AUTH = Buffer.from(
  `${process.env.BB_USERNAME}:${process.env.BB_APP_PASSWORD}`
).toString("base64");

export async function jira(method: string, path: string, body?: any) {
  const res = await fetch(`${SITE}/rest/api/3${path}`, {
    method,
    headers: {
      Authorization: `Basic ${ATLASSIAN_AUTH}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Jira ${method} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// confluence() hits /wiki/rest/api, bb() hits api.bitbucket.org/2.0
// agile() hits /rest/agile/1.0 for sprint/board operations
```

### Step 2: Epic to Confluence RFC Page

When someone creates a Jira Epic with the label "rfc", a Confluence page appears automatically under the Engineering space's "RFCs" parent page, pre-filled with the RFC template. The page links back to the Epic, and a comment on the Epic links forward to the page.

```typescript
// src/flows/rfc.ts
export async function handleEpicCreated(issue: any) {
  if (issue.fields.issuetype.name !== "Epic") return;
  if (!issue.fields.labels?.includes("rfc")) return;

  const epicKey = issue.key;
  const epicTitle = issue.fields.summary;

  // Find the RFCs parent page in the Engineering space
  const rfcParent = await confluence("GET",
    `/content?title=RFCs&spaceKey=${process.env.CONFLUENCE_SPACE_KEY}&type=page`
  );
  const parentId = rfcParent.results[0]?.id;

  // Create the RFC page from template, link back to Epic
  const page = await confluence("POST", "/content", {
    type: "page",
    title: `RFC: ${epicTitle}`,
    space: { key: process.env.CONFLUENCE_SPACE_KEY },
    ancestors: [{ id: parentId }],
    body: { storage: { value: rfcTemplate({ epicKey, title: epicTitle }), representation: "storage" } },
  });

  // Bidirectional linking: remote link on the Epic + comment with URL
  await jira("POST", `/issue/${epicKey}/remotelink`, {
    globalId: `confluence-${page.id}`,
    relationship: "RFC Document",
    object: { url: `${SITE}/wiki/spaces/ENG/pages/${page.id}`, title: `RFC: ${epicTitle}` },
  });
}
```

No more "I created the ticket but forgot to make the RFC page." The label is the trigger, and everything else happens in under two seconds.

### Step 3: PR to Jira Issue Linking

Branch names like `feature/ENG-142-auth` contain the Jira key. When a PR opens, a regex extracts all Jira keys from the branch name and PR title, then for each key: adds the PR as a remote link, transitions the issue to "In Review", and posts a comment with the PR details.

```typescript
// src/flows/pr-link.ts
const JIRA_KEY_PATTERN = /([A-Z]+-\d+)/g;

export async function handlePRCreated(payload: any) {
  const pr = payload.pullrequest;
  const branchName = pr.source.branch.name;

  const keysFromBranch = branchName.match(JIRA_KEY_PATTERN) || [];
  const keysFromTitle = pr.title.match(JIRA_KEY_PATTERN) || [];
  const issueKeys = [...new Set([...keysFromBranch, ...keysFromTitle])];

  for (const issueKey of issueKeys) {
    // Add PR as remote link on the Jira issue
    await jira("POST", `/issue/${issueKey}/remotelink`, {
      globalId: `bitbucket-pr-${pr.id}`,
      relationship: "Pull Request",
      object: { url: pr.links.html.href, title: `PR #${pr.id}: ${pr.title}` },
    });

    // Auto-transition to "In Review"
    const transitions = await jira("GET", `/issue/${issueKey}/transitions`);
    const inReview = transitions.transitions.find(
      (t: any) => t.name.toLowerCase().includes("review")
    );
    if (inReview) {
      await jira("POST", `/issue/${issueKey}/transitions`, { transition: { id: inReview.id } });
    }
  }
}
```

### Step 4: Deployment Status Sync

When a Bitbucket Pipeline deploys to staging or production, the handler scans recent commit messages for Jira keys, then updates each issue with the deployment environment and timestamp. Production deployments auto-transition issues to "Done."

```typescript
// src/flows/deploy.ts
export async function handlePipelineCompleted(payload: any) {
  const pipeline = payload.commit_status;
  if (pipeline.state !== "SUCCESSFUL") return;

  // Determine environment from pipeline name
  const name = (pipeline.name || "").toLowerCase();
  const environment = name.includes("prod") ? "production"
    : name.includes("stag") ? "staging" : null;
  if (!environment) return;

  // Scan last 20 commits for Jira keys
  const commits = await bb("GET", `/repositories/${pipeline.repository.full_name}/commits?pagelen=20`);
  const issueKeys = new Set<string>();
  for (const commit of commits.values) {
    (commit.message.match(JIRA_KEY_PATTERN) || []).forEach((k: string) => issueKeys.add(k));
  }

  for (const issueKey of issueKeys) {
    await jira("PUT", `/issue/${issueKey}`, {
      fields: { customfield_10100: environment, customfield_10101: new Date().toISOString() },
    });
    // Production deploys auto-transition to "Done"
    if (environment === "production") {
      const transitions = await jira("GET", `/issue/${issueKey}/transitions`);
      const done = transitions.transitions.find((t: any) => t.name === "Done");
      if (done) await jira("POST", `/issue/${issueKey}/transitions`, { transition: { id: done.id } });
    }
  }
}
```

### Step 5: Sprint Report Generation

When a sprint closes, the handler pulls all issues from the Jira Agile API, separates completed vs. carryover, calculates velocity against the last 5 sprints, and publishes a full report as a Confluence page under "Sprint Reports." The page includes a summary table, completed issues, carryover list, and velocity trend — all formatted in Confluence's storage format with tables and macros.

```typescript
// src/flows/sprint-report.ts
export async function generateSprintReport(sprintId: number, boardId: number) {
  const sprint = await agile("GET", `/sprint/${sprintId}`);
  const issues = await agile("GET", `/sprint/${sprintId}/issue?maxResults=200`);

  const completed = issues.issues.filter((i: any) => i.fields.status.statusCategory.key === "done");
  const incomplete = issues.issues.filter((i: any) => i.fields.status.statusCategory.key !== "done");

  const pointsCompleted = completed.reduce(
    (sum: number, i: any) => sum + (i.fields.customfield_10016 || 0), 0
  );

  // Build the Confluence page with summary stats, issue tables, velocity trend
  const page = await confluence("POST", "/content", {
    type: "page",
    title: `${sprint.name} Report — ${new Date().toISOString().split("T")[0]}`,
    space: { key: process.env.CONFLUENCE_SPACE_KEY },
    body: { storage: { value: buildReportHtml(sprint, completed, incomplete, pointsCompleted), representation: "storage" } },
  });
}
```

### Step 6: Stale PR Alerts and Server Wiring

A daily cron job at 9 AM checks every open PR across all repos. Anything untouched for more than 3 days gets a reminder comment tagging the author. The Express server ties everything together with two webhook endpoints and the cron:

```typescript
// src/index.ts
const app = express();
app.use(express.json());

app.post("/webhook/jira", async (req, res) => {
  res.sendStatus(200);
  const { webhookEvent, issue, sprint } = req.body;
  if (webhookEvent === "jira:issue_created") await handleEpicCreated(issue);
  if (webhookEvent === "sprint_closed" && sprint) {
    await generateSprintReport(sprint.id, sprint.originBoardId);
  }
});

app.post("/webhook/bitbucket", async (req, res) => {
  res.sendStatus(200);
  const event = req.headers["x-event-key"];
  if (event === "pullrequest:created") await handlePRCreated(req.body);
  if (event === "repo:commit_status_updated") await handlePipelineCompleted(req.body);
});

// Daily stale PR check at 9:00 AM weekdays
cron.schedule("0 9 * * 1-5", () => checkStalePRs());

app.listen(3000, () => console.log("Atlassian Glue running on port 3000"));
```

## Real-World Example

Nadia deploys the service on a Friday. By Monday, the team has already noticed the difference.

An engineer creates Epic ENG-204 with the label "rfc" for a new caching layer. Within seconds, a Confluence page titled "RFC: Implement Redis Caching Layer" appears under the Engineering space, pre-filled with the template and linked back to the Epic. No more "I'll create the RFC page later" — it already exists.

Over the week, three PRs land with branch names like `feature/ENG-204-cache-config`. Each one auto-links to the Epic and transitions it to "In Review." When the pipeline deploys to staging, ENG-204 updates with the deploy timestamp. When it hits production, it transitions to "Done" automatically.

On sprint close, a Confluence page materializes with the full report: 42 of 48 story points completed, 89% velocity, 3 carryover items. The PM stops spending 45 minutes every other week assembling that report by hand.

The stale PR alert catches two forgotten reviews in the first week — one had been sitting for 6 days with no comments. After a month, the team's average PR review time drops from 3.2 days to 1.1 days.

Five webhooks, one Express server, zero manual glue work between Jira, Confluence, and Bitbucket.
