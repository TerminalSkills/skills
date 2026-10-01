---
name: chatwoot
description: >-
  Deploys and integrates Chatwoot, an open-source customer support platform
  with live chat and a shared multi-channel inbox. Use when a user asks to set
  up open-source customer support, add live chat without SaaS costs, build a
  multi-channel inbox, or deploy a free Intercom alternative.
license: Apache-2.0
compatibility: 'Docker with Compose v2, PostgreSQL with pgvector, Redis 7+; 4 GB RAM minimum. Widget works on any website.'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: business
  tags:
    - chatwoot
    - chat
    - support
    - open-source
    - self-hosted
  repository: https://github.com/chatwoot/chatwoot
---

# Chatwoot

## Overview

Chatwoot is an open-source customer support platform. Self-hosted Intercom alternative with live chat, shared inbox, multi-channel support (website, email, Facebook, Instagram, Twitter, WhatsApp, Telegram, Line, SMS), a help center and an AI agent (Captain). A deployment is four containers: the Rails web app, a Sidekiq worker, PostgreSQL and Redis.

## Instructions

### Step 1: Docker Deployment

```yaml
# docker-compose.yaml — follows docker-compose.production.yaml in the Chatwoot repository
x-chatwoot: &chatwoot
  image: chatwoot/chatwoot:v4.18.0        # v4.18.0-ce = community edition without enterprise code
  env_file: .env
  volumes:
    - storage_data:/app/storage
  restart: always

services:
  rails:
    <<: *chatwoot
    depends_on: [postgres, redis]
    ports:
      - "127.0.0.1:3000:3000"             # localhost only; a reverse proxy terminates TLS
    environment:
      - NODE_ENV=production
      - RAILS_ENV=production
      - INSTALLATION_ENV=docker
    entrypoint: docker/entrypoints/rails.sh
    command: ["bundle", "exec", "rails", "s", "-p", "3000", "-b", "0.0.0.0"]

  sidekiq:
    <<: *chatwoot
    depends_on: [postgres, redis]
    environment:
      - NODE_ENV=production
      - RAILS_ENV=production
      - INSTALLATION_ENV=docker
    command: ["bundle", "exec", "sidekiq", "-C", "config/sidekiq.yml"]

  postgres:
    image: pgvector/pgvector:pg16         # Chatwoot v4 needs the pgvector extension
    restart: always
    environment:
      - POSTGRES_DB=chatwoot
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    restart: always
    command: ["sh", "-c", "redis-server --requirepass \"$REDIS_PASSWORD\""]
    env_file: .env
    volumes:
      - redis_data:/data

volumes:
  storage_data:
  postgres_data:
  redis_data:
```

```bash
# .env — next to the compose file, never committed
cat > .env <<EOF
SECRET_KEY_BASE=$(openssl rand -hex 64)
POSTGRES_PASSWORD=$(openssl rand -hex 24)
REDIS_PASSWORD=$(openssl rand -hex 24)
FRONTEND_URL=https://support.northwind.dev
POSTGRES_HOST=postgres
POSTGRES_USERNAME=postgres
REDIS_URL=redis://redis:6379
ENABLE_ACCOUNT_SIGNUP=false
MAILER_SENDER_EMAIL=Northwind Support <support@northwind.dev>
SMTP_ADDRESS=smtp.postmarkapp.com
SMTP_PORT=587
SMTP_USERNAME=${SMTP_USERNAME}
SMTP_PASSWORD=${SMTP_PASSWORD}
EOF
chmod 600 .env

# Create the schema first — also after every image upgrade
docker compose run --rm rails bundle exec rails db:chatwoot_prepare
docker compose up -d
curl -I localhost:3000/api                # expect HTTP 200
```

`FRONTEND_URL` must be the public URL of the installation: the widget script that Chatwoot generates uses it as `BASE_URL`. Put Nginx or another proxy in front for TLS. With Nginx, set `underscores_in_headers on;` — the API authenticates with an `api_access_token` header, which Nginx drops by default — and pass the `Upgrade` and `Connection "upgrade"` headers for WebSockets.

To upgrade: change the image tag, `docker compose pull`, `docker compose up -d`, then run `db:chatwoot_prepare` again. Very old installations should step through intermediate versions.

### Step 2: Add Chat Widget

Create a Website inbox in the dashboard and paste its script before `</body>`:

```html
<script>
  (function(d,t) {
    var BASE_URL="https://support.northwind.dev";
    var g=d.createElement(t),s=d.getElementsByTagName(t)[0];
    g.src=BASE_URL+"/packs/js/sdk.js";
    g.async = true;
    s.parentNode.insertBefore(g,s);
    g.onload=function(){
      window.chatwootSDK.run({
        websiteToken: 'Zc8pXq2mVh4RwT7nLk9sBd3F',   // from the inbox's Configuration tab
        baseUrl: BASE_URL
      })
    }
  })(document,"script");
</script>
```

Identify logged-in users once the SDK is ready, so conversations attach to the right contact:

```javascript
window.chatwootSettings = { position: "right", locale: "en", darkMode: "auto" };  // set before the script loads

window.addEventListener("chatwoot:ready", function () {
  window.$chatwoot.setUser(currentUser.id, {
    email: currentUser.email,
    name: currentUser.name,
    identifier_hash: currentUser.chatwootHash,   // computed on the server, see Example 2
  });
  window.$chatwoot.setCustomAttributes({ plan: "pro" });
});
// On logout: window.$chatwoot.reset();
```

### Step 3: API Integration

```typescript
// lib/chatwoot.ts — Application API: user access token from Profile Settings
const CHATWOOT_URL = 'https://support.northwind.dev'
const CHATWOOT_TOKEN = process.env.CHATWOOT_API_TOKEN!
const ACCOUNT_ID = 1

// Create contact when user signs up
const res = await fetch(`${CHATWOOT_URL}/api/v1/accounts/${ACCOUNT_ID}/contacts`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    api_access_token: CHATWOOT_TOKEN,
  },
  body: JSON.stringify({
    inbox_id: 3,                         // required
    name: 'Maria Okafor',
    email: 'maria@northwind.dev',
    identifier: 'user-381',              // your own user ID
    custom_attributes: { plan: 'pro' },  // define each attribute in Settings first
  }),
})
if (!res.ok) throw new Error(`Chatwoot ${res.status}: ${await res.text()}`)
```

Other Application API routes follow the same pattern under `/api/v1/accounts/{account_id}/`: `conversations` (`source_id`, `inbox_id`, `contact_id`), `conversations/{id}/messages` (`content`, `message_type: "outgoing"`, `private`), and `webhooks`.

## Examples

### Example 1: Self-host Chatwoot behind an existing domain

**User request:** "Set up Chatwoot on our server at support.northwind.dev so we can stop paying for Intercom."

The agent writes the compose file and `.env` above, then:

```bash
docker compose run --rm rails bundle exec rails db:chatwoot_prepare
docker compose up -d
curl -sI localhost:3000/api | head -1     # HTTP/1.1 200 OK once Rails has booted
```

It then adds an Nginx server block for the domain that proxies to `127.0.0.1:3000`:

```nginx
server {
  server_name support.northwind.dev;
  underscores_in_headers on;              # keep the api_access_token header
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_http_version 1.1;
  }
  listen 80;
}
```

After a certificate is issued, opening `https://support.northwind.dev` shows the onboarding screen where the first administrator account is created.

### Example 2: Sync signups to Chatwoot and verify widget identity

**User request:** "When someone signs up, create them in Chatwoot, and make sure nobody can impersonate another user in the chat widget."

The agent enables identity validation on the Website inbox, stores its HMAC token as `CHATWOOT_HMAC_TOKEN`, and computes the hash on the server:

```javascript
const crypto = require("crypto");

function chatwootHash(userId) {
  return crypto
    .createHmac("sha256", process.env.CHATWOOT_HMAC_TOKEN)
    .update(String(userId))
    .digest("hex");
}
// chatwootHash("user-381") → 64 hex characters, sent to the browser with the session
```

The browser passes it as `identifier_hash` in `setUser`. To receive conversations in the CRM, the agent subscribes a webhook (the access token must belong to a Chatwoot administrator; a token of a user with the agent role is refused):

```bash
curl -s -X POST "https://support.northwind.dev/api/v1/accounts/1/webhooks" \
  -H "Content-Type: application/json" \
  -H "api_access_token: $CHATWOOT_API_TOKEN" \
  -d '{"url": "https://crm.northwind.dev/hooks/chatwoot", "subscriptions": ["conversation_created", "message_created", "conversation_status_changed"]}'
```

## Guidelines

- Self-hosted: completely free, unlimited agents and conversations. The default image tags are the Enterprise Edition build, whose paid features are activated from the Super Admin panel; the `-ce` tags are the community edition.
- Cloud: free for up to 2 agents; paid plans start at $19/agent/month.
- Supports WhatsApp Business, Telegram, Twitter, Facebook, Instagram, Line, SMS, email, and website channels in one inbox.
- Use webhooks to sync conversations with your CRM or ticketing system. Events: `conversation_created`, `conversation_updated`, `conversation_status_changed`, `message_created`, `message_updated`, `contact_created`, `contact_updated`, `webwidget_triggered`.
- Run `rails db:chatwoot_prepare`, not `rails db:migrate`, on first setup and after upgrades.
- Use a PostgreSQL image or managed service that provides `pgvector`; Chatwoot v4 requires it.
- Sidekiq must be running alongside Rails — it processes all background jobs.
- Keep `ENABLE_ACCOUNT_SIGNUP=false` on a public instance so strangers cannot create accounts on it.
- Keep port 3000, PostgreSQL and Redis off the public internet; set a Redis password and treat `SECRET_KEY_BASE` and API tokens as secrets.
- Three API families exist: Application (agent token, shown here), Client (custom chat UIs, authenticated by `inbox_identifier`), Platform (installation admin, self-hosted only).
- Plan for at least 4 GB RAM and 1 GB of swap; Sidekiq loads the full Rails stack and can grow past 1 GB on a busy server.
