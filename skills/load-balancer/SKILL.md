---
name: load-balancer
description: >-
  Configures load balancers and reverse proxies with Nginx and HAProxy: upstream pools, least-connections balancing, HTTPS termination, health checks, rate limiting, sticky sessions and WebSocket proxying. Use when someone asks to "set up load balancing", "configure an Nginx reverse proxy", "set up HAProxy", "add SSL termination", "configure health checks", "proxy WebSocket connections", "rate limit traffic", or "set up failover".
license: Apache-2.0
compatibility: 'Nginx 1.25.1+ (tested on 1.30 stable), HAProxy 2.8+ (tested on 3.4 LTS); Docker optional for testing configs'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags: "load-balancer, nginx, haproxy, reverse-proxy, ssl"
---

# Load Balancer

## Overview

Covers production setups for two proxies. Nginx is the default choice for HTTPS termination, simple pools and static content. HAProxy is the better fit for active health checks, stick tables, cookie persistence and a stats page. Cloud balancers (AWS ALB/NLB) and Kubernetes ingress controllers are configured with their own APIs and are out of scope here. The configs below pass `nginx -t` on nginx 1.30 and `haproxy -c` on HAProxy 3.4.

## Instructions

### Step 1: Choose the architecture

- Single service, HTTPS needed: Nginx reverse proxy.
- Several backends with different routing rules: Nginx `upstream` groups, or HAProxy ACLs.
- TCP/UDP traffic (databases, Redis): Nginx `stream` block, or HAProxy `mode tcp`.
- Active health checks, stick tables, a live stats page: HAProxy. Open-source Nginx only has passive checks.
- Kubernetes: use an ingress controller instead of hand-written configs.

### Step 2: Nginx main config

`/etc/nginx/nginx.conf`:

```nginx
user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
}

http {
    sendfile on;
    tcp_nopush on;
    keepalive_timeout 65;
    server_tokens off;

    # Log upstream timing next to total request time
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" rt=$request_time urt=$upstream_response_time';
    access_log /var/log/nginx/access.log main;

    gzip on;
    gzip_types text/plain text/css application/json application/javascript image/svg+xml;

    # Rate limiting zones: 10 MB holds roughly 160k client addresses
    limit_req_zone $binary_remote_addr zone=api:10m rate=30r/s;
    limit_req_zone $binary_remote_addr zone=login:10m rate=5r/m;
    limit_req_status 429;

    # Upgrade header handling for WebSocket and plain requests
    map $http_upgrade $connection_upgrade {
        default upgrade;
        ''      '';
    }

    upstream api_backends {
        least_conn;
        keepalive 32;
        server api1.internal:3000 weight=3 max_fails=3 fail_timeout=30s;
        server api2.internal:3000 weight=3 max_fails=3 fail_timeout=30s;
        server api3.internal:3000 backup;
    }

    upstream ws_backends {
        ip_hash;
        server ws1.internal:8080;
        server ws2.internal:8080;
    }

    include /etc/nginx/conf.d/*.conf;
}
```

### Step 3: Nginx HTTPS server

`/etc/nginx/conf.d/app.conf`. Since nginx 1.25.1 `listen 443 ssl http2;` is deprecated and prints a warning; use the separate `http2 on;` directive.

```nginx
server {
    listen 80;
    server_name api.shopwise.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name api.shopwise.io;

    ssl_certificate     /etc/letsencrypt/live/api.shopwise.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.shopwise.io/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    add_header Strict-Transport-Security "max-age=63072000; includeSubDomains" always;
    add_header X-Content-Type-Options nosniff always;

    # Settings shared by every proxied location (a location with its own proxy_set_header must repeat them)
    proxy_http_version 1.1;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection        "";   # keeps upstream keepalive working
    proxy_connect_timeout 5s;
    proxy_read_timeout 30s;

    location / {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://api_backends;
        # Retry another server on errors, but never replay POST/PATCH (non-idempotent)
        proxy_next_upstream error timeout http_502 http_503;
        proxy_next_upstream_tries 2;
    }

    location /api/auth/login {
        limit_req zone=login burst=3 nodelay;
        proxy_pass http://api_backends;
    }

    location /ws/ {
        proxy_pass http://ws_backends;
        # proxy_set_header here replaces the server-level set, so repeat the shared ones
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade           $http_upgrade;
        proxy_set_header Connection        $connection_upgrade;
        proxy_read_timeout 3600s;
    }

    location ~ /\.(git|env|htaccess) {
        return 404;
    }
}
```

Always run `nginx -t` before `nginx -s reload`. Nginx resolves upstream hostnames only at startup, so a name that does not resolve stops the test.

### Step 4: HAProxy

`/etc/haproxy/haproxy.cfg`. The PEM file must contain the certificate chain followed by the private key. Export the stats password as `HAPROXY_STATS_PASSWORD` in the service environment.

