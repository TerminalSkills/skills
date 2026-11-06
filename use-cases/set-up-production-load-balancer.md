---
title: "Set Up a Production Load Balancer with SSL and Traffic Management"
slug: set-up-production-load-balancer
description: "Configure Nginx as a reverse proxy with SSL termination, load balancing, rate limiting, and WebSocket support to handle production traffic reliably."
skills: [load-balancer, github-actions]
category: devops
tags: [nginx, load-balancer, ssl, reverse-proxy, devops, rate-limiting]
---

# Set Up a Production Load Balancer with SSL and Traffic Management

## The Problem

Ravi runs platform engineering at a 40-person fintech startup. Their API runs on three backend servers behind a single server with no load balancing: traffic hits one box, and when it goes down at 2 AM, everything goes down. There is no SSL termination (the app handles it), no rate limiting (a bot scraped their public API and caused a 20-minute outage last month), and no health checks (a zombie process on one server returned 502s for hours before anyone noticed).

They need a proper traffic layer: load balance across backends, terminate SSL in one place, rate limit abusive clients, proxy WebSocket connections for their real-time dashboard, and stop routing to unhealthy servers.

## The Solution

Use the **load-balancer** skill to configure Nginx as a reverse proxy with upstream groups, SSL, rate limiting and failover. Use the **github-actions** skill to validate and deploy the Nginx config from git.

## Step-by-Step Walkthrough

### Step 1: Design the architecture

```text
I have 3 backend servers running a Node.js API on port 8080 (api1, api2, api3).
api1 and api2 are the same spec (4 vCPU, 8GB RAM), api3 is smaller (2 vCPU, 4GB)
and should get less traffic. I also have a WebSocket service for real-time updates
on ws1 and ws2, port 8080. I need Nginx in front of everything with: HTTPS on
api.example.com, load balancing across the 3 API servers, WebSocket proxying on
/ws/, rate limiting for the public API (30 req/s per IP, but the login endpoint at
5 req/min), and failover. Design the Nginx configuration.
```

All client traffic hits Nginx on port 443, and Nginx routes it to an upstream group:

```text
Client --> Nginx (443/SSL) --> upstream app_servers (3 backends)
                           --> upstream ws_servers  (2 backends)
```

`/etc/nginx/nginx.conf` holds the upstreams and rate-limit zones:

```nginx
user nginx;
worker_processes auto;
events { worker_connections 4096; }

http {
    server_tokens off;
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    limit_req_status 429;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      '';
    }

    upstream app_servers {
        least_conn;
        keepalive 32;
        server api1:8080 weight=3 max_fails=3 fail_timeout=30s;
        server api2:8080 weight=3 max_fails=3 fail_timeout=30s;
        server api3:8080 weight=2 max_fails=3 fail_timeout=30s;
    }

    upstream ws_servers {
        ip_hash;
        server ws1:8080;
        server ws2:8080;
    }

    include /etc/nginx/conf.d/*.conf;
}
```

`app_servers` uses `least_conn` with weights 3/3/2, so the smaller box takes about a third less traffic. `ws_servers` uses `ip_hash` so a client keeps reaching the same backend (clients behind one NAT share a backend).

### Step 2: Terminate SSL with Let's Encrypt

```text
Set up Let's Encrypt SSL for api.example.com on this Nginx server using the webroot
method since Nginx is already running. Redirect HTTP to HTTPS, add security headers,
and make sure renewal reloads Nginx.
```

Request the certificate first. Nginx cannot load the port 443 block below until the certificate files exist, so before the first run keep only the port 80 server block in `api.conf` (it serves the ACME challenge from `/var/www/certbot`), reload Nginx, run certbot, then add the 443 block and reload again:

```bash
sudo certbot certonly --webroot -w /var/www/certbot -d api.example.com
sudo certbot renew --dry-run
```

`/etc/nginx/conf.d/api.conf`:

```nginx
server {
    listen 80;
    server_name api.example.com;

    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}

server {
    listen 443 ssl;
    http2 on;
    server_name api.example.com;

    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-Frame-Options DENY always;

    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection        "";
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;

    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://app_servers;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
    }

    location = /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://app_servers;
        proxy_next_upstream error timeout;
        proxy_next_upstream_tries 2;
    }

    location /ws/ {
        proxy_pass http://ws_servers;
        # proxy_set_header here replaces the server-level set, so repeat the shared ones
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout 3600s;
    }
}
```

`http2 on;` is the current syntax (`listen 443 ssl http2;` is deprecated since nginx 1.25.1). There is no `ssl_stapling` line: Let's Encrypt ended OCSP in 2025 and its certificates no longer carry an OCSP responder URL, so stapling has nothing to staple.

Renewal does not need a hand-written cron job. The certbot package (apt or snap) installs a systemd timer; check it with `systemctl list-timers | grep certbot`. Make renewals reload Nginx with a deploy hook, which runs only when a certificate was actually renewed:

```bash
printf '#!/bin/sh\nnginx -s reload\n' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### Step 3: Failover when a backend dies

```text
If a server fails 3 requests in a row, stop routing traffic to it. Also configure
Nginx to retry the next upstream server if it gets a 502 or 503 from a backend.
```

Open-source Nginx has only passive health checks. With `max_fails=3 fail_timeout=30s`, three failed attempts within 30 seconds take a server out of rotation for 30 seconds, after which Nginx tries it again. The retry directives in Step 2 make that invisible to clients:

```nginx
proxy_next_upstream error timeout http_502 http_503;
proxy_next_upstream_tries 2;
```

If a backend answers 502 or 503, Nginx retries on another server, so the client sees an error only if both attempts fail. By default Nginx does not retry POST, PATCH or LOCK requests; leave it that way unless the backend deduplicates. The login location retries only on connection errors and timeouts, so a 503 is never replayed against an authentication endpoint.

Two limits to plan around. Passive checks only notice a dead server when real traffic hits it, and a zombie process that accepts connections but answers 502 is caught only because `http_502` is in `proxy_next_upstream`. Active probes of `/health` need HAProxy (`check inter 5s fall 3 rise 2`, plus `slowstart 60s` to ramp a recovered server back up) or Nginx Plus (`health_check`, `slow_start`); the load-balancer skill has the HAProxy config. Add `$upstream_response_time` to the access log format and alert on it to catch slow backends before they stop answering.

### Step 4: Test the rate limits

```text
Test the rate limiting configuration against a local copy of this config: send a
burst of 100 requests to /api/ and 8 requests to /api/auth/login from one address.
```

Run this against a staging copy, never against production. Results from a test on nginx 1.30 (stub backends, one client address, requests sent back to back):

- `/api/`, 100 requests as fast as curl can send them: the first 21 pass instantly (1 plus the burst of 20), then requests pass at about 30 per second and the rest get `429`. In the run, 33 returned 200 and 67 returned 429.
- `/api/auth/login`, 8 requests in a row: the first 4 pass (1 plus burst 3), the other 4 return `429`. The zone refills one token every 12 seconds (5 per minute), so an attacker gets about 5 attempts a minute once the burst is gone.
- Zones are keyed on `$binary_remote_addr`, so each client address is limited separately. If the balancer sits behind a CDN, restore the real client address first (`real_ip_header`), or every visitor shares one limit.
- `/ws/` has no rate limit; it carries long-lived connections, not request floods.

### Step 5: Validate and deploy the config from git

```text
Create a GitHub Actions workflow that runs nginx -t on every PR that touches nginx/,
and on merge to main copies the config to the load balancer over SSH, tests it
there, and reloads gracefully. Keep the configs in a nginx/ directory.
```

`nginx -t` fails in CI for two reasons that are not config errors: upstream host names such as `api1` do not resolve, and the certificate files do not exist. The workflow handles both with `--add-host` and a throwaway self-signed certificate:

```yaml
# .github/workflows/nginx-deploy.yml
name: nginx
on:
  pull_request:
    paths: ["nginx/**"]
  push:
    branches: [main]
    paths: ["nginx/**"]

