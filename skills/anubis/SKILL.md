---
name: anubis
description: >-
  Anubis is a self-hosted reverse proxy that makes browsers solve a small proof-of-work challenge before they reach your website, which raises the cost of mass scraping by AI crawlers. Use it when a wiki, forge, blog or docs site is being hammered by scrapers, or when the user asks to "protect my site from AI crawlers", "put Anubis in front of Gitea", "block GPTBot", or "write an Anubis bot policy". Covers install, environment variables, policy files and nginx/Caddy placement.
license: Apache-2.0
compatibility: "Linux x86_64/arm64 (static Go binary, .deb/.rpm packages; curl and jq to verify the download) or Docker 24+ with Docker Compose; a reverse proxy such as nginx or Caddy for TLS"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "anubis, bot-protection, reverse-proxy, proof-of-work, scrapers"
  repository: https://github.com/TecharoHQ/anubis
---
# Anubis — proof-of-work gate against AI scrapers

## Overview

Anubis sits between your TLS terminator (nginx, Caddy, Traefik, HAProxy, Apache) and your application. Every request is checked against a policy file. Requests can be allowed, denied, or challenged. A challenged browser has to solve a SHA-256 proof-of-work in JavaScript, receives a signed cookie, and is then proxied through to the backend. A human pays a second or two once per cookie lifetime (a week by default); a scraper that opens millions of pages pays for every fresh identity.

It protects your own site. It does not hide anything from a person who simply waits for the challenge, and it needs JavaScript on the visitor's side. One Anubis instance protects one backend service. The project is MIT licensed; this skill was checked against release v1.28.2.

## Instructions

### Install

Docker image (pin a release tag, `latest` also exists):

```bash
docker pull ghcr.io/techarohq/anubis:v1.28.2
```

Linux tarball from GitHub releases (each file has a `.asc` signature next to it):

```bash
mkdir -p ~/anubis-1.28.2 && cd ~/anubis-1.28.2
curl -fsSLO https://github.com/TecharoHQ/anubis/releases/download/v1.28.2/anubis-1.28.2-linux-amd64.tar.gz
# GitHub publishes a SHA-256 digest for every release asset; stop if the file does not match
curl -fsSL https://api.github.com/repos/TecharoHQ/anubis/releases/tags/v1.28.2 \
  | jq -r '.assets[] | select(.name=="anubis-1.28.2-linux-amd64.tar.gz") | "\(.digest | ltrimstr("sha256:"))  \(.name)"' \
  | sha256sum -c - || exit 1
tar xzf anubis-1.28.2-linux-amd64.tar.gz
./anubis-1.28.2-linux-amd64/bin/anubis --help
```

The tarball holds `bin/anubis`, `bin/anubis-robots2policy`, `doc/botPolicies.yaml` (the default policy), `run/default.env` and a systemd template `run/anubis@.service`. Releases also ship `.deb` and `.rpm` packages (verify them against the release digest the same way before installing): `sudo apt install ./anubis_1.28.2_amd64.deb` or `sudo dnf -y install ./anubis-1.28.2-1.x86_64.rpm`. After a package install, copy `/etc/anubis/default.env` to `/etc/anubis/<service>.env` and start the unit `anubis@<service>.service`.

### Configure with environment variables

Each flag of the binary has an environment variable twin. The ones you need first:

| Variable | Default | Meaning |
|---|---|---|
| `BIND` | `:8923` | Address Anubis listens on. Use `127.0.0.1:8923` unless the proxy is in another container |
| `BIND_NETWORK` | `tcp` | `tcp` or `unix` (then `BIND` is a socket path and `SOCKET_MODE` applies) |
| `TARGET` | `http://localhost:3923` | Backend to forward allowed requests to; supports `unix:///run/wiki/app.sock` |
| `DIFFICULTY` | `4` | Leading zero hex digits the hash must have; each +1 is about 16 times more work. Applies only to `CHALLENGE` rules that have no `challenge:` block; the built-in default policy sets its own difficulty per suspicion tier (a browser got difficulty 2 in a test), so this variable does not change it |
| `POLICY_FNAME` | unset | Path to your policy file; unset means the built-in default policy |
| `ED25519_PRIVATE_KEY_HEX` or `ED25519_PRIVATE_KEY_HEX_FILE` | random per start | Key that signs the pass cookie; set it so cookies survive restarts and work across several instances. Make one with `openssl rand -hex 32` |
| `COOKIE_DOMAIN` | unset | Registrable domain, if the cookie must cover several subdomains |
| `COOKIE_EXPIRATION_TIME` | `168h` | How long a solved challenge stays valid |
| `SERVE_ROBOTS_TXT` | `false` | Serve a `robots.txt` that disallows known AI scrapers |
| `METRICS_BIND` | `:9090` | Prometheus metrics address; bind it to localhost |
| `USE_REMOTE_ADDRESS` | unset | Take the client IP from the socket when no proxy sits in front |
| `SLOG_LEVEL` | `INFO` | `DEBUG` shows each evaluated request |
| `BASE_PREFIX` | unset | Serve the protected app under a path prefix (see `STRIP_BASE_PREFIX`) |

