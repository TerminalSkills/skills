---
name: load-balancer
description: >-
  Configure and optimize load balancers and reverse proxies using Nginx, HAProxy,
  and cloud ALBs. Use when someone asks to "set up load balancing", "configure Nginx
  reverse proxy", "set up HAProxy", "add SSL termination", "configure health checks",
  "proxy WebSocket connections", "rate limit traffic", or "set up failover". Covers
  L4/L7 balancing, SSL, rate limiting, caching, WebSocket proxying, and health checks.
license: Apache-2.0
compatibility: "Nginx 1.25+, HAProxy 2.8+, AWS ALB/NLB, Traefik"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: ["load-balancer", "nginx", "haproxy", "reverse-proxy", "ssl", "devops"]
---

# Load Balancer

## Overview

This skill helps AI agents configure production-grade load balancers and reverse proxies. It covers Nginx and HAProxy setup, SSL termination, rate limiting, WebSocket proxying, health checks, and traffic routing strategies for web applications and APIs.

## Instructions

### Step 1: Choose Architecture

Determine the right setup based on requirements:
- **Single service, HTTPS needed** → Nginx reverse proxy with SSL
- **Multiple backends, different routing rules** → Nginx with upstream groups or HAProxy with ACLs
- **TCP/UDP traffic (databases, Redis)** → Nginx stream module or HAProxy TCP mode
- **Need advanced health checks, circuit breaking** → HAProxy (more powerful health check DSL)
- **Kubernetes** → Ingress controller (nginx-ingress or Traefik)

### Step 2: Configure Nginx Reverse Proxy

Basic reverse proxy with load balancing:

```nginx
# /etc/nginx/nginx.conf
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    multi_accept on;
}

http {
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    server_tokens off;

    # Logging with upstream timing
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" $request_time $upstream_response_time';

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css application/json application/javascript
               text/xml application/xml image/svg+xml;

    # Rate limiting zones
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;

    # Upstream backends
    upstream app_servers {
        least_conn;
        keepalive 32;

        server app1:8080 weight=3 max_fails=3 fail_timeout=30s;
        server app2:8080 weight=3 max_fails=3 fail_timeout=30s;
        server app3:8080 backup;
    }

    upstream websocket_servers {
        ip_hash;
        server ws1:8080;
        server ws2:8080;
    }

    # Cache for static assets
    proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=static_cache:10m
                     max_size=1g inactive=60m use_temp_path=off;

    include /etc/nginx/conf.d/*.conf;
}
```

### Step 3: Configure HTTPS and Security

```nginx
# /etc/nginx/conf.d/app.conf
server {
    listen 80;
    server_name example.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name example.com;

    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;

    # Security headers
    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;

    # Static files with caching
    location /static/ {
        alias /var/www/static/;
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_cache static_cache;
    }

    # API with rate limiting
    location /api/ {
        limit_req zone=api burst=20 nodelay;

        proxy_pass http://app_servers;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        proxy_connect_timeout 5s;
        proxy_read_timeout 30s;
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
    }

    # Auth — strict rate limit
    location /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://app_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket
    location /ws/ {
        proxy_pass http://websocket_servers;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 3600s;
    }

    # Default
    location / {
        proxy_pass http://app_servers;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Block attack paths
    location ~ /\.(git|env|htaccess) {
        deny all;
        return 404;
    }
}
```

### Step 4: Configure HAProxy (Alternative)

Use HAProxy when you need advanced health checks, stick tables for rate limiting, or a stats dashboard:

