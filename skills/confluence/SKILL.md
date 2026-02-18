---
name: confluence
description: >-
  Manage knowledge bases and documentation with Confluence Cloud. Use when a
  user asks to create or manage Confluence spaces, pages, and blogs, build
  documentation systems, automate page creation from templates, use Confluence
  REST API v2, manage page trees and hierarchies, set up permissions, integrate
  Confluence with Jira or other tools, generate reports from Confluence data,
  build macros or Forge apps, or migrate content between spaces. Covers content
  management, API automation, templates, and Atlassian ecosystem integration.
license: Apache-2.0
compatibility: Node.js 18+ or any HTTP client (REST API v2)
metadata:
  author: terminal-skills
  version: 1.0.0
  category: documents
  tags:
    - confluence
    - atlassian
    - documentation
    - wiki
    - knowledge-base
---

# Confluence

## Overview

Automate and extend Confluence Cloud — Atlassian's wiki and knowledge management platform. This skill covers space and page management, the REST API v2, content creation with Atlassian Document Format (ADF), page trees, templates, labels, permissions, Jira integration, and building Forge apps.

## Instructions

### Step 1: Authentication

```typescript
// Basic auth with API token (same token works for Jira and Confluence).
// Generate at: https://id.atlassian.com/manage-profile/security/api-tokens
const CONFLUENCE_BASE = "https://your-domain.atlassian.net";
const AUTH = Buffer.from(`your-email@company.com:${process.env.ATLASSIAN_API_TOKEN}`).toString("base64");

// REST API v2 (preferred)
async function confluence(method: string, path: string, body?: any) {
  const res = await fetch(`${CONFLUENCE_BASE}/wiki/api/v2${path}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Confluence ${method} ${path}: ${res.status}`);
  return res.status === 204 ? null : res.json();
}

// V1 API (still needed for templates, macros, CQL search)
async function confluenceV1(method: string, path: string, body?: any) {
  const res = await fetch(`${CONFLUENCE_BASE}/wiki/rest/api${path}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Confluence V1 ${method} ${path}: ${res.status}`);
  return res.json();
}
```

### Step 2: Spaces

```typescript
// Create a space (key: uppercase, 2-10 chars; type: "global" or "personal")
const space = await confluence("POST", "/spaces", {
  key: "ENG", name: "Engineering",
  description: { plain: { value: "Engineering team docs and runbooks", representation: "plain" } },
  type: "global",
});

// List, get, update
const spaces = await confluence("GET", "/spaces?limit=25&sort=name");
const engSpace = await confluence("GET", "/spaces/ENG?include-homepage=true");
await confluence("PUT", `/spaces/${space.id}`, {
  name: "Engineering Docs",
  description: { plain: { value: "Updated description", representation: "plain" } },
});
```

### Step 3: Pages — CRUD & Hierarchy

```typescript
// Create a page (body uses "storage" format = Confluence XHTML, or ADF)
const page = await confluence("POST", "/pages", {
  spaceId: space.id,
  status: "current",  // "current" (published) or "draft"
  title: "API Design Guidelines",
  body: {
    representation: "storage",
    value: `<h2>REST API Conventions</h2><p>All APIs must follow these conventions:</p>
      <ul><li>Use plural nouns: <code>/users</code></li><li>Version via URL prefix</li></ul>`,
  },
});

// Create a child page (nested under a parent)
const childPage = await confluence("POST", "/pages", {
  spaceId: space.id, parentId: page.id,
  title: "Authentication Standards",
  body: { representation: "storage", value: "<p>All APIs use OAuth 2.0 with JWT.</p>" },
});

// Update — MUST increment version number
const currentPage = await confluence("GET", `/pages/${page.id}?body-format=storage`);
await confluence("PUT", `/pages/${page.id}`, {
  id: page.id, status: "current", title: "API Design Guidelines v2",
  body: { representation: "storage", value: "<p>Updated content...</p>" },
  version: { number: currentPage.version.number + 1, message: "Added error handling section" },
});

// Children, reparent, delete (moves to trash, recoverable for 30 days)
const descendants = await confluence("GET", `/pages/${page.id}/children?limit=50&sort=title`);
await confluence("DELETE", `/pages/${page.id}`);
```

### Step 4: CQL — Confluence Query Language

```typescript
// CQL uses V1 API (not available in V2 yet). Similar to JQL but for content.
const results = await confluenceV1("GET",
  `/content/search?cql=${encodeURIComponent('type = page AND space = "ENG" AND text ~ "authentication" ORDER BY lastModified DESC')}&limit=20`
);

// Recent pages, labeled pages, pages by user
const recent = await confluenceV1("GET",
  `/content/search?cql=${encodeURIComponent('type = page AND space = "ENG" AND lastModified >= now("-7d") ORDER BY lastModified DESC')}&limit=50`
);
const labeled = await confluenceV1("GET",
  `/content/search?cql=${encodeURIComponent('type = page AND label = "runbook" AND space = "ENG"')}&limit=50`
);
```

### Step 5: Labels & Organization

```typescript
// Add, get, remove labels
await confluenceV1("POST", `/content/${page.id}/label`, [
  { prefix: "global", name: "runbook" },
  { prefix: "global", name: "production" },
]);
const labels = await confluenceV1("GET", `/content/${page.id}/label`);
await confluenceV1("DELETE", `/content/${page.id}/label/runbook`);
```

### Step 6: Templates

