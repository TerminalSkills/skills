---
name: 3proxy
description: >-
  Deploy and configure 3proxy — a lightweight universal proxy server. Use when a
  user asks to set up HTTP, HTTPS, SOCKS4, SOCKS5, or transparent proxies, build
  proxy chains, configure authentication, set bandwidth limits, manage access
  control lists, set up proxy rotation, create multi-port proxy servers,
  configure logging and traffic accounting, or deploy a lightweight proxy
  without heavy VPN overhead. Covers all 3proxy features including proxy
  chaining, ACLs, traffic shaping, and multi-protocol support.
license: Apache-2.0
compatibility: 'Linux, FreeBSD, Windows (3proxy 0.9+)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - 3proxy
    - proxy
    - socks5
    - http-proxy
    - networking
---

# 3proxy

## Overview

Deploy 3proxy — the tiny, fast, universal proxy server supporting HTTP(S), SOCKS4/5, port forwarding, and transparent proxying in a single ~200KB binary. Ideal for lightweight proxy setups, proxy chaining, multi-user access with traffic accounting, and scenarios where a full VPN is overkill. This skill covers installation, multi-protocol configuration, authentication, ACLs, bandwidth control, proxy chains, and production deployment.

## Instructions

### Step 1: Installation

**From package manager:**
```bash
# Ubuntu/Debian
apt update && apt install -y 3proxy
# Config: /etc/3proxy/3proxy.cfg — Service: systemctl start 3proxy
```

**From source (latest):**
```bash
cd /tmp && git clone https://github.com/3proxy/3proxy.git && cd 3proxy
make -f Makefile.Linux && make -f Makefile.Linux install
mkdir -p /etc/3proxy /var/log/3proxy
```

**Systemd service** (`/etc/systemd/system/3proxy.service`):
```ini
[Unit]
Description=3proxy - tiny proxy server
After=network.target

[Service]
Type=simple
ExecStart=/usr/local/bin/3proxy /etc/3proxy/3proxy.cfg
ExecReload=/bin/kill -HUP $MAINPID
Restart=on-failure
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
```

### Step 2: Basic Configuration

**Minimal HTTP + SOCKS5 proxy** (`/etc/3proxy/3proxy.cfg`):
```
daemon
log /var/log/3proxy/3proxy.log D
logformat "L%t %N %p %E %C:%c %R:%r %O %I %T"
rotate 30

nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
timeouts 1 5 30 60 180 1800 15 60

internal 0.0.0.0
external 0.0.0.0

proxy -p3128    # HTTP proxy
socks -p1080    # SOCKS5 proxy
```

**With authentication** (password types: `CL:` cleartext, `CR:` crypt hash, `NT:` NT hash):
```
users admin:CL:strongpassword123
users user1:CL:password1
auth strong
proxy -p3128
socks -p1080
```

### Step 3: Access Control Lists (ACLs)

ACL rules are processed top to bottom, first match wins:
```
users admin:CL:adminpass
users dev1:CL:devpass
auth strong

allow admin                        # Full access
allow dev1,dev2 * * 80,443         # Devs: HTTP/HTTPS only
deny *                             # Block everything else

proxy -p3128
socks -p1080
```

**Time-based:** `allow * * * * 1-5 08:00:00-18:00:00` (Mon-Fri work hours)

**IP-based:** `allow * 192.168.1.0/24` then `deny *`

**Destination filtering:** `deny * * facebook.com,instagram.com *`

### Step 4: Multi-Port / Multi-Protocol

```
# No-auth proxies on localhost
auth none
internal 127.0.0.1
proxy -p3128
socks -p1080

# Authenticated proxies on public interface
flush
auth strong
users admin:CL:password
internal 0.0.0.0
proxy -p8080
socks -p1081
```

**Port forwarding:** `tcppm 2222 10.0.0.5 22` (forward local 2222 to SSH)

