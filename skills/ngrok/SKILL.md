# ngrok

Expose local services to the internet through secure tunnels. Use ngrok to share development servers, test webhooks locally, demo applications to clients, and create temporary public URLs for any local port.

## author

terminal-skills

## prerequisites

- ngrok CLI installed (`brew install ngrok`, `snap install ngrok`, or download from https://ngrok.com/download)
- ngrok account with authtoken configured (`ngrok config add-authtoken <token>`)
- A local service running on a port you want to expose

## instructions

### Basic HTTP Tunnel

Expose a local web server to the internet with a single command:

```bash
# Expose local port 3000 (e.g., Next.js, React dev server)
ngrok http 3000
```

This creates a public URL like `https://abc123.ngrok-free.app` that forwards to `localhost:3000`. The URL changes on each restart unless you use a custom domain.

### Custom Domain

Use a static domain so the URL doesn't change between sessions:

```bash
# Use a free static domain (one per account)
ngrok http --domain=your-app.ngrok-free.app 3000

# Or a custom domain you own (paid plan)
ngrok http --domain=dev.yourcompany.com 3000
```

### Webhook Testing

Expose a local endpoint for webhook development — Stripe, GitHub, Shopify, Telegram bots:

```bash
# Start tunnel for webhook receiver on port 8080
ngrok http 8080

# Inspect webhook payloads in the built-in dashboard
# Open http://127.0.0.1:4040 in your browser
```

The ngrok inspector at `localhost:4040` shows every request with headers, body, and timing. You can replay requests to debug without triggering the webhook again.

### Configuration File

Define tunnels in `ngrok.yml` for complex setups:

```yaml
# ~/.config/ngrok/ngrok.yml (Linux/Mac)
# %USERPROFILE%/.config/ngrok/ngrok.yml (Windows)

version: "3"
agent:
  authtoken: your-authtoken-here

tunnels:
  webapp:
    # Frontend dev server
    addr: 3000
    proto: http
    domain: your-app.ngrok-free.app
    inspect: true

  api:
    # Backend API server
    addr: 8080
    proto: http
    inspect: true

  ssh:
    # SSH access to local machine
    addr: 22
    proto: tcp
```

Start all tunnels at once:

```bash
ngrok start --all
```

Or start specific tunnels:

```bash
ngrok start webapp api
```

### TCP and TLS Tunnels

Expose non-HTTP services — databases, SSH, game servers:

```bash
# Expose local SSH server
ngrok tcp 22

# Expose local PostgreSQL
ngrok tcp 5432

# Expose with TLS termination at ngrok edge
ngrok tls 443
```

### Request Inspection and Replay

The ngrok agent runs a local inspection dashboard:

```bash
# Start a tunnel
ngrok http 3000

# Open the inspector
# http://127.0.0.1:4040

# Or use the API to list captured requests
curl http://127.0.0.1:4040/api/requests/http
```

Use the inspector to:
- View all incoming requests with full headers and body
- Replay any request with one click (no need to retrigger the webhook)
- Filter by status code, method, or path
- Export request data for debugging

### Authentication and Security

Add basic auth or OAuth to protect exposed endpoints:

```bash
# Basic auth — require username/password to access
ngrok http 3000 --basic-auth="user:password"

# IP restriction — allow only specific IPs (paid plan)
ngrok http 3000 --cidr-allow="203.0.113.0/24"

# Webhook verification — validate signatures from known senders
ngrok http 3000 --verify-webhook=stripe --verify-webhook-secret=whsec_xxx
```

### Traffic Policy (ngrok Edge)

Apply middleware rules to traffic before it reaches your service:

```yaml
# traffic-policy.yml
on_http_request:
  - actions:
      # Rate limit by IP
      - type: rate-limit
        config:
          name: global
          algorithm: sliding_window
          capacity: 100
          rate: 60s
          bucket_key:
            - conn.client_ip

  - expressions:
      - req.url.path.startsWith('/admin')
    actions:
      # Require OAuth for admin routes
      - type: forward-internal
        config:
          url: https://idp.ngrok.com/oauth2/google
          binding: internal

  - expressions:
      - req.url.path.startsWith('/api/webhooks')
    actions:
      # Verify Stripe webhook signatures
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
// List active tunnels
const response = await fetch('https://api.ngrok.com/tunnels', {
  headers: { 'Authorization': `Bearer ${NGROK_API_KEY}`, 'Ngrok-Version': '2' }
});
const { tunnels } = await response.json();

// Each tunnel has:
// - id: tunnel identifier
// - public_url: the ngrok URL
// - forwards_to: local address
// - metadata: custom labels you set
```

```bash
# Create a tunnel via API (useful for CI/CD)
curl -X POST https://api.ngrok.com/tunnels \
  -H "Authorization: Bearer $NGROK_API_KEY" \
  -H "Ngrok-Version: 2" \
  -H "Content-Type: application/json" \
  -d '{
    "forwards_to": "http://localhost:3000",
    "metadata": "ci-preview",
    "proto": "https"
  }'
```

### Docker Integration

Expose services running in Docker containers:

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
      - "4040:4040"  # Inspector UI
    depends_on:
      - app
```

### Common Patterns

**Local demo for clients:**
```bash
# Quick share — start tunnel, send URL to client
ngrok http 3000 --basic-auth="demo:clientname2025"
```

**Telegram/Slack bot development:**
```bash
# 1. Start your bot server locally
node bot.js  # listening on :8443

# 2. Expose it
ngrok http 8443 --domain=your-bot.ngrok-free.app

# 3. Set webhook URL to ngrok domain
# Telegram: https://api.telegram.org/bot<token>/setWebhook?url=https://your-bot.ngrok-free.app/webhook
```

**Testing mobile app against local API:**
```bash
# Expose local API — use the ngrok URL in mobile app config
ngrok http 8080
# Replace localhost:8080 with https://abc123.ngrok-free.app in your app
```

**CI/CD preview environments:**
```bash
# In GitHub Actions or similar
ngrok http 3000 --domain=pr-${PR_NUMBER}.ngrok-free.app &
# Deploy preview, comment URL on the PR
```

## tags

tunneling, networking, webhooks, development, localhost, port-forwarding, demo, testing

## examples

### Expose a Next.js dev server

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
