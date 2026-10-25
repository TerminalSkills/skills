---
name: clickup
description: >-
  Automate and integrate with ClickUp. Use when a user asks to manage tasks,
  lists, and spaces via the ClickUp API, build automations and webhooks, create
  custom fields, set up time tracking, manage sprints and goals, integrate
  ClickUp with external tools, build dashboards, automate task assignments, sync
  with GitHub or Slack, or extend ClickUp with custom workflows. Covers API v2
  (plus the v3 move-task call), webhooks, custom fields, and time reports.
license: Apache-2.0
compatibility: 'Any HTTP client or Node.js 18+ (ClickUp API v2, REST)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: productivity
  tags: "clickup, project-management, task-management, automation, api"
---

# ClickUp

## Overview

Automate and extend ClickUp — the all-in-one productivity platform. This skill covers the full ClickUp API v2 for managing workspaces, spaces, folders, lists, and tasks programmatically. Includes webhooks for real-time events, custom fields, time tracking, goals, and integration patterns with Slack and CI/CD pipelines. ClickUp's in-app Automations have no public API; build external automations with webhooks.

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

For OAuth2 (multi-user), redirect to `https://app.clickup.com/api?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}`, then exchange `client_id`, `client_secret` and `code` at `POST /api/v2/oauth/token`. OAuth access tokens are sent as `Authorization: Bearer <token>` (personal `pk_` tokens are sent bare, as above) and currently do not expire.

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
  name: "Sprint 14", content: "Feb 17 — Mar 2, 2026", due_date: 1772409600000, priority: 2,
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
await clickup("POST", `/task/${taskId}/comment`, { comment_text: "Blocked by auth outage.", notify_all: false });
await clickup("POST", `/task/${taskId}/dependency`, { depends_on: blockingTaskId });

// Move a task to another list (v3 endpoint; PUT /task cannot change the list)
await fetch(`https://api.clickup.com/api/v3/workspaces/${teamId}/tasks/${taskId}/home_list/${newListId}`, {
  method: "PUT", headers: { Authorization: TOKEN!, "Content-Type": "application/json" }, body: "{}",
});
```

Task fields `due_date`, `start_date` are Unix milliseconds; add `due_date_time: true` if the time of day matters. The `teamId` from `GET /team` is the workspace ID. If the task's status does not exist in the new list, pass `status_mappings` (source and destination status IDs from `GET /task/{id}`) in the move body.

### Step 4: Custom Fields & Time Tracking

```typescript
// List custom fields for a list
const fields = await clickup("GET", `/list/${listId}/field`);

// Set custom field values (dropdown, number, text, date)
await clickup("POST", `/task/${taskId}/field/${fieldId}`, { value: "option_uuid" });
await clickup("POST", `/task/${taskId}/field/${numberFieldId}`, { value: 42 });

// Log a time entry (POST /task/{id}/time is the legacy endpoint)
await clickup("POST", `/team/${teamId}/time_entries`, {
  tid: taskId, start: Date.now() - 3600000, duration: 3600000,
  billable: true, description: "OAuth callback",
});

// Time entries for the last 7 days (defaults to the token owner; pass assignee for others)
const entries = await clickup("GET",
  `/team/${teamId}/time_entries?start_date=${Date.now() - 7 * 86400000}&end_date=${Date.now()}&assignee=${userId}`);
```

### Step 5: Goals & Webhooks

```typescript
// Create a goal with key results
const goal = await clickup("POST", `/team/${teamId}/goal`, {
  name: "Reduce P1 bug count by 50%", due_date: 1772524800000, description: "Q1 reliability goal",
  multiple_owners: false, owners: [userId], color: "#32a852",
});
await clickup("POST", `/goal/${goalId}/key_result`, {
  name: "P1 bugs resolved", owners: [userId], type: "number",
  steps_start: 0, steps_end: 12, unit: "bugs", task_ids: [], list_ids: [],
});

