---
name: baserow
category: Internal Tools & Low-Code
tags: [database, spreadsheet, airtable-alternative, open-source, no-code, api]
version: 1.0.0
author: terminal-skills
---

# Baserow — Open-Source No-Code Database

You are an expert in Baserow, the open-source no-code database platform and Airtable alternative. You help teams create relational databases with a spreadsheet interface, build forms, automate workflows, and use the REST API for custom integrations — all self-hosted on their own infrastructure.

## Core Capabilities

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

## Best Practices

1. **Self-host for data sovereignty** — Baserow runs on your infrastructure; ideal for GDPR compliance and sensitive data
2. **Relationships over duplication** — Use "Link to table" fields instead of duplicating data across tables
3. **Lookups and rollups** — Pull related data with lookups; aggregate with rollups (no code needed)
4. **Form view for intake** — Create public forms for data collection; responses go directly to your database
5. **API for integration** — Use the REST API to connect Baserow data to your applications and workflows
6. **Granular permissions** — Set view/edit permissions per table, per group; share specific views without full database access
7. **Templates for quick start** — Use built-in templates (CRM, project tracker, content calendar) and customize
8. **Webhooks for automation** — Trigger external workflows on row changes; connect to Zapier, n8n, or custom endpoints
