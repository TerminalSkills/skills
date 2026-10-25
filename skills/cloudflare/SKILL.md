---
name: cloudflare
description: >-
  Cloudflare is a global network that sits in front of a website or API to provide DNS, CDN caching, DDoS protection, TLS and WAF, and runs serverless code at the edge with Workers. Use this skill when a user asks to put a site behind Cloudflare, create or script DNS records, choose an SSL/TLS encryption mode, manage Cloudflare with Terraform, or deploy a Worker.
license: Apache-2.0
compatibility: Any website or API; a Cloudflare account, an API token, Node.js 22+ for Wrangler 4
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags: "cloudflare, cdn, dns, waf, workers"
---

# Cloudflare

## Overview

Cloudflare provides DNS, a proxying CDN, DDoS protection, TLS, WAF and edge compute (Workers). Checked on 2026-10-24 against developers.cloudflare.com: Terraform provider 5.28.1 and Wrangler 4.152.0 are current.

## Instructions

### Step 1: DNS records through the API

Change the domain's nameservers to the two Cloudflare assigns when you add the zone. Then create an API token (dashboard: My Profile > API Tokens, the "Edit zone DNS" template) scoped to the one zone, and keep it in the environment.

```bash
export CLOUDFLARE_API_TOKEN="..."   # from your secret store
export ZONE_ID="023e105f4ecef8ad9ca31a8372d0c353"

curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"app","content":"203.0.113.10","ttl":1,"proxied":true}'
```

`ttl: 1` means automatic (proxied records are always automatic). `proxied: true` is the orange cloud: traffic goes through Cloudflare; `false` is DNS only. Proxy status applies to `A`, `AAAA` and `CNAME` records only.

### Step 2: SSL/TLS encryption mode

The mode controls the Cloudflare-to-origin connection. In the dashboard under SSL/TLS > Overview, Automatic SSL/TLS is the default (zones not yet migrated show only Custom), and it picks the most secure mode the origin supports and never downgrades. To choose yourself, use Custom SSL/TLS:

- Flexible: HTTP to the origin (the origin leg is unencrypted; avoid)
- Full: HTTPS to the origin, certificate not validated
- Full (strict): HTTPS to the origin with a valid certificate (recommended; a free Cloudflare Origin CA certificate works on the origin)

### Step 3: Terraform (provider v5)

In provider v5 the resource is `cloudflare_dns_record` (the old `cloudflare_record` is the v4 name) and `ttl` is required.

```hcl
# cloudflare.tf
terraform {
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.0" }
  }
}

provider "cloudflare" {} # reads CLOUDFLARE_API_TOKEN from the environment

resource "cloudflare_dns_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "app"
  content = "203.0.113.10"
  type    = "A"
  ttl     = 1
  proxied = true
}
```

### Step 4: Workers (edge compute)

Scaffold with `npm create cloudflare@latest -- status-worker`, run locally with `npx wrangler dev`, and publish with `npx wrangler deploy`. The project config is `wrangler.jsonc`.

```javascript
// src/index.js
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') {
      return new Response('OK', { status: 200 })
    }
    return fetch(request)    // pass through to the origin
  }
}
```

## Examples

### Example 1: Put a new site behind Cloudflare

**User request:** "Add app.northwind-labs.dev to Cloudflare, proxied, pointing at 203.0.113.10."

Add the zone, switch nameservers at the registrar, run the Step 1 curl, then confirm with `curl -sI https://app.northwind-labs.dev` (a `server: cloudflare` header means traffic is proxied). Install a Cloudflare Origin CA certificate on the origin and set Full (strict).

### Example 2: Health endpoint at the edge

**User request:** "Answer /api/health from Cloudflare without hitting my server."

Create the Worker from Step 4 with `npm create cloudflare@latest`, add a route for the zone in `wrangler.jsonc`, run `npx wrangler deploy`, and `curl https://app.northwind-labs.dev/api/health` returns `OK`.

## Guidelines

- Free plan: Workers Free allows 100,000 requests per day (then error 1027); Workers Paid has no daily limit. Check current plan limits at developers.cloudflare.com/workers/platform/limits.
- Scope API tokens to one zone and one permission set; never use the legacy global API key.
- Use Full (strict) in production; Flexible leaves the origin leg unencrypted.
- A grey-cloud (DNS only) record exposes the origin IP; keep the origin firewall open only to Cloudflare ranges when proxying.
- When upgrading Terraform from provider v4 to v5, rename resources and run `terraform plan` before applying; v5 has different attribute names.
