---
name: cloudflare
description: >-
  Protect and accelerate websites with Cloudflare. Use when a user asks to add
  CDN, DDoS protection, DNS management, SSL, WAF, or edge computing to a
  website or API.
license: Apache-2.0
compatibility: 'Any website or API'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - cloudflare
    - cdn
    - dns
    - ddos
    - waf
    - ssl
---

# Cloudflare

## Overview

Cloudflare provides CDN, DDoS protection, DNS, SSL, WAF, and edge computing (Workers). Free tier includes unlimited bandwidth, DNS, basic DDoS protection, and SSL.

## Instructions

### Step 1: DNS Management

Point your domain nameservers to Cloudflare, then manage DNS via dashboard or API.

```bash
# Cloudflare API — manage DNS records
curl -X POST "https://api.cloudflare.com/client/v4/zones/ZONE_ID/dns_records" \
  -H "Authorization: Bearer CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"type":"A","name":"app","content":"1.2.3.4","proxied":true}'
```

### Step 2: SSL/TLS

Always use **Full (Strict)** mode in production:
- Flexible: CF terminates SSL, HTTP to origin (insecure)
- Full: HTTPS to origin, self-signed OK
- Full (Strict): HTTPS to origin, valid cert required (recommended)

### Step 3: Terraform Management

```hcl
# cloudflare.tf — Infrastructure as code
resource "cloudflare_record" "app" {
  zone_id = var.cloudflare_zone_id
  name    = "app"
  content = "1.2.3.4"
  type    = "A"
  proxied = true
}
```

### Step 4: Workers (Edge Compute)

```javascript
// worker.js — Runs at the edge, <1ms cold start
export default {
  async fetch(request) {
    const url = new URL(request.url)
    if (url.pathname === '/api/health') {
      return new Response('OK', { status: 200 })
    }
    return fetch(request)    // pass through to origin
  }
}
```

## Guidelines

- Free tier: unlimited bandwidth, DDoS protection, DNS, shared SSL.
- Orange cloud (proxied) = traffic through Cloudflare. Grey cloud = DNS only.
- Workers: 100K requests/day free, <1ms cold starts.
- Always use Full (Strict) SSL — Flexible mode is a security risk.