// Create a webhook
const webhook = await clickup("POST", `/team/${teamId}/webhook`, {
  endpoint: "https://your-server.com/clickup/webhook",
  events: ["taskCreated", "taskStatusUpdated", "taskPriorityUpdated", "taskCommentPosted"],
  list_id: bugListId, // optional scope: space_id, folder_id, list_id or task_id; events: ["*"] = all
});
const webhookSecret = webhook.webhook.secret; // returned only on creation: store it as CLICKUP_WEBHOOK_SECRET
```

**Webhook handler** (Express):
```typescript
import crypto from "node:crypto";

// Sign-check needs the raw body, so mount express.raw on this route (not express.json).
app.post("/clickup/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const expected = crypto.createHmac("sha256", process.env.CLICKUP_WEBHOOK_SECRET!)
    .update(req.body).digest("hex");
  const received = String(req.headers["x-signature"] ?? "");
  if (received.length !== expected.length ||
      !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) {
    return res.sendStatus(401);
  }
  res.sendStatus(200);

  const { event, task_id, history_items } = JSON.parse(req.body.toString("utf8"));
  if (event === "taskStatusUpdated" && history_items?.[0]?.after?.status === "review") {
    await clickup("PUT", `/task/${task_id}`, { assignees: { add: [reviewerUserId] } });
  }
});
```

### Step 6: Integrations

**GitHub** — the ClickUp GitHub integration (enabled in ClickUp, not through this API) links branches, commits and PRs that contain the task ID:
```bash
git checkout -b feature/CU-86a3x9k2m-oauth-login
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

The agent will create a new list named "Sprint 15" under the Engineering space with the specified date range. It will query Sprint 14's list for tasks with statuses "to do" or "in progress", then move each task to the new Sprint 15 list with the v3 move-task endpoint. Finally, it will iterate over the last three sprint list IDs, count total vs. completed tasks and time estimates in each, and output a velocity table showing completion rates and estimated hours delivered per sprint.

### Example 2: Automated on-call bug workflow with Slack alerts

**User prompt:** "Create a webhook that watches for urgent tasks in the Bug Triage list and notifies #oncall in Slack with the task name and assignee. Also set up a GitHub Actions step that auto-creates a ClickUp bug task when CI fails on main."

The agent will create a ClickUp webhook scoped to the Bug Triage list listening for `taskPriorityUpdated` events. It will write an Express webhook handler that verifies the signature on the raw body, checks if the new priority is urgent (1), fetches the task details, and sends a formatted Slack message to `#oncall` with the task name, URL, and assignee. For CI, it will add a GitHub Actions step that runs on failure, calling the ClickUp API to create a task in the Bug Triage list with the branch name, commit SHA, and a link to the failed run.

## Guidelines

- **Always verify the API token first** — call `GET /api/v2/user` before running any automation to confirm the token is valid and has access to the target workspace.
- **Use pagination for large task lists** — the tasks endpoint returns at most 100 tasks per page; request `page=0`, `1`, ... until `last_page` is true. Closed tasks need `include_closed=true`, and tasks whose home list is another list need `include_timl=true`.
- **Respect rate limits** — per token and per minute: 100 on Free Forever, Unlimited and Business, 1,000 on Business Plus, 10,000 on Enterprise. A 429 response carries `X-RateLimit-Limit`, `X-RateLimit-Remaining` and `X-RateLimit-Reset` (Unix time); wait until reset before retrying.
- **Scope webhooks narrowly** — use the optional `space_id`, `folder_id`, or `list_id` parameters when creating webhooks to avoid processing irrelevant events from the entire workspace.
- **Validate webhook signatures** — always verify the `X-Signature` header (hex HMAC-SHA256 of the raw body, keyed with the `webhook.secret` returned when the webhook was created) before processing any payload.
- **Never hardcode task or list IDs** — store them in environment variables or fetch them dynamically by name, since IDs change across environments and workspace copies.
