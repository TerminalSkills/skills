---
title: "Self-Host Workflow Automation and Proxy Services"
slug: self-host-automation-and-proxy-services
description: "Deploy n8n for workflow automation and 3proxy for network proxy access on your own infrastructure, avoiding SaaS costs and retaining full control over data and routing."
skills:
  - n8n-self-host
  - 3proxy
category: devops
tags:
  - self-hosted
  - automation
  - proxy
  - n8n
  - privacy
---

# Self-Host Workflow Automation and Proxy Services

## The Problem

A 20-person agency uses Zapier for 40 workflow automations (CRM sync, invoice generation, lead scoring, Slack notifications) at $250 per month, and a commercial proxy service for web scraping and competitive research at $180 per month. Both services handle sensitive client data -- CRM records flow through Zapier, and research queries reveal client strategy through the proxy provider's logs. The agency wants to reduce costs, own their data pipeline, and run everything on infrastructure they already pay for. They also need authenticated proxy access for distributed team members doing geo-targeted research from restrictive networks.

## The Solution

Deploy **n8n** using the **n8n-self-host** skill for visual workflow automation that replaces Zapier, and set up **3proxy** for authenticated HTTP and SOCKS5 proxy access. Both run on a single VPS alongside existing services, cutting $430 per month in SaaS costs while keeping all data on owned infrastructure.

## Step-by-Step Walkthrough

### 1. Deploy n8n with Docker and persistent storage

Set up n8n with proper database backing, environment variables, and reverse proxy access so workflows survive container restarts. Using PostgreSQL instead of the default SQLite prevents database corruption when multiple workflows execute simultaneously.

> Deploy n8n self-hosted on our Hetzner VPS using Docker Compose. Use PostgreSQL as the database backend instead of SQLite for reliability. Configure it behind our existing Caddy reverse proxy at automate.agency.com with basic auth. Set the timezone to America/New_York, enable execution data pruning after 30 days, and configure the webhook URL so external services can trigger workflows.

The webhook URL configuration is critical: n8n needs to know its public-facing URL so it can generate correct webhook endpoints that HubSpot and other external services can call.

### 2. Migrate Zapier workflows to n8n

Recreate the most critical automations in n8n, starting with the ones that process the most sensitive data. The visual workflow editor in n8n makes complex branching logic easier to debug than Zapier's linear step model.

> Recreate our top 5 Zapier workflows in n8n. First: when a new deal closes in HubSpot, create an invoice in QuickBooks, notify the #revenue channel in Slack, and add a row to our Google Sheets revenue tracker. Second: when a form submission arrives on our website, score the lead based on company size and budget fields, create a HubSpot contact, and assign it to a sales rep based on territory. Include error handling that retries failed steps 3 times and sends a Slack alert if a workflow fails permanently.

Prioritize migrating workflows that handle client financial data first, since those benefit most from self-hosting where the data never leaves your infrastructure.

### 3. Configure 3proxy with team authentication

Set up authenticated proxy access so team members can route research traffic through the agency's server with individual credentials and bandwidth tracking.

> Configure 3proxy on the same VPS with HTTP proxy on port 3128 and SOCKS5 on port 1080. Create individual accounts for each team member with strong passwords. Set bandwidth limits to 20 GB per month per user. Block access to internal network ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16) so proxy users cannot reach other services on the VPS. Enable daily log rotation with 60-day retention.

### 4. Connect n8n workflows to proxy-dependent tasks

Build n8n workflows that use the proxy for automated research tasks, combining automation with network routing. This is where self-hosting both services on the same server pays off -- n8n can reach 3proxy over localhost with zero network overhead.

> Create an n8n workflow that runs every Monday morning: fetch our 10 tracked competitor URLs through the 3proxy SOCKS5 connection, check for pricing page changes by comparing against last week's snapshot, and if any changes are detected, post a summary to the #competitive-intel Slack channel with before and after screenshots. Store the snapshots in a local directory for historical comparison.

Routing research traffic through 3proxy means the requests originate from the agency's server IP rather than from the office network, keeping the agency's identity separate from its competitive research activities.

### 5. Set up monitoring and backups for both services

Ensure the self-hosted services are as reliable as the SaaS products they replaced.

> Add Uptime Kuma monitors for both n8n (HTTP check on automate.agency.com) and 3proxy (TCP check on ports 3128 and 1080). Create a daily backup script that dumps the n8n PostgreSQL database and the 3proxy traffic counter file to S3-compatible storage. Set up a Slack alert if either service goes down for more than 2 minutes.

## Real-World Example

The agency deployed both services on a Friday afternoon using a $12/month Hetzner CX22 VPS they already owned. The n8n migration took a full day -- the lead developer recreated 15 workflows by Monday, with the remaining 25 migrated over the following week. The most complex workflow (lead scoring with conditional routing to three different sales reps based on territory and deal size) actually worked better in n8n because the visual editor made the branching logic visible instead of hidden behind Zapier's collapsed step list.

The 3proxy setup took 45 minutes. Each team member received credentials and configured their browser profiles for proxy access. The competitive research team appreciated having a consistent exit IP rather than the rotating IPs from the old proxy service, which kept triggering CAPTCHAs on target sites.

After the first month, the agency saved $430 in SaaS fees, reduced external data exposure to zero, and gained the ability to build custom workflow integrations that Zapier's pre-built connectors never supported. The n8n competitive monitoring workflow -- which combined proxy access with web scraping and Slack notifications -- would have required three separate SaaS tools before, but now ran as a single self-hosted pipeline.
