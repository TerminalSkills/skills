---
name: glance
description: >-
  Glance is a lightweight self-hosted dashboard that shows RSS feeds, Hacker News, Reddit, release trackers, service uptime and more on one page, configured entirely in YAML. Use this skill to install the single Go binary or Docker image, write and validate glance.yml, add password authentication, wire widgets such as rss, monitor and releases, and keep secrets in environment variables. Triggers: "self-hosted start page", "RSS dashboard", "glance.yml", "homelab dashboard", "show all my feeds on one page".
license: Apache-2.0
compatibility: "Linux, macOS or Windows with the release binary, or Docker 24+ with the Compose plugin; no database needed"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: productivity
  tags: "glance, dashboard, rss, self-hosted, yaml"
  repository: https://github.com/glanceapp/glance
---

# Glance — a YAML-configured dashboard for feeds, releases and service status

## Overview

Glance is one Go binary that serves a dashboard built from widgets you list in a YAML file. Widgets fetch their data on the server and cache it, so the page loads quickly and the browser makes no calls to the sources. There is no database and no build step: edit the file, and the running server reloads it on save.

An agent can install it, write the config, validate it, add authentication and run it behind a reverse proxy. Choosing the feeds and the layout is a human decision. This skill was checked against release v0.8.7 (the binary `glance-linux-amd64.tar.gz`, SHA-256 verified against the digest GitHub lists for the asset). Widgets that call outside services (Hacker News, releases) were validated with `config:validate` but not fetched.

Glance is a reader and status page, not an aggregator pipeline: it does not deduplicate, score or store items, and it does not send alerts.

## Instructions

### Install the release binary

Download the archive for your platform from the GitHub releases page, verify it, and unpack it into its own directory.

```bash
mkdir -p ~/glance && cd ~/glance || exit 1
VER=v0.8.7
curl -fsSL -o glance.tar.gz https://github.com/glanceapp/glance/releases/download/$VER/glance-linux-amd64.tar.gz
EXPECTED=$(curl -fsSL https://api.github.com/repos/glanceapp/glance/releases/tags/$VER \
  | jq -r '.assets[] | select(.name=="glance-linux-amd64.tar.gz") | .digest | ltrimstr("sha256:")')
echo "$EXPECTED  glance.tar.gz" | sha256sum -c -
tar xzf glance.tar.gz && ./glance --help
```

The check must print `glance.tar.gz: OK`. The binary's commands are: `config:validate`, `config:print`, `password:hash <pwd>`, `secret:make`, `sensors:print`, `mountpoint:info <path>` and `diagnose`. The only option is `-config <path>` (default `glance.yml` in the current directory).

### Install with Docker instead