### Step 5: Proxy Chaining

```
# Route through upstream proxy
parent 1000 socks5 upstream-proxy.com 1080 user pass

# Load balance across multiple upstreams (weight-based)
parent 1000 socks5 proxy1.com 1080
parent 1000 socks5 proxy2.com 1080

# Double hop: socks5+ connects through the previous parent
parent 1000 socks5 hop1.com 1080 user1 pass1
parent 500 socks5+ hop2.com 1080 user2 pass2

proxy -p3128
socks -p1080
```

### Step 6: Bandwidth & Traffic Control

```
bandlimin 1048576 user1      # Limit user1 to 1 MB/s
bandlimout 2097152 *         # 2 MB/s outbound for all
connlim 5 *                  # Max 5 concurrent connections per user
maxconn 1000                 # Total connection limit

# Traffic accounting with monthly quotas
counter /var/log/3proxy/traffic.counters
countin 10737418240 * * *    # 10GB monthly incoming per user
countout 10737418240 * * *   # 10GB monthly outgoing per user
```

### Step 7: Security Hardening

```
setgid 65534
setuid 65534
internal 10.0.0.1              # Restrict listening interface
timeouts 1 5 30 60 180 1800 15 60
connlim 3 *
bandlimin 524288 *

# Block proxy access to private networks
deny * * 127.0.0.0/8 *
deny * * 10.0.0.0/8 *
deny * * 172.16.0.0/12 *
deny * * 192.168.0.0/16 *
allow *
```

**Firewall:**
```bash
ufw allow from 10.0.0.0/8 to any port 3128 proto tcp
ufw allow from 10.0.0.0/8 to any port 1080 proto tcp
ufw deny 3128
ufw deny 1080
```

## Examples

### Example 1: Set up an authenticated multi-protocol proxy for a small team
**User prompt:** "Set up a 3proxy server on our Ubuntu VPS at 203.0.113.50 with HTTP and SOCKS5 proxies. Create accounts for alice and bob with 50GB monthly traffic limits each, restrict them to web ports only, and give me full admin access."

The agent will install 3proxy from source, create a systemd service, and generate `/etc/3proxy/3proxy.cfg` with DNS settings, two user accounts (alice and bob) with `auth strong`, ACL rules granting admin full access and restricting alice/bob to ports 80 and 443, bandwidth counters set to 53687091200 bytes (50GB), HTTP proxy on port 3128 and SOCKS5 on port 1080, and proper logging with 30-day rotation.

### Example 2: Chain traffic through an upstream SOCKS5 proxy with IP rotation
**User prompt:** "Configure our 3proxy to route all outgoing traffic through three upstream SOCKS5 proxies for IP rotation. The upstreams are at proxy1.example.com:1080, proxy2.example.com:1080, and proxy3.example.com:1080 with user 'rotate' and password 'r0tate!2025'. Local proxy should listen on port 8080."

The agent will edit the 3proxy config to define three `parent` directives with equal weights of 1000 each pointing to the upstream SOCKS5 servers with credentials, then configure a local HTTP proxy on port 8080 and SOCKS5 on port 1081, enable logging to track which upstream was used per request, and restart the 3proxy service.

## Guidelines

- Always use `auth strong` on publicly exposed proxy ports; never run open proxies accessible from the internet
- Run 3proxy as an unprivileged user with `setuid`/`setgid` and block proxy access to private RFC1918 IP ranges to prevent SSRF attacks
- Use the `flush` directive to separate configuration blocks with different auth or interface settings; without it, settings accumulate
- Place deny rules for private networks before the final `allow *` since 3proxy processes ACLs top to bottom with first-match semantics
- Set `connlim` and `bandlimin` to prevent a single user from exhausting server resources, and enable traffic counters for usage monitoring
- Back up `/etc/3proxy/3proxy.cfg` before editing since 3proxy has no config validation command and a syntax error will prevent startup
