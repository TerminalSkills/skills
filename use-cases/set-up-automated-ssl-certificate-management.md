---
title: "Set Up Automated SSL Certificate Management with AI"
slug: set-up-automated-ssl-certificate-management
description: "Automate SSL certificate monitoring, renewal, and deployment to prevent expiration-related outages."
skills: [cicd-pipeline, coding-agent, n8n]
category: devops
tags: [ssl, certificates, automation, tls, security]
---

# Set Up Automated SSL Certificate Management with AI

## The Problem

Nina's 15-person engineering team manages 24 SSL certificates across production services, staging environments, API endpoints, and internal tools. Renewals happen manually -- someone gets a calendar reminder, logs into the provider, generates a new cert, and deploys it across the relevant servers. The process works fine until it doesn't.

Last quarter, a wildcard certificate expired on a Saturday night. The API and three customer-facing services went dark for two hours before the on-call engineer figured out the cause -- nobody suspects SSL first. Clients saw "connection refused" and "ERR_CERT_DATE_INVALID", and the debugging went down the wrong path (load balancer health, DNS) until someone ran `openssl s_client` and saw the expired certificate.

There is no central inventory. Nobody knows which certificates protect which services, when they expire, or who owns the renewal. The knowledge lives in calendar reminders on different people's accounts, some of which belong to engineers who have left. And the clock is tightening: the CA/Browser Forum caps certificate lifetimes at 200 days since March 15, 2026 (100 days from March 2027, 47 days from March 2029), and Let's Encrypt's default certificate drops from 90 to 64 days on February 10, 2027 and to 45 days in February 2028. Manual renewal gets more frequent every year.

## The Solution

Using the **coding-agent**, **cicd-pipeline**, and **n8n** skills, this walkthrough builds a certificate lifecycle system: an inventory of all 24 certificates, daily monitoring that reaches Slack through n8n, automated Let's Encrypt renewals with certbot, and a GitLab CI gate that blocks deploys to hosts with expiring certs. A coding agent (Claude Code or Codex CLI, run non-interactively as the coding-agent skill describes) writes the scripts and configs; Nina reviews them before anything runs.

## Step-by-Step Walkthrough

### Step 1: Discover and Catalog Every Certificate

Nina starts from the DNS zone export and the load balancer configs and asks the agent to turn them into an inventory:

```text
From dns-export.txt and the nginx configs in ./infra, list every hostname that serves TLS. For each one, read the certificate with openssl and write ssl-inventory.json with: domain, issuer, notAfter, days until expiry, type (single, wildcard, SAN), and which service uses it.
```

The scan comes back with two immediate fires:

| Domain | Days Left | Used By |
|--------|-----------|---------|
| `*.api.example.com` | 23 | API gateway, webhooks |
| `admin.example.com` | 19 | Admin panel |