permissions:
  contents: read

jobs:
  validate:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v7
      - name: nginx -t
        run: |
          mkdir -p certs/live/api.example.com
          openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj /CN=api.example.com \
            -keyout certs/live/api.example.com/privkey.pem -out certs/live/api.example.com/fullchain.pem
          docker run --rm \
            --add-host api1:127.0.0.1 --add-host api2:127.0.0.1 --add-host api3:127.0.0.1 \
            --add-host ws1:127.0.0.1 --add-host ws2:127.0.0.1 \
            -v "$PWD/nginx/nginx.conf:/etc/nginx/nginx.conf:ro" \
            -v "$PWD/nginx/conf.d:/etc/nginx/conf.d:ro" \
            -v "$PWD/certs:/etc/letsencrypt:ro" \
            nginx:stable-alpine nginx -t

  deploy:
    needs: validate
    if: github.event_name == 'push'
    runs-on: ubuntu-24.04
    environment: production
    steps:
      - uses: actions/checkout@v7
      - name: Install SSH key and pinned host key
        run: |
          install -m 700 -d ~/.ssh
          printf '%s\n' "$DEPLOY_KEY" > ~/.ssh/id_ed25519 && chmod 600 ~/.ssh/id_ed25519
          printf '%s\n' "$LB_KNOWN_HOSTS" > ~/.ssh/known_hosts
        env:
          DEPLOY_KEY: ${{ secrets.LB_DEPLOY_KEY }}
          LB_KNOWN_HOSTS: ${{ secrets.LB_KNOWN_HOSTS }}
      - name: Upload, test, reload
        run: |
          rsync -az --delete nginx/ deploy@lb.example.com:/tmp/nginx-new/
          ssh deploy@lb.example.com 'set -e
            sudo cp -a /etc/nginx /etc/nginx.bak
            sudo rsync -a /tmp/nginx-new/ /etc/nginx/
            if sudo nginx -t && sudo nginx -s reload; then
              sudo rm -rf /etc/nginx.bak
            else
              sudo rsync -a --delete /etc/nginx.bak/ /etc/nginx/ && sudo nginx -s reload
              sudo rm -rf /etc/nginx.bak
              exit 1
            fi'
```

`LB_KNOWN_HOSTS` holds the server's real host key line (from `ssh-keyscan` checked against a trusted source), so the deploy never accepts an unknown host. `nginx -s reload` starts new workers on the new config and lets old workers finish in-flight requests, so no connection is dropped. The server-side copy uses `rsync -a` without `--delete`, so files the repo does not manage (`mime.types`, `fastcgi_params`) stay in place; the backup in `/etc/nginx.bak` is what the failure branch restores.

## Real-World Example

Ravi inherits a setup where three API servers sit behind a single point of failure with no load balancing, no SSL termination and no rate limiting. A scraper bot took down the API for 20 minutes last month, and a zombie backend returned 502s for hours before anyone noticed.

He configures Nginx with weighted `least_conn` balancing across the three servers, so the smaller one takes less traffic. Certbot's timer handles renewal and a deploy hook reloads Nginx. A backend that answers 502 or 503 is skipped by a transparent retry and removed from rotation after three failures, and the general API is capped at 30 req/s per address with login at 5 req/min. A GitHub Actions workflow runs `nginx -t` on every PR and deploys with a graceful reload on merge. The next scraper gets 429 responses while real users are unaffected.

## Related Skills

- [load-balancer](/skills/load-balancer): the Nginx upstream, SSL, rate-limit and WebSocket configuration, and the HAProxy alternative for active health checks.
- [github-actions](/skills/github-actions): the workflow that validates the config on pull requests and deploys it on merge.
