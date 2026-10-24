---
name: clay
description: >-
  Clay is a go-to-market data platform that finds companies and people,
  enriches them through many data providers (waterfalls), scores leads with AI
  and syncs them to a CRM or sequencer. Use when someone asks to "enrich leads
  with Clay", "build a prospect list", "set up a Clay table", "send data to a
  Clay webhook", "call the Clay API", "use the Clay CLI or plugin in Claude
  Code", "score leads against our ICP", or "automate outbound research".
license: Apache-2.0
compatibility: "Clay workspace (free plan or paid; webhooks, HTTP API and CRM sync need higher tiers). API and CLI need an API key or `clay login`; the agent plugin needs Claude Code, Codex or Cursor."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: business
  tags:
    - lead-enrichment
    - data-enrichment
    - outbound-sales
    - prospecting
    - b2b
---

# Clay

## Overview

Clay is a spreadsheet-style workspace for B2B prospecting. A table holds one lead or company per row; columns are imported data, provider enrichments, AI research (Claygent and AI columns), formulas, or actions that push data elsewhere. Provider waterfalls try several data vendors in order for one field (work email, phone) and stop at the first hit.

Usage is metered in two units: **Actions** (platform work such as running an enrichment or sending data out) and **Data Credits** (what vendors charge for data and AI). Plans are Free, Launch, Growth and Enterprise; exact prices and allowances change, so read them from https://www.clay.com/pricing and https://university.clay.com/docs/plans-and-billing before quoting any number.

There are four ways in, from least to most programmatic:

1. The Clay web app (tables, enrichment columns, AI columns).
2. A **webhook source**: a table with a unique URL that accepts JSON POSTs.
3. The **Public API** (`https://api.clay.com/public/v0`) with a `clay-api-key` header.
4. The **agent plugin and `clay` CLI** for Claude Code, Codex and Cursor.

## Instructions

### 1. Build a table in the app

1. Create a workbook, add a table, and import companies by domain (CSV, CRM import, or a Clay search).
2. Add enrichment columns (company data, work email waterfall, job-change signals) from the Enrich menu. Start with the domain; most other fields derive from it.
3. Add an AI column for scoring or an opener. Give it the enriched columns as inputs and ask for a fixed output (for example a number 0-100 plus one sentence of reasoning).
4. Run on a handful of rows first and check spend in the credit usage view before running the whole table. Credit budgets and spend limits exist in workspace settings.

### 2. Send rows in with a webhook source

In a workbook choose **+ Add**, search for Webhooks, and pick **Monitor webhook**. Clay shows a URL and a ready-made cURL command. Optionally add an authentication token; it is displayed once, so copy it immediately. Each POST body is a JSON object whose keys become columns.

```bash
curl -X POST "$CLAY_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{"company": "Northwind Traders", "domain": "northwindtraders.com", "contact_email": "dana.ruiz@northwindtraders.com"}'
```

Use the exact URL and authentication header that Clay shows for your table. A webhook source accepts at most 50,000 submissions in total, even after rows are deleted; after that you create a new source (Enterprise can enable auto-delete tables for unlimited submissions). Check your plan: the 14-day trial includes webhooks.

### 3. Send results out

To push a qualified lead to your own service, add an **HTTP API** column to the table (it supports GET, POST, PUT and DELETE to any endpoint; Growth plan and up), conditioned on your score column, and map the cells you want into the JSON body. For CRM destinations use the native HubSpot or Salesforce actions.

### 4. Call the Public API

Create a key under API and CLI, API keys tab in the Clay app, or run `clay api-keys create --name "lead-sync"`. The key is shown once; keep it in an environment variable and server-side only.

```bash
export CLAY_PUBLIC_API_KEY="..."   # from your secret store

curl https://api.clay.com/public/v0/me -H "clay-api-key: $CLAY_PUBLIC_API_KEY"

# Run a custom function (routine id format function:t_...) on up to 100 items
curl -X POST "https://api.clay.com/public/v0/routines/function:t_abc123/run" \
  -H "Content-Type: application/json" -H "clay-api-key: $CLAY_PUBLIC_API_KEY" \
  -d '{"items": [{"id": "row-1", "inputs": {"domain": "northwindtraders.com"}}]}'
# -> {"routine_run_id": "run_xyz789", ...}

curl "https://api.clay.com/public/v0/routines/run/run_xyz789/results" -H "clay-api-key: $CLAY_PUBLIC_API_KEY"
# 202 with progress counters while running; 200 with status "complete" and a data array when done
```

Other endpoints: `GET /credits/balance`, `POST /search/query-mode` (company and people search with Clay's advanced query language; fetch `GET /search/query-mode/reference` for the field list), `POST /routines/{id}/run-batch/start` for larger JSONL batches, and `POST /tables/query` (Enterprise only, reads existing table data). The filters-mode search endpoints are deprecated. The API is rate limited per workspace: on `429` wait for `Retry-After` and back off. The OpenAPI spec is at https://developers.clay.com/openapi.json.

### 5. Use the plugin and CLI from a coding agent

In Claude Code:

```text
/plugin marketplace add clay-run/agent-plugins
/plugin install clay@clay-plugins
/clay:setup
```

`clay:setup` installs the `clay` CLI and signs you in through the browser (use `clay login --device` on a headless machine). The CLI writes JSON to stdout and an error envelope to stderr; exit code 3 means sign in again, 4 means rate limited. `clay whoami` confirms the connection.

## Examples

### Example 1: Score a list of accounts against an ICP

**User prompt:** "I have 300 SaaS company domains in a CSV. Find the VP of Engineering at each, get a verified work email, and score fit for dev-tools outreach."

Import the CSV into a Clay table. Add a people-search or role-lookup column for "VP Engineering", then a work-email waterfall column on the result. Add an AI column with the prompt "Score 0-100 for a 20-200 person B2B SaaS company that hires engineers; reply with the number only" using company size, tech stack and open roles as inputs. Test on 10 rows, check credits used, then run all 300 and filter to scores of 70 or more.

Result: a table with name, email, score and the data behind it, ready to export or sync.

### Example 2: Push form leads into Clay from your backend

**User prompt:** "When someone signs up on our site, enrich them in Clay and tell me if they're a fit."

Create a webhook-source table, copy its URL and token into the server's environment as `CLAY_WEBHOOK_URL`, and POST the sign-up as JSON (see section 2). Add enrichment columns for company size and funding plus the scoring column; when the score passes your threshold, an HTTP API column posts the row to your `/internal/qualified-leads` endpoint.

Result: each sign-up appears as a row within seconds, enriched automatically, and only qualified rows call your service.

## Guidelines

- Start every table from the domain, and test on a small sample before a full run; waterfalls and AI columns spend Data Credits per row.
- Verify emails before sending and respect opt-out rules (CAN-SPAM, GDPR); Clay finds data, you remain responsible for how it is used.
- Treat the webhook URL, webhook token and API key as secrets. Never put them in browser code or a public repository.
- Do not invent Clay REST paths. The Public API has only the endpoints listed above; reading arbitrary table rows needs the Enterprise `tables/query` endpoint.
- Re-run enrichment periodically (titles, headcount and tech stacks go stale), but reuse saved enrichment data where possible to avoid paying twice.
- Plan limits, prices and feature gating change often; confirm on the pricing page rather than relying on remembered numbers.
- Clay is not a sending tool by itself; its native Sequencer or your existing outreach tool sends the mail.
