---
name: baserow
description: >-
  Build database-powered applications with Baserow, the open-source no-code database. Use when a user asks to create spreadsheet databases, build API-connected workflows, manage relational data, or self-host Baserow as an Airtable alternative.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["database", "spreadsheet", "airtable-alternative", "open-source", "no-code"]
---
# Baserow — Open-Source No-Code Database

## Overview

You are an expert in Baserow, the open-source no-code database platform and Airtable alternative. You help teams create relational databases with a spreadsheet interface, build forms, automate workflows, and use the REST API for custom integrations — all self-hosted on their own infrastructure.

## Instructions

### Setup

```bash
# Docker Compose (production-ready)
docker compose up -d
# UI at http://localhost:80

# Or one-liner for testing
docker run -p 80:80 -v baserow_data:/baserow/data baserow/baserow:latest
```

### Database Structure

```markdown
## Table Types and Fields

### Field Types
- Text, Long text, Number, Boolean, Date, URL, Email, Phone
- Single select, Multiple select (colored tags)
- Link to table (relationships between tables)
- Lookup (pull data from linked records)
- Rollup (aggregate linked records: SUM, COUNT, AVG)
- Formula (computed fields using other fields)
- File (attachments)
- Created by, Last modified, Auto-number

### Formulas
concat(field('First Name'), ' ', field('Last Name'))
if(field('Status') = 'Paid', field('Amount'), 0)
datetime_format(field('Created'), 'YYYY-MM-DD')
year(now()) - year(field('Birth Date'))
```

### REST API

```bash
# List rows with filtering
curl "https://baserow.example.com/api/database/rows/table/TABLE_ID/?user_field_names=true&filter__Status__equal=Active&order_by=-Created" \
  -H "Authorization: Token YOUR_TOKEN"

# Create row
curl -X POST "https://baserow.example.com/api/database/rows/table/TABLE_ID/?user_field_names=true" \
  -H "Authorization: Token YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Name": "New Project", "Status": "Active", "Priority": "High"}'

# Update row
curl -X PATCH "https://baserow.example.com/api/database/rows/table/TABLE_ID/ROW_ID/?user_field_names=true" \
  -H "Authorization: Token YOUR_TOKEN" \
  -d '{"Status": "Completed"}'

# Webhooks — trigger on row events
# Configure in UI: Settings → Webhooks
# Events: rows.created, rows.updated, rows.deleted
```

## Examples

**Example 1: User asks to set up baserow**

User: "Help me set up baserow for my project"

The agent should:
1. Check system requirements and prerequisites
2. Install or configure baserow
3. Set up initial project structure
4. Verify the setup works correctly

**Example 2: User asks to build a feature with baserow**

User: "Create a dashboard using baserow"

The agent should:
1. Scaffold the component or configuration
2. Connect to the appropriate data source
3. Implement the requested feature
4. Test and validate the output

## Guidelines

1. **Self-host for data sovereignty** — Baserow runs on your infrastructure; ideal for GDPR compliance and sensitive data
2. **Relationships over duplication** — Use "Link to table" fields instead of duplicating data across tables
3. **Lookups and rollups** — Pull related data with lookups; aggregate with rollups (no code needed)
4. **Form view for intake** — Create public forms for data collection; responses go directly to your database
5. **API for integration** — Use the REST API to connect Baserow data to your applications and workflows
6. **Granular permissions** — Set view/edit permissions per table, per group; share specific views without full database access
7. **Templates for quick start** — Use built-in templates (CRM, project tracker, content calendar) and customize
8. **Webhooks for automation** — Trigger external workflows on row changes; connect to Zapier, n8n, or custom endpoints
