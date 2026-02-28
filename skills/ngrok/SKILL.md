---
name: ngrok
description: >-
  Expose local services to the internet through secure tunnels. Use ngrok to
  share development servers, test webhooks locally, demo applications to
  clients, and create temporary public URLs for any local port.
license: Apache-2.0
compatibility: "ngrok CLI installed and authtoken configured"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["tunneling", "webhooks", "networking", "localhost", "development"]
---

# ngrok

## Overview

Expose local services to the internet through secure ngrok tunnels. Share development servers with clients, test webhooks from Stripe/GitHub/Telegram locally, create temporary public URLs for any local port, and inspect all incoming traffic in real time.

### Prerequisites

- ngrok CLI installed (`brew install ngrok`, `snap install ngrok`, or download from https://ngrok.com/download)
- ngrok account with authtoken configured (`ngrok config add-authtoken <token>`)
- A local service running on a port you want to expose

## Instructions

### Basic HTTP Tunnel

Expose a local web server to the internet:

```bash
# Expose local port 3000 (e.g., Next.js, React dev server)
ngrok http 3000
```

Creates a public URL like `https://abc123.ngrok-free.app` forwarding to `localhost:3000`. The URL changes on each restart unless you use a custom domain.

### Custom Domain

Use a static domain so the URL persists between sessions:

```bash
# Free static domain (one per account)
ngrok http --domain=your-app.ngrok-free.app 3000

# Custom domain you own (paid plan)
ngrok http --domain=dev.yourcompany.com 3000
```

### Webhook Testing

Expose a local endpoint for webhook development:

```bash
# Start tunnel for webhook receiver on port 8080
ngrok http 8080

# Inspect webhook payloads at http://127.0.0.1:4040
```

The inspector at `localhost:4040` shows every request with headers, body, and timing. Replay requests to debug without retriggering the webhook.

### Configuration File

Define tunnels in `ngrok.yml` for multi-service setups:

```yaml
# ~/.config/ngrok/ngrok.yml
version: "3"
agent:
  authtoken: your-authtoken-here

tunnels:
  webapp:
    addr: 3000
    proto: http
    domain: your-app.ngrok-free.app
    inspect: true
  api:
    addr: 8080
    proto: http
    inspect: true
  ssh:
    addr: 22
    proto: tcp
```

```bash
ngrok start --all       # Start all tunnels
ngrok start webapp api  # Start specific tunnels
```

### TCP and TLS Tunnels

Expose non-HTTP services — databases, SSH, game servers:

```bash
ngrok tcp 22    # SSH
ngrok tcp 5432  # PostgreSQL
ngrok tls 443   # TLS termination at ngrok edge
```

### Request Inspection and Replay

```bash
ngrok http 3000
# Open http://127.0.0.1:4040 or use the API:
curl http://127.0.0.1:4040/api/requests/http
```

Use the inspector to view requests, replay them, filter by status/method, and export data.

### Authentication and Security

```bash
# Basic auth
ngrok http 3000 --basic-auth="user:password"

# IP restriction (paid plan)
ngrok http 3000 --cidr-allow="203.0.113.0/24"

# Webhook signature verification
ngrok http 3000 --verify-webhook=stripe --verify-webhook-secret=whsec_xxx
```

### Traffic Policy

Apply middleware rules to traffic before it reaches your service:

```yaml
# traffic-policy.yml
on_http_request:
  - actions:
      - type: rate-limit
        config:
          name: global
          algorithm: sliding_window
          capacity: 100
          rate: 60s
          bucket_key:
            - conn.client_ip
  - expressions:
      - req.url.path.startsWith('/api/webhooks')
    actions:
      - type: verify-webhook
        config:
          provider: stripe
```

```bash
ngrok http 3000 --traffic-policy-file=traffic-policy.yml
```

### ngrok API

Manage tunnels programmatically:

```javascript
const response = await fetch('https://api.ngrok.com/tunnels', {
  headers: { 'Authorization': `Bearer ${NGROK_API_KEY}`, 'Ngrok-Version': '2' }
});
const { tunnels } = await response.json();
```

### Docker Integration

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports:
      - "3000:3000"
  ngrok:
    image: ngrok/ngrok:latest
    restart: unless-stopped
    command: "http app:3000 --domain=your-app.ngrok-free.app"
    environment:
      - NGROK_AUTHTOKEN=${NGROK_AUTHTOKEN}
    ports:
      - "4040:4040"
    depends_on:
      - app
```

### Common Patterns

**Local demo for clients:**
```bash
ngrok http 3000 --basic-auth="demo:clientname2025"
```

**Telegram/Slack bot development:**
```bash
node bot.js  # listening on :8443
ngrok http 8443 --domain=your-bot.ngrok-free.app
# Set webhook: https://api.telegram.org/bot<token>/setWebhook?url=https://your-bot.ngrok-free.app/webhook
```

**CI/CD preview environments:**
```bash
ngrok http 3000 --domain=pr-${PR_NUMBER}.ngrok-free.app &
```

## Examples

### Expose a Next.js dev server for client review

```prompt
I'm building a Next.js app on port 3000 and need to share it with a client for review. Set up ngrok with a stable URL and basic auth so only they can access it.
```

### Test Stripe webhooks locally

```prompt
I'm integrating Stripe payments. Set up ngrok to receive webhooks on my local server (port 8080) with Stripe signature verification, and show me how to use the inspector to debug incoming events.
```

### Multi-service development environment

```prompt
I have a frontend on port 3000, API on port 8080, and a WebSocket server on port 3001. Create an ngrok config that exposes all three with stable domains and request inspection enabled.
```

## Guidelines

- Use custom domains for stable URLs — free accounts get one static domain
- Always use `--basic-auth` when sharing tunnels with external parties
- Use the inspector at `localhost:4040` to debug webhook payloads before writing handler code
- For production webhook receivers, use `--verify-webhook` to validate request signatures
- Define multi-tunnel setups in `ngrok.yml` rather than running multiple CLI commands
- TCP tunnels expose raw ports — only use for trusted services like SSH with key auth
- The free plan has rate limits and connection limits; paid plans remove these
