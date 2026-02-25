---
title: Harden Production Server Security
slug: harden-production-server-security
description: >-
  Secure a production Linux server with layered defenses: Fail2Ban for brute
  force protection, CrowdSec for community threat intelligence, Let's Encrypt
  for TLS, Cloudflare for DDoS and WAF, Trivy for vulnerability scanning, and
  Vault for secrets management.
skills:
  - fail2ban
  - crowdsec
  - letsencrypt
  - cloudflare
  - trivy
  - vault-secrets
category: development
tags:
  - server-hardening
  - security
  - production
  - tls
  - firewall
---

# Harden Production Server Security

Marta runs a SaaS platform on three Ubuntu servers. The app works, customers are signing up — but she's been ignoring security. Last week, her monitoring showed 50,000 SSH brute force attempts in a single day, and a penetration test revealed the API server was running a Node.js image with 23 known CVEs. Time to fix this before something breaks.

## Step 1: SSH and Brute Force Protection

The first line of defense is stopping brute force attacks. Marta installs Fail2Ban to automatically ban IPs after failed login attempts, then layers CrowdSec on top for community-shared threat intelligence.

```ini
# /etc/fail2ban/jail.local — SSH and web server protection
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
banaction = iptables-multiport
action = %(action_mwl)s

[sshd]
enabled = true
port = 2222
maxretry = 3
bantime = 24h
# After 3 failed SSH attempts, ban for 24 hours

[nginx-http-auth]
enabled = true
port = http,https
maxretry = 5
bantime = 2h

[nginx-botsearch]
enabled = true
port = http,https
maxretry = 2
bantime = 7d
# Aggressive ban for bots probing for wp-admin, phpmyadmin, etc.
```

CrowdSec adds collaborative intelligence — when an IP attacks anyone in the community, it gets flagged for everyone.

```bash
# Install CrowdSec with community scenarios
sudo apt install crowdsec crowdsec-firewall-bouncer-iptables
sudo cscli collections install crowdsecurity/nginx
sudo cscli collections install crowdsecurity/sshd
sudo cscli collections install crowdsecurity/http-cve

# Enroll in the community (share and receive threat intelligence)
sudo cscli console enroll YOUR_ENROLLMENT_KEY
```

Within hours of enabling CrowdSec, Marta sees it blocking IPs that Fail2Ban hasn't caught yet — because those IPs were already flagged by other community members before they even reached her servers.

## Step 2: TLS Everywhere

Every connection must be encrypted. Marta uses Let's Encrypt for the application servers behind Cloudflare, and generates internal certificates for service-to-service communication.

```bash
# Public-facing: Let's Encrypt via Certbot
sudo certbot --nginx -d api.martasaas.com -d app.martasaas.com

# Verify auto-renewal is active
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

For Nginx, Marta adds security headers and configures strong TLS:

```nginx
# /etc/nginx/conf.d/security.conf — TLS hardening
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
ssl_prefer_server_ciphers off;
ssl_session_timeout 1d;
ssl_session_cache shared:SSL:10m;
ssl_stapling on;
ssl_stapling_verify on;

# Security headers
add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
add_header X-Content-Type-Options nosniff always;
add_header X-Frame-Options DENY always;
add_header Content-Security-Policy "default-src 'self'" always;
```

## Step 3: Cloudflare for Edge Protection

Marta puts Cloudflare in front of everything. The free tier provides DDoS protection, WAF rules, and hides the origin server IPs.

```bash
# Set SSL mode to Full (Strict) — never use Flexible
# Dashboard: SSL/TLS → Full (Strict)

# Create firewall rules to block known bad traffic
# Dashboard: Security → WAF → Create rule:
# Expression: (cf.threat_score gt 14)
# Action: Challenge

# Block specific countries if not needed
# Expression: (ip.geoip.country in {"CN" "RU"} and not cf.client.bot)
# Action: Block
```

The key security setting: SSL mode must be **Full (Strict)**. Flexible mode means Cloudflare terminates SSL but connects to the origin over plain HTTP — anyone between Cloudflare and the server can read the traffic.

## Step 4: Container Vulnerability Scanning

Marta's Docker images haven't been updated in months. She adds Trivy to the CI pipeline to catch vulnerabilities before deployment.

```bash
# Scan current production image
trivy image --severity CRITICAL,HIGH martasaas/api:latest

# Output shows 23 vulnerabilities:
# - 4 CRITICAL (remote code execution in outdated openssl)
# - 19 HIGH (various library CVEs)
```

She updates the base image and adds Trivy to the deployment pipeline:

```dockerfile
# Dockerfile — Updated with minimal base image
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
RUN apk --no-cache add dumb-init
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
USER node
ENTRYPOINT ["dumb-init", "node", "dist/server.js"]
```

```yaml
# .github/workflows/security.yml — Scan on every push
name: Security Scan
on: [push]
jobs:
  trivy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t martasaas/api:test .
      - name: Trivy scan
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: martasaas/api:test
          format: table
          exit-code: 1
          severity: CRITICAL,HIGH
```

## Step 5: Secrets Management with Vault

Marta's API keys and database passwords are currently in `.env` files on the servers. She migrates to Vault for centralized, auditable secret management.

```bash
# Deploy Vault (production mode with file storage)
vault server -config=/etc/vault/config.hcl

# Store application secrets
vault kv put secret/api \
  database_url="postgresql://prod:xxx@db:5432/saas" \
  stripe_key="sk_live_xxx" \
  sendgrid_key="SG.xxx"

# Create policy for the API service
vault policy write api-policy - <<EOF
path "secret/data/api" {
  capabilities = ["read"]
}
path "database/creds/api-role" {
  capabilities = ["read"]
}
EOF
```

```typescript
// lib/config.ts — Load secrets from Vault at startup
import Vault from 'node-vault'

const vault = Vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
})

export async function loadSecrets() {
  const { data } = await vault.read('secret/data/api')
  return {
    databaseUrl: data.data.database_url,
    stripeKey: data.data.stripe_key,
    sendgridKey: data.data.sendgrid_key,
  }
}
```

The key improvement: database credentials are now dynamic. Vault creates temporary PostgreSQL users that auto-expire after 1 hour. If credentials leak, the blast radius is minimal — they expire before an attacker can use them.

## Results

After a weekend of hardening, Marta's security posture transforms. SSH brute force attempts still hit the server — but Fail2Ban and CrowdSec block them instantly. Cloudflare absorbs a 2Gbps DDoS attack without the origin servers noticing. Trivy catches a critical CVE in the next deployment before it reaches production. And when an engineer accidentally commits a database password to Git, it doesn't matter — Vault's dynamic credentials already expired. The 50,000 daily brute force attempts? Still happening, but now they bounce off multiple layers of defense.