Anubis needs the client address. A proxy in front must send `X-Real-IP`, otherwise Anubis answers 500 (confirmed by running it without the header). Without a proxy, set `USE_REMOTE_ADDRESS=true`.

### Write a policy file

The policy is YAML (JSON also works since v1.17.0) with a `bots:` list. Rules are checked in order, the first match wins, and a request that matches nothing is allowed. Rule names are lower-case kebab-case because they appear in Prometheus labels. Actions: `ALLOW`, `DENY`, `CHALLENGE`, `WEIGH`. The default policy in v1.28 does not challenge outright: it adds weight to suspicious requests (`WEIGH`) and then picks `ALLOW` or a harder challenge from `thresholds:`. The policies below are simpler and challenge directly; use one style, do not mix them.

```yaml
# /etc/anubis/wiki.botPolicies.yaml
bots:
  - name: block-bytespider
    user_agent_regex: Bytespider
    action: DENY
  - name: office-network
    action: ALLOW
    remote_addresses:
      - 192.0.2.0/24
  - import: (data)/meta/ai-block-aggressive.yaml
  - import: (data)/common/keep-internet-working.yaml
  - name: generic-browser
    user_agent_regex: Mozilla
    action: CHALLENGE
    challenge:
      difficulty: 5
      algorithm: fast
```

Matchers: `user_agent_regex`, `path_regex`, `headers_regex` (a map of header name to regex), `remote_addresses` (CIDR list). `import: (data)/...` pulls in snippets embedded in the binary; the tarball's `doc/botPolicies.yaml` shows the full default set (`bots/_deny-pathological`, `meta/ai-block-aggressive`, `crawlers/_allow-good`, `common/keep-internet-working` and others). `DENY` returns an error page that looks like success to a scraper, so the HTTP status is not a reliable test of a deny; read the metrics instead.

To turn an existing `robots.txt` into rules: `anubis-robots2policy -input robots.txt -output robots.policy.yaml`.

### Put it behind nginx

nginx terminates TLS and proxies to Anubis; the real site listens on a socket or an internal port that the internet cannot reach. Anubis loads its assets from `/.within.website/`, so every path must be forwarded to it.

```nginx
# /etc/nginx/conf.d/wiki.conf (TLS block)
upstream anubis_wiki {
    server 127.0.0.1:8923;
}

server {
    listen 443 ssl;
    http2 on;
    server_name wiki.northwind-labs.net;
    ssl_certificate     /etc/letsencrypt/live/wiki.northwind-labs.net/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/wiki.northwind-labs.net/privkey.pem;

    location / {
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Http-Version $server_protocol;
        proxy_set_header X-TLS-SNI-Name $ssl_server_name;
        proxy_pass http://anubis_wiki;
    }
}
```

