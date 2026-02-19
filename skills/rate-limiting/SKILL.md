---
name: infra-rate-limiting
description: >-
  Assists with configuring infrastructure-level rate limiting at the reverse proxy, API
  gateway, CDN, and WAF layers. Use when setting up Nginx rate limiting, Cloudflare rate
  rules, AWS API Gateway throttling, Kong rate limiting plugins, or CDN-level DDoS
  protection. Trigger words: nginx rate limit, api gateway throttling, cloudflare rate
  limiting, waf, cdn rate limit, infrastructure throttling.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["rate-limiting", "nginx", "api-gateway", "cdn", "waf"]
---

# Infrastructure Rate Limiting

## Overview

Infrastructure-level rate limiting protects APIs and services at the network edge before requests reach application code. This includes Nginx `limit_req` zones, API gateway throttling (AWS API Gateway, Kong, Traefik), CDN-level rules (Cloudflare, Fastly, AWS CloudFront), and WAF rate policies. Unlike application-level rate limiting (covered by the rate-limiter skill), infrastructure rate limiting requires no code changes and handles volumetric attacks, DDoS mitigation, and global traffic shaping.

## Instructions

- When configuring Nginx, define `limit_req_zone` with a shared memory zone keyed on `$binary_remote_addr`, then apply `limit_req` on location blocks with `burst` for spikes and `nodelay` to reject excess immediately rather than queuing.
- When using API gateways, configure throttling at the route or stage level: AWS API Gateway uses `throttle.rateLimit` and `throttle.burstLimit`; Kong uses the `rate-limiting` plugin with Redis backing; Traefik uses the `RateLimit` middleware.
- When setting up CDN-level rules, configure Cloudflare Rate Limiting rules with expression-based matching (path, method, headers), set thresholds per period, and choose actions (block, challenge, JS challenge) with custom response pages.
- When implementing WAF rate policies, define rules that combine rate thresholds with request characteristics (user-agent, geography, request size) to distinguish legitimate traffic from attacks, using AWS WAF rate-based rules or Cloudflare WAF custom rules.
- When protecting against DDoS, layer rate limits at multiple levels: CDN edge first, then API gateway, then reverse proxy, with progressively tighter limits closer to the application.
- When monitoring, track rate-limited request counts, origin IPs, and geographic distribution in dashboards (Cloudflare Analytics, AWS CloudWatch, Nginx status module) to tune thresholds and detect attack patterns.

## Examples

### Example 1: Configure Nginx rate limiting for an API

**User request:** "Add rate limiting to Nginx for my API with different limits per endpoint"

**Actions:**
1. Define zones: `limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s` and `zone=auth:10m rate=5r/m`
2. Apply `limit_req zone=auth burst=3 nodelay` to the `/api/auth` location block
3. Apply `limit_req zone=api burst=50 nodelay` to the general `/api/` location block
4. Configure custom 429 error page and add `X-RateLimit-*` headers via `add_header`

**Output:** An Nginx configuration with per-endpoint rate limits, burst allowance, and proper rate limit headers.

### Example 2: Set up Cloudflare rate limiting with WAF rules

**User request:** "Protect my API from abuse using Cloudflare rate limiting and WAF"

**Actions:**
1. Create a Cloudflare Rate Limiting rule matching `/api/*` with a threshold of 100 requests per minute per IP
2. Add a stricter rule for `/api/auth/*` at 10 requests per minute with CAPTCHA challenge
3. Configure WAF custom rules to block requests with suspicious user-agent patterns
4. Set up Cloudflare Analytics alerts for rate-limited traffic spikes

**Output:** Cloudflare edge-level rate limiting with WAF rules that block abuse before requests reach the origin server.

## Guidelines

- Layer rate limits at multiple levels (CDN, gateway, proxy) with tighter limits closer to the application.
- Use `nodelay` with Nginx `limit_req` to reject excess requests immediately rather than queuing them.
- Configure different rate limits per endpoint: authentication endpoints need the strictest limits.
- Set minimum per-IP limits above 100 requests/minute for non-auth endpoints since corporate networks share IPs via NAT.
- Use CDN-level rate limiting for DDoS protection since it blocks traffic at the edge before it reaches your infrastructure.
- Monitor rate-limited request patterns to tune thresholds and detect coordinated attacks.
- Return `429 Too Many Requests` with `Retry-After` header at every rate limiting layer for client compatibility.
