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
  version: 1.1.0
  category: productivity
  repository: https://developer.atlassian.com/cloud/jira/platform/rest/v3/
  tags: "jira, atlassian, project-management, issue-tracker, agile"
---

# Jira

## Overview

Automate and extend Jira Cloud — the most widely used issue tracker and project management tool. This skill covers project setup, issue CRUD, workflow configuration, Scrum and Kanban boards, sprint management, JQL (Jira Query Language) for advanced searches, REST API v3 for automation, webhooks, and building Atlassian Forge apps.

## Instructions

### Step 1: Authentication

```typescript
// Basic auth with API token — simplest for scripts and integrations.
// Generate token at: https://id.atlassian.com/manage-profile/security/api-tokens
const JIRA_BASE = "https://acme-eng.atlassian.net";
const AUTH = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString("base64");

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
// Set JIRA_EMAIL and JIRA_API_TOKEN in the environment; never hard-code them.
```

### Step 2: Projects & Issue Types

```typescript
// Create a project: projectTypeKey = "software" | "business" | "service_desk" | "customer_service"
// (give a projectTemplateKey, or at least the type; the template must match the type)
const project = await jira("POST", "/project", {
  key: "ENG",                     // 2-10 char uppercase key (ENG-1, ENG-2)
  name: "Engineering",
  projectTypeKey: "software",
  leadAccountId: process.env.JIRA_LEAD_ACCOUNT_ID, // from GET /myself or /user/search?query=
  projectTemplateKey: "com.pyxis.greenhopper.jira:gh-simplified-agility-scrum", // Scrum; ...-kanban for Kanban
  description: "Core product engineering",
});
// Default software issue types: Epic, Story, Task, Bug, Sub-task

// Custom issue type (requires admin)
const customType = await jira("POST", "/issuetype", {
  name: "Tech Debt", hierarchyLevel: 0, // 0 = standard (Story/Task level; the default), -1 = sub-task
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
    assignee: { accountId: process.env.JIRA_ASSIGNEE_ACCOUNT_ID },
    [process.env.JIRA_STORY_POINTS_FIELD!]: 8, // e.g. "customfield_10016"; the ID differs per site
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
// JQL search: POST /search/jql. The old /search endpoint is being removed.
// It has no startAt and no total: pass the returned nextPageToken until isLast is true.
// Without "fields" only the issue id comes back.
const myBugs = await jira("POST", "/search/jql", {
  jql: `project = ENG AND issuetype = Bug AND priority in (High, Highest)
    AND assignee = currentUser() AND sprint in openSprints()
    ORDER BY priority DESC`,
  maxResults: 50, fields: ["summary", "status", "priority", "assignee"],
});

// Stale work detection
const staleIssues = await jira("POST", "/search/jql", {
  jql: `project = ENG AND statusCategory != Done AND updated <= -14d ORDER BY updated ASC`,
  maxResults: 100, fields: ["summary", "status", "assignee", "updated"],
});

// Next page: repeat the call with nextPageToken: myBugs.nextPageToken (while !myBugs.isLast)
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
  return res.status === 204 ? null : res.json(); // moving issues into a sprint answers 204
}

// Boards, sprints, sprint issues
const boards = await agile("GET", "/board?type=scrum");
const boardId = boards.values[0].id;
const sprints = await agile("GET", `/board/${boardId}/sprint?state=active`);
// GET /sprint/{id}/issue is deprecated; search the sprint with JQL instead
const sprintIssues = await jira("POST", "/search/jql", {
  jql: `sprint = ${sprints.values[0].id}`, fields: ["summary", "status", "assignee"], maxResults: 100,
});

// Create sprint, move issues, close sprint
const newSprint = await agile("POST", "/sprint", {
  name: "Sprint 24", startDate: "2026-11-02T09:00:00.000Z",
  endDate: "2026-11-13T17:00:00.000Z", originBoardId: boardId,
  goal: "Complete auth module and API v2 migration",
});
await agile("POST", `/sprint/${newSprint.id}/issue`, { issues: ["ENG-142", "ENG-143"] });
await agile("POST", `/sprint/${newSprint.id}`, { state: "active" }); // start it first (dates required)
await agile("POST", `/sprint/${newSprint.id}`, { state: "closed" }); // only an active sprint can be closed
```

