---
title: "Plan Multi-Region Deployment Strategy with AI"
slug: plan-multi-region-deployment
description: "Design and implement a multi-region deployment architecture for improved latency, reliability, and compliance."
skills: [coding-agent, docker-helper, hetzner-cloud]
category: devops
tags: [multi-region, deployment, infrastructure, high-availability, latency]
---

# Plan Multi-Region Deployment Strategy with AI

## The Problem

Priya is the CTO of a 15-person SaaS startup that just signed an enterprise deal with a German logistics company. The contract requires EU data residency and 99.9% uptime. The problem: everything runs on a single Hetzner server in Ashburn, Virginia.

European users see 100ms+ of network latency on every API call. Australian customers complain about slow page loads. A single-region outage last quarter took the entire product offline for 45 minutes, which on a 99.9% SLA (about 43 minutes of downtime per 30 days) burns the whole monthly error budget in one incident.

Multi-region is the obvious answer, but the complexity feels overwhelming for a 15-person team: database replication across regions, latency-aware DNS routing, deployments that do not break when one region is mid-update, and data residency rules that dictate where specific users' data physically lives. Priya needs all of them working together within a $2,000/month infrastructure budget.

## The Solution

Use **coding-agent** to draft and review the design and the infrastructure code in small scoped tasks, **hetzner-cloud** for the Hetzner locations, server types, firewalls and load balancers, and **docker-helper** to package the API as one image that runs identically in every region. The design below separates data by residency, adds a standby inside each jurisdiction for high availability, routes users with Cloudflare Load Balancing, and deploys one region at a time.

## Step-by-Step Walkthrough

### Step 1: Define Requirements and Constraints

```text
We run a Next.js frontend and Express API with Postgres. Currently single-region
on Hetzner in Ashburn (US East). We need to expand to Europe and Asia for:
- Lower latency for global users
- EU data residency for GDPR compliance
- High availability (survive a full region outage)
Our budget for infrastructure is $2,000/month. Help me plan this.
```

Write down the constraints the agent must respect. Hetzner Cloud has no Frankfurt location: its cloud locations are Falkenstein (`fsn1`), Nuremberg (`nbg1`) and Helsinki (`hel1`) in the `eu-central` network zone, Ashburn (`ash`, `us-east`), Hillsboro (`hil`, `us-west`) and Singapore (`sin`, `ap-southeast`). Confirm what each location offers with `hcloud location list` and `hcloud server-type list`, because server types differ by location (the older `cx` types were withdrawn for new orders at the start of 2026). Price every line from the current Hetzner price list rather than from memory. Self-managing Postgres replication is the trade for low cost: you give up the managed failover that a cloud database service provides.

### Step 2: Design the Architecture

Residency changes the design. A read replica of the US database in Europe does not satisfy "EU data stays in the EU", and a US primary cannot also be the EU users' writable home. So the data layer is split by user residency instead of replicated across regions:

- **US cluster:** Postgres primary in `ash`, asynchronous standby in `hil` (same legal region, different site), serving users with `region=us`.
- **EU cluster:** a separate Postgres primary in `fsn1`, standby in `nbg1` or `hel1`, serving users with `region=eu`. Its data is never replicated outside the EU.
- **Singapore (`sin`):** stateless API servers and a local cache only. Requests that need the database go over the WireGuard link to the user's home cluster, so Asian users still pay a cross-ocean round trip for each query. If that is too slow, put a read replica of the US cluster there for `region=us` users only, never of the EU cluster.
- **Per region:** two API servers behind a Hetzner Load Balancer (one in `sin`), and an identical container image everywhere.
- **Routing:** Cloudflare Load Balancing, one pool per region, with health monitors and a steering policy (dynamic or proximity) so each user lands on a nearby healthy pool. Cloudflare Load Balancing is a separately priced add-on, so include it in the budget. Failover time is your monitor interval times its retry count; set it explicitly and test it.

Why not active-active over one logical database? Writes need a single primary per dataset, and the contract asks for residency, which sharding by jurisdiction gives you directly. A standby in the same jurisdiction covers a site failure; a full-region failure of the US or EU cluster means a manual (or Patroni-driven) promotion of the standby and, because replication is asynchronous, the loss of the last moments of writes.

### Step 3: Generate Infrastructure-as-Code

Ask the agent for Terraform with the `hetznercloud/hcloud` provider, with each region defined by variables rather than copied code:

```text
Write Terraform for the hcloud provider: a map of regions (location, server type, API server count), one firewall that allows 443 and UDP 51820 (WireGuard) and SSH only from our office IP, and one server per region/index. Use for_each, no copy-paste. Run terraform validate.
```

A validated core of the result (the token comes from `TF_VAR_hcloud_token` and the SSH source from `TF_VAR_office_cidr`; the server type per location is an example, check yours):

