---
name: windmill
description: >-
  Build internal tools and workflows with Windmill. Use when a user asks to
  create internal tools, build admin dashboards, orchestrate scripts, automate
  DevOps tasks, or self-host a Retool alternative with code-first approach.
license: Apache-2.0
compatibility: 'TypeScript, Python, Go, Bash, SQL (self-hosted or cloud)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: automation
  tags:
    - windmill
    - internal-tools
    - workflow
    - scripts
    - automation
---

# Windmill

## Overview

Windmill is an open-source platform for building internal tools, workflows, and scripts. Think Retool + Temporal — visual workflows with real code (TypeScript, Python, Go, Bash, SQL). Scripts run in isolated containers with auto-generated UIs.

## Instructions

### Step 1: Self-Host

```bash
# Quick start with Docker
docker run -d -p 8000:8000 --name windmill ghcr.io/windmill-labs/windmill:main

# Or with docker-compose (recommended for production)
curl -o docker-compose.yml https://raw.githubusercontent.com/windmill-labs/windmill/main/docker-compose.yml
docker compose up -d
```

### Step 2: Write Scripts

```typescript
// TypeScript script — auto-generates UI from type signature
export async function main(
  db_url: string,       // renders as text input
  table_name: string,   // renders as text input
  limit: number = 100,  // renders as number input with default
) {
  const client = new Client(db_url)
  const result = await client.query(`SELECT * FROM ${table_name} LIMIT $1`, [limit])
  return result.rows    // displayed as a table in the UI
}
```

```python
# Python script — same auto-UI behavior
def main(
    api_key: str,
    start_date: str,    # renders as date picker with "date" in name
    end_date: str,
) -> list[dict]:
    response = requests.get(
        "https://api.example.com/data",
        headers={"Authorization": f"Bearer {api_key}"},
        params={"start": start_date, "end": end_date},
    )
    return response.json()["results"]
```

### Step 3: Build Workflows

```yaml
# Workflows chain scripts together with branching and loops
# Visual editor or YAML definition:
# 1. Fetch data from API (TypeScript)
# 2. Transform data (Python)
# 3. Branch: if errors > threshold → alert Slack
# 4. Insert into database (SQL)
# 5. Send summary email
```

### Step 4: Build Apps (UI)

Windmill includes a drag-and-drop app builder for internal tools. Connect to scripts, display tables, forms, charts — all backed by your scripts.

## Guidelines

- Self-hosted: free community edition. Enterprise: starts at $10/user/month.
- Scripts get auto-generated UIs from function signatures — no frontend code needed.
- Supports approval steps (human-in-the-loop) for sensitive workflows.
- Better than Retool for code-first teams; better than Temporal for simpler workflows.
