---
name: 3x-ui
description: >-
  Deploys and operates 3x-ui, a web control panel for Xray-core proxy servers, and scripts it through its REST API: create inbounds, add clients with traffic quotas, expiry and IP limits, read usage, and restart Xray. Use when asked to "install 3x-ui", "run an Xray panel in Docker", "add a proxy user with a 50 GB limit", "automate 3x-ui with its API", "reset 3x-ui credentials", or "back up the panel". For hand-written Xray config files use the xray skill instead.
license: Apache-2.0
compatibility: "Linux server with root access (systemd) or Docker 24+; panel v3.x; use only on servers you own, where proxy use is lawful"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags: "3x-ui, xray, proxy, vless, api"
  repository: https://github.com/MHSanaei/3x-ui
---
# 3x-ui — web panel and API for Xray-core servers

## Overview

3x-ui is a Go web panel that wraps Xray-core. It manages inbounds (VLESS, VMess, Trojan, Shadowsocks, WireGuard, Hysteria2, TUIC and more), per-client traffic quotas, expiry dates and IP limits, share links and QR codes, a subscription server, traffic statistics, and optional Telegram or Discord bots. Data lives in SQLite (`/etc/x-ui/x-ui.db`) or PostgreSQL.

This skill covers installing the panel, hardening it, and automating it through the HTTP API. It does not cover writing raw Xray JSON configs or choosing Reality or transport settings in depth; the `xray` skill does that. The project README states the panel is meant for personal use and warns against illegal use or production-grade claims, so use it only on servers you own and in places where running a proxy is lawful.

The commands below were checked against the v3.11.0 source and docs. The API calls were run against the Docker image `ghcr.io/mhsanaei/3x-ui:v3.11.0`; `install.sh` was read but not executed.

## Instructions

### Install with the official script (download, read, then run)

Pin the release tag and never pipe the script into a shell:

```bash
curl -fsSLo install.sh https://raw.githubusercontent.com/MHSanaei/3x-ui/v3.11.0/install.sh
less install.sh                      # read it first; it runs as root
sudo bash install.sh v3.11.0
```

The installer generates a random username, password, port and web base path, installs the `x-ui` service, and prints them. Release archives have a `.sha256` file that the installer checks. For cloud-init, run it unattended; credentials, access URL and an API token go to a root-only file:

```bash
sudo XUI_NONINTERACTIVE=1 bash install.sh v3.11.0
sudo cat /etc/x-ui/install-result.env       # XUI_USERNAME, XUI_PASSWORD, XUI_PANEL_PORT, XUI_WEB_BASE_PATH, XUI_ACCESS_URL, XUI_API_TOKEN
```

### Install with Docker

The image is published at `ghcr.io/mhsanaei/3x-ui` with version tags such as `v3.11.0`. The repo's `docker-compose.yml` builds from source; to use the image directly, bind the panel to loopback and add the capabilities that the bundled Fail2ban needs for IP limits:

```bash
mkdir -p ~/xui/db ~/xui/cert && cd ~/xui
docker run -d --name 3xui --restart unless-stopped \
  --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -p 127.0.0.1:2053:2053 \
  -v "$PWD/db:/etc/x-ui" -v "$PWD/cert:/root/cert" \
  ghcr.io/mhsanaei/3x-ui:v3.11.0
docker logs 3xui 2>&1 | grep -i "username"       # first start prints generated credentials once
```

Publish each inbound port you create (for example `-p 443:443`) and the subscription port `2096` if you use it. Without `NET_ADMIN` and `NET_RAW`, IP-limit bans are logged but never applied. Set `XUI_PORT`, `XUI_INIT_WEB_BASE_PATH` or `XUI_DB_TYPE` / `XUI_DB_DSN` (PostgreSQL) through `-e`; the complete list is in the docs under Reference, Environment Variables.

### First login and hardening (do this before creating inbounds)

Panel URL: `http://HOST:PORT/BASEPATH`. Read current values with `x-ui settings`. Then:

- Change username and password (menu `x-ui`, option 7, or Panel Settings). This logs out all sessions.
- Randomize the web base path (menu option 8) and change the port (option 10).
- Turn on TOTP two-factor in Panel Settings.
- Keep the panel off the public internet: reach it through an SSH tunnel, or put it behind Nginx or Caddy with TLS.

