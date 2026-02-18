---
name: clickup
description: >-
  Automate and integrate with ClickUp. Use when a user asks to manage tasks,
  lists, and spaces via the ClickUp API, build automations and webhooks, create
  custom fields, set up time tracking, manage sprints and goals, integrate
  ClickUp with external tools, build dashboards, automate task assignments, sync
  with GitHub or Slack, or extend ClickUp with custom workflows. Covers API v2,
  webhooks, custom fields, automations, and reporting.
license: Apache-2.0
compatibility: 'Any HTTP client or Node.js 18+ (ClickUp API v2, REST)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: productivity
  tags:
    - clickup
    - project-management
    - task-management
    - automation
    - api
---

# ClickUp

## Overview

Automate and extend ClickUp — the all-in-one productivity platform. This skill covers the full ClickUp API v2 for managing workspaces, spaces, folders, lists, and tasks programmatically. Includes webhooks for real-time events, custom fields, time tracking, goals, automations, and integration patterns with GitHub, Slack, and CI/CD pipelines.

## Instructions

### Step 1: Authentication & API Setup

Get an API token from ClickUp Settings → Apps → API Token (personal), or create an OAuth2 app for multi-user integrations.

```bash
export CLICKUP_API_TOKEN="pk_xxxxxxxxxxxxxxxxxxxx"

curl -s https://api.clickup.com/api/v2/user \
  -H "Authorization: $CLICKUP_API_TOKEN" | python3 -m json.tool
```

**Helper module** (Node.js):
```typescript
const BASE = "https://api.clickup.com/api/v2";
const TOKEN = process.env.CLICKUP_API_TOKEN;

async function clickup(method: string, path: string, body?: any) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: TOKEN!, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return res.json();
}
```

For OAuth2 (multi-user), redirect to `https://app.clickup.com/api?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`, then exchange the code at `POST /api/v2/oauth/token`.

### Step 2: Workspace Hierarchy

ClickUp's hierarchy: **Workspace → Spaces → Folders → Lists → Tasks → Subtasks**.

```typescript
// List workspaces (teams)
const teams = await clickup("GET", "/team");

// List spaces
const spaces = await clickup("GET", `/team/${teamId}/space?archived=false`);

// Create a folder and list
const folder = await clickup("POST", `/space/${spaceId}/folder`, { name: "Q1 2026 Roadmap" });
const list = await clickup("POST", `/folder/${folderId}/list`, {
  name: "Sprint 14", content: "Feb 17 — Mar 2, 2026", due_date: 1772524800000, priority: 2,
});
```

### Step 3: Tasks — CRUD & Bulk Operations

```typescript
// Create a task
const task = await clickup("POST", `/list/${listId}/task`, {
  name: "Implement OAuth2 login",
  description: "Add Google and GitHub OAuth2 providers.",
  assignees: [userId1], tags: ["backend", "auth"],
  status: "to do", priority: 2, due_date: 1772524800000,
  time_estimate: 28800000, // 8 hours in ms
});

// Get tasks with filters
const tasks = await clickup("GET",
  `/list/${listId}/task?archived=false&order_by=due_date&statuses[]=in+progress&subtasks=true`);

// Update a task
await clickup("PUT", `/task/${taskId}`, {
  status: "in progress", priority: 1,
  assignees: { add: [newUserId], rem: [oldUserId] },
});

// Create subtask, comment, checklist, dependency
await clickup("POST", `/list/${listId}/task`, { name: "Write tests", parent: parentTaskId });
await clickup("POST", `/task/${taskId}/comment`, { comment_text: "Blocked by auth outage." });
await clickup("POST", `/task/${taskId}/dependency`, { depends_on: blockingTaskId });
```

### Step 4: Custom Fields & Time Tracking

```typescript
// List custom fields for a list
const fields = await clickup("GET", `/list/${listId}/field`);

// Set custom field values (dropdown, number, text, date)
await clickup("POST", `/task/${taskId}/field/${fieldId}`, { value: "option_uuid" });
await clickup("POST", `/task/${taskId}/field/${numberFieldId}`, { value: 42 });

// Log time entry
await clickup("POST", `/task/${taskId}/time`, {
  start: Date.now(), end: Date.now() + 3600000,
  time: 3600000, billable: true, tags: [{ name: "development" }],
});

// Get workspace time entries for last 7 days
const entries = await clickup("GET",
  `/team/${teamId}/time_entries?start_date=${Date.now() - 7 * 86400000}&end_date=${Date.now()}`);
```

