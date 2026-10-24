---
title: "Self-Host Plausible Analytics for Privacy-First Web Analytics"
description: "Replace Google Analytics with self-hosted Plausible CE on a VPS — Docker Compose, automatic TLS, custom events, a Dokku-deployed app and a weekly Slack digest, all on your infrastructure."
skills: [dokku, plausible]
difficulty: intermediate
time_estimate: "3 hours"
tags: [analytics, privacy, plausible, self-hosted, docker, dokku, gdpr, no-cookie]
---

# Self-Host Plausible Analytics for Privacy-First Web Analytics

## The Problem

Google Analytics 4 is a privacy nightmare: GDPR consent banners required, data shipped to US servers, users tracked across the web. You want real traffic insights without selling your visitors' data to Google.

## What You'll Build

- Plausible Community Edition (CE) on its own VPS with Docker Compose and automatic Let's Encrypt TLS
- The tracking script on an app deployed with Dokku, with the script URL kept in config
- Custom event tracking: button clicks, form conversions, plan upgrades
- A weekly Slack digest from the Stats API

## Persona

**Nina, SaaS founder** — runs a B2B tool with 5,000 monthly visitors. Got a GDPR notice from a European customer. Wants real analytics without cookie banners, on a server she controls. Her app runs on a small Dokku box; Plausible gets a separate server so analytics load never competes with the app.

---

## Architecture

```text
analytics VPS (2 GB RAM or more, SSE 4.2 / NEON CPU)
└── Docker Compose (official community-edition repo)
    ├── plausible          (Elixir app, serves HTTP/HTTPS itself)
    ├── plausible_db       (PostgreSQL)
    └── plausible_events_db (ClickHouse)

app VPS
└── Dokku → bluefinbikes.com (tracking script loaded from the analytics host)
```

---

## Step 1: Install Plausible CE

Use the official repository instead of a hand-written compose file: it ships the matching PostgreSQL and ClickHouse versions and their config. Check the newest tag at github.com/plausible/community-edition (v3.2.1 when this page was verified) and read its release notes.

```bash
# Ubuntu 24.04 package names; on other distributions install Docker Engine with the Compose plugin
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git openssl
git clone -b v3.2.1 --single-branch https://github.com/plausible/community-edition plausible-ce
cd plausible-ce || exit 1
echo "BASE_URL=https://analytics.bluefinbikes.com" >> .env
echo "SECRET_KEY_BASE=$(openssl rand -base64 48)" >> .env
echo "HTTP_PORT=80" >> .env
echo "HTTPS_PORT=443" >> .env
cat > compose.override.yml <<'EOF'
services:
  plausible:
    ports:
      - 80:80
      - 443:443
EOF
docker compose up -d
```

The DNS record for `analytics.bluefinbikes.com` must already point at the server. With `HTTP_PORT=80` and `HTTPS_PORT=443` set, Plausible requests and renews a Let's Encrypt certificate for the `BASE_URL` host itself, so no Nginx or certbot is needed. If you prefer your own reverse proxy, pick other ports and bind them to `127.0.0.1`. Open the `BASE_URL`, register the first user (`DISABLE_REGISTRATION` defaults to `invite_only`, so later users need an invitation; `true` closes registration entirely), and add the site `bluefinbikes.com`.

For email reports and invitations, add `MAILER_ADAPTER`, `MAILER_EMAIL`, `SMTP_HOST_ADDR`, `SMTP_HOST_PORT`, `SMTP_USER_NAME` and `SMTP_USER_PWD` to `.env` (the compose file passes them through); keep the SMTP password out of version control.

---

## Step 2: Add the Tracking Script via Dokku

Copy the snippet from **Site settings, General, Tracking, Site installation**. The `pa-` id in the script URL is unique to your site; do not guess it. Older tutorials show `data-domain` scripts, which are the legacy form.

On the app server, keep the URL in config so it can change without code edits (set it before the first push, so it exists at build time):

```bash
dokku config:set --no-restart invoice-app NEXT_PUBLIC_PLAUSIBLE_SRC="$PLAUSIBLE_SCRIPT_URL"
git push dokku main
```

`next-plausible` 4.x takes the script URL, not the domain:

```tsx
// app/layout.tsx
import PlausibleProvider from 'next-plausible'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PlausibleProvider src={process.env.NEXT_PUBLIC_PLAUSIBLE_SRC!}>
          {children}
        </PlausibleProvider>
      </body>
    </html>
  )
}
```

The provider renders the script only in production builds, and localhost visits are ignored by default. For plain HTML sites paste the two-part snippet from the dashboard into `<head>`.

---

## Step 3: Custom Event Tracking

An event shows in the dashboard only after you create a goal with the same name (Site settings, Goals, Add goal, Custom event). Goal names are case-sensitive.

Without JavaScript, add a CSS class to the element; spaces in the name are written `+`:

```html
<button class="plausible-event-name=Upgrade+Clicked">Upgrade</button>
```

From JavaScript, with the snippet installed:

```javascript
// custom properties
window.plausible?.('Signup', { props: { source: 'homepage' } })
```

Never put emails, names or user ids into properties; individual values cannot be deleted later. Community Edition leaves out Plausible's ecommerce revenue goals, funnels and the Sites API (see the self-hosting page on plausible.io), so revenue tracking is a cloud-only feature; track purchases as a plain custom event with a `plan` property.

---

## Step 4: Slack Weekly Digest

Create a Stats API key in account settings, API Keys (limited to 600 requests per hour). The API is `POST /api/v2/query`; the old `GET /api/v1/stats/*` endpoints belong to the previous generation. Without dimensions the answer is one row whose metrics follow the order requested.

```bash
#!/bin/bash
# /opt/plausible-digest/weekly-digest.sh, cron: 0 9 * * 1
set -euo pipefail
: "${PLAUSIBLE_API_KEY:?}" "${SLACK_WEBHOOK_URL:?}"
BASE_URL=https://analytics.bluefinbikes.com

ROW=$(curl -sf -X POST "$BASE_URL/api/v2/query" \
  -H "Authorization: Bearer $PLAUSIBLE_API_KEY" -H "Content-Type: application/json" \
  -d '{"site_id":"bluefinbikes.com","metrics":["visitors","pageviews","bounce_rate"],"date_range":"7d"}' \
  | jq -r '.results[0].metrics | @tsv')
read -r VISITORS PAGEVIEWS BOUNCE <<< "$ROW"

jq -n --arg t "Last 7 days: $VISITORS visitors, $PAGEVIEWS pageviews, $BOUNCE% bounce rate" \
  '{text: $t}' | curl -sf -X POST "$SLACK_WEBHOOK_URL" -H "Content-Type: application/json" -d @-
```

Store both secrets in an environment file readable only by the cron user.

---

## Operations

- Back up both the PostgreSQL and ClickHouse volumes (`db-data`, `event-data`).
- To upgrade, check out the next tag, read its release notes, then `docker compose pull && docker compose up -d`.
- Ad blockers drop some requests to third-party hosts. Serving the script and the event endpoint from your own domain through a proxy avoids that; the proxy must forward the visitor IP in `X-Forwarded-For`, otherwise the bot filter silently drops events.
- Plausible has no per-user tracking or session replay by design; use a product analytics tool for identified-user funnels.

## Related Skills

- **plausible**: snippet, goals, Stats API v2 and Community Edition setup
- **dokku**: deploying the tracked app and keeping its configuration
