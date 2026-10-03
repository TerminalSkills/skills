---
name: crowdsec
description: >-
  Detects attacks from server logs and blocks malicious IPs with CrowdSec, an open-source, crowd-sourced alternative to fail2ban. Use when a user asks to block brute force attempts, protect SSH or a web server, set up a community blocklist firewall, add a WAF, or install CrowdSec with Docker.
license: Apache-2.0
compatibility: 'Linux (Debian, Ubuntu, RHEL family), FreeBSD, Windows, Docker; Security Engine 1.8.x'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
    - crowdsec
    - firewall
    - ids
    - brute-force
    - community
  repository: https://github.com/crowdsecurity/crowdsec
---

# CrowdSec

## Overview

CrowdSec has two halves. The **Security Engine** reads logs (and, with the AppSec component, live HTTP requests), matches them against scenarios from the Hub and records *decisions* such as "ban 203.0.113.50 for 4h". A **Remediation Component** (called a bouncer) fetches those decisions from the Local API and enforces them in a firewall, reverse proxy or CDN. The engine alone blocks nothing. Signals you report feed a community blocklist that is pushed back to all users. Current release is v1.8.1 (September 2026). Docs: https://docs.crowdsec.net.

## Instructions

### Step 1: Install the engine

On Debian or Ubuntu add the CrowdSec package repository by hand (the one-line installer from the docs pipes a script into a shell; the manual route is the same repo):

```bash
sudo apt update && sudo apt install -y curl gnupg apt-transport-https
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://packagecloud.io/crowdsec/crowdsec/gpgkey | sudo gpg --dearmor -o /etc/apt/keyrings/crowdsec_crowdsec-archive-keyring.gpg
printf 'deb [signed-by=/etc/apt/keyrings/crowdsec_crowdsec-archive-keyring.gpg] https://packagecloud.io/crowdsec/crowdsec/any any main\n' | sudo tee /etc/apt/sources.list.d/crowdsec_crowdsec.list
sudo apt update && sudo apt install -y crowdsec
```

RHEL-family systems use the `crowdsec_crowdsec.repo` file shown on the Linux installation page, then `sudo yum install crowdsec`. Since 1.7 the installer detects running services (sshd, nginx, ...) and enables matching collections and log sources on its own.

### Step 2: Check what it watches

```bash
sudo cscli metrics show acquisition   # log sources, lines read / parsed
sudo cscli collections list           # installed parsers + scenarios
sudo cscli collections install crowdsecurity/nginx crowdsecurity/http-cve
sudo systemctl reload crowdsec        # after any config or collection change
```

If a log lives in a custom path, add a file under `/etc/crowdsec/acquis.d/` with `filenames:` and `labels: {type: nginx}`. Test a parser without waiting for an attack: `sudo cscli explain --log 'Oct  3 10:01:02 web01 sshd[2345]: Failed password for root from 203.0.113.50 port 4242 ssh2' --type syslog` or `--file access.log --type nginx`.

### Step 3: Add a remediation component

Pick the one that matches where you want to block:

```bash
sudo apt install crowdsec-firewall-bouncer-nftables   # or ...-iptables; run `iptables -V`, "nf_tables" means nftables
sudo apt install crowdsec-nginx-bouncer               # Lua bouncer for nginx, supports captcha and AppSec
```

On the same machine the package registers itself with the Local API. For a remote bouncer create a key with `sudo cscli bouncers add edge-firewall` (shown once), then set `api_url` and `api_key` in its YAML (firewall: `/etc/crowdsec/bouncers/crowdsec-firewall-bouncer.yaml`). Other components: Traefik, OpenResty, HAProxy SPOA, Cloudflare, AWS WAF, Fastly, WordPress.

### Step 4: Operate

