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
  version: 1.0.0
  category: devops
  tags:
    - traefik
    - reverse-proxy
    - load-balancer
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
  traefik:
    image: traefik:v3.2
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedByDefault=false"    # only route labeled containers
      - "--entrypoints.web.address=:80"
      - "--entrypoints.websecure.address=:443"
      # Let's Encrypt auto-TLS
      - "--certificatesresolvers.letsencrypt.acme.tlschallenge=true"
      - "--certificatesresolvers.letsencrypt.acme.email=admin@example.com"
      - "--certificatesresolvers.letsencrypt.acme.storage=/letsencrypt/acme.json"
      # HTTP → HTTPS redirect
      - "--entrypoints.web.http.redirections.entryPoint.to=websecure"
      - "--entrypoints.web.http.redirections.entryPoint.scheme=https"
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro    # Docker auto-discovery
      - letsencrypt:/letsencrypt                         # TLS certificate storage
    labels:
      # Dashboard at traefik.example.com (protected by basicauth)
      - "traefik.enable=true"
      - "traefik.http.routers.dashboard.rule=Host(`traefik.example.com`)"
      - "traefik.http.routers.dashboard.service=api@internal"
      - "traefik.http.routers.dashboard.tls.certresolver=letsencrypt"
      - "traefik.http.routers.dashboard.middlewares=auth"
      - "traefik.http.middlewares.auth.basicauth.users=admin:$$apr1$$xyz$$hashedpassword"

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
      - "traefik.http.routers.webapp.rule=Host(`app.example.com`)"
      - "traefik.http.routers.webapp.tls.certresolver=letsencrypt"
      - "traefik.http.services.webapp.loadbalancer.server.port=3000"

  api:
    image: myapi:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.api.rule=Host(`api.example.com`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=8000"

  blog:
    image: ghost:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.blog.rule=Host(`blog.example.com`)"
      - "traefik.http.routers.blog.tls.certresolver=letsencrypt"
      - "traefik.http.services.blog.loadbalancer.server.port=2368"
```

Adding a new service is just adding labels — Traefik detects the container automatically and starts routing. No restart, no config reload.

### Step 3: Path-Based Routing

```yaml
# Route different paths to different services on the same domain
services:
  frontend:
    image: frontend:latest
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.frontend.rule=Host(`example.com`)"
      - "traefik.http.routers.frontend.tls.certresolver=letsencrypt"
      - "traefik.http.services.frontend.loadbalancer.server.port=3000"

  api:
    image: api:latest
    labels:
      - "traefik.enable=true"
      # PathPrefix routes /api/* to this service
      - "traefik.http.routers.api.rule=Host(`example.com`) && PathPrefix(`/api`)"
      - "traefik.http.routers.api.tls.certresolver=letsencrypt"
      - "traefik.http.services.api.loadbalancer.server.port=8000"
      # Strip /api prefix before forwarding (so /api/users → /users)
      - "traefik.http.routers.api.middlewares=strip-api"
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

# IP whitelist (admin panel)
labels:
  - "traefik.http.middlewares.admin-ip.ipallowlist.sourcerange=10.0.0.0/8,192.168.1.0/24"
  - "traefik.http.routers.admin.middlewares=admin-ip"

# Basic auth
labels:
  - "traefik.http.middlewares.auth.basicauth.users=admin:$$2y$$05$$hashhere"
  - "traefik.http.routers.protected.middlewares=auth"

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
      - "traefik.http.routers.webapp.rule=Host(`app.example.com`)"
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
      rule: "Host(`legacy.example.com`)"
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
5. Protect the admin panel with IP whitelist or basic auth.

### Example 2: Zero-downtime deployments with health checks
**User prompt:** "Set up Traefik so I can deploy new versions without downtime. Old containers should keep serving until new ones are healthy."

The agent will:
1. Configure health check endpoints on the application.
2. Add Traefik health check labels with appropriate intervals.
3. Use Docker's rolling update strategy with Traefik's load balancer.
4. New containers only receive traffic after passing health checks.

## Guidelines

- Mount the Docker socket as read-only (`:ro`) — Traefik only needs to read container labels, not manage containers.
- Set `exposedByDefault=false` to prevent accidentally routing internal services (databases, Redis) to the internet. Only containers with `traefik.enable=true` get routes.
- Use Let's Encrypt's TLS challenge (port 443) rather than HTTP challenge (port 80) when possible — it's simpler and works with CDNs.
- Store the acme.json file on a persistent volume — losing it means re-issuing all certificates, which hits Let's Encrypt rate limits.
- For high-traffic production, add a health check to every service. Without health checks, Traefik routes to containers that may be starting up or shutting down.
- Traefik's Docker provider is the killer feature over nginx — adding a new service is just adding labels to docker-compose, no proxy config to update, no reload needed.
