---
title: "Configure Infrastructure Rate Limiting Across Proxy, Gateway, and CDN"
slug: configure-infrastructure-rate-limiting-across-layers
description: "Set up layered rate limiting at Nginx, API gateway, and CDN levels to protect APIs from abuse without touching application code."
skills:
  - rate-limiter
  - nginx
  - load-balancer
  - cloudflare
  - k6
category: devops
tags:
  - rate-limiting
  - nginx
  - api-gateway
  - cdn
  - infrastructure
---

# Configure Infrastructure Rate Limiting Across Proxy, Gateway, and CDN

## The Problem

Your API is getting hammered by scrapers and misbehaving clients. The application-level rate limiter catches some abuse, but by the time requests hit your app server they've already consumed CPU, memory, and database connections. You need rate limiting at the infrastructure layer — Nginx, API gateway, CDN — so bad traffic gets dropped before it reaches your application. Configuring rate limits across three layers without accidentally blocking legitimate users is error-prone and hard to test.

## The Solution

Use **nginx** (with **load-balancer** for the upstream pool) for per-IP rate zones, Kong's `rate-limiting` plugin for per-tier quotas, **cloudflare** rate limiting rules for volumetric abuse at the edge, and **rate-limiter** for the per-user limits that stay in the application. **k6** then proves each layer trips where it should. Each layer catches what the one before it missed.

## Step-by-Step Walkthrough

### 1. Audit current traffic patterns

> Analyze our Nginx access logs from the last 7 days. Show me the top 50 IPs by request count, requests per second peaks, and which endpoints get the most traffic. Identify any IPs that look like scrapers or bots.

The agent parses the logs and reports, for example, that 12 IPs account for 40% of requests, most hitting the search endpoint at 200+ requests per second.

### 2. Configure Nginx rate zones

> Set up Nginx rate limiting: 100 req/s per IP globally, 10 req/s per IP on /api/search, a 200 req/s zone per API key with a burst of 20, and a ceiling for the whole server. Exempt monitoring and CI addresses. Return 429 with Retry-After.

`limit_req` implements a leaky bucket; `burst` sets the queue and `nodelay` serves burst requests immediately instead of spacing them. An exemption works by giving whitelisted clients an empty zone key, which nginx does not count. Defining a `geo` block alone does nothing; it has to feed the zone key through a `map`:

```nginx
# /etc/nginx/conf.d/rate-limiting.conf (http context)
geo $limited_client {
    default         1;
    10.0.0.0/8      0;   # internal monitoring
    203.0.113.50/32 0;   # CI runner
}
map $limited_client $limit_ip_key {
    0 "";                       # empty key: not rate limited
    1 $binary_remote_addr;
}

# 1 MB holds about 16,000 states of 64 bytes, so 10m is roughly 160,000 entries
limit_req_zone $limit_ip_key   zone=global:10m        rate=100r/s;
limit_req_zone $limit_ip_key   zone=search:10m        rate=10r/s;
limit_req_zone $http_x_api_key zone=authenticated:10m rate=200r/s;
limit_req_zone $server_name    zone=total:1m          rate=10000r/m;
limit_req_status 429;
limit_req_log_level warn;

upstream backend {
    least_conn;
    server 10.0.1.11:3000 max_fails=3 fail_timeout=10s;
    server 10.0.1.12:3000 max_fails=3 fail_timeout=10s;
    keepalive 32;
}

server {
    # (listen, server_name and TLS omitted)
    error_page 429 = @rate_limited;
    location @rate_limited {
        default_type application/json;
        add_header Retry-After 1 always;
        return 429 '{"error":"rate_limited"}';
    }

    location /api/search {
        limit_req zone=search burst=5 nodelay;
        limit_req zone=total burst=500 nodelay;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_pass http://backend;
    }

    location /api/ {
        limit_req zone=global burst=20 nodelay;
        limit_req zone=authenticated burst=20 nodelay;   # requests without X-API-Key are not counted here
        limit_req zone=total burst=500 nodelay;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_pass http://backend;
    }
}
```

If Cloudflare proxies your traffic, `$binary_remote_addr` is Cloudflare's address unless nginx restores the visitor IP. Add `set_real_ip_from` lines for each range published at `https://www.cloudflare.com/ips-v4` and `/ips-v6`, plus `real_ip_header CF-Connecting-IP;`, or every visitor shares one bucket. Do not read `X-API-Key` as proof of identity: it only selects a counter, and the application still authenticates the key.

Run `nginx -t`, and set `limit_req_dry_run on;` first to log what would be rejected without rejecting it. A config like this one was checked on nginx 1.30: six requests to `/api/search` passed (the first plus a burst of five) and the rest returned 429.

### 3. Add API gateway throttling

> Configure Kong with rate-limiting per consumer group: free 60 requests per minute, pro 600, enterprise 6000, counted in Redis so every gateway node shares the counters.

Kong's open-source `rate-limiting` plugin takes `second`, `minute`, `hour` and similar limits, a `policy` of `local`, `cluster` or `redis`, and a `redis` block (`redis.host`, `redis.port`, and so on). It can be scoped to a consumer or a consumer group:

