---
name: jira
description: >-
  Manage projects, issues, and workflows with Jira Cloud. Use when a user asks
  to set up Jira projects, create and manage issues, configure workflows, build
  Jira integrations, automate issue transitions, set up boards (Scrum/Kanban),
  manage sprints, use Jira REST API v3, create webhooks, build custom JQL
  queries, configure permissions and schemes, set up automation rules, or
  integrate Jira with CI/CD pipelines. Covers project administration, issue
  tracking, agile boards, API automation, and Atlassian Connect/Forge apps.
license: Apache-2.0
compatibility: Node.js 18+ or any HTTP client (REST API v3)
metadata:
  author: terminal-skills
  version: 1.0.0
  category: productivity
  tags:
    - jira
    - atlassian
    - project-management
    - issue-tracker
    - agile
---

# Jira

## Overview

Automate and extend Jira Cloud — the most widely used issue tracker and project management tool. This skill covers project setup, issue CRUD, workflow configuration, Scrum and Kanban boards, sprint management, JQL (Jira Query Language) for advanced searches, REST API v3 for automation, webhooks, and building Atlassian Forge apps.

## Instructions

### Step 1: Authentication

```typescript
// Basic auth with API token — simplest for scripts and integrations.
// Generate token at: https://id.atlassian.com/manage-profile/security/api-tokens
const JIRA_BASE = "https://your-domain.atlassian.net";
const AUTH = Buffer.from(`your-email@company.com:${process.env.JIRA_API_TOKEN}`).toString("base64");

async function jira(method: string, path: string, body?: any) {
  const res = await fetch(`${JIRA_BASE}/rest/api/3${path}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Jira ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
// For Marketplace apps, use OAuth 2.0 (3LO) — register at developer.atlassian.com
```

### Step 2: Projects & Issue Types

```typescript
// Create a project: projectTypeKey = "software" | "business" | "service_desk"
const project = await jira("POST", "/project", {
  key: "ENG",                     // 2-10 char uppercase key (ENG-1, ENG-2)
  name: "Engineering",
  projectTypeKey: "software",
  leadAccountId: "5f1234abc...",
  description: "Core product engineering",
});
// Default software issue types: Epic, Story, Task, Bug, Sub-task

// Custom issue type (requires admin)
const customType = await jira("POST", "/issuetype", {
  name: "Tech Debt", type: "standard", hierarchyLevel: 0,
});
```

### Step 3: Issues — CRUD & Bulk Operations

```typescript
// Create an issue (descriptions use Atlassian Document Format, not plain text)
const issue = await jira("POST", "/issue", {
  fields: {
    project: { key: "ENG" },
    issuetype: { name: "Story" },
    summary: "Implement user authentication flow",
    description: {
      type: "doc", version: 1,
      content: [{ type: "paragraph", content: [{ type: "text", text: "Build OAuth2 login with MFA support." }] }],
    },
    priority: { name: "High" },       // Highest, High, Medium, Low, Lowest
    labels: ["auth", "security"],
    assignee: { accountId: "5f1234abc..." },
    customfield_10016: 8,              // Story points (custom field ID varies)
    components: [{ name: "Backend" }],
  },
});

// Transition through workflow (e.g., To Do → In Progress)
const transitions = await jira("GET", `/issue/${issue.key}/transitions`);
const target = transitions.transitions.find((t: any) => t.name === "In Progress");
await jira("POST", `/issue/${issue.key}/transitions`, {
  transition: { id: target.id },
});

// Bulk create (up to 50 per request)
const bulkResult = await jira("POST", "/issue/bulk", {
  issueUpdates: [
    { fields: { project: { key: "ENG" }, issuetype: { name: "Task" }, summary: "Set up CI pipeline" } },
    { fields: { project: { key: "ENG" }, issuetype: { name: "Bug" }, summary: "Fix login timeout", priority: { name: "High" } } },
  ],
});
```

### Step 4: JQL — Jira Query Language

```typescript
// JQL search — paginated via startAt/maxResults
const myBugs = await jira("POST", "/search", {
  jql: `project = ENG AND issuetype = Bug AND priority in (High, Highest)
    AND assignee = currentUser() AND sprint in openSprints()
    ORDER BY priority DESC`,
  maxResults: 50, fields: ["summary", "status", "priority", "assignee"],
});

// Stale work detection
const staleIssues = await jira("POST", "/search", {
  jql: `project = ENG AND status != Done AND updated <= -14d ORDER BY updated ASC`,
  maxResults: 100, fields: ["summary", "status", "assignee", "updated"],
});

// Key JQL functions: currentUser(), membersOf("team"), openSprints(),
// futureSprints(), startOfDay(), endOfWeek(), startOfMonth(-1)
```

### Step 5: Boards & Sprints (Agile API)

```typescript
// Agile API uses a separate base path: /rest/agile/1.0
async function agile(method: string, path: string, body?: any) {
  const res = await fetch(`${JIRA_BASE}/rest/agile/1.0${path}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Agile ${method} ${path}: ${res.status}`);
  return res.json();
}

// Boards, sprints, sprint issues
const boards = await agile("GET", "/board?type=scrum");
const sprints = await agile("GET", `/board/${boardId}/sprint?state=active`);
const sprintIssues = await agile("GET", `/sprint/${sprints.values[0].id}/issue?fields=summary,status,assignee`);