```hcl
terraform {
  required_providers {
    hcloud = { source = "hetznercloud/hcloud", version = "~> 1.70" }
  }
}

variable "hcloud_token" {
  type      = string
  sensitive = true
}

variable "office_cidr" {
  type        = string
  description = "Your office or VPN address, e.g. 203.0.113.7/32"
}

variable "regions" {
  type = map(object({ location = string, server_type = string, api_count = number }))
  default = {
    us = { location = "ash", server_type = "cpx31", api_count = 2 }
    eu = { location = "fsn1", server_type = "cx33", api_count = 2 }
    ap = { location = "sin", server_type = "cpx22", api_count = 1 }
  }
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_ssh_key" "deploy" {
  name       = "deploy-key"
  public_key = file(pathexpand("~/.ssh/id_ed25519.pub"))
}

resource "hcloud_firewall" "api" {
  name = "api"
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = [var.office_cidr]
  }
  rule {
    direction  = "in"
    protocol   = "udp"
    port       = "51820"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "api" {
  for_each = merge([
    for name, r in var.regions : { for i in range(r.api_count) : "${name}-${i + 1}" => r }
  ]...)

  name         = "api-${each.key}"
  server_type  = each.value.server_type
  location     = each.value.location
  image        = "ubuntu-24.04"
  ssh_keys     = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.api.id]
  labels       = { role = "api", region = split("-", each.key)[0] }
}
```

Review `terraform plan` before any `apply`: each server starts billing immediately. Decisions the design needs on top of this core:

- **WireGuard between regions.** Hetzner private networks do not span network zones, so cross-region traffic must be encrypted by you. Postgres ports stay closed to the public internet and listen on the WireGuard address only.
- **PgBouncer** next to the API servers in each region to pool connections to the local cluster.
- **Postgres standbys** are created with `pg_basebackup -R -X stream` from the primary over WireGuard, and use a replication role limited to that address.
- **One image everywhere.** docker-helper writes a multi-stage Dockerfile for the API and a `compose.yaml` for local runs; the same tag is deployed to every region.

### Step 4: Build Deployment Orchestration

Deployments roll region by region, starting with the lowest-traffic region (Singapore), so a bad release hits the fewest users first:

```bash
# deploy.sh outline (the agent fills in your deploy mechanism)
# 1. Singapore:  deploy new image, run smoke tests
# 2. EU:         deploy, smoke tests, check replication lag on the standby
# 3. US:         deploy, full integration tests
# 4. On failure in a region: roll that region back to the previous image tag and stop
```

Schema migrations are the dangerous part: run them as backward-compatible steps (add the column, deploy code that handles both shapes, backfill, then remove the old column) because during a rolling release two app versions share each database. Three health endpoints give the pipeline something to check:

| Endpoint | What It Checks | Failure Action |
|---|---|---|
| `/health/basic` | Process is up and can serve a request | Roll back immediately |
| `/health/db` | Database reachable; standby replay lag under your threshold | Pause the deploy, alert |
| `/health/full` | Postgres, cache and external APIs | Roll back if critical dependencies fail |

Measure lag on the primary with `SELECT application_name, replay_lag FROM pg_stat_replication;` or on the standby with `SELECT now() - pg_last_xact_replay_timestamp();`. Choose the threshold from your own measured baseline and migration behavior; lag can jump during large migrations, so alert on a sustained breach rather than a single sample.

### Step 5: Enforce Data Residency in the Application

Running servers in Europe is not enough; the application must send each user's reads and writes to their home cluster. Users get `region=eu` or `region=us` at signup (from the billing country, with a documented rule for edge cases) and the value is stored in the user record and the signed JWT:

```typescript
// src/middleware/region-router.ts
import type { NextFunction, Request, Response } from 'express';
import { Pool } from 'pg';

type Region = 'us' | 'eu';

const pools: Record<Region, Pool> = {
  us: new Pool({ connectionString: process.env.DATABASE_URL_US }),
  eu: new Pool({ connectionString: process.env.DATABASE_URL_EU }),
};

declare module 'express-serve-static-core' {
  interface Request {
    auth?: { sub: string; region?: string }; // set by auth middleware AFTER it verified the JWT signature
    db?: Pool;
  }
}

export function regionRouter(req: Request, res: Response, next: NextFunction): void {
  const region = req.auth?.region;
  if (region !== 'us' && region !== 'eu') {
    res.status(403).json({ error: 'user has no data residency region' }); // fail closed, never default to us
    return;
  }
  req.db = pools[region];
  next();
}
```

The middleware reads the region only from a verified token and fails closed, so a missing or tampered claim can never write EU data to the US cluster. Keep EU personal data out of US-side logs, caches, analytics and backups as well, and have counsel confirm the contract's exact wording.

Moving existing EU users out of the US database is a one-off job: copy their rows in batches to the EU primary, compare row counts and per-batch checksums, switch the user's `region` only after a batch verifies, and delete from the US cluster at the end. Write it to be re-runnable, and rehearse it on a copy of production first.

## Real-World Example

Priya's team deploys the EU region first, migrates the German client's data to the EU cluster, and passes the customer's compliance review, which unblocks the signed contract. The US cluster keeps serving US users unchanged; Singapore goes live last as the lowest-risk region.

They then run a game day: block the EU pool at the Cloudflare monitor and watch traffic move to the remaining pools according to the failover rules, then bring it back. The exercise shows the gap that the design predicted: EU users reaching a US API server can no longer read their data, because the EU cluster is the only home of that data. The team decides EU traffic should fail to a maintenance page and the EU standby promotion runbook becomes the recovery path.

They end with a setup priced from Hetzner's price list at a fraction of what the same topology costs on a hyperscaler's managed services, with the difference paid for in operational work: patching Postgres, rehearsing failover, and watching replication.