```bash
ssh -N -L 12053:127.0.0.1:2053 admin@vpn-edge-1      # then open http://127.0.0.1:12053/
```

The panel's login limiter blocks an IP after 5 failed attempts in 5 minutes. Menu options 20 (SSL certificates), 22 (IP limit management) and 23 (firewall) exist in the `x-ui` menu.

### Service control

```bash
sudo systemctl status x-ui
sudo x-ui log                  # panel log
sudo x-ui restart-xray         # restart only the Xray core
sudo x-ui update               # update to latest stable (read the release notes first)
```

### API authentication

All automation endpoints live under `/panel/api/` (prefix them with the web base path if it is not `/`). Two modes:

1. Bearer token (best for scripts): create it in Panel Settings, Security, API Token, or take `XUI_API_TOKEN` from `install-result.env`. A token has a scope (`admin`, `monitor` read-only, `node-sync`, `node-admin`), may expire, and is shown only once. Bearer requests skip CSRF.
2. Session cookie: `GET /csrf-token`, then `POST /login` with JSON and the `X-CSRF-Token` header. A login without the CSRF header returns 403.

```bash
export XUI_URL="http://127.0.0.1:12053"
export XUI_API_TOKEN="..."        # from Panel Settings or install-result.env
curl -s -H "Authorization: Bearer $XUI_API_TOKEN" "$XUI_URL/panel/api/server/status"
```

Responses are JSON: `{"success": true, "msg": "...", "obj": ...}`. Check `success`, not just the HTTP status.

### Inbounds

```bash
H="Authorization: Bearer $XUI_API_TOKEN"; J="Content-Type: application/json"
curl -s -H "$H" "$XUI_URL/panel/api/inbounds/list"                       # list
curl -s -H "$H" "$XUI_URL/panel/api/server/getNewUUID"                    # {"obj":{"uuid":...}}
curl -s -H "$H" "$XUI_URL/panel/api/server/getNewX25519Cert"              # Reality key pair
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/inbounds/add" -d @inbound.json
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/inbounds/del/ID"
```

`settings`, `streamSettings` and `sniffing` are sent as JSON objects. A minimal VLESS inbound (verified):

```json
{"enable": true, "remark": "vless-tcp-lab", "listen": "127.0.0.1", "port": 24443,
 "protocol": "vless", "expiryTime": 0, "total": 0,
 "settings": {"clients": [], "decryption": "none"},
 "streamSettings": {"network": "tcp", "security": "none"},
 "sniffing": {"enabled": true, "destOverride": ["http", "tls"]}}
```

For TLS or Reality inbounds, create one once in the UI and read it back with `GET /panel/api/inbounds/get/ID` to copy the exact `streamSettings` shape, rather than writing it from memory. Other inbound calls: `update/ID`, `setEnable/ID`, `ID/resetTraffic`.

### Clients, quotas and traffic

Clients are separate records attached to one or more inbounds, identified by `email`. `totalGB` is in bytes (0 means unlimited), `expiryTime` is Unix milliseconds (0 means never), `limitIp` caps simultaneous IPs.

```bash
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/clients/add" -d '{
  "client": {"email": "mira.k", "totalGB": 53687091200, "expiryTime": 1798761600000, "limitIp": 2, "enable": true},
  "inboundIds": [1]}'
curl -s -H "$H" "$XUI_URL/panel/api/clients/traffic/mira.k"               # up, down, total, expiry
curl -s -H "$H" "$XUI_URL/panel/api/clients/get/mira.k"                   # includes generated uuid and subId
curl -s -H "$H" "$XUI_URL/panel/api/clients/links/mira.k"                 # vless:// share links
curl -s -H "$H" "$XUI_URL/panel/api/clients/list/paged?page=1&pageSize=50"
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/clients/update/mira.k" -d '{"email":"mira.k","totalGB":107374182400,"expiryTime":1798761600000,"limitIp":2,"enable":true}'
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/clients/resetTraffic/mira.k"
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/clients/bulkDisable" -d '{"emails":["mira.k"]}'
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/clients/del/mira.k"
```