Two more (`app.example.com`, `docs.example.com`) expire in 70-75 days, and the remaining 20 have 90-365 days left. For the first time there is a complete picture, including the issuer of each certificate (18 Let's Encrypt, 6 from a commercial CA), which decides the renewal route in Step 3.

The wildcard for `*.api.example.com` serves the main API, the webhook endpoints and the internal service-to-service calls, so an expiry there would have broken every service that talks to it over HTTPS.

### Step 2: Set Up Daily Monitoring with Slack Alerts

Let's Encrypt ended its expiry reminder emails in June 2025, so the team has to watch its own certificates. The check script reads each endpoint, computes the days left and reports whether the chain verifies:

```bash
#!/usr/bin/env bash
# scripts/check-ssl-certs.sh endpoints.txt   (one "host[:port]" per line)
set -u
while read -r endpoint; do
  [ -z "$endpoint" ] && continue
  host="${endpoint%%:*}"; port="${endpoint##*:}"; [ "$port" = "$endpoint" ] && port=443
  out=$(openssl s_client -servername "$host" -connect "$host:$port" </dev/null 2>/dev/null)
  cert=$(printf '%s\n' "$out" | openssl x509 2>/dev/null)
  if [ -z "$cert" ]; then
    printf '{"host":"%s","days_left":null,"chain":"no TLS answer"}\n' "$host"; continue
  fi
  end=$(printf '%s\n' "$cert" | openssl x509 -noout -enddate | cut -d= -f2)
  days=$(( ($(date -d "$end" +%s) - $(date +%s)) / 86400 ))
  chain=$(printf '%s\n' "$out" | sed -n 's/^ *Verify return code: [0-9]* (\(.*\))/\1/p' | tail -1)
  printf '{"host":"%s","days_left":%d,"chain":"%s"}\n' "$host" "$days" "$chain"
done < "$1"
```

It prints one JSON line per endpoint. An expired certificate still produces a line (negative `days_left`), and a missing intermediate shows up in `chain`:

```console
$ ./check-ssl-certs.sh endpoints.txt
{"host":"api.example.com","days_left":23,"chain":"ok"}
{"host":"staging.example.com","days_left":-2,"chain":"certificate has expired"}
{"host":"legacy.example.com","days_left":null,"chain":"no TLS answer"}
```

A cron entry on a monitoring host runs it at 06:00 UTC and posts the lines to an n8n Webhook node. Give the node Header Auth (see the n8n skill) so strangers cannot trigger it, and keep the URL and key in the cron host's environment:

```bash
0 6 * * * /opt/ssl/check-ssl-certs.sh /opt/ssl/endpoints.txt | jq -s '{results: .}' | curl -fsS -X POST -H "Content-Type: application/json" -H "X-Api-Key: $SSL_ALERT_KEY" --data-binary @- "$SSL_ALERT_URL"
```

In n8n the workflow is Webhook -> Code (split `body.results`, add a severity per item) -> Switch -> Slack "Send a message" nodes:

| Days Until Expiry | Severity | Action |
|-------------------|----------|--------|
| 60 | Info | Message to `#infrastructure` |
| 30 | Warning | Renewal instructions included |
| 14 | Urgent | Tags `@oncall` |
| 7 | Critical | Tags `@engineering-lead` |
| Expired or chain error | P0 | Incident escalation |

The 60-day row suits the commercial certificates. A Let's Encrypt certificate is renewed at one third of its lifetime and is only 64 days long from February 2027 (45 from 2028), so for those start the thresholds at 14 days or fewer; anything below that means the automated renewal has failed.

### Step 3: Automate Let's Encrypt Renewals

The 18 Let's Encrypt certificates can be fully automated with certbot (5.8.0 at the time of writing). Single-domain hosts use the HTTP-01 challenge. The wildcard needs the DNS-01 challenge, which requires a DNS plugin for the zone's provider; for Cloudflare:

```bash
# cloudflare.ini holds dns_cloudflare_api_token (Zone:DNS:Edit on this zone only); restrict it first,
# because certbot warns about "Unsafe permissions" on a readable credentials file
sudo chmod 600 /etc/letsencrypt/cloudflare.ini
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d example.com -d '*.example.com'
```

Certbot packages install a scheduled task that runs `certbot renew`; since Certbot 4.0 it renews a certificate once less than a third of its lifetime remains (30 days for a 90-day certificate, about 21 for 64 days, 15 for 45 days) and does nothing otherwise. Confirm it exists and works instead of adding a second cron job:

```bash
systemctl list-timers | grep certbot
sudo certbot renew --dry-run
```

Deployment to the other servers belongs in a deploy hook, which certbot runs only after a successful renewal and passes `RENEWED_LINEAGE` and `RENEWED_DOMAINS`. Put an executable script in `/etc/letsencrypt/renewal-hooks/deploy/` that copies the new files to each target (with a deploy-only SSH key), reloads nginx, and checks the live endpoint with the Step 4 script:

```bash
#!/bin/sh
# /etc/letsencrypt/renewal-hooks/deploy/push-certs.sh
set -eu
for host in web1.internal web2.internal; do
  scp "$RENEWED_LINEAGE/fullchain.pem" "$RENEWED_LINEAGE/privkey.pem" "deploy@$host:/etc/nginx/certs/"
  ssh "deploy@$host" 'sudo nginx -t && sudo systemctl reload nginx'
done
/opt/ssl/ssl-gate.sh "${RENEWED_DOMAINS%% *}" 30
```

The last line matters: a renewal that lands on the certbot server but never reaches production (expired SSH key, wrong path) is otherwise invisible until the old certificate expires. A failing hook is reported by `certbot renew`, and the daily Step 2 report flags the stale certificate anyway.

The remaining 6 certificates come from a commercial CA for OV/EV requirements. With the 200-day cap they need renewing about twice a year, and about four times a year once the cap drops to 100 days in March 2027. If the CA offers ACME for the account, point certbot at it; if not, the monitor sends a 60-day reminder with the portal, certificate type, CSR steps and deploy targets, and each certificate has a named owner in the inventory.

### Step 4: Add Certificate Checks to the CI/CD Pipeline

The gate blocks a deploy to a host whose certificate is missing or about to expire (`openssl x509 -checkend N` fails when the certificate expires within N seconds):

```bash
#!/usr/bin/env bash
# scripts/ssl-gate.sh host[:port] [min_days]
set -eu
endpoint="$1"; min_days="${2:-7}"
host="${endpoint%%:*}"; port="${endpoint##*:}"; [ "$port" = "$endpoint" ] && port=443
if ! openssl s_client -servername "$host" -connect "$host:$port" </dev/null 2>/dev/null \
     | openssl x509 -noout -checkend $(( min_days * 86400 )) >/dev/null; then
  echo "Deployment blocked: certificate for $host is missing or expires within $min_days days." >&2
  exit 1
fi
echo "$host: certificate valid for at least $min_days more days"
```

The cicd-pipeline skill covers GitLab CI and CircleCI. In GitLab CI the gate is a job before the deploy stage:

```yaml
# .gitlab-ci.yml (excerpt; list pre-deploy before deploy under stages:)
ssl-gate:
  stage: pre-deploy
  script:
    - ./scripts/ssl-gate.sh "$DEPLOY_HOST" 7
deploy:
  stage: deploy
  needs: [ssl-gate]
  script: ./scripts/deploy.sh
```

A developer pushing a Friday deploy to a host whose certificate expires on Sunday gets a clear pipeline failure instead of a weekend outage. After deploying, run `curl -sI "https://$DEPLOY_HOST" | grep -i strict-transport-security` to confirm HSTS, and the Step 2 script to confirm the chain.

## Real-World Example

Three months after setting everything up, Nina checks the numbers. Twelve certificates have auto-renewed without any human intervention, and the two critical ones from the first scan renewed a week before their deadlines. The monitoring caught one close call -- a commercial certificate 14 days from expiry with no renewal in progress -- and the Slack alert gave the team two weeks to handle it during business hours. The CI gate blocked one deployment to a staging server whose certificate had expired unnoticed.

The setup took the team an afternoon. Unlike the calendar-reminder system, it does not depend on any one person being available.

## Related Skills

- `coding-agent` -- run Claude Code or Codex CLI non-interactively to generate and review the scripts
- `n8n` -- webhook, routing and Slack nodes for the alerting workflow
- `cicd-pipeline` -- GitLab CI and CircleCI configuration for the pre-deploy gate
