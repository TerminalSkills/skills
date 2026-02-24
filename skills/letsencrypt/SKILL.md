---
name: letsencrypt
description: >-
  Get free TLS certificates with Certbot and Let's Encrypt. Use when a user
  asks to add HTTPS to a website, get a free SSL certificate, auto-renew
  certificates, or secure a web server with TLS.
license: Apache-2.0
compatibility: 'Any web server (Nginx, Apache, standalone)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - letsencrypt
    - tls
    - ssl
    - https
    - certbot
---

# Let's Encrypt

## Overview

Let's Encrypt provides free, automated TLS certificates. Certbot is the official client — obtains and renews certificates automatically. Supports Nginx, Apache, standalone, and DNS validation for wildcards.

## Instructions

### Step 1: Install Certbot

```bash
sudo apt install certbot python3-certbot-nginx
```

### Step 2: Get Certificate

```bash
# Automatic Nginx configuration
sudo certbot --nginx -d example.com -d www.example.com

# Standalone (no web server needed)
sudo certbot certonly --standalone -d example.com

# DNS validation (for wildcards)
sudo certbot certonly --manual --preferred-challenges dns -d "*.example.com"
```

### Step 3: Auto-Renewal

```bash
# Certbot installs a systemd timer automatically
sudo systemctl status certbot.timer
sudo certbot renew --dry-run    # test renewal
```

### Step 4: Docker with Traefik

```yaml
# docker-compose.yml — Automatic TLS with Traefik
services:
  traefik:
    image: traefik:v3
    command:
      - --entrypoints.websecure.address=:443
      - --certificatesresolvers.le.acme.email=admin@example.com
      - --certificatesresolvers.le.acme.storage=/acme/acme.json
      - --certificatesresolvers.le.acme.httpchallenge.entrypoint=web
    ports: ["80:80", "443:443"]
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - acme:/acme
volumes:
  acme:
```

## Guidelines

- Certificates valid for 90 days — auto-renewal handles this.
- Rate limits: 50 certs per domain per week.
- Use DNS validation for wildcard certs and internal servers.
- For containers, Traefik or Caddy handle Let's Encrypt automatically.
