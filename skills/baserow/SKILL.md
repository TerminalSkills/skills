---
name: baserow
description: >-
  Build database-powered applications with Baserow, the open-source no-code database. Use when a user asks to create spreadsheet databases, build API-connected workflows, manage relational data, or self-host Baserow as an Airtable alternative.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["database", "spreadsheet", "airtable-alternative", "open-source", "no-code"]
---
# Baserow — Open-Source No-Code Database

## Overview

Baserow is an open-source no-code database platform and Airtable alternative, with a spreadsheet interface, a REST API, forms, and workflow automation, self-hosted on the user's own infrastructure. Use this skill when a user asks to create spreadsheet-style relational databases, build API-connected workflows, manage relational data, or self-host Baserow.

## Instructions

### Setup

```bash
# All-in-one image, pinned to a specific release (never :latest in production)
docker run -d --name baserow -p 80:80 -p 443:443 \
  -v baserow_data:/baserow/data \
  -e BASEROW_PUBLIC_URL='http://localhost' \
  baserow/baserow:2.3.3

# Or docker-compose.yml with the same image; production setups split into
# separate baserow/backend and baserow/web-frontend containers plus Celery
# workers (see the official "Install with Docker Compose" guide) and require
# SECRET_KEY, DATABASE_PASSWORD, and REDIS_PASSWORD to be set.
docker compose up -d
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

Create a database token in the Baserow UI (per-table create/read/update/delete permissions) and send it as `Authorization: Token YOUR_DATABASE_TOKEN` — this is different from the `Authorization: JWT ...` header used by the web app's own user session.

```bash
# List rows with filtering (filter__<field>__<operator>, or filter__field_<id>__<operator>)
curl "https://baserow.northstar-robotics.internal/api/database/rows/table/412/?user_field_names=true&filter__Status__equal=Active&order_by=-Created" \
  -H "Authorization: Token YOUR_DATABASE_TOKEN"

# Create row
curl -X POST "https://baserow.northstar-robotics.internal/api/database/rows/table/412/?user_field_names=true" \
  -H "Authorization: Token YOUR_DATABASE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"Name": "Q3 renewal outreach", "Status": "Active", "Priority": "High"}'

# Update row
curl -X PATCH "https://baserow.northstar-robotics.internal/api/database/rows/table/412/1038/?user_field_names=true" \
  -H "Authorization: Token YOUR_DATABASE_TOKEN" \
  -d '{"Status": "Completed"}'

# Webhooks — trigger on row events
# Configure in UI: Settings → Webhooks
# Events: rows.created, rows.updated, rows.deleted
```

## Examples

### Example 1: Self-host Baserow and connect it to an external script

**User request:** "Set up Baserow on our server and give me a way to push new leads into a table from a Python script."

**Agent workflow:**
1. Deploy with the pinned `baserow/baserow:2.3.3` image (or docker-compose for a production split) and set `BASEROW_PUBLIC_URL` to the real hostname.
2. In the UI, create a "Leads" table with fields for Name, Email, Status, and Source, then create a database token scoped to that table only.
3. Give the user a `curl`/Python snippet using `POST /api/database/rows/table/<id>/?user_field_names=true` with the token to insert a row.
4. Point out the table ID and token belong to that one table, not the whole workspace.

**Output:** A running Baserow instance, a "Leads" table, and a working insert call the user's script can reuse.

### Example 2: Build a rollup across linked tables

**User request:** "I have a Clients table and an Invoices table — show total paid per client without duplicating data."

**Agent workflow:**
1. Add a "Link to table" field on Invoices pointing at Clients (this creates the reverse link on Clients automatically).
2. Add a Rollup field on Clients that sums the Invoices' Amount field, filtered or using a Lookup + Formula like `sum(lookup('Invoices', 'Amount'))` where Status = Paid.
3. Verify the rollup updates when a new invoice row is added.

**Output:** A "Total Paid" rollup column on Clients that stays in sync as invoices change, with no copied data.

## Guidelines

1. **Self-host for data sovereignty** — Baserow runs on your infrastructure; ideal for GDPR compliance and sensitive data
2. **Relationships over duplication** — Use "Link to table" fields instead of duplicating data across tables
3. **Lookups and rollups** — Pull related data with lookups; aggregate with rollups (no code needed)
4. **Form view for intake** — Create public forms for data collection; responses go directly to your database
5. **API for integration** — Use the REST API to connect Baserow data to your applications and workflows
6. **Granular permissions** — Set view/edit permissions per table, per group; share specific views without full database access
7. **Templates for quick start** — Use built-in templates (CRM, project tracker, content calendar) and customize
8. **Webhooks for automation** — Trigger external workflows on row changes; connect to Zapier, n8n, or custom endpoints