```typescript
// Create a reusable page template with variable placeholders
const template = await confluenceV1("POST", "/template", {
  name: "Incident Postmortem",
  templateType: "page",
  description: "Standard incident postmortem template",
  space: { key: "ENG" },
  body: {
    storage: {
      value: `<h2>Incident Summary</h2>
        <p><strong>Severity:</strong> <at:var at:name="severity">P1/P2/P3</at:var></p>
        <p><strong>Duration:</strong> <at:var at:name="duration">X hours</at:var></p>
        <h2>Timeline</h2><p>Chronological events...</p>
        <h2>Root Cause</h2><p>What caused this...</p>
        <h2>Action Items</h2>
        <ac:structured-macro ac:name="tasklist"><ac:rich-text-body>
          <ac:task><ac:task-body>Action item 1</ac:task-body></ac:task>
        </ac:rich-text-body></ac:structured-macro>`,
      representation: "storage",
    },
  },
});

// Create a page from a template (replace variables with real values)
const fromTemplate = await confluenceV1("POST", "/content", {
  type: "page", title: "Postmortem: Auth Service Outage 2026-02-18",
  space: { key: "ENG" }, ancestors: [{ id: postmortemsParentPageId }],
  body: {
    storage: {
      value: template.body.storage.value.replace("P1/P2/P3", "P1").replace("X hours", "2h 15m"),
      representation: "storage",
    },
  },
});
```

### Step 7: Attachments

```typescript
// Upload attachment (PUT creates or updates; POST always creates new)
const form = new FormData();
form.append("file", fs.createReadStream("architecture-diagram.png"));
const attachment = await fetch(`${CONFLUENCE_BASE}/wiki/rest/api/content/${page.id}/child/attachment`, {
  method: "PUT",
  headers: { Authorization: `Basic ${AUTH}`, "X-Atlassian-Token": "nocheck", ...form.getHeaders() },
  body: form,
}).then(r => r.json());

// List attachments
const attachments = await confluenceV1("GET", `/content/${page.id}/child/attachment?limit=50`);
```

### Step 8: Permissions

```typescript
// Get and set page restrictions
const restrictions = await confluenceV1("GET", `/content/${page.id}/restriction`);
await confluenceV1("PUT", `/content/${page.id}/restriction`, [{
  operation: "update",
  restrictions: {
    user: [{ type: "known", accountId: "5f1234abc..." }],
    group: [{ type: "group", name: "engineering-leads" }],
  },
}]);

// Space-level permissions
await confluence("POST", `/spaces/${space.id}/permissions`, {
  subject: { type: "group", identifier: "engineering" },
  operation: { key: "read", target: "space" },
});
```

### Step 9: Webhooks

```typescript
// Register a webhook for content events
const webhook = await fetch(`${CONFLUENCE_BASE}/wiki/rest/api/webhooks`, {
  method: "POST",
  headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    name: "Page update notifier",
    url: "https://your-app.com/webhook/confluence",
    events: ["page_created", "page_updated", "page_removed", "comment_created"],
    active: true,
  }),
}).then(r => r.json());
// Webhook payload: { eventType: "page_created", page: { id, title, space, version } }
```

### Step 10: Jira Integration

```typescript
// Embed a live Jira issue table in a Confluence page using the Jira macro
const pageWithJira = await confluenceV1("POST", "/content", {
  type: "page", title: "Sprint 24 Status", space: { key: "ENG" },
  body: {
    storage: {
      value: `<h2>Current Sprint Issues</h2>
        <ac:structured-macro ac:name="jira">
          <ac:parameter ac:name="jqlQuery">project = ENG AND sprint = "Sprint 24" ORDER BY priority DESC</ac:parameter>
          <ac:parameter ac:name="columns">key,summary,status,assignee,priority</ac:parameter>
          <ac:parameter ac:name="maximumIssues">50</ac:parameter>
        </ac:structured-macro>`,
      representation: "storage",
    },
  },
});
```

## Examples

### Example 1: Build an engineering documentation hub with page hierarchy
**User prompt:** "Create a Confluence space called 'Engineering' with key ENG. Set up a page tree with top-level pages for Architecture, Runbooks, and RFCs. Under Runbooks, create child pages for 'Database Failover' and 'Incident Response'. Add labels to the runbook pages."

The agent will:
1. Create the space via `POST /spaces` with key `ENG` and type `global`.
2. Create three top-level pages (Architecture, Runbooks, RFCs) using `POST /pages` with the space ID and storage-format body content.
3. Create two child pages under Runbooks by setting `parentId` to the Runbooks page ID.
4. Add labels `runbook` and `production` to both child pages using the V1 labels API.
5. Return the URLs of all created pages.

### Example 2: Generate a weekly status page from Jira sprint data
**User prompt:** "Create a Confluence page in the ENG space titled 'Sprint 24 Status' that shows a live Jira issue table for the current sprint filtered by priority, plus a summary section I can edit."

The agent will:
1. Create a new page using the V1 content API with storage-format body.
2. Include an `ac:structured-macro` Jira macro with a JQL query filtering for the current sprint, displaying key, summary, status, assignee, and priority columns.
3. Add an editable summary section with placeholder text below the Jira table.
4. Add labels `sprint-report` and `status` to the page for easy discovery via CQL search.

## Guidelines

- Use the V2 REST API for page and space CRUD operations; fall back to V1 only for CQL search, templates, labels, and attachment uploads.
- Always increment the version number by exactly 1 when updating pages; the API rejects updates with incorrect version numbers to prevent conflicting edits.
- Use storage format (Confluence XHTML) for page bodies when creating pages programmatically; it is simpler than ADF and supports all macros including Jira embeds.
- Add labels to pages for organizational taxonomy; they power CQL queries like `label = "runbook"` which are the primary way to find pages across spaces.
- Set the `X-Atlassian-Token: nocheck` header when uploading attachments; the API rejects multipart file uploads without this CSRF bypass header.
- Delete operations move pages to trash (recoverable for 30 days), not permanent deletion; use the purge endpoint if permanent removal is needed.
