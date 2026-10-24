---
name: notion
description: >-
  Build integrations with the Notion API: databases and data sources, pages, blocks, search, and OAuth. Use when tasks involve reading or writing Notion workspace data, syncing external tools with a Notion database, building dashboards from Notion content, or automating page creation and updates.
license: Apache-2.0
compatibility: "Python 3 with requests, or Node 18+ with @notionhq/client; API version 2026-03-11"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: productivity
  tags: ["notion", "api", "productivity", "databases", "automation"]
---

# Notion API Integration

## Overview

The Notion REST API (`https://api.notion.com/v1`) reads and writes pages, blocks and databases that have been shared with a connection (what Notion's UI calls an integration). Since API version `2025-09-03` a database is a container of one or more **data sources**; rows are queried and their schema read through `/v1/data_sources/{id}`, not `/v1/databases/{id}`. Version `2026-03-11` (the latest at the time of writing) renamed `archived` to `in_trash` and replaced the `after` parameter of block append with `position`. This skill uses `2026-03-11` throughout.

## Instructions

### Authentication

Create a connection at https://www.notion.so/my-integrations, copy its token, and share each target page or database with it (page menu, Connections). Keep the token in an environment variable:

```bash
export NOTION_TOKEN="ntn_..."   # from the connection's Configuration tab
```

For apps used by many workspaces, create a public connection and use OAuth 2.0: send the user to `https://api.notion.com/v1/oauth/authorize?owner=user&client_id=...&redirect_uri=...&response_type=code`, then POST the returned `code` (`grant_type=authorization_code`, same `redirect_uri`) to `https://api.notion.com/v1/oauth/token` with HTTP Basic auth `client_id:client_secret`. Each user authorizes separately. The Notion-Version header is required on every request.

### Client setup and rate limits

```python
"""notion_client.py — shared request helper with retry on 429/529/503."""
import os
import time
import requests

API = "https://api.notion.com/v1"
HEADERS = {
    "Authorization": f"Bearer {os.environ['NOTION_TOKEN']}",
    "Notion-Version": "2026-03-11",
    "Content-Type": "application/json",
}

def call(method: str, path: str, **kwargs) -> dict:
    """Send a request; wait for Retry-After on HTTP 429 or 529, back off on 503 for GET."""
    for attempt in range(5):
        resp = requests.request(method, f"{API}{path}", headers=HEADERS, timeout=30, **kwargs)
        if resp.status_code in (429, 529):
            time.sleep(int(resp.headers.get("Retry-After", 2 ** attempt)))
            continue
        if resp.status_code == 503 and method == "GET":
            time.sleep(2 ** attempt)
            continue
        resp.raise_for_status()
        return resp.json()
    raise RuntimeError(f"Notion request kept failing: {method} {path}")
```

Limits: each connection gets 180 requests per minute (about 3 per second; 600 per minute on Business and Enterprise workspaces), data source queries about 3 per second, and a separate workspace-wide budget exists. Do not retry a failed write blindly after a 503: check whether it was applied first. At most 100 blocks go in one append request, and a request body is limited in size.

### Find the data source of a database

A database ID (from the URL) is not enough for queries. Fetch its data sources once and store the ID:

```python
def get_data_source_id(database_id: str) -> str:
    """Return the first data source ID of a database (most databases have one)."""
    db = call("GET", f"/databases/{database_id}")
    return db["data_sources"][0]["id"]
```

Search also returns data source objects: `{"filter": {"property": "object", "value": "data_source"}}` (`"database"` was the value before `2025-09-03`).

### Query, create and update rows

```python
def query_data_source(data_source_id: str, filter_obj: dict = None, sorts: list = None) -> list:
    """Return all pages of a data source matching the filter, following the cursor."""
    body = {"page_size": 100}
    if filter_obj:
        body["filter"] = filter_obj
    if sorts:
        body["sorts"] = sorts
    pages = []
    while True:
        data = call("POST", f"/data_sources/{data_source_id}/query", json=body)
        pages.extend(data["results"])
        if not data.get("has_more"):
            return pages
        body["start_cursor"] = data["next_cursor"]

def create_page(data_source_id: str, properties: dict, children: list = None) -> dict:
    """Create a row (page) in a data source."""
    body = {"parent": {"data_source_id": data_source_id}, "properties": properties}
    if children:
        body["children"] = children
    return call("POST", "/pages", json=body)

def update_page(page_id: str, properties: dict) -> dict:
    """Change properties of an existing page."""
    return call("PATCH", f"/pages/{page_id}", json={"properties": properties})

def trash_page(page_id: str) -> dict:
    """Move a page to the trash (restorable from the Notion UI)."""
    return call("PATCH", f"/pages/{page_id}", json={"in_trash": True})
```

Querying returns at most 10,000 results per query; narrow the filter for bigger sets. Example filter: `{"property": "Status", "select": {"equals": "In Progress"}}`; combine with `{"and": [...]}` or `{"or": [...]}`.

### Property values

```python
properties = {
    "Name": {"title": [{"text": {"content": "Fix login redirect"}}]},      # every data source has one title property
    "Description": {"rich_text": [{"text": {"content": "Redirect loops on Safari"}}]},
    "Status": {"select": {"name": "In Progress"}},
    "Tags": {"multi_select": [{"name": "frontend"}, {"name": "urgent"}]},
    "Story Points": {"number": 5},
    "Due Date": {"date": {"start": "2026-11-15", "end": "2026-11-20"}},
    "Done": {"checkbox": False},
    "Link": {"url": "https://github.com/acme-web/shop/issues/412"},
    "Assignee": {"people": [{"id": "0d0ca9b1-6b1e-4c2b-8f0a-2f2a1e7d9c11"}]},
    "Project": {"relation": [{"id": "5a1f3c1e-9b0a-4d3e-8c52-7d1b2f9e0a34"}]},
}
```

Property names must match the data source schema (`GET /v1/data_sources/{id}` shows it). A `status` property takes `{"status": {"name": "..."}}` with an option that already exists.

### Blocks

```python
def append_blocks(page_id: str, blocks: list, after_block_id: str = None) -> dict:
    """Append blocks to a page or block (max 100); optionally insert after a given block."""
    body = {"children": blocks}
    if after_block_id:
        body["position"] = {"type": "after_block", "after_block": {"id": after_block_id}}
    return call("PATCH", f"/blocks/{page_id}/children", json=body)

blocks = [
    {"type": "heading_2", "heading_2": {"rich_text": [{"text": {"content": "Sprint 42 summary"}}]}},
    {"type": "paragraph", "paragraph": {"rich_text": [{"text": {"content": "Focus: checkout performance."}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "Shipped payment retry"}}]}},
    {"type": "to_do", "to_do": {"rich_text": [{"text": {"content": "Write migration notes"}}], "checked": False}},
    {"type": "code", "code": {"rich_text": [{"text": {"content": "npm run build"}}], "language": "shell"}},
]
```

`position` also accepts `{"type": "start"}` and `{"type": "end"}` (the default). To read a page's content, `GET /blocks/{page_id}/children?page_size=100` and follow `next_cursor`; nested blocks (toggles, columns) have `has_children: true` and need their own call.

### Search

```python
def search(query: str, kind: str = "page") -> list:
    """kind is 'page' or 'data_source'."""
    body = {"query": query, "filter": {"property": "object", "value": kind}}
    return call("POST", "/search", json=body)["results"]
```

## Examples

### Example 1: "Sync GitHub issues into my Notion tracker"

```python
# uses the helpers defined above (call, get_data_source_id, query_data_source, create_page, update_page)
ds = get_data_source_id("b6a4e1c2d3f84a7e9f10a2b3c4d5e6f7")
existing = {p["properties"]["Issue #"]["number"]: p["id"]
            for p in query_data_source(ds) if p["properties"]["Issue #"]["number"]}

issues = [{"number": 412, "title": "Fix login redirect", "state": "open", "url": "https://github.com/acme-web/shop/issues/412"}]
for i in issues:
    props = {
        "Name": {"title": [{"text": {"content": i["title"]}}]},
        "Issue #": {"number": i["number"]},
        "Status": {"select": {"name": "Open" if i["state"] == "open" else "Closed"}},
        "URL": {"url": i["url"]},
    }
    if i["number"] in existing:
        update_page(existing[i["number"]], props)
    else:
        create_page(ds, props)
```

Result: issue 412 appears as a new row, or its existing row is updated, with no duplicates.

### Example 2: "Add a standup note to today's meeting page"

```python
append_blocks("9f2c7a10b4e84d6c8a31c5d2e7f90b12", [
    {"type": "heading_3", "heading_3": {"rich_text": [{"text": {"content": "Standup 2026-11-03"}}]}},
    {"type": "bulleted_list_item", "bulleted_list_item": {"rich_text": [{"text": {"content": "Blocked on staging DB access"}}]}},
])
```

The call returns the new blocks; the heading and bullet appear at the end of the page.

## Guidelines

- Share every page or database with the connection first; otherwise the API answers `object_not_found`, which looks like a wrong ID.
- Code written for versions before `2025-09-03` (`/databases/{id}/query`, `parent.database_id`, search `value: "database"`) breaks on the new version; do not mix the two styles. Use the JavaScript SDK v5.12.0 or later for `2026-03-11`.
- Use `in_trash` (not `archived`) to trash pages, blocks and data sources on `2026-03-11`; a page response also has `is_archived`.
- Prefer server-side filters over fetching all rows. Formula, rollup and some other property types are read-only through the API.
- Rich text comes as arrays of segments; join their `plain_text` to get text.
- Keep the token in an environment variable or secret manager, never in code or a repository.
