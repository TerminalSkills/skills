---
title: "Configure Production Traffic Management with Caddy, Load Balancing, and Rate Limiting"
slug: configure-production-traffic-management
description: "Set up a production traffic stack with Caddy as a reverse proxy, weighted load balancing across backends, and rate limiting to protect APIs from abuse."
skills:
  - caddy
  - load-balancer
  - rate-limiter
category: devops
tags:
  - reverse-proxy
  - load-balancing
  - rate-limiting
  - traffic-management
---

# Configure Production Traffic Management with Caddy, Load Balancing, and Rate Limiting

## The Problem

A SaaS company runs three API servers behind a single Nginx reverse proxy with no rate limiting. During a product launch, one enterprise customer's integration script hammered the API with 2,000 requests per second, saturating all three backends and causing 504 timeouts for every other customer. The Nginx config is 400 lines of copy-pasted directives nobody fully understands, SSL certificates require manual renewal, and there is no way to gradually shift traffic to a new deployment without editing the config and reloading. The last SSL expiry took the API offline for 90 minutes on a Saturday because nobody was monitoring the certificate renewal cron job. When the post-mortem asked why the certificate was not auto-renewed, the answer was that the certbot cron had silently failed three weeks earlier.

## The Solution

Replace the brittle Nginx setup with **Caddy** for automatic HTTPS and clean reverse proxy configuration, use the **load-balancer** skill to distribute traffic across backends with health checks and weighted routing, and add the **rate-limiter** skill to protect endpoints from abuse with tiered per-client limits. Together, these three layers handle everything from SSL termination to abuse prevention in a single, readable configuration.

## Step-by-Step Walkthrough

### 1. Set up Caddy as the reverse proxy with automatic HTTPS

Replace Nginx with Caddy to get automatic certificate provisioning and a readable configuration file. Caddy handles HTTPS by default -- there is no separate certbot setup, renewal cron, or manual configuration required.

> Create a Caddyfile that reverse-proxies api.example.com to three backend servers on ports 8001, 8002, and 8003. Enable automatic HTTPS with Let's Encrypt. Add health checks that probe /health every 10 seconds and remove unhealthy backends from rotation. Enable access logging in JSON format to /var/log/caddy/access.log.

The health checks are critical: when a backend goes down during a deployment, Caddy automatically removes it from rotation within 10 seconds and redistributes traffic to the healthy backends.

### 2. Configure weighted load balancing for blue-green deployments

Set up weighted traffic distribution so new deployments can receive a small percentage of traffic before going fully live. This eliminates the current practice of deploying directly to all backends and hoping nothing breaks.

> Configure Caddy's load balancing to use weighted round-robin. Assign 80% of traffic to the two stable backends on ports 8001 and 8002, and 20% to the canary backend on port 8003. Add sticky sessions using a cookie so individual users stay on the same backend for their session. Include a header-based override so the team can force traffic to a specific backend by setting X-Backend-Target for debugging.

The weight configuration can be changed and reloaded without downtime, so shifting from 20% canary to 100% is a one-line change that takes effect in under a second.

### 3. Implement tiered rate limiting per API key

Add rate limiting that differentiates between free-tier and enterprise customers based on their API key. Without tiered limits, a single free-tier user can consume as many resources as your largest paying customer.

> Add rate limiting to the API with three tiers. Free-tier API keys get 60 requests per minute and 1,000 per hour. Pro-tier keys get 300 per minute and 10,000 per hour. Enterprise keys get 1,000 per minute and 50,000 per hour. Rate limit by API key extracted from the Authorization header. Return standard 429 responses with Retry-After and X-RateLimit-Remaining headers. Exempt the /health and /status endpoints from all limits.

The X-RateLimit-Remaining header is important for well-behaved clients: it lets integration scripts throttle themselves before hitting the limit, avoiding the retry-after-429 dance entirely.

### 4. Add abuse protection for authentication endpoints

Apply strict rate limits to sensitive endpoints that are common targets for brute-force attacks. These limits are separate from the API tier limits because authentication abuse is a security concern, not a usage concern.

> Add aggressive rate limiting to POST /auth/login and POST /auth/register. Limit to 5 login attempts per IP per minute with a 15-minute block after 20 failed attempts in an hour. Limit registration to 3 accounts per IP per hour. Log every blocked request with the source IP and the rule that triggered the block. Add the X-Forwarded-For header parsing so rate limits apply to the real client IP, not the CDN edge IP.

### 5. Set up traffic monitoring and alerting

Configure logging and metrics so the team can see traffic patterns and rate-limit events in real time. Without visibility, rate limits and load balancing configuration are just guesses -- metrics tell you whether they are working.

> Add a /metrics endpoint to Caddy that exposes Prometheus-compatible metrics for request count by status code, backend health status, active connections per backend, and rate-limit events by tier. Create a Grafana dashboard JSON that visualizes requests per second, error rate, p95 latency, and rate-limited requests over time.

The dashboard should be the first thing the on-call engineer checks during an incident: it shows immediately whether the problem is traffic volume, backend failures, or rate-limit saturation.

## Real-World Example

A developer tools company migrated from their patched Nginx setup to Caddy on a Friday afternoon. The Caddyfile was 45 lines compared to the old 400-line Nginx config. SSL certificates provisioned automatically within seconds -- the Let's Encrypt integration handled both the initial provisioning and automatic renewal, eliminating the certificate expiry risk entirely.

On Monday, they deployed a new API version to the canary backend at 10% traffic weight, monitored error rates for two hours, then shifted to 50% and finally 100% by end of day -- all by changing one weight value and reloading Caddy. The health checks caught a configuration bug on the canary backend within 30 seconds and automatically removed it from rotation before any user-facing errors occurred.

The following week, a bot network hit the login endpoint with credential-stuffing attacks at 800 requests per second. The rate limiter blocked 99.6% of the attempts, legitimate users saw no degradation, and the security log captured every blocked IP for the incident report. The Grafana dashboard showed the attack as a clean spike in the rate-limited requests graph, making it obvious in the weekly operations review exactly when the attack started, how long it lasted, and that it had zero impact on real users.