The image is `glanceapp/glance` and the config directory is mounted at `/app/config` (the project's documented layout). Pin a version tag rather than using the default.

```yaml
services:
  glance:
    image: glanceapp/glance:v0.8.7
    container_name: glance
    restart: unless-stopped
    volumes:
      - ./config:/app/config
    ports:
      - "127.0.0.1:8080:8080"
    env_file: .env
```

Put `glance.yml` in `./config` and leave `server.host` unset there: inside a container, `127.0.0.1` would make the published port unreachable (the `127.0.0.1:` in `ports` already keeps it local). This container form was not run here; the commands for the binary behave the same inside it. The docs also show secret generation as `docker run --rm glanceapp/glance secret:make`.

### Write a config

Top-level keys are `server`, `auth`, `theme`, `pages` and a few others. The first page is the home page. Each page has up to three `columns`, each `size: small` (fixed width) or `size: full`, each holding `widgets`. This config ran and served the page:

```yaml
server:
  host: 127.0.0.1
  port: 8080

auth:
  secret-key: ${GLANCE_SECRET_KEY}
  users:
    admin:
      password-hash: ${GLANCE_ADMIN_HASH}

theme:
  background-color: 240 13 14
  primary-color: 51 33 68
  contrast-multiplier: 1.1

pages:
  - name: News
    columns:
      - size: small
        widgets:
          - type: clock
            hour-format: 24h
          - type: bookmarks
            groups:
              - title: Desk
                links:
                  - title: Regulator bulletin
                    url: https://www.federalreserve.gov/feeds/press_all.xml
      - size: full
        widgets:
          - type: rss
            title: Markets and rules
            style: detailed-list
            limit: 10
            feeds:
              - url: https://www.federalreserve.gov/feeds/press_all.xml
                title: Federal Reserve
```

`host` defaults to all interfaces, so set `127.0.0.1` unless a proxy or other machines must reach it. `port` defaults to 8080. Theme colours are HSL values written as three numbers (hue, saturation %, lightness %).

Widget names and properties that the docs for v0.8.7 list and that passed validation:

- `rss`: `feeds` (each with `url`, optional `title`, `limit`, `headers`), `style` (`vertical-list`, `detailed-list`, `horizontal-cards`, `horizontal-cards-2`), `limit`, `collapse-after`.
- `monitor`: `sites` (each `title`, `url`, `icon`), `style: compact`, `show-failing-only`. It sends a GET and counts HTTP 200 as up.
- `releases`: `repositories` such as `jellyfin/jellyfin`, `codeberg:owner/repo`, `dockerhub:owner/image`; optional `token`.
- `hacker-news`: `limit`, `sort-by` (`top`, `new`, `best`).
- `group`: puts several widgets into tabs through its own `widgets` list.
- Every widget accepts `type`, `title`, `title-url`, `hide-header`, `cache` (such as `30s`, `5m`, `2h`) and `css-class`.

### Validate before starting

```bash
./glance -config glance.yml config:validate && echo valid
```

An invalid file prints a specific message and a non-zero exit, for example `Config file is invalid: page 1 has no columns` when `columns` was misspelled. Do this after every edit. `config:print` shows the config with includes resolved.

### Secrets, passwords and includes

Anywhere in the YAML, `${NAME}` is replaced from the environment; a missing variable is an error. Escape a literal with `\${NAME}`. Docker secrets use `${secret:name}`, and `${readFileFromEnv:VAR}` reads a file whose path is in `VAR`.

```bash
export GLANCE_SECRET_KEY=$(./glance secret:make)
export GLANCE_ADMIN_HASH=$(./glance password:hash "$GLANCE_ADMIN_PASSWORD")
```

`GLANCE_ADMIN_PASSWORD` is a password you choose. After five failed logins in five minutes Glance blocks the address; behind a reverse proxy set `server.proxied: true` so it sees the real client address.

### Run and check

```bash
./glance -config glance.yml &
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/api/healthz
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://127.0.0.1:8080/
```

With auth enabled, the health endpoint returned 200 and `/` answered 303 to `/login`. Without a session the dashboard content is not served. Run `./glance diagnose` to test network access to the sources Glance uses. It reports failures per source, which is how to tell a blocked network from a bad config.

Config changes reload on save without a restart; reloading clears cached widget data, so avoid editing in a loop against rate-limited APIs.

### Subpath and assets

Under a reverse proxy at `/glance`, set `server.base-url: /glance` and make the proxy strip that prefix before forwarding. `server.assets-path` serves a directory under `/assets/`, useful for `icon: /assets/file.png` in the monitor widget; in Docker mount it to the same path the config names.

## Examples

### Example 1: A private feed page for a compliance team

Request: "Put the three regulator feeds and our service checks on one password-protected page, local only."

The agent installs the verified binary, runs `secret:make` and `password:hash`, exports both variables, writes `glance.yml` with an `rss` widget listing the three feed URLs, a `monitor` widget for the internal wiki and ticket tool, and a `releases` widget for `grafana/grafana`, then validates.

```bash
./glance -config glance.yml config:validate && ./glance -config glance.yml
```

Result: `valid`, then the server logs `Starting server on 127.0.0.1:8080`. The agent reports the URL and the login name, not the password or hash.

### Example 2: Fix a config that will not load

Request: "Glance exits right after I edit the file."

```bash
./glance -config glance.yml config:validate
```

Result: the validator names the problem, such as a page without `columns` or an undefined `${RSS_CATEGORY}` environment variable. The agent corrects the key or exports the variable, re-runs validation until it prints nothing and exits 0, and restarts.

## Guidelines

- Always run `config:validate` after editing. A running server keeps the last good config when a save is invalid, but a fresh start with a bad file exits.
- Never put passwords or secret keys in the YAML or in chat. Use `password-hash` with environment variables, and keep the `.env` file out of version control.
- Bind to 127.0.0.1 behind a TLS reverse proxy for remote access, and enable `auth`; the dashboard shows internal URLs.
- Use the real property names from the docs for your version; a misspelled structural key such as `columns` fails validation.
- Each widget has its own cache time; short `cache` values on `releases` or `reddit` can hit rate limits. Give `releases` a `token` if you track many repositories.
- Do not rely on Glance for alerting, deduplication or storing history. For those, build a pipeline and use Glance only to display results.
