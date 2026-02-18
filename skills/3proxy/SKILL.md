---
name: 3proxy
description: >-
  Deploy and configure 3proxy — a lightweight universal proxy server. Use when
  a user asks to set up HTTP, HTTPS, SOCKS4, SOCKS5, or transparent proxies,
  build proxy chains, configure authentication, set bandwidth limits, manage
  access control lists, set up proxy rotation, create multi-port proxy servers,
  configure logging and traffic accounting, or deploy a lightweight proxy
  without heavy VPN overhead. Covers all 3proxy features including proxy
  chaining, ACLs, traffic shaping, and multi-protocol support.
license: Apache-2.0
compatibility: "Linux, FreeBSD, Windows (3proxy 0.9+)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: networking
  tags: ["3proxy", "proxy", "socks5", "http-proxy", "networking", "proxy-chain"]
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

# Config: /etc/3proxy/3proxy.cfg
# Service: systemctl start 3proxy
```

**From source (latest version):**
```bash
cd /tmp
git clone https://github.com/3proxy/3proxy.git
cd 3proxy
make -f Makefile.Linux
make -f Makefile.Linux install

# Binary: /usr/local/bin/3proxy
# Create config dir
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

```bash
systemctl daemon-reload
systemctl enable --now 3proxy
```

### Step 2: Basic Configuration

**Minimal HTTP + SOCKS5 proxy** (`/etc/3proxy/3proxy.cfg`):
```
# Run as daemon
daemon

# Logging
log /var/log/3proxy/3proxy.log D
logformat "L%t %N %p %E %C:%c %R:%r %O %I %T"
rotate 30

# DNS
nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
timeouts 1 5 30 60 180 1800 15 60

# Internal and external interfaces
internal 0.0.0.0
external 0.0.0.0

# HTTP proxy on port 3128
proxy -p3128

# SOCKS5 proxy on port 1080
socks -p1080
```

**With authentication:**
```
# Users database
users admin:CL:strongpassword123
users user1:CL:password1
users user2:CL:password2

# Or use password file
# users $/etc/3proxy/passwd

# Require authentication
auth strong

# HTTP proxy
proxy -p3128

# SOCKS5 proxy
socks -p1080
```

**Password types:**
- `CL:` — cleartext
- `CR:` — crypt() hash
- `NT:` — NT hash

**Generate NT hash:**
```bash
echo -n "password" | openssl dgst -md4 -hex | awk '{print $2}' | tr 'a-f' 'A-F'
```

### Step 3: Access Control Lists (ACLs)

```
# Users
users admin:CL:adminpass
users dev1:CL:devpass
users dev2:CL:devpass

# Authentication required
auth strong

# ACL rules (processed top to bottom, first match wins)

# Admin — full access
allow admin

# Devs — only HTTPS (port 443) and HTTP (port 80)
allow dev1,dev2 * * 80,443

# Block everything else
deny *

# Apply to proxies
proxy -p3128
socks -p1080
```

**Time-based ACLs:**
```
# Allow access only during work hours (Mon-Fri 08:00-18:00)
allow * * * * 1-5 08:00:00-18:00:00

# Block outside work hours
deny *
```

**IP-based restrictions:**
```
# Only allow from office IP range
allow * 192.168.1.0/24
allow * 10.0.0.0/8
deny *
```

**Destination filtering:**
```
# Block social media
deny * * facebook.com,instagram.com,tiktok.com *
deny * * *.facebook.com,*.instagram.com *

# Allow everything else
allow *
```

### Step 4: Multi-Port / Multi-Protocol Setup

Run multiple proxy types on different ports:

```
daemon
log /var/log/3proxy/3proxy.log D
rotate 30

nserver 1.1.1.1
nscache 65536

# No auth proxies (bind to localhost only)
auth none
internal 127.0.0.1
proxy -p3128
socks -p1080

# Authenticated proxies (public)
flush
auth strong
users admin:CL:password

internal 0.0.0.0

# HTTP proxy on 8080
proxy -p8080

# SOCKS5 on 1081
socks -p1081

# SOCKS4 on 1082
socks -p1082 -4

# HTTPS CONNECT proxy on 8443
proxy -p8443
```

**Port forwarding (tcppm):**
```
# Forward local port 2222 to internal server's SSH
tcppm 2222 10.0.0.5 22

# Forward local port 3389 to internal RDP
tcppm 3389 10.0.0.10 3389
```

**Transparent proxy:**
```
# Requires iptables REDIRECT
tcppm -i0.0.0.0 -e0.0.0.0 3129 0.0.0.0 0
# Then redirect traffic with iptables:
# iptables -t nat -A PREROUTING -p tcp --dport 80 -j REDIRECT --to-port 3129
```

### Step 5: Proxy Chaining

Route traffic through multiple proxies:

```
# Chain: client → 3proxy → upstream proxy → internet

# Define parent (upstream) proxy
parent 1000 socks5 upstream-proxy.com 1080 upstream_user upstream_pass

# Or HTTP parent proxy
parent 1000 http proxy2.example.com 8080

# Multiple parents with load balancing
parent 1000 socks5 proxy1.com 1080
parent 1000 socks5 proxy2.com 1080
parent 1000 socks5 proxy3.com 1080
# 1000 = weight; requests distributed by weight

# Chain through two proxies (double hop)
parent 1000 socks5 hop1.com 1080 user1 pass1
parent 500 socks5+ hop2.com 1080 user2 pass2
# socks5+ means "connect through the previous parent"

# Local proxy that chains
proxy -p3128
socks -p1080
```

