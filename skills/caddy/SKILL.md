---
name: caddy
category: devops
version: 1.0.0
description: >-
  Configure Caddy as a web server and reverse proxy — automatic HTTPS, reverse
  proxy, load balancing, file server, redirects, headers, rate limiting, and
  API configuration. Use when tasks involve serving websites, proxying to
  backend services, automatic TLS certificate management, or replacing Nginx
  with a simpler configuration.
author: terminal-skills
tags: [caddy, web-server, reverse-proxy, https, tls, load-balancer]
---

# Caddy

Modern web server with automatic HTTPS. Configures TLS certificates from Let's Encrypt without any setup — just specify domain names and Caddy handles the rest.

## Setup

```bash
# Debian/Ubuntu
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Docker
docker run -d -p 80:80 -p 443:443 \
  -v caddy_data:/data -v caddy_config:/config \
  -v $PWD/Caddyfile:/etc/caddy/Caddyfile \
  caddy:latest
```

## Caddyfile (config format)

### Simple Static Site

```caddyfile
example.com {
    root * /var/www/html
    file_server
    encode gzip zstd
}
```

That's it. Caddy automatically obtains and renews a TLS certificate for `example.com`.

### Reverse Proxy

```caddyfile
# Single backend
app.example.com {
    reverse_proxy localhost:3000
}

# With health checks and load balancing
api.example.com {
    reverse_proxy localhost:3001 localhost:3002 localhost:3003 {
        lb_policy round_robin
        health_uri /health
        health_interval 10s
        health_timeout 5s
    }
}

# WebSocket support (automatic — no special config needed)
ws.example.com {
    reverse_proxy localhost:8080
}
```

### Multi-Service Setup

```caddyfile
# Main app
example.com {
    # API routes → backend
    handle /api/* {
        reverse_proxy localhost:3000
    }

    # Static assets → file server with caching
    handle /static/* {
        root * /var/www/static
        file_server
        header Cache-Control "public, max-age=31536000, immutable"
    }

    # Everything else → frontend SPA
    handle {
        root * /var/www/app
        try_files {path} /index.html
        file_server
    }

    encode gzip zstd
}

# Admin panel — separate subdomain
admin.example.com {
    reverse_proxy localhost:3001

    # Basic auth protection
    basicauth {
        admin $2a$14$...  # bcrypt hash: caddy hash-password
    }
}

# Redirect www to non-www
www.example.com {
    redir https://example.com{uri} permanent
}
```

### Security Headers

```caddyfile
example.com {
    reverse_proxy localhost:3000

    header {
        # Security headers
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
        Permissions-Policy "camera=(), microphone=(), geolocation=()"

        # Remove server identification
        -Server
    }
}
```

### Rate Limiting

```caddyfile
example.com {
    # Rate limit: 100 requests per minute per IP
    rate_limit {
        zone api_zone {
            key {remote_host}
            events 100
            window 1m
        }
    }

    reverse_proxy localhost:3000
}
```

### CORS

```caddyfile
api.example.com {
    @cors_preflight method OPTIONS
    handle @cors_preflight {
        header Access-Control-Allow-Origin "https://app.example.com"
        header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
        header Access-Control-Allow-Headers "Content-Type, Authorization"
        header Access-Control-Max-Age "86400"
        respond "" 204
    }

    header Access-Control-Allow-Origin "https://app.example.com"
    reverse_proxy localhost:3000
}
```

## JSON Config (API mode)

For programmatic configuration instead of Caddyfile:

```json
{
  "apps": {
    "http": {
      "servers": {
        "main": {
          "listen": [":443"],
          "routes": [
            {
              "match": [{"host": ["api.example.com"]}],
              "handle": [{
                "handler": "reverse_proxy",
                "upstreams": [
                  {"dial": "localhost:3000"},
                  {"dial": "localhost:3001"}
                ],
                "load_balancing": {"selection_policy": {"policy": "round_robin"}},
                "health_checks": {
                  "active": {"uri": "/health", "interval": "10s"}
                }
              }]
            }
          ]
        }
      }
    }
  }
}
```

