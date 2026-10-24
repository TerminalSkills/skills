---
name: traefik
description: >-
  Route traffic and manage TLS with Traefik reverse proxy. Use when a user asks
  to set up a reverse proxy, route traffic to Docker containers, auto-provision
  SSL certificates with Let's Encrypt, set up load balancing, configure HTTPS
  for multiple services, use a modern alternative to nginx for Docker, set up
  path-based or host-based routing, add middleware (rate limiting, auth,
  headers), or manage ingress for containerized applications.
license: Apache-2.0
compatibility: 'Docker, Kubernetes, Linux, macOS'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/traefik/traefik
  tags:
    - traefik
    - reverse-proxy
    - tls
    - docker
    - letsencrypt
---

# Traefik

## Overview

Traefik is a modern reverse proxy and load balancer designed for containerized environments. Unlike nginx, Traefik auto-discovers services from Docker labels, Kubernetes ingress, and other providers — no manual config file updates when you add or remove services. It handles Let's Encrypt TLS certificates automatically, supports path-based and host-based routing, and offers middleware for rate limiting, authentication, headers, and more.

## Instructions

### Step 1: Docker Compose Deployment

```yaml
# docker-compose.yml — Traefik with auto-discovery and Let's Encrypt
# Traefik watches Docker events and configures routing from container labels

services:
  socket-proxy:              # read-only Docker API for Traefik; only container listing is allowed
    image: tecnativa/docker-socket-proxy:v0.5.0
    environment:
      CONTAINERS: 1          # POST and every other section stay disabled by default
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    networks: [socket]

  traefik:
    image: traefik:v3.7      # pin a minor version; v3.7.16 was the newest release checked
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.endpoint=tcp://socket-proxy:2375"
      - "--providers.docker.exposedByDefault=false"    # only route labeled containers
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      # Let's Encrypt auto-TLS
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@shipfast.io"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      # HTTP → HTTPS redirect
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - letsencrypt:/letsencrypt                         # TLS certificate storage
      - ./dashboard-users:/etc/traefik/dashboard-users:ro  # created with `htpasswd -nB admin > dashboard-users`
    networks: [socket, default]
    labels:
      # Dashboard at traefik.shipfast.io (protected by basicauth; hashes stay out of the compose file)
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.shipfast.io`)"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.middlewares=auth"
      - "traefik.http.middlewares.auth.basicauth.usersfile=/etc/traefik/dashboard-users"

networks:
  socket:
    internal: true           # the Docker API proxy is not reachable from outside

volumes:
  letsencrypt:
```

### Step 2: Route Services via Docker Labels

```yaml
# docker-compose.yml — Application services with Traefik routing labels
# Each service declares its own routing rules via labels — no Traefik config changes needed

services:
  traefik:
    # ... (from Step 1)

  webapp:
    image: myapp:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.webapp.rule=Host(`app.shipfast.io`)"
      - "traefik.http.routers.webapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.webapp.loadbalancer.server.port=3000"

  api:
    image: myapi:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.shipfast.io`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=8000"

  blog:
    image: ghost:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.blog.rule=Host(`blog.shipfast.io`)"
      - "traefik.http.routers.blog.tls.certresolver=letsencrypt"
      - "traefik.http.services.blog.loadbalancer.server.port=2368"
```

Adding a new service is just adding labels — Traefik detects the container automatically and starts routing. No restart, no config reload.

### Step 3: Path-Based Routing

```yaml
# Router and service names are global in Traefik: do not reuse a name from another file
# Route different paths to different services on the same domain
services:
  frontend:
    image: frontend:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`shipfast.io`)"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=3000"

  site-api:
    image: api:latest
    labels:
      - "traefik.enable=true"
      # PathPrefix routes /api/* to this service
      - "traefik.http.routers.site-api.rule=Host(`shipfast.io`) && PathPrefix(`/api`)"
      - "traefik.http.routers.site-api.tls.certresolver=letsencrypt"
      - "traefik.http.services.site-api.loadbalancer.server.port=8000"
      # Strip /api prefix before forwarding (so /api/users → /users)
      - "traefik.http.routers.site-api.middlewares=strip-api"
      - "traefik.http.middlewares.strip-api.stripprefix.prefixes=/api"
```

### Step 4: Middleware