```haproxy
global
    maxconn 50000
    log stdout format raw local0
    stats socket /var/run/haproxy.sock mode 600 level admin
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

# Stats page: loopback only, with a login
frontend stats
    bind 127.0.0.1:8404
    stats enable
    stats uri /stats
    stats refresh 10s
    stats auth "admin:${HAPROXY_STATS_PASSWORD}"

frontend https_front
    bind :80
    bind :443 ssl crt /etc/haproxy/certs/store.greenleaf.com.pem alpn h2,http/1.1
    http-request redirect scheme https unless { ssl_fc }
    http-request set-header X-Forwarded-Proto https if { ssl_fc }

    acl is_api path_beg /api/
    acl is_websocket hdr(Upgrade) -i websocket

    # Per-client request rate: more than 100 requests in 10 s gets a 429
    stick-table type ip size 100k expire 30s store http_req_rate(10s)
    http-request track-sc0 src
    http-request deny deny_status 429 if { sc_http_req_rate(0) gt 100 }

    use_backend ws_servers if is_websocket
    use_backend api_servers if is_api
    default_backend app_servers

backend app_servers
    balance leastconn
    option httpchk
    http-check send meth GET uri /health
    http-check expect status 200
    cookie SERVERID insert indirect nocache
    server web1 web1.internal:8080 check inter 5s fall 3 rise 2 cookie web1
    server web2 web2.internal:8080 check inter 5s fall 3 rise 2 cookie web2
    server web3 web3.internal:8080 check inter 5s fall 3 rise 2 backup

backend api_servers
    balance leastconn
    option httpchk
    http-check send meth GET uri /api/health
    default-server inter 3s fall 3 rise 2 slowstart 60s
    retry-on conn-failure empty-response response-timeout
    retries 2
    server api1 api1.internal:3000 check
    server api2 api2.internal:3000 check

backend ws_servers
    balance source
    timeout tunnel 1h
    server ws1 ws1.internal:8080 check
    server ws2 ws2.internal:8080 check
```

Validate with `haproxy -c -f /etc/haproxy/haproxy.cfg` and apply with `systemctl reload haproxy`.

### Step 5: Certificates with Let's Encrypt

Install certbot from the distribution package or snap (both set up automatic renewal; check with `systemctl list-timers | grep certbot`), then:

```bash
sudo certbot --nginx -d api.shopwise.io
sudo certbot renew --dry-run
```

For HAProxy, request the certificate with `certbot certonly --standalone` (or the webroot plugin) and add a deploy hook in `/etc/letsencrypt/renewal-hooks/deploy/` that rebuilds the combined PEM (`cat fullchain.pem privkey.pem`) and reloads HAProxy.

### Step 6: Algorithms and TCP balancing

- round-robin (default): stateless servers.
- `least_conn` / `balance leastconn`: variable request durations.
- `ip_hash` / `balance source`: affinity by client address, needed for in-memory WebSocket state. Clients behind one NAT land on the same server.
- `hash $request_uri consistent` (Nginx) / `balance uri` (HAProxy): caches, so servers can change with little reshuffling.

For databases or Redis, put a `stream { upstream ... server { listen 6379; proxy_pass ...; } }` block at the top level of `nginx.conf` (it needs the stream module, present in the official packages).

## Examples

### Example 1: Nginx reverse proxy with SSL for a Node.js API
**User prompt:** "Configure Nginx as a reverse proxy for my Node.js API on two servers, port 3000. Add SSL with Let's Encrypt for api.shopwise.io, rate limit the login endpoint to 5 requests per minute, and proxy WebSocket connections on /ws/."

The agent writes the two files from Steps 2 and 3 with its own host names, runs `nginx -t`, reloads, and runs certbot. Result: HTTP redirects to HTTPS, `/api/auth/login` answers 429 from the fifth request in quick succession from one address (1 plus a burst of 3), `/ws/` upgrades to WebSocket with a one-hour read timeout, and a failed server is skipped for 30 s after 3 errors.

### Example 2: HAProxy with active health checks and a stats page
**User prompt:** "Set up HAProxy to load balance three servers for store.greenleaf.com. Health check /health every 5 seconds, sticky sessions for the cart, stats page on 8404."

The agent writes the Step 4 config: the `app_servers` backend with `http-check send meth GET uri /health`, `check inter 5s fall 3 rise 2` and a `SERVERID` cookie per server. A server leaves rotation after 3 failed probes and returns after 2 good ones. The stats page is on `127.0.0.1:8404/stats` behind a password; reach it through an SSH tunnel.

## Guidelines

- Do not bind the stats page to a public address without authentication; it can expose server state and, with `stats admin`, control it.
- Trust `X-Forwarded-For` in the backend only from the proxy's address; the header can be forged by clients.
- `proxy_next_upstream` retries only idempotent requests by default; do not add `non_idempotent` unless the backend deduplicates.
- `proxy_http_version 1.1` plus `Connection ""` is required for `keepalive` to the upstream; the WebSocket location overrides `Connection`.
- A health endpoint should check real dependencies (database, cache), but keep it fast and cheap, or the checks themselves cause load.
- Rate limits keyed on client address misbehave behind a CDN: restore the real address first (`real_ip_header` in Nginx).
- Terminate TLS at the balancer and re-encrypt to backends if the network between them is not private.