Run Anubis with `TARGET=http://127.0.0.1:3923` (the wiki's internal port, bound to localhost). For Caddy, use `reverse_proxy 127.0.0.1:8923` with `header_up X-Real-IP {remote_host}`, `header_up X-Http-Version {http.request.proto}` and `header_up X-TLS-SNI-Name {tls_server_name}`.

### Docker Compose

```yaml
services:
  anubis:
    image: ghcr.io/techarohq/anubis:v1.28.2
    environment:
      BIND: ":8923"
      TARGET: "http://wiki:80"
      DIFFICULTY: "4"
      POLICY_FNAME: "/data/cfg/botPolicy.yaml"
      ED25519_PRIVATE_KEY_HEX: "${ANUBIS_ED25519_KEY}"
    ports:
      - "127.0.0.1:8923:8923"
    volumes:
      - "./botPolicy.yaml:/data/cfg/botPolicy.yaml:ro"
  wiki:
    image: nginx:1.27
    volumes:
      - "./site:/usr/share/nginx/html:ro"
```

Create `./botPolicy.yaml` first (copy `doc/botPolicies.yaml` from the tarball). Generate a key with `openssl rand -hex 32` and store it as `ANUBIS_ED25519_KEY` in an `.env` file next to the compose file (never commit that file). The container runs as user 1000; mounted files must be readable by it. Only the Anubis port is published, and only on loopback, so the backend is reachable only through the filter.

### Verify and observe

Send a browser-like and a plain request through Anubis and compare. Read the counters from the metrics port:

```bash
curl -s -A "Mozilla/5.0 Firefox/130.0" -H "X-Real-IP: 203.0.113.7" http://127.0.0.1:8923/ | grep -o "Making sure you.*not a bot"
curl -s http://127.0.0.1:9090/metrics | grep '^anubis_policy_results'
```

`anubis_policy_results{action="CHALLENGE",rule="bot/generic-browser"}` rising means browsers are being challenged.

## Examples

### Example 1: Put Anubis in front of a self-hosted Gitea

Request: "Our Gitea at git.northwind-labs.net is being crawled by AI bots, 40 requests a second on blame pages. Add Anubis."

```bash
sudo apt install ./anubis_1.28.2_amd64.deb
sudo cp /etc/anubis/default.env /etc/anubis/gitea.env
sudo cp /usr/share/doc/anubis/botPolicies.yaml /etc/anubis/gitea.botPolicies.yaml
```

Edit `/etc/anubis/gitea.env`:

```text
BIND=127.0.0.1:8923
TARGET=http://127.0.0.1:3000
POLICY_FNAME=/etc/anubis/gitea.botPolicies.yaml
METRICS_BIND=127.0.0.1:9090
```

Append a persistent signing key (systemd reads the env file as root):

```bash
echo "ED25519_PRIVATE_KEY_HEX=$(openssl rand -hex 32)" | sudo tee -a /etc/anubis/gitea.env > /dev/null
```

```bash
sudo systemctl enable --now anubis@gitea.service
```

Point nginx `proxy_pass` at `127.0.0.1:8923` as shown above, reload nginx, then check the metrics. Result: browsers see a short "Making sure you're not a bot" page once per week; the crawler traffic shows up as `DENY` or unsolved `CHALLENGE` counts.

### Example 2: Block named AI crawlers but let a monitoring probe in

Request: "Deny GPTBot and ClaudeBot, challenge every browser, but my uptime checker at 198.51.100.20 must not be challenged."

```yaml
bots:
  - name: uptime-probe
    action: ALLOW
    remote_addresses:
      - 198.51.100.20/32
  - name: block-named-ai-crawlers
    user_agent_regex: (GPTBot|ClaudeBot)
    action: DENY
  - import: (data)/common/keep-internet-working.yaml
  - name: generic-browser
    user_agent_regex: Mozilla
    action: CHALLENGE
```

Restart Anubis, then run `curl -A "Mozilla/5.0 GPTBot/1.0" -H "X-Real-IP: 203.0.113.7" http://127.0.0.1:8923/` and check that `anubis_policy_results{action="DENY",rule="bot/block-named-ai-crawlers"}` went up. Result: named crawlers are denied, browsers are challenged, the probe passes untouched.

## Guidelines

- Keep the backend off the public network. If it is reachable directly, scrapers skip Anubis.
- Always set a persistent `ED25519_PRIVATE_KEY_HEX` in production; with a random key every restart invalidates all visitors' cookies.
- Forward `/.within.website/` and send `X-Real-IP`; both are required for the challenge page to work.
- A request that matches no rule is allowed. In a hand-written policy, end with a catch-all `CHALLENGE` rule for `Mozilla` user agents (the default policy reaches the same result with `WEIGH` and `thresholds`).
- Legitimate search engines can be challenged when they come from unexpected addresses. Use the `crawlers/_allow-good` import and add `remote_addresses` for crawlers you want to admit.
- Visitors without JavaScript, or with script blockers such as JShelter, cannot pass; a no-JavaScript mode does not exist yet. Command-line clients that do not claim to be a browser are not challenged by the default rule, so API endpoints need their own rules or a different tool.
- Challenge difficulty above about 5 makes slow phones wait noticeably (set it in a rule's `challenge:` block, or with `DIFFICULTY` for rules without one). Test on a real phone.
- Bind `METRICS_BIND` to localhost; leave pprof debug routes off.
- Not for WebSocket-heavy apps with long-lived connections, and not a replacement for rate limiting or a WAF; combine it with them.
