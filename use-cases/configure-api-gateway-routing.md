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

Your microservices architecture has grown to 8 services, and it shows. Every frontend request hits a different port or subdomain. CORS is configured inconsistently across services — last month a billing-service misconfiguration allowed any origin to make requests for two full days before anyone noticed. Authentication middleware is copy-pasted into each service with slight variations. There is no centralized rate limiting, so a misbehaving client can hammer any service directly.

Adding a new service means updating the frontend, the nginx config, the CORS whitelist, and the load balancer. This process takes a full day, and it has caused three outages in the past six months from misconfigured routing rules. Every new developer spends their first week understanding which service handles what and which port to call.

## The Solution

Using the **coding-agent**, **docker-helper**, and **api-tester** skills, the agent designs a complete API gateway configuration with Kong, generates routing rules with per-route rate limiting and JWT auth, produces a test suite to validate everything before deployment, and creates a zero-downtime migration plan.

## Step-by-Step Walkthrough

### Step 1: Describe the Current Service Landscape

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

### Step 2: Design the Routing Table

The routing table consolidates 8 service URLs into a single domain with clear access patterns:

**Public routes (require JWT):**

| Path | Service | Rate Limit |
|---|---|---|
| `/api/users/*` | user-service:4002 | 200 req/min per consumer |
| `/api/billing/*` | billing-service:4003 | 200 req/min per consumer |
| `/api/notifications/*` | notification-service:4004 | 200 req/min per consumer |
| `/api/uploads/*` | upload-service:4005 | 20 req/min per consumer |
| `/api/search/*` | search-service:4006 | 60 req/min per consumer |

**Public routes (no auth):**

| Path | Service | Rate Limit |
|---|---|---|
| `/api/auth/*` | auth-service:4001 | 10 req/min per IP (login) |
| `/api/health` | Answered by the gateway itself (`request-termination`) | -- |

**Internal routes (API key or internal network only):**

| Path | Service | Notes |
|---|---|---|
| `/api/analytics/*` | analytics-service:4007 | `key-auth`, server-to-server only |
| `/internal/admin/*` | admin-service:4008 | `ip-restriction`, internal network only |

The upload service gets a tighter rate limit (20/min) to prevent abuse. The login endpoint is rate-limited by IP rather than user (since there is no auth token yet) to block brute-force attacks. Search is capped at 60/min because each query is expensive.

### Step 3: Generate the Kong Configuration

With the **docker-helper** skill the agent also writes a Compose file that runs Kong in DB-less mode, with Redis for the shared rate-limit counters:

```yaml
# docker-compose.yml
services:
  kong:
    image: kong:3.9
    environment:
      KONG_DATABASE: "off"
      KONG_DECLARATIVE_CONFIG: /etc/kong/kong.yml
    volumes:
      - ./kong.rendered.yml:/etc/kong/kong.yml:ro
    ports:
      - "127.0.0.1:8000:8000"   # put TLS termination in front for anything public
    depends_on: [redis]
  redis:
    image: redis:8-alpine
```

