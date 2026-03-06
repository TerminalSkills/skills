---
name: nocodb
description: >-
  Build database applications with NocoDB, the open-source Airtable alternative. Use when a user asks to create spreadsheet views of databases, build forms, configure automations, use the NocoDB API, or self-host NocoDB.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["database", "spreadsheet", "airtable-alternative", "open-source", "no-code"]
---
# NocoDB — Open-Source Airtable Alternative

## Overview

You are an expert in NocoDB, the open-source platform that turns any database into a smart spreadsheet interface with REST API. You help teams set up NocoDB on existing PostgreSQL/MySQL databases, build views (grid, kanban, gallery, form), create automations, and use the auto-generated API for integrations.

## Instructions

### Deployment

```bash
# Docker (connects to existing database)
docker run -d --name nocodb \
  -p 8080:8080 \
  -e NC_DB="pg://host:5432?u=user&p=pass&d=mydb" \
  nocodb/nocodb:latest

# Docker Compose with built-in SQLite
docker compose up -d
# UI at http://localhost:8080

# Connect to existing database:
# NocoDB reads your existing tables and creates spreadsheet views.
# No data migration needed — it's a UI layer on your database.
```

### Views

```markdown
## View Types

### Grid View (spreadsheet)
- Sort, filter, group, hide columns
- Inline editing with validation
- Expand row for detail view
- Import/export CSV

### Kanban View
- Drag-and-drop cards between columns
- Group by any single-select or status field
- Stack by: status, priority, assignee, category

### Gallery View
- Card layout with cover image
- Ideal for: product catalogs, team directory, portfolio

### Form View
- Auto-generated forms from table schema
- Share via public URL (no NocoDB account needed)
- Conditional field visibility
- Custom submit message and redirect

### Calendar View
- Events from date fields
- Drag to reschedule
- Day/week/month views
```

### Auto-Generated REST API

```bash
# NocoDB auto-generates REST APIs for every table
# List records
curl -X GET "http://localhost:8080/api/v1/db/data/noco/project/table" \
  -H "xc-auth: YOUR_AUTH_TOKEN"

# Create record
curl -X POST "http://localhost:8080/api/v1/db/data/noco/project/table" \
  -H "xc-auth: YOUR_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Name": "New Item", "Status": "Active", "Priority": "High"}'

# Filter and sort
curl -X GET "http://localhost:8080/api/v1/db/data/noco/project/table?where=(Status,eq,Active)&sort=-CreatedAt&limit=20"
```

### Automations

```markdown
## Webhooks and Automations

### Webhook triggers:
- After record insert
- After record update
- After record delete
- After bulk insert

### Use cases:
- New row → Send Slack notification
- Status changed to "Done" → Send email via SendGrid
- New form submission → Create Jira ticket
- Record deleted → Log to audit table
```

## Examples

**Example 1: User asks to set up nocodb**

User: "Help me set up nocodb for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure nocodb
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with nocodb**

User: "Create a dashboard using nocodb"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Layer on existing DB** — Don't migrate data; point NocoDB at your existing PostgreSQL/MySQL and get instant spreadsheet views
2. **Form views for data collection** — Share public form URLs for intake (support tickets, feedback, applications); data goes straight to your DB
3. **API for integrations** — Use the auto-generated REST API to connect NocoDB data to your application code
4. **Kanban for workflows** — Use kanban view for any status-based process (support tickets, hiring pipeline, content calendar)
5. **Roles for access control** — Set viewer/editor/creator roles per table; share specific views without exposing the full database
6. **Webhooks for automation** — Trigger external workflows on data changes; no polling needed
7. **Self-host for compliance** — NocoDB runs on your infrastructure; data never leaves your network
8. **Lookup and rollup fields** — Use linked records, lookups, and rollups for relational data without writing SQL joins
