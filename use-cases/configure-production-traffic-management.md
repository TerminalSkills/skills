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

A SaaS company runs three API servers behind a single Nginx reverse proxy with no rate limiting. During a product launch, one enterprise customer's integration script hammered the API with 2,000 requests per second, saturating all three backends and causing 504 timeouts for every other customer. The Nginx config is hundreds of lines of copy-pasted directives nobody fully understands, SSL certificates require manual renewal, and there is no way to gradually shift traffic to a new deployment without editing the config and reloading. The last SSL expiry took the API offline for 90 minutes on a Saturday because nobody was monitoring the certificate renewal cron job. When the post-mortem asked why the certificate was not auto-renewed, the answer was that the certbot cron had silently failed three weeks earlier.

## The Solution

Replace the brittle Nginx setup with **Caddy** for automatic HTTPS and clean reverse proxy configuration, use the **load-balancer** skill to choose the balancing approach (it covers Nginx and HAProxy, so Caddy's own policies are checked against the Caddy docs), and add the **rate-limiter** skill to design tiered per-client limits and abuse protection, which Caddy enforces with the third-party `caddy-ratelimit` module. Together, these three layers handle everything from SSL termination to abuse prevention in a single, readable configuration.

## Step-by-Step Walkthrough

### 1. Set up Caddy as the reverse proxy with automatic HTTPS

Caddy obtains and renews certificates by itself once DNS points at the server and ports 80 and 443 are reachable, so there is no certbot cron to fail silently.

> Create a Caddyfile that reverse-proxies api.example.com to three backends on ports 8001, 8002 and 8003. Add active health checks on /health every 10 seconds, enable JSON access logs, and turn on Prometheus metrics. Treat X-Forwarded-For as the client IP only when it comes from a private-range proxy.

```caddyfile
{
	metrics
	servers {
		trusted_proxies static private_ranges
		client_ip_headers X-Forwarded-For
	}
}

api.example.com {
	log {
		output file /var/log/caddy/access.log
		format json
	}
	# routes from steps 2-4 go here
}
```

Do not list your CDN's public ranges as `private_ranges`; if a CDN sits in front, list its published ranges in `trusted_proxies` so `{client_ip}` is the real visitor.

### 2. Weighted canary with sticky sessions

Caddy has a `weighted_round_robin` policy (one integer weight per upstream, in order) and a `cookie` policy that pins a client to an upstream. Combine them: `cookie` picks the pinned backend, and its `fallback` handles first requests.

> Send 80% of new clients to 8001 and 8002 and 20% to the canary on 8003, keep each client on its backend with a cookie, and let engineers on the internal network force the canary with an X-Backend-Target header.

```caddyfile
	@debug {
		header X-Backend-Target canary
		client_ip private_ranges
	}
	handle @debug {
		reverse_proxy localhost:8003
	}

	handle {
		reverse_proxy localhost:8001 localhost:8002 localhost:8003 {
			lb_policy cookie api_session {$LB_COOKIE_SECRET} {
				fallback weighted_round_robin 4 4 2
			}
			health_uri /health
			health_interval 10s
			health_timeout 2s
			health_fails 2
			health_passes 2
			fail_duration 30s
			lb_retries 2
			lb_try_duration 3s
		}
	}
```

Set `LB_COOKIE_SECRET` in the environment, not in the file. The weights are per new client, not per request, because the cookie pins returning clients. Run `caddy validate --config Caddyfile` and `caddy reload --config Caddyfile` to change a weight without dropping connections. An unhealthy backend leaves rotation after two failed probes (about 20 seconds with a 10-second interval); `fail_duration` and `lb_retries` cover the gap by retrying a request on another backend.

### 3. Tiered rate limiting per API key

Rate limiting is not in the standard Caddy binary. The `rate_limit` directive comes from the third-party `github.com/mholt/caddy-ratelimit` module, added to a custom build with `xcaddy build --with github.com/mholt/caddy-ratelimit` (a `caddy:builder` Docker image has xcaddy; see the caddy skill). It sets `Retry-After` on its 429 responses. It does not set `X-RateLimit-*` headers, so do not promise clients a remaining-requests header unless your backend sends it.

Caddy cannot look an API key up in a database, so this setup reads the tier from a key prefix your key service issues (`free_`, `pro_`, `ent_`). The backend must still reject forged keys; the IP zone below bounds what a forger can cost you.

> Add rate limits: free keys 60/min and 1,000/hour, pro keys 300/min and 10,000/hour, enterprise keys 1,000/min and 50,000/hour, counted per Authorization header. Add a 600/min per-IP zone for everything. Exempt /health and /status.

```caddyfile
	rate_limit {
		zone ip_all {
			match {
				not path /health /status
			}
			key    {client_ip}
			events 600
			window 1m
		}
		zone free_min {
			match {
				header_regexp Authorization ^Bearer\s+free_
				not path /health /status
			}
			key    {http.request.header.Authorization}
			events 60
			window 1m
		}
		zone free_hour {
			match {
				header_regexp Authorization ^Bearer\s+free_
				not path /health /status
			}
			key    {http.request.header.Authorization}
			events 1000
			window 1h
		}
		# pro_ (300/min, 10000/hour) and ent_ (1000/min, 50000/hour): same shape
	}
```

Put this block before the `reverse_proxy` routes inside the site block (use a `route { ... }` wrapper to fix the order), and use `caddy validate` on the custom binary before reloading.

### 4. Abuse protection for authentication endpoints

`caddy-ratelimit` counts requests in a sliding window; it cannot count only failed logins or hold a 15-minute block. Limit attempts per client IP, and keep failure-based lockout in the application or a log-driven tool.

> Limit POST /auth/login to 5 requests per IP per minute and POST /auth/register to 3 per IP per hour. Log the key when a request is limited.

```caddyfile
	rate_limit {
		zone login {
			match {
				method POST
				path /auth/login
			}
			key    {client_ip}
			events 5
			window 1m
		}
		zone register {
			match {
				method POST
				path /auth/register
			}
			key    {client_ip}
			events 3
			window 1h
		}
		log_key
	}
```

Credential stuffing spread over thousands of IPs stays under per-IP limits, so also count attempts per username in the application, as the rate-limiter skill describes.

### 5. Traffic monitoring

With the global `metrics` option on, Prometheus metrics are served at `http://localhost:2019/metrics` on the admin API (keep the admin API on localhost). The useful series are `caddy_http_request_duration_seconds` (labelled by `code` and `method`, so its `_count` is the per-status request counter), `caddy_http_requests_total` (no `code` label, so do not filter it by status) and `caddy_reverse_proxy_upstreams_healthy` (one series per upstream, 1 or 0).

> Write Prometheus queries and alert rules for requests per second, 5xx ratio, p95 latency, rate-limited (429) responses and unhealthy upstreams.

```promql
sum(rate(caddy_http_request_duration_seconds_count[5m]))
sum(rate(caddy_http_request_duration_seconds_count{code=~"5.."}[5m])) / sum(rate(caddy_http_request_duration_seconds_count[5m]))
histogram_quantile(0.95, sum by (le) (rate(caddy_http_request_duration_seconds_bucket[5m])))
sum(rate(caddy_http_request_duration_seconds_count{code="429"}[5m]))
caddy_reverse_proxy_upstreams_healthy == 0
```

## Real-World Example

A developer tools company moved from a patched Nginx setup to Caddy on a Friday. The Caddyfile was a few dozen lines instead of the old multi-hundred-line config, and certificate renewal became Caddy's job. On Monday they deployed a new API version to the canary backend with weight 2 of 10, watched the 5xx ratio for two hours, then raised the canary weight in steps with `caddy reload`. Because the cookie pins returning clients, each shift took effect as sessions turned over.

The following week a bot network hit the login endpoint. The per-IP login zone returned 429 to each source after five attempts a minute, the 429 query showed the start and end of the spike, and the team added a per-username counter in the application for the part of the attack that spread across many addresses.

## Related Skills

- **caddy**: Caddyfile, automatic HTTPS, health checks, load-balancing policies, and adding the rate-limit module.
- **load-balancer**: balancing and health-check concepts, and the Nginx or HAProxy fallback if Caddy is not an option.
- **rate-limiter**: algorithm choice, layered limits, response headers and abuse patterns behind the limits in steps 3 and 4.
