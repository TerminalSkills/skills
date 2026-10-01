---
name: caddy
description: >-
  Caddy is a web server and reverse proxy that obtains and renews HTTPS
  certificates automatically. Covers reverse proxying, load balancing, file
  serving, redirects, headers, rate limiting, and configuration through the
  admin API. Use when tasks involve serving websites, proxying to
  backend services, automatic TLS certificate management, or replacing Nginx
  with a simpler configuration.
license: Apache-2.0
compatibility: "Caddy 2.8 or newer (checked against 2.11.4) on Linux, macOS, Windows, or Docker"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["caddy", "web-server", "reverse-proxy", "https", "tls"]
  repository: https://github.com/caddyserver/caddy
---

# Caddy

## Overview

Caddy is a web server and reverse proxy with automatic HTTPS: name a domain in the config and Caddy obtains and renews its certificate (Let's Encrypt or ZeroSSL) and redirects HTTP to HTTPS. It is configured with a Caddyfile, or with JSON through an admin API on `localhost:2019`.

## Instructions

### Setup

```bash
brew install caddy        # macOS (Arch: sudo pacman -Syu caddy)
sudo dnf copr enable @caddy/caddy && sudo dnf install caddy   # Fedora, RHEL (needs the dnf copr plugin)

# Debian/Ubuntu — official apt repository; installs and starts the `caddy` systemd service
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install caddy

# Docker — pin a version; put the Caddyfile in ./conf and mount that directory, not the single file, so reloads see edits
docker run -d --name caddy -p 80:80 -p 443:443 -p 443:443/udp \
  -v $PWD/conf:/etc/caddy -v caddy_data:/data -v caddy_config:/config \
  caddy:2.11
```

The packaged service reads `/etc/caddy/Caddyfile`; apply edits with `sudo systemctl reload caddy`. In Docker, run `docker exec -w /etc/caddy caddy caddy reload`. `443/udp` is HTTP/3, and the `/data` volume holds the certificates and keys.

### Sites and Reverse Proxy

```caddyfile
# Static site — the certificate for fernhill.app is obtained and renewed automatically
fernhill.app {
	root * /var/www/html
	file_server
	encode
}

# Reverse proxy — WebSockets work without extra config
app.fernhill.app {
	reverse_proxy localhost:3000
}

# Load balancing with active health checks
api.fernhill.app {
	reverse_proxy localhost:3001 localhost:3002 localhost:3003 {
		lb_policy round_robin
		health_uri /health
		health_interval 10s
		health_timeout 5s
	}
}
```

### Multi-Service Setup

```caddyfile
fernhill.app {
	encode
	# API routes → backend (the /api prefix is kept)
	handle /api/* {
		reverse_proxy localhost:3000
	}

	# Static assets — handle_path strips /static, so /static/app.js is /var/www/static/app.js
	handle_path /static/* {
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
}

# Admin panel behind basic auth: user name, then a hash from `caddy hash-password`
admin.fernhill.app {
	basic_auth {
		admin $2a$14$y8VIWLk516NX/l2UF9pk2Oz3bV00fnoFnh7k0YUq4/W19uKDFmP/S
	}
	reverse_proxy localhost:3001
}

www.fernhill.app {
	redir https://fernhill.app{uri} permanent
}
```

### Security Headers and CORS

```caddyfile
fernhill.app {
	reverse_proxy localhost:3000

	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'"
		Permissions-Policy "camera=(), microphone=(), geolocation=()"
		-Server
	}
}

api.fernhill.app {
	@cors_preflight method OPTIONS
	handle @cors_preflight {
		header Access-Control-Allow-Origin "https://app.fernhill.app"
		header Access-Control-Allow-Methods "GET, POST, PUT, DELETE, OPTIONS"
		header Access-Control-Allow-Headers "Content-Type, Authorization"
		header Access-Control-Max-Age "86400"
		respond "" 204
	}

	header Access-Control-Allow-Origin "https://app.fernhill.app"
	reverse_proxy localhost:3000
}
```

### Plugins: Rate Limiting and Wildcard Certificates

Rate limiting and DNS providers are not in the standard build. Add them to the installed binary with `caddy add-package` (experimental, replaces the binary in place), or build one with `xcaddy build --with github.com/mholt/caddy-ratelimit` (needs Go), then restart Caddy.

```bash
sudo caddy add-package github.com/mholt/caddy-ratelimit github.com/caddy-dns/cloudflare
caddy list-modules --packages | tail -4    # lists http.handlers.rate_limit and dns.providers.cloudflare
```

```caddyfile
# 100 requests per minute per client IP; further requests get 429 with Retry-After
shop.fernhill.app {
	rate_limit {
		zone per_client {
			key {remote_host}
			events 100
			window 1m
		}
	}
	reverse_proxy localhost:3000
}

# Wildcard certificate — needs the DNS challenge; the token is read from the environment
*.fernhill.app {
	tls {
		dns cloudflare {env.CF_API_TOKEN}
	}
	@docs host docs.fernhill.app
	handle @docs {
		reverse_proxy localhost:3001
	}

	handle {
		respond "Not found" 404
	}
}
```

Since Caddy 2.10, a separate site block such as `status.fernhill.app { ... }` reuses the wildcard certificate instead of requesting its own.

### JSON Config and Admin API

JSON is Caddy's native format; `caddy adapt --config Caddyfile --pretty` prints the JSON for any Caddyfile.

```json
{
  "apps": {"http": {"servers": {"main": {
    "listen": [":443"],
    "routes": [{
      "match": [{"host": ["api.fernhill.app"]}],
      "handle": [{
        "handler": "reverse_proxy",
        "upstreams": [{"dial": "localhost:3000"}, {"dial": "localhost:3001"}],
        "load_balancing": {"selection_policy": {"policy": "round_robin"}},
        "health_checks": {"active": {"uri": "/health", "interval": "10s"}}
      }]
    }]
  }}}}
}
```

```bash
# Replace the whole config (use Content-Type: text/caddyfile to post a Caddyfile instead)
curl -X POST http://localhost:2019/load -H "Content-Type: application/json" -d @caddy-config.json

# Read the current config, or any part of it by path
curl http://localhost:2019/config/apps/http/servers/main/routes/0/match

# PATCH replaces the value at a path — here only the upstream list of the first route
curl -X PATCH http://localhost:2019/config/apps/http/servers/main/routes/0/handle/0/upstreams \
  -H "Content-Type: application/json" -d '[{"dial": "localhost:3000"}, {"dial": "localhost:3002"}]'

# Health of every proxy upstream
curl http://localhost:2019/reverse_proxy/upstreams
```

### Commands

```bash
caddy run                          # Foreground with Caddyfile in current dir
caddy start                        # Background; stop it with `caddy stop`
caddy reload                       # Apply the config file without downtime
caddy adapt --config Caddyfile     # Convert Caddyfile to JSON (debugging)
caddy validate --config Caddyfile  # Load and provision the config without starting it
caddy fmt --overwrite Caddyfile    # Format Caddyfile (tabs)
caddy hash-password                # Hash for basic_auth (bcrypt; --algorithm argon2id)
caddy trust                        # Install Caddy's local CA into the system trust store
```

## Examples

### Example 1: Put an app and its API online with HTTPS

**User request:** "Our Next.js app runs on port 3000 and the API on 4000 on this Ubuntu server. Serve them at fernhill.app with HTTPS."

DNS A/AAAA records for `fernhill.app` and `www.fernhill.app` must already point at the server, and ports 80 and 443 must be open. Write `/etc/caddy/Caddyfile`:

```caddyfile
fernhill.app {
	encode
	handle /api/* {
		reverse_proxy localhost:4000
	}
	handle {
		reverse_proxy localhost:3000
	}
}

www.fernhill.app {
	redir https://fernhill.app{uri} permanent
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile   # ends with "Valid configuration"
sudo systemctl reload caddy
curl -sI https://fernhill.app/api/health
```

**Result:** Caddy obtains a certificate for each name on first load, and the check prints `HTTP/2 200` with an `alt-svc: h3=":443"; ma=2592000` header (HTTP/3 is on) and a `via` header added by the proxy. If issuance fails, the reason is in `journalctl -u caddy --no-pager | tail -50`.

### Example 2: HTTPS on localhost for a dev server

**User request:** "I need https://localhost in front of my Vite dev server on 5173, with /api going to my backend on 3000."

Save as `Caddyfile.dev` (file names that start with `Caddyfile` are parsed as Caddyfiles):

```caddyfile
localhost {
	reverse_proxy /api/* localhost:3000
	reverse_proxy localhost:5173
}
```

```bash
caddy run --config Caddyfile.dev --watch
curl -s https://localhost/api/health
```

**Result:** `localhost` gets a certificate from Caddy's own local CA — no `tls internal` line needed. On first run Caddy asks for the sudo password once to install its root certificate into the system trust store, after which `curl` and browsers that use the system store trust `https://localhost`; `--watch` reloads the file on every save.

## Guidelines

- **Automatic HTTPS is the default** — don't disable it unless you have a specific reason. It needs DNS pointing at the server and ports 80/443 reachable; while testing, set the global option `acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` to stay clear of Let's Encrypt rate limits.
- **`basic_auth`, not `basicauth`** — the directive was renamed in 2.8 and the old name logs a deprecation warning. Passwords in the config are always hashes.
- **Reload, never stop and start** — `caddy reload` or `systemctl reload caddy` swaps the config with zero downtime and keeps the old one if the new one fails to load. Run `caddy validate` first in CI.
- **Caddyfile for humans, JSON for automation** — admin API changes apply immediately and are saved for `caddy run --resume`, but a later `caddy reload` from the Caddyfile overwrites them. Pick one source of truth.
- **Keep the admin API local** — `localhost:2019` has no authentication; never publish that port or bind it to a public interface.
- **In Docker, `localhost` is the Caddy container** — proxy to the service name and container port (`reverse_proxy web:3000`), and persist `/data` or certificates are re-issued on every recreate.
- **Behind a load balancer or another proxy** — set the global option `servers { trusted_proxies static private_ranges }` (or list a CDN's address ranges) so `{client_ip}` and logs show the real client instead of the proxy.
- **Bare `encode`** enables zstd and gzip, preferring zstd (since 2.9; on 2.8 it compresses nothing, so write `encode zstd gzip` there); `try_files {path} /index.html` serves the SPA shell for client-side routes.
- **Health checks on reverse proxy** — configure them for multi-backend setups to avoid routing to dead backends.
- **Plugins mean a custom binary** — `caddy upgrade` keeps them, but an apt or dnf upgrade puts the standard binary back; in Docker, build from `caddy:2.11-builder` with `xcaddy` instead.
- **When not to use it** — if an existing Nginx or HAProxy config already works and certificates are handled elsewhere, switching brings little.