// Create sprint, move issues, close sprint
const newSprint = await agile("POST", "/sprint", {
  name: "Sprint 24", startDate: "2026-02-24T09:00:00.000Z",
  endDate: "2026-03-07T17:00:00.000Z", originBoardId: boardId,
  goal: "Complete auth module and API v2 migration",
});
await agile("POST", `/sprint/${newSprint.id}/issue`, { issues: ["ENG-142", "ENG-143"] });
await agile("POST", `/sprint/${newSprint.id}`, { state: "closed", completeDate: new Date().toISOString() });
```

### Step 6: Webhooks & Automation

```typescript
// Register a webhook for issue events
const webhook = await jira("POST", "/webhook", {
  name: "Epic completion handler",
  url: "https://your-app.com/webhook/jira",
  events: ["jira:issue_updated"],
  filters: { "issue-related-events-section": `project = ENG AND issuetype = Epic` },
});

// Webhook handler: auto-transition Epic children when Epic is marked Done
app.post("/webhook/jira", async (req, res) => {
  res.sendStatus(200);
  const { issue, changelog } = req.body;
  const statusChange = changelog?.items?.find((i: any) => i.field === "status" && i.toString === "Done");
  if (!statusChange || issue.fields.issuetype.name !== "Epic") return;

  const children = await jira("POST", "/search", {
    jql: `"Epic Link" = ${issue.key} AND status != Done`, fields: ["status"],
  });
  for (const child of children.issues) {
    const tr = await jira("GET", `/issue/${child.key}/transitions`);
    const done = tr.transitions.find((t: any) => t.name === "Done");
    if (done) await jira("POST", `/issue/${child.key}/transitions`, { transition: { id: done.id } });
  }
});
```

### Step 7: Dashboards & Reporting

```typescript
// Calculate velocity from closed sprints
async function getVelocity(boardId: number, sprintCount = 5) {
  const closedSprints = await agile("GET", `/board/${boardId}/sprint?state=closed&maxResults=${sprintCount}`);
  return Promise.all(closedSprints.values.map(async (sprint: any) => {
    const issues = await agile("GET", `/sprint/${sprint.id}/issue?fields=customfield_10016,status`);
    const points = issues.issues
      .filter((i: any) => i.fields.status.statusCategory.key === "done")
      .reduce((sum: number, i: any) => sum + (i.fields.customfield_10016 || 0), 0);
    return { sprint: sprint.name, points };
  }));
}

// Create a shared filter (saved JQL query)
const filter = await jira("POST", "/filter", {
  name: "Sprint Burndown - ENG",
  jql: "project = ENG AND sprint in openSprints() ORDER BY rank ASC",
  sharePermissions: [{ type: "project", project: { id: project.id } }],
});
```

### Step 8: Permissions

```typescript
// Check permissions and add users to project roles
const permission = await jira("GET", `/mypermissions?projectKey=ENG&permissions=EDIT_ISSUES,ASSIGN_ISSUES`);
await jira("POST", `/project/${projectKey}/role/${roleId}`, {
  user: ["accountId1", "accountId2"],
});
// Common roles: 10002=Administrators, 10001=Developers, 10000=Users
```

## Examples

### Example 1: Set up a new Scrum project with sprint and initial backlog
**User prompt:** "Create a Jira project called 'Payments' with key PAY. Set up a two-week sprint starting next Monday. Create 5 stories for building a Stripe integration: webhook handler, checkout flow, subscription management, refund processing, and payment dashboard. Assign them all to the new sprint with story points."

The agent will:
1. Create the project via `POST /project` with `projectTypeKey: "software"` and key `PAY`.
2. Find the board ID for the new project using the Agile API.
3. Create a sprint with a two-week window starting from next Monday.
4. Bulk-create 5 Story issues with descriptive summaries, appropriate story point estimates (3, 5, 8, 5, 3), and labels like `payments` and `stripe`.
5. Move all 5 issues into the new sprint using `POST /sprint/{id}/issue`.

### Example 2: Generate a weekly stale issues report
**User prompt:** "Find all unresolved ENG issues that haven't been updated in over 14 days. Group them by assignee and tell me who has the most stale work."

The agent will:
1. Run a JQL search: `project = ENG AND status != Done AND updated <= -14d ORDER BY assignee ASC, updated ASC` with fields for summary, status, assignee, and updated date.
2. Group the results by assignee account ID.
3. Output a summary showing each assignee, their count of stale issues, and the oldest one by last update date.
4. Highlight any issues not updated in over 30 days as critical.

## Guidelines

- Use API tokens (basic auth) for scripts and personal integrations; OAuth 2.0 (3LO) is only needed for Marketplace apps that act on behalf of multiple users.
- Jira Cloud uses Atlassian Document Format (ADF) for descriptions and comments, not plain text; always construct the `{ type: "doc", version: 1, content: [...] }` structure.
- Custom field IDs (like `customfield_10016` for story points) vary between Jira instances; use `GET /issue/createmeta` to discover the correct field IDs for your project.
- The Agile API (`/rest/agile/1.0`) is separate from the core API (`/rest/api/3`); use it for boards, sprints, backlog, and ranking operations.
- JQL search results are paginated with a default limit of 50; use `startAt` and `maxResults` to iterate through large result sets.
- When transitioning issues, always fetch available transitions first with `GET /issue/{key}/transitions`; transition IDs are not stable across different workflow configurations.