```bash
sudo cscli decisions list                                   # active bans
sudo cscli alerts list                                      # detections
sudo cscli decisions add --ip 203.0.113.50 --duration 24h --reason "manual block"
sudo cscli decisions delete --ip 203.0.113.50
sudo cscli allowlists create office --description "Office IPs"   # then: cscli allowlists add office 198.51.100.7
sudo cscli hub update && sudo cscli hub upgrade             # refresh scenarios
sudo cscli bouncers list                                    # is the bouncer pulling?
```

### Step 5: Docker

```yaml
# compose.yaml
services:
  crowdsec:
    image: crowdsecurity/crowdsec:latest
    restart: always
    ports:
      - "127.0.0.1:8080:8080"
    environment:
      COLLECTIONS: "crowdsecurity/nginx crowdsecurity/http-cve"
      BOUNCER_KEY_firewall: ${CROWDSEC_FIREWALL_KEY}
      TZ: Europe/Berlin
    volumes:
      - ./acquis.yaml:/etc/crowdsec/acquis.yaml
      - /var/log/nginx:/var/log/nginx:ro
      - crowdsec-db:/var/lib/crowdsec/data
      - crowdsec-config:/etc/crowdsec
volumes:
  crowdsec-db:
  crowdsec-config:
```

`BOUNCER_KEY_<name>` seeds a bouncer key at first start; generate it with `openssl rand -hex 24` and keep it in `.env`. The compose file does not start a bouncer: install one on the host (Step 3, `api_url: http://127.0.0.1:8080/`) or use the Traefik plugin.

## Examples

### Example 1: Stop SSH brute force on an Ubuntu VPS

**User request:** "Bots hammer my SSH port with passwords, ban them automatically"

```bash
sudo apt install -y crowdsec crowdsec-firewall-bouncer-nftables   # repo from Step 1
sudo cscli collections install crowdsecurity/sshd
sudo systemctl reload crowdsec
sudo cscli explain --log 'Oct  3 10:01:02 web01 sshd[2345]: Failed password for root from 203.0.113.50 port 4242 ssh2' --type syslog
```

**Result:** `cscli explain` shows `sshd-logs` parsed (green) and the `crowdsecurity/ssh-bf` scenarios evaluated. After repeated failures `sudo cscli decisions list` shows `Ip:203.0.113.50 ... ban`, and `sudo nft list ruleset` contains a `crowdsec-blacklists` set with that address.

### Example 2: Run the engine in Docker next to nginx

**User request:** "Put CrowdSec in my docker-compose stack and ban IPs that scan my site"

Save the Step 5 file next to an `acquis.yaml` containing `filenames: [/var/log/nginx/access.log]` and `labels: {type: nginx}`, then:

```bash
echo "CROWDSEC_FIREWALL_KEY=$(openssl rand -hex 24)" > .env
docker compose up -d
docker compose exec crowdsec cscli metrics show acquisition
```

**Result:** the acquisition table lists `file:/var/log/nginx/access.log` with growing "Lines parsed". Without the `/var/lib/crowdsec/data` volume the container refuses to start with `No volume mounted for /var/lib/crowdsec/data`.

## Guidelines

- Detection and blocking are separate: always confirm with `cscli bouncers list` that a bouncer has a recent "Last API pull".
- Persist `/var/lib/crowdsec/data` (mandatory since 1.7) and `/etc/crowdsec` in containers; mount logs read-only.
- Do not publish the Local API (port 8080) on a public address; bind it to `127.0.0.1` or a private network.
- Add your own IPs to an allowlist before testing bans so you do not lock yourself out; private LAN ranges are allowed by default.
- A firewall bouncer protects ports and services (SSH, SMTP); for web apps add a WAF-capable bouncer (nginx, OpenResty, Traefik) and the AppSec component, built on Coraza with OWASP CRS support.
- The Console (https://app.crowdsec.net, `cscli console enroll`) is optional and needs an account; the engine runs without it.
- Not suited to hosts without readable logs, or where you cannot install a bouncer at any layer.