The file below is trimmed to five of the services (billing, notifications and search follow the user-service pattern). The declarative file is rendered at deploy time so no secret lives in git: `ANALYTICS_API_KEY=... envsubst '${ANALYTICS_API_KEY}' < kong.yml > kong.rendered.yml`. (Kong's `{vault://...}` references are not resolved when a key-auth credential is looked up, so the key has to be in the rendered file.) The JWT credential holds only auth-service's public key.

```yaml
_format_version: "3.0"

consumers:
  - username: web-app
    jwt_secrets:
      - key: auth-service            # must equal the "iss" claim in tokens auth-service issues
        algorithm: RS256
        rsa_public_key: |
          -----BEGIN PUBLIC KEY-----
          PLACEHOLDER
          -----END PUBLIC KEY-----
  - username: analytics-ingest
    keyauth_credentials:
      - key: "${ANALYTICS_API_KEY}"

services:
  - name: auth-service
    url: http://auth-service:4001
    routes:
      - name: auth
        paths: ["/api/auth"]
        strip_path: true
    plugins:
      - name: rate-limiting
        config:
          minute: 10
          limit_by: ip
          policy: redis
          redis: { host: redis, port: 6379 }

  - name: user-service
    url: http://user-service:4002
    routes:
      - name: users
        paths: ["/api/users"]
        strip_path: true
    plugins:
      - name: jwt
        config: { claims_to_verify: [exp] }
      - name: rate-limiting
        config:
          minute: 200
          limit_by: consumer
          policy: redis
          redis: { host: redis, port: 6379 }

  - name: upload-service
    url: http://upload-service:4005
    routes:
      - name: uploads
        paths: ["/api/uploads"]
        methods: ["GET", "POST", "DELETE"]
        strip_path: true
    plugins:
      - name: jwt
        config: { claims_to_verify: [exp] }
      - name: rate-limiting
        config:
          minute: 20
          limit_by: consumer
          policy: redis
          redis: { host: redis, port: 6379 }
      - name: request-size-limiting
        config: { allowed_payload_size: 50, size_unit: megabytes }

  - name: analytics-service
    url: http://analytics-service:4007
    routes:
      - name: analytics
        paths: ["/api/analytics"]
        strip_path: true
    plugins:
      - name: key-auth

  - name: admin-service
    url: http://admin-service:4008
    routes:
      - name: admin
        paths: ["/internal/admin"]
        strip_path: true
    plugins:
      - name: ip-restriction
        config: { allow: ["10.0.0.0/8"] }

  - name: gateway-health
    url: http://127.0.0.1:8001     # never reached: request-termination answers first
    routes:
      - name: health
        paths: ["/api/health"]
    plugins:
      - name: request-termination
        config: { status_code: 200, content_type: application/json, body: '{"status":"ok"}' }

# Global plugin applied to all routes
plugins:
  - name: cors
    config:
      origins: ["https://app.example.com"]
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
      headers: ["Authorization", "Content-Type"]
      max_age: 3600
```

CORS is configured exactly once, at the gateway level. No more per-service CORS headers to keep in sync. The `jwt` plugin verifies the token signature (and, with `claims_to_verify: [exp]`, the expiry), matches the `iss` claim to the consumer's credential, and forwards `X-Consumer-Username` and `X-Consumer-ID` headers upstream, so services behind the gateway never verify tokens themselves. Rate limits are counted per consumer (the calling application) rather than per end user, because Kong's built-in limiter keys on the consumer, credential, IP, header or path. `/internal/admin` answers 403 to any address outside `10.0.0.0/8`.

### Step 4: Validate with a Test Suite

With the **api-tester** skill, the agent writes the checks as curl or Python `requests` calls against the running gateway and groups them by what can break:

**Route resolution:** every service is reachable through its gateway path, and path stripping works correctly (the service receives `/profiles/123`, not `/api/users/profiles/123`).

**Auth enforcement:** protected routes return 401 without a JWT, with a bad signature or with an expired token. The auth routes are reachable without a token. `/api/analytics` returns 401 without the `apikey` header and passes with it.

**Rate limiting:** each route enforces its configured limit. Exceeding it returns 429 with a `Retry-After` header. Different consumers have independent limits.

**Security:** CORS preflight from `https://app.example.com` succeeds and other origins get no `Access-Control-Allow-Origin`. `/internal/admin` is refused from outside the internal network. A stopped service produces a gateway error (502 or 503), not a hang.

Against a local gateway with unreachable upstreams, the first run showed the expected pattern: no token gave 401, a valid RS256 token passed the gateway (the upstream error was 503, not 401), a token with a broken signature gave 401, the admin route gave 403, and `/api/health` answered 200 from the gateway itself. Gaps found by running it, such as a missing size limit on the upload route, are fixed before deployment.

### Step 5: Deploy with Zero-Downtime Migration

The migration runs in five phases, with a rollback plan at every step:

1. **Deploy gateway** alongside existing direct connections — both work simultaneously
2. **Canary at 10%** — route a tenth of traffic through the gateway, watch error rates
3. **Monitor for 24 hours** — compare error rates, latency, and response shapes between direct and gateway traffic
4. **Route 100%** — switch all traffic to the gateway
5. **Remove direct exposure** — remove service ports from the load balancer

Rollback at any phase: DNS switch back to direct service endpoints, takes less than 5 minutes.

The frontend changes are minimal: replace 8 service base URLs with a single `GATEWAY_URL`, remove per-service CORS handling, and remove client-side auth header injection (the gateway handles it now). The frontend codebase shrinks by about 200 lines of service-discovery boilerplate.

## Real-World Example

Jonas deploys the gateway using the canary migration plan, routing 10% of traffic through Kong on day one. The monitoring dashboard shows identical error rates between direct and gateway traffic, so he bumps it to 50% on day two and 100% on day three.

After full migration, three things change immediately. First, CORS is handled in one place — the billing-service vulnerability that went unnoticed for two days would have been impossible because the gateway enforces a single origin whitelist. Second, onboarding new developers takes half the time because there is one domain to learn, not eight ports to memorize. Third, the rate limiting on the login endpoint catches a brute-force attempt within the first week — something that was completely invisible before.

The frontend team removes 200 lines of service-discovery code and the per-service auth header injection that was slightly different in three of the eight services. Adding a new service now takes 15 minutes instead of a full day: add a service block to `kong.yml`, run the test suite, and deploy.