```yaml
_format_version: "3.0"
consumer_groups:
  - name: free
    plugins:
      - name: rate-limiting
        config:
          minute: 60
          limit_by: consumer
          policy: redis
          fault_tolerant: false
          redis:
            host: redis.internal
            port: 6379
  # pro (minute: 600) and enterprise (minute: 6000): same shape
```

Kong runs only the most specific instance of a plugin for a request, so a gateway-wide 10,000 requests per minute ceiling cannot sit next to the per-group limits in this plugin. That is why the aggregate ceiling is the `total` zone in step 2. `fault_tolerant: false` makes clients see errors when Redis is down instead of silently dropping the limit; choose it deliberately. Apply the file with `deck gateway sync`.

### 4. Set up CDN-level rules

> Add Cloudflare rate limiting rules for api.example.com: block any IP above 500 requests per 10 seconds for 60 seconds, and issue a managed challenge to IPs above 200 per 10 seconds.

Cloudflare rate limiting rules live in the `http_ratelimit` phase entry point ruleset, created through the Rulesets API:

```bash
curl "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/$RULESET_ID/rules" \
  --request POST \
  --header "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  --json '{
    "description": "Block above 500 req/10s",
    "expression": "(http.host eq \"api.example.com\")",
    "action": "block",
    "ratelimit": {
      "characteristics": ["cf.colo.id", "ip.src"],
      "period": 10,
      "requests_per_period": 500,
      "mitigation_timeout": 60
    }
  }'
```

Create the challenge rule the same way with `"action": "managed_challenge"`, `"requests_per_period": 200` and `"mitigation_timeout": 0`: on Free, Pro and Business plans a challenge rule must use `mitigation_timeout` 0, and rate limiting rules must come last in the ruleset. Plan limits matter: Free allows one rule, a 10-second period, a 10-second mitigation timeout and only the path in the expression, so the 60-second block and the `http.host` match above need Pro or higher, and the pair of rules needs at least two rule slots (Pro has two, Business five). Source IP and user agent fields in the expression start at Business. Excluding your CI ranges with `and not ip.src in {203.0.113.0/24}` therefore needs Business or Enterprise; on lower plans keep the CI exemption in Nginx.

### 5. Test the layered setup

> Write a k6 script for staging that runs normal users at 50 req/s, a scraper at 500 req/s against /api/search, and a 1000 req/s burst for 10 seconds. Count 200 and 429 responses per scenario.

```javascript
import http from 'k6/http';
import { Counter } from 'k6/metrics';

const ok = new Counter('status_200');
const limited = new Counter('status_429');
const base = __ENV.BASE_URL;  // staging only

const arrival = (rate, path, startTime, duration) => ({
  executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration, startTime,
  preAllocatedVUs: 200, maxVUs: 1500, exec: 'hit', env: { TARGET: path },
});

export const options = {
  scenarios: {
    normal:  arrival(50, '/api/items', '0s', '60s'),
    scraper: arrival(500, '/api/search', '0s', '60s'),
    burst:   arrival(1000, '/api/items', '70s', '10s'),
  },
};

export function hit() {
  const res = http.get(`${base}${__ENV.TARGET}`, { headers: { 'X-API-Key': __ENV.API_KEY } });
  (res.status === 429 ? limited : ok).add(1);
}
```

Run it with `BASE_URL=https://staging.example.com API_KEY=$STAGING_API_KEY k6 run test.js`. All generated traffic comes from one IP, so it exercises the per-IP zones; to see the Cloudflare and Kong tiers fire, run it from a second machine or with a staging consumer per tier. Success is normal traffic at 0 rejected responses and the scraper scenario mostly 429.

## Real-World Example

A fintech startup's public API was being scraped, and response times climbed to about 3 seconds during business hours. They put per-IP zones on Nginx, Kong quotas per tier, and a Cloudflare rule for bursts, and left only per-user fairness in the application. In their own numbers, search p99 latency fell from 3.1 seconds to 180 ms once the scraper traffic was rejected at the proxy instead of reaching the app servers.

## Tips

- Run new limits in staging, or with `limit_req_dry_run on;`, before production. A burst value that is too low blocks real users at normal traffic spikes.
- Always send `Retry-After` with a 429; nginx does not add it by itself.
- Log rate-limited requests with IP, endpoint and rate (`limit_req_log_level`) so thresholds come from data.
- Layer from coarsest to finest: CDN for volumetric abuse, Nginx per IP, the gateway per key, the application per user.

## Related Skills

- **rate-limiter**: design of the per-user limits and 429 headers that remain in the application.
- **nginx**: `limit_req_zone`, burst and `nodelay` for the proxy layer.
- **load-balancer**: the upstream pool and health behaviour behind the rate zones.
- **cloudflare**: edge rules, API tokens and zone setup for the CDN layer.
- **k6**: arrival-rate scenarios that prove each layer trips at the right threshold.
