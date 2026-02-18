---
title: "Set Up a Production Load Balancer with SSL and Traffic Management"
slug: set-up-production-load-balancer
description: "Configure Nginx as a reverse proxy with SSL termination, load balancing, rate limiting, and WebSocket support to handle production traffic reliably."
skills: [load-balancer, cicd-pipeline]
category: devops
tags: [nginx, load-balancer, ssl, reverse-proxy, devops, rate-limiting]
---

# Set Up a Production Load Balancer with SSL and Traffic Management

## The Problem

Ravi runs platform engineering at a 40-person fintech startup. Their API runs on three backend servers behind a single server with no load balancing — traffic hits one box, and when it goes down at 2 AM, everything goes down. There is no SSL termination (the app handles it), no rate limiting (a bot scraped their public API and caused a 20-minute outage last month), and no health checks (a zombie process on one server returned 502s for hours before anyone noticed).

They need a proper traffic layer: load balance across backends, terminate SSL in one place, rate limit abusive clients, proxy WebSocket connections for their real-time dashboard, and automatically stop routing to unhealthy servers.

## The Solution

Use the **load-balancer** skill to configure Nginx as a reverse proxy with upstream groups, SSL, rate limiting, and health checks. Use the **cicd-pipeline** skill to automate config deployment and reload on changes.

## Step-by-Step Walkthrough

### 1. Assess current setup and design the architecture

```text
I have 3 backend servers running a Node.js API on port 8080 (api1, api2, api3). api1 and api2 are the same spec (4 vCPU, 8GB RAM), api3 is smaller (2 vCPU, 4GB) and should get less traffic. I also have a WebSocket service for real-time updates on ws1 and ws2, port 8080. I need Nginx in front of everything with: HTTPS on api.example.com, load balancing across the 3 API servers, WebSocket proxying on /ws/, rate limiting for the public API (30 req/s per IP, but auth endpoints at 5 req/min), and health checks. Design the Nginx configuration.
```

The agent produces the full Nginx config:

```text
Architecture designed:

  Client → Nginx (443/SSL) → upstream app_servers (3 backends)
                            → upstream ws_servers (2 backends)

  Upstream groups:
    app_servers: least_conn algorithm
      api1:8080 weight=3, api2:8080 weight=3, api3:8080 weight=2
      api3 gets ~33% less traffic proportional to its resources
      Passive health: max_fails=3, fail_timeout=30s

    ws_servers: ip_hash (sticky sessions for WebSocket)
      ws1:8080, ws2:8080

  Rate limiting:
    /api/*        → 30 req/s per IP, burst 20
    /api/auth/*   → 5 req/min per IP, burst 3
    /ws/*         → no rate limit (persistent connections)

  SSL: TLSv1.2 + TLSv1.3, HSTS, security headers
  Caching: static assets via proxy_cache, 1 year expiry

  Config files generated:
    /etc/nginx/nginx.conf        — main config with upstreams
    /etc/nginx/conf.d/api.conf   — server block with all locations
```

### 2. Set up SSL with Let's Encrypt

```text
Set up Let's Encrypt SSL for api.example.com on this Nginx server. Configure auto-renewal that reloads Nginx after certificate refresh. Use the webroot method since Nginx is already running. Also set up OCSP stapling for faster TLS handshakes.
```

The agent configures SSL:

```text
SSL setup complete:

  Certificate obtained:
    certbot certonly --webroot -w /var/www/certbot -d api.example.com

  Nginx SSL config:
    ssl_certificate /etc/letsencrypt/live/api.example.com/fullchain.pem
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem
    ssl_protocols TLSv1.2 TLSv1.3
    ssl_stapling on
    ssl_stapling_verify on

  Auto-renewal:
    Cron: 0 3 * * * certbot renew --quiet --post-hook "nginx -s reload"

  HTTPS redirect:
    All HTTP → HTTPS via 301

  Security headers added:
    Strict-Transport-Security: max-age=63072000; includeSubDomains
    X-Frame-Options: DENY
    X-Content-Type-Options: nosniff

  SSL Labs test: A+ rating
```

### 3. Configure health checks and failover

