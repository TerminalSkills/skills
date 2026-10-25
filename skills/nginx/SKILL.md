---
name: nginx
description: >-
  Assists with configuring Nginx as a web server, reverse proxy, and load balancer. Use
  when serving static files, proxying to application servers, setting up TLS termination,
  configuring caching, rate limiting, or writing security headers. Trigger words: nginx,
  reverse proxy, load balancer, tls, ssl, server block, location block.
license: Apache-2.0
compatibility: "nginx 1.25.1+ for the `http2 on;` directive (config checked with nginx 1.31.8)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/nginx/nginx
  category: devops
  tags: "nginx, reverse-proxy, load-balancer, tls, web-server"
---

# Nginx

## Overview

Nginx is a high-performance web server and reverse proxy that serves static files, proxies requests to application servers, load balances across backends, terminates TLS, and caches responses. It handles thousands of concurrent connections with minimal resource usage through an event-driven, non-blocking architecture.

## Instructions

- When configuring server blocks, define virtual hosts with `server_name` for domain matching and `listen` for ports, using separate blocks for HTTP (port 80, redirect to HTTPS) and HTTPS (`listen 443 ssl;` plus `http2 on;`). Since nginx 1.25.1 the `http2` parameter of `listen` is deprecated and `nginx -t` warns about it.
- When setting up reverse proxying, use `proxy_pass` to forward to upstream servers and set `proxy_set_header` for Host, X-Real-IP, X-Forwarded-For, and X-Forwarded-Proto to preserve client information.
- When load balancing, define `upstream` blocks with multiple servers and choose the strategy: round-robin (default), `least_conn`, `ip_hash` to keep a client on the same backend by IP address, or weighted distribution.
- When configuring TLS, set modern protocols (`TLSv1.2 TLSv1.3`), enable a shared session cache, and get certificates from Let's Encrypt via certbot or another ACME client. Do not add `ssl_stapling` for Let's Encrypt certificates: Let's Encrypt ended OCSP service on 2025-08-06, and its certificates carry no OCSP URL. Use it only if your CA still issues OCSP responses (and then also set `ssl_trusted_certificate`).
- When serving static files, enable `gzip` compression for text-based content, set `expires 1y` for hashed assets, use `sendfile on` for efficient transfer, and `try_files $uri $uri/ /index.html;` for SPA fallback routing.
- When a backend uses WebSockets, send `proxy_http_version 1.1;` with `Upgrade` and `Connection` headers (see the example below).
- When adding security, set headers (X-Frame-Options, X-Content-Type-Options, HSTS, CSP) and configure rate limiting with `limit_req_zone` to prevent abuse.

```bash
sudo nginx -t && sudo systemctl reload nginx   # test, then reload without dropping connections
```

## Examples

### Example 1: Set up Nginx as reverse proxy with TLS for a Node.js app

**User request:** "Configure Nginx with HTTPS to proxy to my Node.js API on port 3000"

**Actions:**
1. Create a server block listening on port 443 with SSL certificate paths and HTTP/2
2. Configure `proxy_pass http://localhost:3000` with proper header forwarding
3. Add a port 80 server block that redirects all HTTP to HTTPS
4. Enable TLS 1.2/1.3, session caching, and HSTS

```nginx
# /etc/nginx/conf.d/api.shopline.dev.conf (tested with nginx -t on 1.31.8)
limit_req_zone $binary_remote_addr zone=api:10m rate=10r/s;
map $http_upgrade $connection_upgrade { default upgrade; '' close; }

server {                                  # unknown hostnames get no certificate
  listen 80 default_server;
  listen 443 ssl default_server;
  ssl_reject_handshake on;
  return 444;
}
server {
  listen 80;
  server_name api.shopline.dev;
  return 301 https://$host$request_uri;
}
server {
  listen 443 ssl;
  http2 on;
  server_name api.shopline.dev;
  ssl_certificate     /etc/letsencrypt/live/api.shopline.dev/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/api.shopline.dev/privkey.pem;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:SSL:10m;
  ssl_session_timeout 1d;
  add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
  add_header X-Content-Type-Options "nosniff" always;

  location / {
    limit_req zone=api burst=20 nodelay;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

The agent then runs `nginx -t` and reloads only if it reports `test is successful`.

**Output:** An Nginx configuration with TLS termination, HTTP-to-HTTPS redirect, and reverse proxy to the Node.js app.

### Example 2: Configure load balancing with health checks

**User request:** "Load balance across three API servers with failover"

**Actions:**
1. Define an `upstream` block with three backend servers and `least_conn` strategy
2. Set `max_fails=3 fail_timeout=30s`: this is passive health checking (a server is skipped after failed real requests); active probes are an NGINX Plus feature
3. Add a `backup` server that activates only when primary servers are down
4. Enable upstream keepalive connections to reduce connection setup to the backends

```nginx
upstream api_backend {
  least_conn;
  server 10.0.1.11:3000 max_fails=3 fail_timeout=30s;
  server 10.0.1.12:3000 max_fails=3 fail_timeout=30s;
  server 10.0.1.13:3000 backup;
  keepalive 16;
}
# in the location: proxy_pass http://api_backend; proxy_http_version 1.1;
#                  proxy_set_header Connection "";   (needed for keepalive)
```

**Output:** A load-balanced setup with automatic failover, passive health checks, and keepalive connections to the backends.

## Guidelines

- Use `server_name` with specific domains, and add a `default_server` block that rejects unknown hosts (`return 444;`, and `ssl_reject_handshake on;` on port 443) so requests for other names never reach your app.
- Never use `listen 443 ssl http2;` in new configs; use `http2 on;`.
- Always redirect HTTP to HTTPS with `return 301 https://$host$request_uri` on the port 80 block.
- Set security headers on every server block using an included snippet file for consistency. `add_header` inside a `location` replaces the ones inherited from `server`, so repeat them there.
- Use `try_files` for SPA routing instead of `rewrite` since it is faster and more explicit.
- Rate-limit API endpoints with `limit_req zone=api burst=20 nodelay` to prevent abuse without affecting normal traffic.
- Cache static assets aggressively: `expires 1y` for hashed filenames and `expires 1h` for HTML.
- Always test config before reload: `nginx -t && nginx -s reload` to prevent downtime from syntax errors.