### Step 6: Webhooks

```typescript
// POST /rest/api/3/webhook ("dynamic webhooks") works only for Connect and OAuth 2.0 apps,
// so an API-token script cannot call it. For a script, a Jira admin creates the webhook in
// Settings > System > WebHooks (URL, events, optional JQL filter), or uses an
// Automation rule with a "Send web request" action.
// Handler: when an Epic is marked Done, close its open children.
app.post("/webhook/jira/ENG-epics", async (req, res) => {
  res.sendStatus(200);
  const { issue, changelog } = req.body;
  const statusChange = changelog?.items?.find((i: any) => i.field === "status" && i.toString === "Done");
  if (!statusChange || issue.fields.issuetype.name !== "Epic") return;

  // "Epic Link" is deprecated; children of an Epic are found with parent
  const children = await jira("POST", "/search/jql", {
    jql: `parent = ${issue.key} AND statusCategory != Done`, fields: ["status"],
  });
  for (const child of children.issues) {
    const tr = await jira("GET", `/issue/${child.key}/transitions`);
    const done = tr.transitions.find((t: any) => t.to.statusCategory.key === "done");
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
    const pointsField = process.env.JIRA_STORY_POINTS_FIELD!; // find it with GET /field
    const issues = await jira("POST", "/search/jql", {
      jql: `sprint = ${sprint.id} AND statusCategory = Done`, fields: [pointsField], maxResults: 100,
    }); // follow nextPageToken for sprints with more than 100 issues
    const points = issues.issues.reduce((sum: number, i: any) => sum + (i.fields[pointsField] || 0), 0);
    return { sprint: sprint.name, points };
  }));
}

// Create a shared filter (saved JQL query)
const filter = await jira("POST", "/filter", {
  name: "Sprint Burndown - ENG",
  jql: "project = ENG AND sprint in openSprints() ORDER BY rank ASC",
  sharePermissions: [{ type: "project", projectId: project.id }],
});
```

### Step 8: Permissions

```typescript
// Check permissions and add users to project roles
const permission = await jira("GET", `/mypermissions?projectKey=ENG&permissions=EDIT_ISSUES,ASSIGN_ISSUES`);
const roles = await jira("GET", "/project/ENG/role");   // { "Developers": ".../role/10001", ... }
const roleId = roles["Developers"].split("/").pop();    // role IDs differ per site
await jira("POST", `/project/ENG/role/${roleId}`, {
  user: [process.env.JIRA_ASSIGNEE_ACCOUNT_ID],         // account IDs, not emails
});
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
1. Run a JQL search: `project = ENG AND statusCategory != Done AND updated <= -14d ORDER BY assignee ASC, updated ASC` via `POST /search/jql` with fields for summary, status, assignee, and updated date.
2. Group the results by assignee account ID.
3. Output a summary showing each assignee, their count of stale issues, and the oldest one by last update date.
4. Highlight any issues not updated in over 30 days as critical.

## Guidelines

- Use API tokens (basic auth) for scripts and personal integrations; OAuth 2.0 (3LO) is only needed for Marketplace apps that act on behalf of multiple users.
- Jira Cloud uses Atlassian Document Format (ADF) for descriptions and comments, not plain text; always construct the `{ type: "doc", version: 1, content: [...] }` structure.
- Custom field IDs (story points is often `customfield_10016`) vary between sites; look them up with `GET /field` or `GET /issue/createmeta/{projectKey}/issuetypes/{issueTypeId}` (the bare `/issue/createmeta` is deprecated).
- The Agile API (`/rest/agile/1.0`) is separate from the core API (`/rest/api/3`); use it for boards, sprints, backlog, and ranking operations.
- Use `POST /search/jql`; the old `/search` is being removed. It pages with `nextPageToken` (no `startAt`, no total) and returns only issue IDs unless you list `fields`.
- `POST /webhook` and dynamic webhooks are for Connect and OAuth apps only; a basic-auth script registers webhooks in the admin UI instead.
- When transitioning issues, always fetch available transitions first with `GET /issue/{key}/transitions`; transition IDs are not stable across different workflow configurations.