**Selective chaining** (only certain destinations through parent):
```
# Direct for local networks
deny * * 10.0.0.0/8,192.168.0.0/16 *
allow *

# Chain only for specific domains
parent 1000 socks5 upstream.com 1080

proxy -p3128
```

### Step 6: Bandwidth & Traffic Control

```
# Per-user bandwidth limits
# bandlimin <max_bytes_per_sec> <user_list> <src> <dst> <ports>

# Limit user1 to 1 MB/s
bandlimin 1048576 user1

# Limit all users to 512 KB/s
bandlimin 524288 *

# Output (server → client) limit
bandlimout 2097152 *  # 2 MB/s

# Per-connection limit
connlim 5 *  # Max 5 concurrent connections per user

# Total connections limit
maxconn 1000
```

**Traffic accounting:**
```
# Enable traffic counter
counter /var/log/3proxy/traffic.counters

# Per-user monthly quotas (bytes)
# nocountin — don't count incoming
# nocountout — don't count outgoing
countin 10737418240 * * *   # 10GB monthly incoming per user
countout 10737418240 * * *  # 10GB monthly outgoing per user
```

### Step 7: Multi-User Proxy Server

Full config for a multi-user proxy service:

```
daemon
pidfile /var/run/3proxy.pid

# Logging with traffic stats
log /var/log/3proxy/3proxy.log D
logformat "L%t %N %p %E %U %C:%c %R:%r %O %I %T"
archiver gz /usr/bin/gzip %F
rotate 30

# DNS
nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
timeouts 1 5 30 60 180 1800 15 60

# Limits
maxconn 500
connlim 10 *

# Users (or load from file: users $/etc/3proxy/passwd)
users user1:CL:pass1
users user2:CL:pass2
users user3:CL:pass3
users admin:CL:adminpass

# Traffic counters
counter /var/log/3proxy/traffic.counters
countin 53687091200 user1,user2,user3 * * *  # 50GB/month
countout 53687091200 user1,user2,user3 * * *

# Admin — unlimited
allow admin

# Users — standard web ports + common services
auth strong
allow user1,user2,user3 * * 80,443,8080,8443

# Block everything else
deny *

# Services
proxy -p3128 -n
socks -p1080 -n
```

**User management script:**
```bash
#!/bin/bash
# manage-users.sh — add/remove/list proxy users
ACTION=$1
USER=$2
PASS=$3
CONFIG=/etc/3proxy/3proxy.cfg

case "$ACTION" in
  add)
    echo "users ${USER}:CL:${PASS}" >> "$CONFIG"
    # Add to allow list — find last allow line and add user
    systemctl reload 3proxy
    echo "Added user: $USER"
    ;;
  remove)
    sed -i "/users ${USER}:/d" "$CONFIG"
    systemctl reload 3proxy
    echo "Removed user: $USER"
    ;;
  list)
    grep "^users " "$CONFIG" | awk -F: '{print $1}' | sed 's/users //'
    ;;
  traffic)
    # Parse traffic counters
    cat /var/log/3proxy/traffic.counters
    ;;
  *)
    echo "Usage: $0 {add|remove|list|traffic} [user] [pass]"
    ;;
esac
```

### Step 8: Proxy Rotation

Distribute outgoing connections across multiple IPs:

```
# Multiple external IPs on the server
# Rotate per-connection
external 1.1.1.1
external 2.2.2.2
external 3.3.3.3

# Round-robin by default
proxy -p3128

# Or assign specific IPs to users
flush
external 1.1.1.1
allow user1
proxy -p3128

flush
external 2.2.2.2
allow user2
proxy -p3129
```

**Random rotation:**
```
# Use multiple external IPs with auto-rotation
external 0.0.0.0
# 3proxy rotates through available external IPs
```

### Step 9: Security Hardening

```
# Run as unprivileged user
setgid 65534
setuid 65534

# Restrict to specific interfaces
internal 10.0.0.1  # Only listen on VPN interface

# Disable DNS resolution for clients (privacy)
# nserver 0.0.0.0

# Connection timeouts (prevent slow attacks)
timeouts 1 5 30 60 180 1800 15 60

# Rate limiting
connlim 3 *        # Max 3 concurrent connections per user
bandlimin 524288 * # 512 KB/s per user

# Log everything
log /var/log/3proxy/3proxy.log D
logformat "L%t %N %p %E %U %C:%c %R:%r %O %I %T"

# Block access to private networks from proxy
deny * * 127.0.0.0/8 *
deny * * 10.0.0.0/8 *
deny * * 172.16.0.0/12 *
deny * * 192.168.0.0/16 *
deny * * 169.254.0.0/16 *

# Then allow external
allow *
```

**Firewall:**
```bash
# Only allow proxy ports from known IPs
ufw allow from 10.0.0.0/8 to any port 3128 proto tcp
ufw allow from 10.0.0.0/8 to any port 1080 proto tcp
ufw deny 3128
ufw deny 1080
```
