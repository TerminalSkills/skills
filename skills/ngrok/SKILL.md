---
name: ngrok
description: >-
  Exposes local services to the internet through ngrok tunnels with a public URL.
  Use it to share a development server, test webhooks locally, demo an app to a
  client, inspect and replay incoming requests, or put a temporary public URL on
  any local port.
license: Apache-2.0
compatibility: "ngrok CLI installed and authtoken configured"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["tunneling", "webhooks", "networking", "localhost", "development"]
---

# ngrok

## Overview

ngrok is a cloud gateway plus a small agent (`ngrok` CLI, v3) that publishes a local port at a public URL, with request inspection and Traffic Policy rules for auth, rate limits and webhook verification. Typical uses: share a dev server, receive Stripe/GitHub/Telegram webhooks on localhost, demo to a client, expose SSH or a database. This page was checked against ngrok 3.39 and the docs at ngrok.com/docs (October 2026).

Key v3 changes to know: the CLI flags `--domain`, `--basic-auth`, `--oauth`, `--verify-webhook` and `--cidr-allow` on `ngrok http` are deprecated (they still print a warning and run). Use `--url` and a Traffic Policy instead. The config file uses `version: 3` and `endpoints:`.

### Prerequisites

- Install the agent: `brew install ngrok`, `snap install ngrok`, `choco install ngrok`, or the apt repository / packages listed at https://ngrok.com/download.
- An ngrok account. Without a valid authtoken the agent exits with "authentication failed: This ngrok session is not authenticated".
- Save the token: `ngrok config add-authtoken "$NGROK_AUTHTOKEN"` (copy it from the dashboard, never commit it).

## Instructions

### Basic HTTP endpoint

```bash
ngrok http 3000
```

Prints a public `https://` URL forwarding to `localhost:3000` and serves a local inspector at http://127.0.0.1:4040. The URL is random on each run unless you choose one. Other upstream forms: `ngrok http https://localhost:8443`, `ngrok http intranet.local:9000`.

### Stable URL

```bash
ngrok http 3000 --url https://shop-demo.ngrok.app       # a domain you own on a paid plan, or an ngrok domain
```

Every account gets one dev domain (for free accounts it ends in `ngrok-free.dev` or `ngrok-free.app`), shown in the dashboard. Free accounts cannot pick or reserve names; custom names and your own domain (via DNS CNAME) need a paid plan.

### Webhook testing and inspection

```bash
ngrok http 8080
curl -s http://127.0.0.1:4040/api/requests/http | head -c 600   # list captured requests as JSON
```

The inspector shows headers, bodies and timings for every request and lets you replay one without re-triggering the sender (and the Traffic Inspector in the dashboard keeps history).

### Traffic Policy (auth, rate limits, webhook signatures)

Policies are YAML with phases such as `on_http_request`. Save as `policy.yml` and pass it:

```yaml
on_http_request:
  - actions:
      - type: basic-auth
        config:
          credentials:
            - "reviewer:correct-horse-battery"
  - actions:
      - type: rate-limit
        config:
          name: per-ip-burst
          algorithm: sliding_window
          capacity: 100
          rate: 60s
          bucket_key:
            - conn.client_ip
  - expressions:
      - req.url.path.startsWith('/webhooks/stripe')
    actions:
      - type: verify-webhook
        config:
          provider: stripe
          secret: ${STRIPE_WEBHOOK_SECRET}
```

```bash
ngrok http 3000 --url https://shop-demo.ngrok.app --traffic-policy-file policy.yml
```

`basic-auth` takes up to 10 `user:password` pairs and answers 401; `rate-limit` answers 429 with a retry-after header; `verify-webhook` answers 403 on a bad signature (set `enforce: false` to log only). Other actions include `restrict-ips` (`allow` / `deny` CIDR lists; works in `on_tcp_connect` too) and `custom-response`. The `${...}` in the example is for illustration: ngrok does not read your shell, so write the real secret into the file or generate it with `envsubst`, and do not commit it.

### Config file for several endpoints