Missing identity fields are generated: the add call fills a UUID for VLESS and VMess, a password for Trojan. `clients/bulkCreate`, `bulkAdjust` (add days or bytes to many clients), `bulkEnable`, `bulkDel` and `delDepleted` also exist; `update` replaces the client's fields, so send the full record. The panel stops a client when the quota is used up or the expiry passes.

### Operations

```bash
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/server/restartXrayService"
curl -s -H "$H" "$XUI_URL/panel/api/server/getDb" -o "xui-backup-$(date +%F).db"     # SQLite backup
curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/server/xraylogs/50"
```

The OpenAPI document is served at `GET /panel/api/openapi.json`; fetch it from your running panel when you need a field this skill does not list.

## Examples

### Example 1: Install on a fresh VPS and lock it down

**Request:** "Install 3x-ui v3.11.0 on vpn-edge-1, keep the panel private, and give me the access details."

```bash
curl -fsSLo install.sh https://raw.githubusercontent.com/MHSanaei/3x-ui/v3.11.0/install.sh
less install.sh
sudo XUI_NONINTERACTIVE=1 bash install.sh v3.11.0
sudo cat /etc/x-ui/install-result.env
sudo ufw allow OpenSSH && sudo ufw allow 443/tcp && sudo ufw enable
ssh -N -L 12053:127.0.0.1:PANEL_PORT admin@vpn-edge-1
```

Replace PANEL_PORT with the `XUI_PANEL_PORT` value from `install-result.env`; the unattended installer leaves the panel listening on all interfaces (its source says the panel stays reachable on the public interface; only the interactive run offers a 127.0.0.1-only bind), so the agent confirms the panel port is blocked by the firewall and reaches the panel only via the tunnel. Result: random credentials and a random base path stored in the env file, the panel reachable at `http://127.0.0.1:12053/<XUI_WEB_BASE_PATH>`, and only SSH and 443 open to the internet. The agent then changes the credentials and enables 2FA in the UI.

### Example 2: Onboard contractors with 50 GB quotas

**Request:** "Add Mira, Tomas and Jun to inbound 1 with 50 GB each, valid until 1 Jan 2027, max 2 devices. Give me their links and tell me later who used most."

```bash
for u in mira.k tomas.v jun.w; do
  curl -s -H "$H" -H "$J" -X POST "$XUI_URL/panel/api/clients/add" -d "{
    \"client\": {\"email\": \"$u\", \"totalGB\": 53687091200, \"expiryTime\": 1798761600000, \"limitIp\": 2, \"enable\": true},
    \"inboundIds\": [1]}"
  curl -s -H "$H" "$XUI_URL/panel/api/clients/links/$u"
done
curl -s -H "$H" "$XUI_URL/panel/api/clients/list/paged?page=1&pageSize=50" \
  | python3 -c 'import sys,json; [print(i["email"], i["traffic"]["up"]+i["traffic"]["down"]) for i in json.load(sys.stdin)["obj"]["items"]]'
```

Result: three `{"success":true,"msg":"Inbound client(s) have been added."}` replies, one `vless://` link each (send them over a private channel), and later a usage line per email in bytes.

## Guidelines

- **Default and generated credentials are the first thing to change**, together with the web base path and port. A panel on a public IP with `/` as its base path is found by scanners quickly.
- **Keep the panel on 127.0.0.1 or behind TLS.** The Docker command above binds loopback; with the script install, check which address the panel listens on and block its port in the firewall. Do not expose the API token: it is a full-admin credential unless created with a narrower scope.
- **Lawful use only.** Run it on servers you own and where operating a proxy is legal; the project says it is for personal use.
- **Pin versions.** Install a tagged release and read the release notes before `x-ui update`; Xray-core and panel versions move fast.
- **`totalGB` is bytes, `expiryTime` is milliseconds.** Passing gigabytes or seconds silently sets a tiny quota or an expiry in 1970.
- **IP limits need Fail2ban privileges.** In Docker, forget `NET_ADMIN` and bans are never applied.
- **Back up** `/etc/x-ui/x-ui.db` (or the DB via `getDb`) before updates and before changing the database backend. `x-ui migrate-db --dsn ...` moves SQLite to PostgreSQL and leaves the SQLite file untouched.
- **Not for:** hand-tuned Xray configurations (use the `xray` skill), a hardened multi-tenant commercial service, or shared machines you do not control.