```haproxy
# /etc/haproxy/haproxy.cfg
global
    maxconn 50000
    log stdout format raw local0
    stats socket /var/run/haproxy.sock mode 660 level admin
    ssl-default-bind-options ssl-min-ver TLSv1.2

defaults
    mode http
    log global
    option httplog
    option dontlognull
    option forwardfor
    timeout connect 5s
    timeout client 30s
    timeout server 30s
    timeout http-request 10s

frontend stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 10s

frontend https_front
    bind *:443 ssl crt /etc/haproxy/certs/example.com.pem alpn h2,http/1.1
    http-request set-header X-Forwarded-Proto https

    # ACL-based routing
    acl is_api path_beg /api/
    acl is_websocket hdr(Upgrade) -i websocket
    acl is_static path_beg /static/ /assets/

    # Rate limiting with stick tables
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request track-sc0 src
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 100 }

    use_backend ws_servers if is_websocket
    use_backend api_servers if is_api
    default_backend app_servers

backend app_servers
    balance leastconn
    option httpchk GET /health
    http-check expect status 200
    cookie SERVERID insert indirect nocache

    server app1 app1:8080 check inter 5s fall 3 rise 2 cookie app1
    server app2 app2:8080 check inter 5s fall 3 rise 2 cookie app2
    server app3 app3:8080 check inter 5s fall 3 rise 2 backup

backend api_servers
    balance leastconn
    option httpchk GET /api/health
    default-server inter 3s fall 3 rise 2 slowstart 60s
    retry-on conn-failure empty-response response-timeout
    retries 2

    server api1 api1:3000 check
    server api2 api2:3000 check

backend ws_servers
    balance source
    timeout tunnel 3600s
    server ws1 ws1:8080 check
    server ws2 ws2:8080 check
```

### Step 5: Set Up SSL with Let's Encrypt

```bash
# Install and get certificate
apt install certbot python3-certbot-nginx
certbot --nginx -d example.com -d www.example.com

# Auto-renewal cron
echo "0 3 * * * certbot renew --quiet --post-hook 'nginx -s reload'" | crontab -
```

### Step 6: TCP/UDP Load Balancing (L4)

For databases, Redis, or other non-HTTP services:

```nginx
# Add to nginx.conf (outside http block)
stream {
    upstream postgres {
        least_conn;
        server db1:5432 weight=5;
        server db2:5432 weight=5;
        server db3:5432 backup;
    }

    upstream redis {
        hash $remote_addr consistent;
        server redis1:6379;
        server redis2:6379;
    }

    server {
        listen 5432;
        proxy_pass postgres;
        proxy_connect_timeout 3s;
        proxy_timeout 300s;
    }
}
```

### Load Balancing Algorithms

Choose the algorithm based on your workload:

- **round-robin** (default) — Equal distribution. Good for uniform, stateless servers
- **least_conn** — Routes to server with fewest active connections. Best for variable request durations
- **ip_hash** — Sticky sessions by client IP. Use when sessions are stored in-memory
- **hash $key consistent** — Consistent hashing. Minimizes redistribution when servers change. Good for caches
- **weighted** — Add `weight=N` to send proportionally more traffic to stronger servers

### Health Check Patterns

**Nginx (passive)** — Marks servers down after `max_fails` consecutive failures within `fail_timeout`:
```nginx
server app1:8080 max_fails=3 fail_timeout=30s;
```

**HAProxy (active)** — Probes backends on a schedule:
```haproxy
option httpchk GET /health
http-check expect status 200
default-server inter 5s fall 3 rise 2
```

### Docker Compose Deployment

```yaml
version: "3.8"
services:
  nginx:
    image: nginx:1.25-alpine
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./conf.d:/etc/nginx/conf.d:ro
      - ./certs:/etc/letsencrypt:ro
    ports:
      - "80:80"
      - "443:443"
    restart: unless-stopped
    depends_on:
      - app1
      - app2
```

## Best Practices

- Terminate SSL at the load balancer — simpler cert management, offloads crypto from backends
- Always set `X-Real-IP` and `X-Forwarded-For` headers — backends need real client IPs
- Use `least_conn` for APIs with variable response times
- Configure `proxy_next_upstream` for transparent failover on 502/503
- Use keepalive connections to backends (`keepalive 32`) to reduce TCP overhead
- Rate limit auth endpoints much more aggressively than general API endpoints
- Log `$upstream_response_time` separately from `$request_time` to isolate backend vs network latency
- Health check endpoints should test real dependencies (DB, cache), not just return 200
- Store configs in version control and provision via Docker volumes
