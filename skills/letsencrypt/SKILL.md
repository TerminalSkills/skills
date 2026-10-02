---
name: letsencrypt
description: >-
  Let's Encrypt is a free, automated certificate authority, and Certbot is its
  official ACME client for getting and renewing TLS certificates. Use this skill
  when asked to add HTTPS to a website, get a free SSL certificate, issue a
  wildcard certificate, set up automatic renewal, fix a Certbot renewal
  failure, or get certificates automatically in Docker with Traefik.
license: Apache-2.0
compatibility: "Linux server with a public DNS name; Nginx, Apache, standalone or any web server; Certbot 4+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/certbot/certbot
  tags: ["letsencrypt", "tls", "ssl", "https", "certbot"]
---

# Let's Encrypt

## Overview

Let's Encrypt issues free domain-validated certificates over the ACME protocol. Certbot (from the EFF) proves you control a domain, stores the certificate under `/etc/letsencrypt/live/<name>/`, and renews it. Validation methods: HTTP-01 (port 80 must be reachable from the internet), TLS-ALPN-01, and DNS-01 (the only way to get wildcard certificates, and works for servers that are not public).

Certificate lifetimes are shrinking. Today the default `classic` profile still issues 90-day certificates; Let's Encrypt has announced 64 days from 10 February 2027 and 45 days from 16 February 2028, with an opt-in `tlsserver` profile (45 days) and a `shortlived` profile (6 days) available earlier. Renew automatically and monitor, because manual calendar reminders will not keep up. Expiry-notification emails from Let's Encrypt have been discontinued, so use your own monitoring.

## Instructions

### Step 1: Install Certbot

The Certbot project recommends the snap on most Linux distributions:

```bash
sudo apt-get remove certbot            # remove any distro package first
sudo snap install --classic certbot
sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
```

Distro packages also work (`sudo apt install certbot python3-certbot-nginx` or `python3-certbot-apache`) but are often older. Before issuing, confirm the domain's DNS A/AAAA records point at this server and ports 80 and 443 are open.

### Step 2: Get a certificate

```bash
# Nginx: obtain and edit the config (redirects HTTP to HTTPS)
sudo certbot --nginx -d shop.northwind.dev -d www.shop.northwind.dev

# Obtain only, configure the server yourself
sudo certbot certonly --nginx -d shop.northwind.dev

# Existing webroot (server keeps running)
sudo certbot certonly --webroot -w /var/www/shop -d shop.northwind.dev

# No web server running yet: Certbot binds port 80 itself
sudo certbot certonly --standalone -d shop.northwind.dev
```

Add `--staging` (alias `--test-cert`) while experimenting; staging certificates are not trusted but have far higher rate limits.

### Step 3: Wildcards with a DNS plugin

Wildcards need DNS-01. Use a DNS provider plugin so renewals run unattended. Example with Cloudflare (snap install):

```bash
sudo snap set certbot trust-plugin-with-root=ok
sudo snap install certbot-dns-cloudflare
sudo install -d -m 700 /root/.secrets/certbot
sudoedit /root/.secrets/certbot/cloudflare.ini       # one line: dns_cloudflare_api_token = followed by your zone-scoped API token
sudo chmod 600 /root/.secrets/certbot/cloudflare.ini

sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/certbot/cloudflare.ini \
  -d northwind.dev -d "*.northwind.dev"
```

Use a token scoped to DNS edit on that one zone. A wildcard does not cover the bare domain, so list both names. `certbot certonly --manual --preferred-challenges dns` works once but cannot renew automatically unless you also give `--manual-auth-hook` and `--manual-cleanup-hook` scripts.

### Step 4: Renewal

```bash
systemctl list-timers | grep certbot       # snap and distro packages install a timer (or a cron entry)
sudo certbot renew --dry-run               # full simulated renewal against staging
sudo certbot certificates                  # names, domains, expiry dates, paths
```

Certbot 4 and later renews when about a third of the lifetime remains. Reload the server after renewal with a deploy hook; it runs only when a certificate was actually renewed:

```bash
sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh >/dev/null <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

Or pass `--deploy-hook "systemctl reload nginx"` when issuing. The `--nginx` and `--apache` plugins reload the server for you.

### Step 5: Containers with Traefik (v3)

Traefik has its own ACME client and needs no Certbot:

```yaml
# docker-compose.yml
services:
  traefik:
    image: traefik:v3
    command:
      - --providers.docker=true
      - --providers.docker.exposedbydefault=false
      - --entrypoints.web.address=:80
      - --entrypoints.websecure.address=:443
      - --entrypoints.web.http.redirections.entrypoint.to=websecure
      - --certificatesresolvers.le.acme.email=ops@northwind.dev
      - --certificatesresolvers.le.acme.storage=/acme/acme.json
      - --certificatesresolvers.le.acme.httpchallenge.entrypoint=web
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - acme:/acme
  shop:
    image: ghcr.io/northwind/shop:2.4.1
    labels:
      - traefik.enable=true
      - traefik.http.routers.shop.rule=Host(`shop.northwind.dev`)
      - traefik.http.routers.shop.entrypoints=websecure
      - traefik.http.routers.shop.tls.certresolver=le
volumes:
  acme:
```

For tests add `--certificatesresolvers.le.acme.caserver=https://acme-staging-v02.api.letsencrypt.org/directory`. Caddy is another option that obtains certificates with no configuration beyond the site name.

## Examples

### Example 1: HTTPS for an Nginx site

Request: "Put HTTPS on shop.northwind.dev, it already runs on Nginx."

```bash
sudo snap install --classic certbot && sudo ln -s /snap/bin/certbot /usr/local/bin/certbot
sudo certbot --nginx -d shop.northwind.dev -d www.shop.northwind.dev
sudo certbot renew --dry-run
```

Certbot asks for an email address, edits the matching `server` blocks to listen on 443 with `ssl_certificate /etc/letsencrypt/live/shop.northwind.dev/fullchain.pem`, adds the HTTP-to-HTTPS redirect, and the dry run ends with "Congratulations, all simulated renewals succeeded".

### Example 2: A wildcard for internal services

Request: "I need *.northwind.dev for staging hosts that are not reachable from the internet."

Use DNS-01 as in Step 3. The result is one certificate in `/etc/letsencrypt/live/northwind.dev/` that you copy or mount into each service; add a deploy hook that distributes `fullchain.pem` and `privkey.pem` after every renewal.

## Guidelines

- Use `fullchain.pem` (leaf plus intermediates) as the server certificate and `privkey.pem` as the key; never the old `cert.pem` alone.
- Rate limits (production): 50 new certificates per registered domain per 7 days, 5 per exact identical name set per 7 days, 5 failed validations per hostname per hour, 300 new orders per account per 3 hours. Renewals that follow ACME Renewal Information (ARI) are exempt; Certbot supports ARI. Test with `--staging` or `--dry-run`.
- Keep private keys and DNS API tokens readable by root only (mode 600) and out of Git and backups that others can read.
- A common renewal failure is port 80 blocked or redirected by a firewall, CDN or WAF; check the `/var/log/letsencrypt/letsencrypt.log` file for the failing challenge.
- Do not run `certbot` from cron every minute or with `--force-renewal` in a loop; that exhausts the duplicate limit.
- Mounting the Docker socket (even read-only) gives Traefik broad control over the host; consider a socket proxy for production.
- Install Certbot with the package manager or snap; do not pipe downloaded scripts into a shell.
