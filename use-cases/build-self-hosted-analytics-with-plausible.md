---
title: "Self-Host Plausible Analytics for Privacy-First Web Analytics"
description: "Replace Google Analytics with self-hosted Plausible CE on a VPS — Docker Compose, Nginx SSL, custom events, and weekly email reports, all on your infrastructure."
skills: [dokku, plausible]
difficulty: intermediate
time_estimate: "4 hours"
tags: [analytics, privacy, plausible, self-hosted, docker, nginx, gdpr, no-cookie]
---

# Self-Host Plausible Analytics for Privacy-First Web Analytics

## The Problem

Google Analytics 4 is a privacy nightmare: GDPR consent banners required, data shipped to US servers, users tracked across the web. You want real traffic insights without selling your visitors' data to Google.

## What You'll Build

- Plausible Community Edition deployed on your VPS with Docker Compose
- Nginx reverse proxy with Let's Encrypt SSL
- Tracking script installed on your websites
- Custom event tracking: button clicks, form conversions, purchases
- Weekly email reports and Slack digest

## Persona

**Nina, SaaS founder** — runs a B2B tool with 5,000 monthly visitors. Got a GDPR notice from a European customer. Wants real analytics without cookie banners and without paying $99/month to Plausible cloud.

---

## Architecture

```
VPS (2 vCPU, 4GB RAM — ~$12/month)
│
├── Nginx (reverse proxy + SSL)
│   └── analytics.yoursite.com → Plausible :8000
│
└── Docker Compose
    ├── plausible (Elixir app)
    ├── plausible_db (PostgreSQL)
    ├── plausible_events_db (ClickHouse)
    └── mail (SMTP via Resend/Postmark)
```

---

## Step 1: Server Setup

```bash
# On your VPS (Ubuntu 22.04)
apt update && apt install -y docker.io docker-compose-plugin nginx certbot python3-certbot-nginx

# Create app directory
mkdir -p /opt/plausible && cd /opt/plausible
```

---

## Step 2: Docker Compose Configuration

```yaml
# /opt/plausible/docker-compose.yml
version: "3.8"

services:
  plausible_db:
    image: postgres:16-alpine
    restart: always
    volumes:
      - db-data:/var/lib/postgresql/data
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: plausible_db

  plausible_events_db:
    image: clickhouse/clickhouse-server:24.3-alpine
    restart: always
    volumes:
      - event-data:/var/lib/clickhouse
      - ./clickhouse/logs.xml:/etc/clickhouse-server/config.d/logs.xml
      - ./clickhouse/ipv4.xml:/etc/clickhouse-server/config.d/ipv4.xml
    ulimits:
      nofile:
        soft: 262144
        hard: 262144

  plausible:
    image: ghcr.io/plausible/community-edition:v2
    restart: always
    command: sh -c "sleep 10 && /entrypoint.sh db createdb && /entrypoint.sh db migrate && /entrypoint.sh run"
    depends_on:
      - plausible_db
      - plausible_events_db
    ports:
      - "127.0.0.1:8000:8000"
    env_file:
      - plausible-conf.env

volumes:
  db-data:
  event-data:
```

```bash
# /opt/plausible/plausible-conf.env
BASE_URL=https://analytics.yoursite.com
SECRET_KEY_BASE=<generate with: openssl rand -base64 64>
DATABASE_URL=postgres://postgres:${POSTGRES_PASSWORD}@plausible_db:5432/plausible_db
CLICKHOUSE_DATABASE_URL=http://plausible_events_db:8123/plausible_events_db

# Email (use Postmark/Resend/SES)
MAILER_ADAPTER=Bamboo.SMTPAdapter
SMTP_HOST_ADDR=smtp.postmarkapp.com
SMTP_HOST_PORT=587
SMTP_USER_NAME=your-postmark-token
SMTP_USER_PWD=your-postmark-token
MAILER_EMAIL=analytics@yoursite.com

# Optional: disable registration after first user
DISABLE_REGISTRATION=invite_only
```

```bash
# ClickHouse config to suppress noise
mkdir -p clickhouse

cat > clickhouse/logs.xml << 'EOF'
<clickhouse><logger><level>warning</level></logger></clickhouse>
EOF

cat > clickhouse/ipv4.xml << 'EOF'
<clickhouse><listen_host>0.0.0.0</listen_host></clickhouse>
EOF

docker compose up -d
```

---

## Step 3: Nginx + SSL

```nginx
# /etc/nginx/sites-available/analytics
server {
    listen 80;
    server_name analytics.yoursite.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name analytics.yoursite.com;

    ssl_certificate /etc/letsencrypt/live/analytics.yoursite.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/analytics.yoursite.com/privkey.pem;

    # Security headers
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header Referrer-Policy strict-origin-when-cross-origin;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/analytics /etc/nginx/sites-enabled/
certbot --nginx -d analytics.yoursite.com --non-interactive --agree-tos -m you@yoursite.com
nginx -t && systemctl reload nginx
```

---

## Step 4: Add Tracking Script

```html
<!-- Add to <head> of every page -->
<script
  defer
  data-domain="yoursite.com"
  src="https://analytics.yoursite.com/js/script.js"
></script>
```

For Next.js:
```typescript
// app/layout.tsx
import Script from "next/script";

export default function RootLayout({ children }) {
  return (
    <html>
      <head>
        <Script
          defer
          data-domain="yoursite.com"
          src="https://analytics.yoursite.com/js/script.js"
          strategy="afterInteractive"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

---

## Step 5: Custom Event Tracking

```javascript
// Track custom events (no cookie, no PII)
// Plausible's script exposes window.plausible()

// Button click
document.getElementById("upgrade-btn").addEventListener("click", () => {
  window.plausible?.("Upgrade Clicked", { props: { plan: "pro" } });
});

// Form submission
document.getElementById("signup-form").addEventListener("submit", () => {
  window.plausible?.("Signup", { props: { source: "homepage" } });
});

// Purchase (e-commerce)
function trackPurchase(amount: number, plan: string) {
  window.plausible?.("Purchase", {
    props: { plan, revenue: { currency: "USD", amount } },
  });
}
```

---

## Step 6: Slack Weekly Digest

```bash
# cron: every Monday 9am
# 0 9 * * 1 /opt/plausible/weekly-digest.sh

#!/bin/bash
# Fetch stats via Plausible Stats API
STATS=$(curl -s "https://analytics.yoursite.com/api/v1/stats/aggregate?site_id=yoursite.com&period=7d&metrics=visitors,pageviews,bounce_rate,visit_duration" \
  -H "Authorization: Bearer ${PLAUSIBLE_API_KEY}")

VISITORS=$(echo $STATS | jq -r '.results.visitors.value')
PAGEVIEWS=$(echo $STATS | jq -r '.results.pageviews.value')
BOUNCE=$(echo $STATS | jq -r '.results.bounce_rate.value')

curl -s -X POST "$SLACK_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "{\"text\":\"📊 Last 7 days: *${VISITORS}* visitors | *${PAGEVIEWS}* pageviews | *${BOUNCE}%* bounce rate\"}"
```

---

## What's Next

- Funnel analysis: track multi-step conversion flows
- Goal tracking: set conversion targets and monitor progress
- Reverse proxy the script URL through your own domain (avoid ad blockers)
- Connect to Grafana via the Stats API for custom dashboards