```yaml
# Rate limiting
labels:
  - "traefik.http.middlewares.rate-limit.ratelimit.average=100"    # 100 req/s average
  - "traefik.http.middlewares.rate-limit.ratelimit.burst=200"
  - "traefik.http.routers.api.middlewares=rate-limit"

# Security headers
labels:
  - "traefik.http.middlewares.security.headers.stsSeconds=31536000"
  - "traefik.http.middlewares.security.headers.stsIncludeSubdomains=true"
  - "traefik.http.middlewares.security.headers.contentTypeNosniff=true"
  - "traefik.http.middlewares.security.headers.frameDeny=true"
  - "traefik.http.routers.webapp.middlewares=security"

# IP allow list (admin panel; Traefik v3 name, `ipwhitelist` was removed)
labels:
  - "traefik.http.middlewares.admin-ip.ipallowlist.sourcerange=10.0.0.0/8,192.168.1.0/24"
  - "traefik.http.routers.admin.middlewares=admin-ip"

# Basic auth
labels:
  # the name `auth` is already used by the dashboard in Step 1, so pick another
  # usersfile is a path inside the Traefik container (mount it like the dashboard file)
  - "traefik.http.middlewares.panel-auth.basicauth.usersfile=/etc/traefik/panel-users"
  - "traefik.http.routers.protected.middlewares=panel-auth"

# Compress responses
labels:
  - "traefik.http.middlewares.compress.compress=true"
  - "traefik.http.routers.webapp.middlewares=compress"

# Chain multiple middlewares
labels:
  - "traefik.http.routers.api.middlewares=rate-limit,security,compress"
```

### Step 5: Load Balancing

```yaml
# Scale services and Traefik auto-load-balances
services:
  webapp:
    image: myapp:latest
    deploy:
      replicas: 3    # 3 instances
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.webapp.rule=Host(`app.shipfast.io`)"
      - "traefik.http.services.webapp.loadbalancer.server.port=3000"
      # Health check
      - "traefik.http.services.webapp.loadbalancer.healthcheck.path=/health"
      - "traefik.http.services.webapp.loadbalancer.healthcheck.interval=10s"
      # Sticky sessions (if needed)
      - "traefik.http.services.webapp.loadbalancer.sticky.cookie.name=server_id"
```

### Step 6: File-Based Configuration

For services outside Docker (bare metal, VMs), use file configuration:

```yaml
# /etc/traefik/dynamic/services.yml — Route to external services
http:
  routers:
    legacy-app:
      rule: "Host(`legacy.shipfast.io`)"
      service: legacy-backend
      tls:
        certResolver: letsencrypt

  services:
    legacy-backend:
      loadBalancer:
        servers:
          - url: "http://192.168.1.50:8080"
          - url: "http://192.168.1.51:8080"
        healthCheck:
          path: /health
          interval: "15s"
```

```yaml
# traefik.yml (static config) — Enable file provider
providers:
  docker:
    exposedByDefault: false
  file:
    directory: /etc/traefik/dynamic/
    watch: true    # auto-reload on file changes
```

## Examples

### Example 1: Set up HTTPS for multiple Docker services on one server
**User prompt:** "I have 4 Docker services (app, API, admin panel, blog) that each need their own subdomain with automatic HTTPS."

The agent will:
1. Deploy Traefik with Docker socket access and Let's Encrypt.
2. Add routing labels to each service's docker-compose definition.
3. Traefik auto-provisions TLS certificates for each subdomain.
4. Add security headers and rate limiting middleware.
5. Protect the admin panel with an IP allow list or basic auth.

### Example 2: Health-checked load balancing
**User prompt:** "Run three copies of my app behind Traefik and stop sending traffic to a copy that is failing."

The agent will:
1. Add a `/health` endpoint to the application.
2. Set `loadbalancer.healthcheck.path` and `interval` labels (Step 5) and `deploy.replicas: 3`.
3. Start it with `docker compose up -d`; Traefik adds each container as a backend.
4. A copy whose `/health` stops answering with 2xx or 3xx is taken out of rotation until it recovers.

## Guidelines

- Anyone who can reach the Docker socket controls the host, and `:ro` on the mount does not limit the API calls Traefik can make. On a shared or exposed host, put a socket proxy that only allows listing containers in front of it instead of mounting the socket directly.
- Set `exposedByDefault=false` so databases and Redis are never routed by accident. Only containers with `traefik.enable=true` get routes.
- The TLS challenge needs port 443 reachable from the internet and cannot work behind a proxying CDN; use the DNS challenge for wildcard certificates or CDN-fronted domains.
- Keep `acme.json` on a persistent volume. Losing it means re-issuing every certificate and can hit Let's Encrypt rate limits.
- Router, service and middleware names are shared across all providers; a duplicate name silently breaks one of the routes.
- Traefik v3 changed some names and the rule syntax from v2 (for example `ipAllowList` replaced `ipWhiteList`); check the migration guide when copying v2 snippets.
- Add a health check to every load-balanced service so Traefik does not send traffic to containers that are starting or failing.
