---
title: "Configure API Gateway Routing with AI"
slug: configure-api-gateway-routing
description: "Design and implement API gateway routing rules, rate limiting, and request transformation for microservices architectures."
skills: [coding-agent, docker-helper, api-tester]
category: devops
tags: [api-gateway, routing, microservices, nginx, kong]
---

# Configure API Gateway Routing with AI

## The Problem

Your microservices architecture has grown to 8 services, and every frontend request hits a different port or subdomain. CORS is configured inconsistently across services, authentication middleware is duplicated in each service, and there is no centralized rate limiting. Adding a new service means updating the frontend, the nginx config, the CORS whitelist, and the load balancer — a process that takes a full day and has caused three outages in the past six months from misconfigured routing rules.

## The Solution

Use the **coding-agent** to design gateway routing rules and generate configuration, **docker-helper** to deploy and manage the gateway, and **api-tester** to validate routes work correctly before going live.

## Step-by-Step Walkthrough

### 1. Describe your current service landscape

```text
We have 8 microservices running in Docker:
- auth-service (:4001) - login, signup, token refresh
- user-service (:4002) - profiles, preferences
- billing-service (:4003) - subscriptions, invoices
- notification-service (:4004) - email, push, webhooks
- upload-service (:4005) - file uploads, media processing
- search-service (:4006) - full-text search
- analytics-service (:4007) - event tracking, dashboards
- admin-service (:4008) - internal admin panel

Currently the frontend calls each service directly. Set up an API gateway
that consolidates everything under a single domain with proper routing,
auth, and rate limiting.
```

### 2. The agent designs the routing table

```text
API Gateway Routing Plan (using Kong):

Public routes (require JWT):
  /api/users/*        → user-service:4002
  /api/billing/*      → billing-service:4003
  /api/notifications/* → notification-service:4004
  /api/uploads/*      → upload-service:4005
  /api/search/*       → search-service:4006

Public routes (no auth):
  /api/auth/*         → auth-service:4001
  /api/health         → gateway health aggregation

Internal routes (API key required):
  /api/analytics/*    → analytics-service:4007
  /internal/admin/*   → admin-service:4008

Rate limits:
  /api/auth/login     → 10 req/min per IP (brute force protection)
  /api/uploads/*      → 20 req/min per user (abuse prevention)
  /api/search/*       → 60 req/min per user
  Default             → 200 req/min per user
```

### 3. The agent generates Kong configuration

```yaml
# kong.yml (excerpt)
_format_version: "3.0"
services:
  - name: auth-service
    url: http://auth-service:4001
    routes:
      - paths: ["/api/auth"]
        strip_path: true
  - name: user-service
    url: http://user-service:4002
    routes:
      - paths: ["/api/users"]
        strip_path: true
    plugins:
      - name: jwt
      - name: rate-limiting
        config: { minute: 200, policy: redis }
  - name: upload-service
    url: http://upload-service:4005
    routes:
      - paths: ["/api/uploads"]
        methods: ["GET", "POST", "DELETE"]
    plugins:
      - name: jwt
      - name: rate-limiting
        config: { minute: 20 }
      - name: request-size-limiting
        config: { allowed_payload_size: 50 }
```

### 4. The agent creates a comprehensive test suite

```text
Generated API gateway test suite: tests/gateway/

Test cases (47 total):
- Route resolution: each service reachable via gateway path
- Auth enforcement: protected routes return 401 without JWT
- Auth bypass: /api/auth/* accessible without token
- Rate limiting: verify 429 response after threshold
- CORS: correct headers for browser requests
- Request transformation: headers forwarded correctly
- Error handling: gateway returns 503 when service is down
- Path stripping: services receive clean paths

Running tests against local gateway...
✓ 45 passed, 2 warnings
⚠ upload-service: missing Content-Length validation for multipart
⚠ analytics-service: internal API key header not being stripped from responses
```

### 5. The agent generates deployment and migration plan

```text
Migration Plan (zero-downtime):

Phase 1: Deploy gateway alongside existing direct connections
Phase 2: Route 10% of traffic through gateway (canary)
Phase 3: Monitor error rates for 24 hours
Phase 4: Route 100% of traffic through gateway
Phase 5: Remove direct service exposure from load balancer

Rollback: DNS switch back to direct service endpoints (< 5 min)

Frontend changes needed:
- Replace 8 service base URLs with single GATEWAY_URL
- Remove per-service CORS handling
- Remove client-side auth header injection (gateway handles it)
```

## Real-World Example

Jonas is a backend architect at a 20-person SaaS startup. Their frontend makes direct HTTP calls to 8 different services, and every new developer spends their first week understanding which service handles what. Last month, a billing-service CORS misconfiguration let any origin make requests for two days.

1. Jonas asks the agent to design an API gateway for their 8 microservices
2. The agent generates a complete Kong configuration with routing, JWT auth, rate limiting, and CORS — all centralized
3. It produces a 47-case test suite that catches two security issues before deployment
4. The team deploys using the canary migration plan, routing 10% of traffic first
5. After full migration, the frontend codebase shrinks by 200 lines of service-discovery code, CORS is handled in one place, and onboarding new developers takes half the time
