---
name: confluence
description: >-
  Manage documentation and knowledge bases in Confluence Cloud through its
  REST APIs. Use when a user asks to create Confluence spaces or pages, build
  a page tree, update a page, search with CQL, add labels, upload
  attachments, restrict who can view or edit a page, embed Jira issues, or
  automate documentation from scripts. Covers REST API v2, the remaining v1
  endpoints and storage-format page bodies.
license: Apache-2.0
compatibility: Confluence Cloud; Node.js 18+ (built-in fetch) or any HTTP client
metadata:
  author: terminal-skills
  version: 1.1.0
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

Automate Confluence Cloud (Atlassian's wiki) over HTTP. Page and space work goes through REST API v2 (`/wiki/api/v2`, cursor-paginated). A subset of v1 (`/wiki/rest/api`) is still needed for CQL search, labels (add/remove), attachment upload, templates, page restrictions and some page moves. Atlassian has been removing v1 endpoints: v1 `POST /content` (create page) and `PUT /content/{id}` are no longer in its published API reference, so always create and update pages with v2. Checked against the v1 and v2 OpenAPI documents on 2026-10-24; nothing here was run against a live site.

## Instructions

### Step 1: Authentication

Basic auth with the account email and an API token (create it at https://id.atlassian.com/manage-profile/security/api-tokens). Keep both in environment variables.

```typescript
const BASE = process.env.CONFLUENCE_BASE_URL!;   // https://acme-eng.atlassian.net
const AUTH = Buffer.from(
  `${process.env.ATLASSIAN_EMAIL}:${process.env.ATLASSIAN_API_TOKEN}`,
).toString("base64");

async function api(prefix: "/wiki/api/v2" | "/wiki/rest/api", method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${prefix}${path}`, {
    method,
    headers: { Authorization: `Basic ${AUTH}`, "Content-Type": "application/json", Accept: "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Confluence ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
const v2 = (m: string, p: string, b?: unknown) => api("/wiki/api/v2", m, p, b);
const v1 = (m: string, p: string, b?: unknown) => api("/wiki/rest/api", m, p, b);
```

OAuth 2.0 (3LO) is the alternative for apps acting for other users; v2 scopes look like `read:page:confluence` and `write:page:confluence`.

### Step 2: Spaces

v2 identifies a space by numeric `id`, not by key. Look the id up with `keys=`.

```typescript
// Create: name is required, plus either key (uppercase) or alias. description is optional and plain text only.
const space = await v2("POST", "/spaces", {
  name: "Engineering", key: "ENG",
  description: { representation: "plain", value: "Engineering docs" },
});

const found = await v2("GET", "/spaces?keys=ENG&description-format=plain");
const spaceId: string = found.results[0].id;
const pages = await v2("GET", `/spaces/${spaceId}/pages?limit=50`);
```

v2 has no endpoint to update or delete a space; use the Confluence UI or v1 for that. Responses are cursor-paginated: follow `_links.next` until it is absent.

### Step 3: Pages and hierarchy

Bodies use `representation`: `storage` (Confluence XHTML), `atlas_doc_format` (ADF as a JSON string) or `wiki`.

```typescript
const page = await v2("POST", "/pages", {
  spaceId, status: "current", title: "API Design Guidelines",
  body: { representation: "storage",
          value: "<h2>REST conventions</h2><ul><li>Use plural nouns: <code>/users</code></li></ul>" },
});

// Child page: set parentId
const child = await v2("POST", "/pages", {
  spaceId, parentId: page.id, title: "Authentication Standards",
  body: { representation: "storage", value: "<p>All APIs use OAuth 2.0.</p>" },
});

// Update: send the full page and version.number = current + 1
const cur = await v2("GET", `/pages/${page.id}?body-format=storage`);
await v2("PUT", `/pages/${page.id}`, {
  id: page.id, status: "current", title: "API Design Guidelines v2",
  body: { representation: "storage", value: "<p>Updated content</p>" },
  version: { number: cur.version.number + 1, message: "Added error handling section" },
});

// Direct children (GET /pages/{id}/children is deprecated), all descendants, ancestors
const kids = await v2("GET", `/pages/${page.id}/direct-children`);
const tree = await v2("GET", `/pages/${page.id}/descendants`);

// Delete moves to trash; purge=true on a page already in the trash removes it permanently
await v2("DELETE", `/pages/${child.id}`);
```

To move a page under a different parent in the same space, send `parentId` in the v2 `PUT /pages/{id}` body. For other moves use v1: `PUT /wiki/rest/api/content/{pageId}/move/append/{targetId}`.

### Step 4: CQL search (v1)

```typescript
const cql = 'type = page AND space = "ENG" AND text ~ "authentication" ORDER BY lastModified DESC';
const hits = await v1("GET", `/content/search?cql=${encodeURIComponent(cql)}&limit=20`);
// Other useful clauses: lastModified >= now("-7d"), label = "runbook", ancestor = 12345
```

`GET /wiki/rest/api/search?cql=` returns results with excerpts across content, spaces and users.

### Step 5: Labels

```typescript
await v1("POST", `/content/${page.id}/label`, [
  { prefix: "global", name: "runbook" },
  { prefix: "global", name: "production" },
]);
const labels = await v2("GET", `/pages/${page.id}/labels`);   // v2 can read labels
await v1("DELETE", `/content/${page.id}/label/runbook`);
```

### Step 6: Templates

v1 can create and read templates (`POST /wiki/rest/api/template` with `name`, `templateType: "page"`, `space: { key }` and `body.storage`) and list them (`GET /template/page`). The published API has no call that creates a page from a template, so for automation keep your template as a string in code, fill in the values and create the page with `POST /pages`:

```typescript
const postmortem = (sev: string, duration: string) => `
  <h2>Incident summary</h2>
  <p><strong>Severity:</strong> ${sev}</p><p><strong>Duration:</strong> ${duration}</p>
  <h2>Timeline</h2><p></p><h2>Root cause</h2><p></p><h2>Action items</h2>
  <ac:task-list><ac:task><ac:task-id>1</ac:task-id><ac:task-status>incomplete</ac:task-status>
  <ac:task-body>Add alert on token refresh failures</ac:task-body></ac:task></ac:task-list>`;

await v2("POST", "/pages", {
  spaceId, parentId: postmortemsParentId, title: "Postmortem: Auth service outage 2026-10-14",
  body: { representation: "storage", value: postmortem("P1", "2h 15m") },
});
```

### Step 7: Attachments (v1)

```typescript
import { readFile } from "node:fs/promises";

const form = new FormData();
form.append("file", new Blob([await readFile("architecture-diagram.png")]), "architecture-diagram.png");
form.append("minorEdit", "true");
const res = await fetch(`${BASE}/wiki/rest/api/content/${page.id}/child/attachment`, {
  method: "PUT",                       // PUT creates or updates by filename; POST always adds
  headers: { Authorization: `Basic ${AUTH}`, "X-Atlassian-Token": "no-check" },
  body: form,                          // let fetch set the multipart boundary
});
const attachment = await res.json();
const list = await v2("GET", `/pages/${page.id}/attachments`);
```

### Step 8: Permissions

```typescript
// Simple v2 switch: OPEN | EDIT_RESTRICTED | VIEW_RESTRICTED (direct state of this page)
await v2("PUT", `/pages/${page.id}/restriction-state`, { state: "EDIT_RESTRICTED" });
const perms = await v2("GET", `/pages/${page.id}/permissions`);
const spacePerms = await v2("GET", `/spaces/${spaceId}/permissions`);

// Space roles are assigned with role-assignments (POST takes an array)
await v2("POST", `/spaces/${spaceId}/role-assignments`, [
  { principal: { principalType: "GROUP", principalId: engineeringGroupId }, roleId: viewerRoleId },
]);
```

Group and role ids come from the Atlassian admin APIs or from `GET /spaces/{id}/role-assignments`. Fine-grained user/group restrictions on one page are in v1 `PUT /wiki/rest/api/content/{id}/restriction` (`operation` is `read` or `update`; users by `accountId`, groups by group `id`).

### Step 9: Embed Jira issues

The Jira macro is plain storage-format content in a v2 page body:

```typescript
await v2("POST", "/pages", {
  spaceId, title: "Sprint 24 Status",
  body: { representation: "storage", value: `<h2>Current sprint</h2>
    <ac:structured-macro ac:name="jira" ac:schema-version="1">
      <ac:parameter ac:name="jqlQuery">project = ENG AND sprint in openSprints() ORDER BY priority DESC</ac:parameter>
      <ac:parameter ac:name="columns">key,summary,status,assignee,priority</ac:parameter>
      <ac:parameter ac:name="maximumIssues">50</ac:parameter>
    </ac:structured-macro>` },
});
```

The Jira site must be connected to this Confluence site, or the macro shows an error instead of issues.

## Examples

### Example 1: Engineering hub with a page tree

**User prompt:** "Create a Confluence space called Engineering with key ENG, with top-level pages Architecture, Runbooks and RFCs, and under Runbooks the pages Database Failover and Incident Response, labelled runbook."

The agent will:
1. `POST /wiki/api/v2/spaces` with `name: "Engineering"` and `key: "ENG"`, and keep the returned `id`.
2. `POST /pages` three times with that `spaceId` (Architecture, Runbooks, RFCs), keeping the Runbooks page id.
3. `POST /pages` twice with `parentId` set to the Runbooks id.
4. `POST /wiki/rest/api/content/{id}/label` on both children with `runbook`.
5. Print each page's `_links.webui` (prefix with the site base URL).

### Example 2: Weekly status page with live Jira data

**User prompt:** "Make a Confluence page in ENG called Sprint 24 Status with a live Jira table of the open sprint and an editable summary section."

The agent will:
1. Look up the ENG space id with `GET /spaces?keys=ENG`.
2. `POST /pages` with a storage body: a Summary heading and empty paragraph first, then the `jira` macro with the JQL, columns and `maximumIssues`.
3. Add the labels `sprint-report` and `status` with the v1 label endpoint, so `label = "sprint-report"` in CQL finds it later.

## Guidelines

- Create and update pages with v2 only. Updates need `version.number` set to the current number plus one; a stale number is rejected, so re-read the page just before writing.
- Fetch before you overwrite: a PUT replaces the whole body, so read the page with `body-format=storage`, change it, and send it back.
- Prefer `storage` format for generated content; use `atlas_doc_format` only if you already build ADF.
- List endpoints return a page of results with a cursor in `_links.next`; loop until it is gone, and respect HTTP 429 `Retry-After`.
- Attachment uploads need `X-Atlassian-Token: no-check`, and the multipart `Content-Type` must be set by `fetch`, not by hand.
- Cloud webhooks are not a REST resource in Confluence; use Forge event triggers or Automation rules for change notifications.
- Store the email and API token in environment variables; an API token has the full rights of its account, so use a dedicated service account for automation.
- This skill is for Confluence Cloud. Data Center and Server use different paths and auth.