`ngrok config check` shows which config file is used and validates it; `ngrok config edit` opens it.

```yaml
version: 3
agent:
  authtoken: your-token-written-by-add-authtoken
endpoints:
  - name: webapp
    url: https://shop-demo.ngrok.app
    upstream:
      url: 3000
    traffic_policy:
      on_http_request:
        - actions:
            - type: basic-auth
              config:
                credentials:
                  - "reviewer:correct-horse-battery"
  - name: api
    url: https://shop-api.ngrok.app
    upstream:
      url: 8080
```

```bash
ngrok config check          # "Valid configuration file at ..."
ngrok start --all           # all endpoints
ngrok start webapp api      # only these
```

### TCP and TLS

```bash
ngrok tcp 22                       # SSH; prints a tcp:// address
ngrok tcp 5432 --cidr-allow 203.0.113.0/24   # only this CIDR may connect
ngrok tls --url=app.northwind-labs.com 443   # TLS passthrough on your own domain
```

TCP endpoints may require a verified or paid account, and a stable TCP address must be reserved first. Expose a database only with an IP allowlist, never openly.

### Load balancing and files

`--pooling-enabled` on two agents with the same `--url` balances traffic between them. `ngrok http file:///var/log` serves a directory read-only.

### API and Docker

```bash
ngrok api endpoints list --api-key "$NGROK_API_KEY"    # active endpoints; also: tunnels, reserved-domains
curl -s https://api.ngrok.com/endpoints -H "Authorization: Bearer $NGROK_API_KEY" -H "Ngrok-Version: 2"
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
  ngrok:
    image: ngrok/ngrok:latest
    restart: unless-stopped
    command: ["http", "app:3000", "--url", "https://shop-demo.ngrok.app"]
    environment:
      NGROK_AUTHTOKEN: ${NGROK_AUTHTOKEN}
    depends_on: [app]
```

## Examples

### Example 1: Share a Next.js dev server with a client

```prompt
I'm building a Next.js app on port 3000. Give a client a stable link protected by a password.
```

Write `policy.yml` with the `basic-auth` action (above), then run `ngrok http 3000 --url https://shop-demo.ngrok.app --traffic-policy-file policy.yml`. The terminal shows `Forwarding https://shop-demo.ngrok.app -> http://localhost:3000`; the client is asked for the username and password, and 401 is returned otherwise.

### Example 2: Test Stripe webhooks locally

```prompt
Receive Stripe webhooks on my local server (port 8080) and reject unsigned requests.
```

Put the `verify-webhook` action (provider `stripe`, the endpoint's `whsec_` secret) in a policy for `/webhooks/stripe`, run `ngrok http 8080 --traffic-policy-file policy.yml`, register `https://shop-demo.ngrok.app/webhooks/stripe` in the Stripe dashboard, then watch each delivery at http://127.0.0.1:4040 and replay a failed one after fixing your handler.

### Example 3: Expose SSH for a colleague

```prompt
Let a colleague SSH to my workstation from 203.0.113.0/24 for an hour.
```

Run `ngrok tcp 22 --cidr-allow 203.0.113.0/24`, send them the printed `tcp://` host and port, and stop the process (Ctrl+C) when done; the address disappears.

## Guidelines

- Anything behind a tunnel is public. Add `basic-auth`, `restrict-ips` or OAuth through Traffic Policy before sharing, and stop the agent when finished.
- Prefer `--url` over `--domain` and Traffic Policy over `--basic-auth`, `--verify-webhook`, `--cidr-allow` (on `http`) and `--oauth`; the old flags are deprecated.
- Free accounts show a browser warning interstitial on HTML pages and have rate and endpoint limits; API clients can send an `ngrok-skip-browser-warning` header.
- Keep authtokens and API keys in environment variables or the agent's config file; never put them in a repository or compose file in plain text.
- Do not use a tunnel as production hosting; use ngrok's gateway features deliberately or a real deployment.
- Define multi-service setups in the config file instead of several shell commands.
- Expose a database or SSH only with a CIDR allowlist and key-based auth.