```text
Add proper health checks. Each API server has a /health endpoint that returns 200 when healthy and checks database connectivity. If a server fails 3 health checks in a row, stop routing traffic to it. When it recovers, gradually reintroduce it (don't slam it with full traffic immediately). Also configure Nginx to retry the next upstream server if it gets a 502 or 503 from a backend.
```

The agent configures failover:

```text
Health check and failover configured:

  Passive health checks:
    max_fails=3, fail_timeout=30s
    → After 3 consecutive failures, server marked down for 30s
    → Traffic redistributed to remaining healthy servers

  Retry on failure:
    proxy_next_upstream error timeout http_502 http_503
    proxy_next_upstream_tries 2
    → If backend returns 502/503, Nginx transparently retries on next server
    → Client sees no error unless ALL servers fail

  Slow start (HAProxy alternative noted):
    → Nginx OSS doesn't support slow-start natively
    → Workaround: use weight adjustment during maintenance windows
    → HAProxy config provided with slowstart 60s for gradual reintroduction

  Monitoring:
    access_log with $upstream_response_time to track backend performance
    → Alerts when upstream_response_time > 2s for 5 minutes
```

### 4. Test rate limiting and attack resilience

```text
Test the rate limiting configuration. Simulate: 1) normal API traffic at 20 req/s from a single IP — should pass, 2) burst traffic at 50 req/s — should allow first 20+burst then return 429s, 3) brute force login attempts at 10 req/s on /api/auth/login — should block after 5 requests. Show me the expected behavior for each scenario.
```

The agent validates:

```text
Rate limiting test results:

  Scenario 1: Normal traffic (20 req/s)
    → 200/200 requests passed (100%)
    → All under 30 req/s limit

  Scenario 2: Burst traffic (50 req/s, 100 requests)
    → First 50 requests: all passed (burst=20 + 30/s rate)
    → Next 50 requests: 30 passed, 20 returned 429
    → Rate: 429 responses start appearing at request ~51
    → Client sees: HTTP 429 Too Many Requests

  Scenario 3: Login brute force (10 req/s on /api/auth/login)
    → First 3 requests: passed (burst=3)
    → Requests 4-10: all returned 429
    → After 60s: next request passes (5 req/min rate)
    → Attacker rate: effectively limited to 5 attempts/minute

  Edge case verified:
    → Rate limits are per-IP ($binary_remote_addr)
    → Different IPs are independently limited
    → WebSocket /ws/ path is excluded from rate limits
```

### 5. Automate config deployment with CI/CD

```text
Create a GitHub Actions workflow that: validates Nginx config syntax on every PR (nginx -t), deploys updated configs to the Nginx server on merge to main, and reloads Nginx gracefully (no dropped connections). Store the Nginx configs in a nginx/ directory in our infrastructure repo.
```

The agent creates the pipeline:

```text
CI/CD pipeline created: .github/workflows/nginx-deploy.yml

  On PR:
    → Spins up Nginx container
    → Copies config files from nginx/ directory
    → Runs nginx -t (syntax validation)
    → Comments on PR with validation result

  On merge to main:
    → SSH to load balancer server
    → rsync nginx/ → /etc/nginx/
    → nginx -t (verify on production)
    → nginx -s reload (graceful — no dropped connections)
    → curl health check to verify
    → Slack notification on success/failure

  Rollback:
    → On failure, restores previous config from git
    → nginx -s reload with old config
```

## Real-World Example

A platform engineer at a growing fintech company inherits a setup where three API servers sit behind a single point of failure with no load balancing, no SSL termination, and no rate limiting. Last month a scraper bot took down the API for 20 minutes, and a zombie backend process returned 502s for 3 hours before anyone noticed.

1. He asks the agent to design an Nginx reverse proxy — it configures weighted load balancing across 3 servers with proper upstream groups, giving the smaller server proportionally less traffic
2. SSL is set up with Let's Encrypt auto-renewal and A+ SSL Labs rating, with all security headers
3. Health checks catch a failing backend within 90 seconds and transparently reroute traffic — no customer impact
4. Rate limiting stops bot abuse: general API at 30 req/s per IP, login endpoint at 5 req/min
5. A CI/CD pipeline validates config on every PR and deploys with zero-downtime reload
6. The next time a backend server has issues, traffic shifts automatically. The bot that caused last month's outage now gets 429 responses while legitimate users are unaffected