### Step 5: Goals & Webhooks

```typescript
// Create a goal with key results
const goal = await clickup("POST", `/team/${teamId}/goal`, {
  name: "Reduce P1 bug count by 50%", due_date: 1772524800000, owners: [userId],
});
await clickup("POST", `/goal/${goalId}/key_result`, {
  name: "P1 bugs resolved", type: "number", steps_start: 0, steps_end: 12, unit: "bugs",
});

// Create a webhook
const webhook = await clickup("POST", `/team/${teamId}/webhook`, {
  endpoint: "https://your-server.com/clickup/webhook",
  events: ["taskCreated", "taskStatusUpdated", "taskPriorityUpdated", "taskCommentPosted"],
});
```

**Webhook handler** (Express):
```typescript
app.post("/clickup/webhook", async (req, res) => {
  const signature = req.headers["x-signature"];
  const hmac = crypto.createHmac("sha256", process.env.CLICKUP_WEBHOOK_SECRET!);
  hmac.update(JSON.stringify(req.body));
  if (hmac.digest("hex") !== signature) return res.sendStatus(401);
  res.sendStatus(200);

  const { event, task_id, history_items } = req.body;
  if (event === "taskStatusUpdated" && history_items[0].after.status === "review") {
    await clickup("PUT", `/task/${task_id}`, { assignees: { add: [reviewerUserId] } });
  }
});
```

### Step 6: Integrations

**GitHub** — include task ID in branches or PR titles for auto-linking:
```
git checkout -b feature/CU-abc123-oauth-login
```

**Slack notifications:**
```typescript
async function notifySlack(text: string) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel: "#engineering", text }),
  });
}
```

**CI/CD — create task on failure** (GitHub Actions):
```yaml
- name: Create ClickUp bug
  if: failure()
  run: |
    curl -X POST "https://api.clickup.com/api/v2/list/${{ secrets.CLICKUP_BUG_LIST_ID }}/task" \
      -H "Authorization: ${{ secrets.CLICKUP_API_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{"name":"[CI] Build failure: ${{ github.ref_name }}","priority":2,"tags":["ci-failure"]}'
```

## Examples

### Example 1: Sprint planning with velocity tracking

**User prompt:** "Set up a new sprint list for Sprint 15 (Mar 3-16, 2026) in the Engineering space, move all unfinished tasks from Sprint 14 into it, and show me a velocity report for the last 3 sprints."

The agent will create a new list named "Sprint 15" under the Engineering space with the specified date range. It will query Sprint 14's list for tasks with statuses "to do" or "in progress", then batch-update each task's list to the new Sprint 15 list. Finally, it will iterate over the last three sprint list IDs, count total vs. completed tasks and time estimates in each, and output a velocity table showing completion rates and estimated hours delivered per sprint.

### Example 2: Automated on-call bug workflow with Slack alerts

**User prompt:** "Create a webhook that watches for urgent tasks in the Bug Triage list and notifies #oncall in Slack with the task name and assignee. Also set up a GitHub Actions step that auto-creates a ClickUp bug task when CI fails on main."

The agent will create a ClickUp webhook scoped to the Bug Triage list listening for `taskPriorityUpdated` events. It will write an Express webhook handler that verifies the signature, checks if the new priority is urgent (1), fetches the task details, and sends a formatted Slack message to `#oncall` with the task name, URL, and assignee. For CI, it will add a GitHub Actions step that runs on failure, calling the ClickUp API to create a task in the Bug Triage list with the branch name, commit SHA, and a link to the failed run.

## Guidelines

- **Always verify the API token first** — call `GET /api/v2/user` before running any automation to confirm the token is valid and has access to the target workspace.
- **Use pagination for large task lists** — the tasks endpoint returns 100 results per page by default; always check for `last_page: false` and increment the `page` parameter to avoid missing records.
- **Rate-limit bulk operations** — ClickUp enforces 100 requests per minute per token; add a small delay between calls when looping over tasks, and use batch patterns where possible.
- **Scope webhooks narrowly** — use the optional `space_id`, `folder_id`, or `list_id` parameters when creating webhooks to avoid processing irrelevant events from the entire workspace.
- **Validate webhook signatures** — always verify the `x-signature` header using HMAC-SHA256 with your webhook secret before processing any payload to prevent spoofed requests.
- **Never hardcode task or list IDs** — store them in environment variables or fetch them dynamically by name, since IDs change across environments and workspace copies.