### Config API

Caddy exposes a REST API for live configuration changes — no restarts needed:

```bash
# Load full config
curl -X POST http://localhost:2019/load \
  -H "Content-Type: application/json" \
  -d @caddy-config.json

# Get current config
curl http://localhost:2019/config/

# Update a specific route without touching anything else
curl -X PATCH "http://localhost:2019/config/apps/http/servers/main/routes/0" \
  -H "Content-Type: application/json" \
  -d '{"handle": [{"handler": "reverse_proxy", "upstreams": [{"dial": "localhost:3002"}]}]}'
```

## Common Patterns

### Local Development with HTTPS

```caddyfile
# Caddyfile.dev — local HTTPS with self-signed cert
localhost {
    tls internal  # Auto-generate a local CA cert

    reverse_proxy /api/* localhost:3000
    reverse_proxy localhost:5173  # Vite dev server
}
```

```bash
caddy run --config Caddyfile.dev
# App available at https://localhost with valid (local) TLS
```

### Wildcard Subdomains

```caddyfile
# Requires DNS challenge (e.g., Cloudflare DNS plugin)
*.example.com {
    tls {
        dns cloudflare {env.CF_API_TOKEN}
    }

    # Route subdomains to different backends
    @app host app.example.com
    handle @app {
        reverse_proxy localhost:3000
    }

    @docs host docs.example.com
    handle @docs {
        reverse_proxy localhost:3001
    }

    # Catch-all: 404
    handle {
        respond "Not found" 404
    }
}
```

### Caching Proxy

```caddyfile
api.example.com {
    reverse_proxy localhost:3000

    # Cache responses from the backend
    @cacheable {
        method GET
        path /api/public/*
    }
    header @cacheable Cache-Control "public, max-age=300"  # 5 min cache
}
```

## Caddy vs Nginx

| | Caddy | Nginx |
|---|---|---|
| **HTTPS** | Automatic (Let's Encrypt) | Manual cert setup or certbot |
| **Config format** | Caddyfile (simple) or JSON | nginx.conf (complex) |
| **Hot reload** | API-based, zero downtime | `nginx -s reload` |
| **HTTP/3** | Built-in | Requires compilation flags |
| **Plugins** | Go modules, `xcaddy build` | C modules, recompilation |
| **Performance** | Fast, slightly slower than Nginx | Fastest for static files |
| **Use case** | Modern apps, auto-HTTPS | Legacy, high-traffic static |

## Commands

```bash
caddy run                          # Foreground with Caddyfile in current dir
caddy start                        # Background daemon
caddy stop                         # Stop daemon
caddy reload                       # Reload config without downtime
caddy adapt --config Caddyfile     # Convert Caddyfile to JSON (debugging)
caddy validate --config Caddyfile  # Check for syntax errors
caddy hash-password                # Generate bcrypt hash for basicauth
caddy fmt --overwrite Caddyfile    # Format Caddyfile
```

## Guidelines

- **Automatic HTTPS is the default** — don't disable it unless you have a specific reason. Caddy handles cert issuance, renewal, and OCSP stapling.
- **Use `try_files` for SPAs** — `try_files {path} /index.html` serves the SPA shell for all routes, letting the frontend router handle them.
- **Caddyfile for humans, JSON for automation** — Caddyfile is easier to read and maintain; JSON API is for programmatic management.
- **Config API is live** — changes via the admin API take effect immediately without restart or reload.
- **DNS challenge for wildcards** — wildcard certs require DNS-01 challenge. Install the appropriate DNS provider plugin via `xcaddy`.
- **`encode gzip zstd`** on every site — compression is free performance. Zstandard is faster than gzip for modern clients.
- **Health checks on reverse proxy** — always configure them for multi-backend setups to avoid routing to dead backends.
- **`-Server` header** — remove it in production to avoid leaking server info.
