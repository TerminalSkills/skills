---
name: xray
description: >-
  Deploy and configure Xray proxy servers. Use when a user asks to set up VLESS,
  VMess, Trojan, or Shadowsocks proxies, configure Reality or TLS transport,
  deploy Xray with XTLS, set up fallback routing, manage multi-user access,
  configure traffic routing rules, set up CDN-based tunneling, build
  subscription links for client apps, monitor Xray traffic, or bypass network
  restrictions. Covers all major Xray protocols, transports, and deployment
  patterns.
license: Apache-2.0
compatibility: 'Linux (any distro), Xray-core 1.8+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - xray
    - vless
    - vmess
    - trojan
    - proxy
---

# Xray

## Overview

Deploy and configure Xray-core — the advanced proxy platform supporting VLESS, VMess, Trojan, and Shadowsocks protocols with modern transports like Reality, XTLS-Vision, WebSocket, gRPC, and HTTP/2. This skill covers server deployment, protocol selection, TLS/Reality configuration, traffic routing, multi-user management, CDN integration, client configuration, and monitoring.

## Instructions

### Step 1: Installation

```bash
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
xray version
# Binary: /usr/local/bin/xray
# Config: /usr/local/etc/xray/config.json

# Generate UUID and X25519 keys
xray uuid
xray x25519   # Private + Public key pair for Reality
```

### Step 2: VLESS + Reality (Recommended)

The most secure setup. Reality mimics a real HTTPS website's TLS handshake, eliminating the need for a domain or TLS certificate.

**Server config (`/usr/local/etc/xray/config.json`):**
```json
{
  "log": { "loglevel": "warning" },
  "inbounds": [{
    "listen": "0.0.0.0",
    "port": 443,
    "protocol": "vless",
    "settings": {
      "clients": [
        { "id": "YOUR-UUID", "flow": "xtls-rprx-vision", "email": "user1@proxy" }
      ],
      "decryption": "none"
    },
    "streamSettings": {
      "network": "tcp",
      "security": "reality",
      "realitySettings": {
        "dest": "www.microsoft.com:443",
        "serverNames": ["www.microsoft.com", "microsoft.com"],
        "privateKey": "YOUR-PRIVATE-KEY",
        "shortIds": ["", "0123456789abcdef"]
      }
    },
    "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"] }
  }],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ],
  "routing": {
    "rules": [{ "type": "field", "ip": ["geoip:private"], "outboundTag": "block" }]
  }
}
```

**Client share link:**
```
vless://UUID@SERVER_IP:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=PUBLIC_KEY&sid=0123456789abcdef&type=tcp#MyProxy
```

```bash
systemctl enable --now xray
```

### Step 3: VLESS + WebSocket + TLS (CDN-Compatible)

For routing through Cloudflare CDN to hide the server IP. Requires a domain with Cloudflare proxying and a TLS certificate.

```bash
apt install -y certbot
certbot certonly --standalone -d proxy.yourdomain.com
```

```json
{
  "inbounds": [
    {
      "port": 443, "protocol": "vless",
      "settings": {
        "clients": [{ "id": "YOUR-UUID" }],
        "decryption": "none",
        "fallbacks": [
          { "dest": 8080 },
          { "path": "/ws-path", "dest": 8443, "xver": 1 }
        ]
      },
      "streamSettings": {
        "network": "tcp", "security": "tls",
        "tlsSettings": {
          "certificates": [{
            "certificateFile": "/etc/letsencrypt/live/proxy.yourdomain.com/fullchain.pem",
            "keyFile": "/etc/letsencrypt/live/proxy.yourdomain.com/privkey.pem"
          }]
        }
      }
    },
    {
      "listen": "127.0.0.1", "port": 8443, "protocol": "vless",
      "settings": { "clients": [{ "id": "YOUR-UUID" }], "decryption": "none" },
      "streamSettings": { "network": "ws", "wsSettings": { "path": "/ws-path" } }
    }
  ],
  "outbounds": [{ "protocol": "freedom", "tag": "direct" }]
}
```

Set up nginx on port 8080 as fallback, and in Cloudflare: SSL/TLS Full (Strict), WebSockets ON.

### Step 4: Trojan & Shadowsocks

**Trojan** (looks like normal HTTPS):
```json
{
  "inbounds": [{
    "port": 443, "protocol": "trojan",
    "settings": {
      "clients": [{ "password": "your-strong-password", "email": "user1@trojan" }],
      "fallbacks": [{ "dest": 8080 }]
    },
    "streamSettings": {
      "network": "tcp", "security": "tls",
      "tlsSettings": { "certificates": [{ "certificateFile": "...", "keyFile": "..." }] }
    }
  }]
}
```

**Shadowsocks 2022** (modern AEAD ciphers):
```json
{
  "inbounds": [{
    "port": 8388, "protocol": "shadowsocks",
    "settings": { "method": "2022-blake3-aes-128-gcm", "password": "BASE64_KEY", "network": "tcp,udp" }
  }]
}
```

Generate key: `openssl rand -base64 16` (or `-base64 32` for aes-256)

### Step 5: Multi-User Management

```json
"clients": [
  { "id": "uuid-1", "email": "alice@proxy", "flow": "xtls-rprx-vision" },
  { "id": "uuid-2", "email": "bob@proxy", "flow": "xtls-rprx-vision" },
  { "id": "uuid-3", "email": "carol@proxy", "flow": "xtls-rprx-vision" }
]
```

**Per-user traffic stats** — enable the stats API:
```json
{
  "stats": {},
  "policy": {
    "levels": { "0": { "statsUserUplink": true, "statsUserDownlink": true } },
    "system": { "statsInboundUplink": true, "statsInboundDownlink": true }
  },
  "api": { "tag": "api", "services": ["StatsService", "HandlerService"] },
  "inbounds": [
    { "listen": "127.0.0.1", "port": 10085, "protocol": "dokodemo-door",
      "settings": { "address": "127.0.0.1" }, "tag": "api" }
  ],
  "routing": { "rules": [{ "type": "field", "inboundTag": ["api"], "outboundTag": "api" }] }
}
```

**Query and manage users at runtime:**
```bash
xray api stats --server=127.0.0.1:10085 -name "user>>>alice@proxy>>>traffic>>>uplink"
xray api adi --server=127.0.0.1:10085 --inbound-tag proxy --id "new-uuid" --email "newuser@proxy"
xray api rmi --server=127.0.0.1:10085 --inbound-tag proxy --email "olduser@proxy"
```

### Step 6: Routing Rules & Monitoring

**Route by domain/IP/geo:**
```json
{
  "routing": {
    "domainStrategy": "IPIfNonMatch",
    "rules": [
      { "type": "field", "domain": ["geosite:category-ads-all"], "outboundTag": "block" },
      { "type": "field", "ip": ["geoip:private"], "outboundTag": "block" },
      { "type": "field", "network": "tcp,udp", "outboundTag": "proxy" }
    ]
  }
}
```

**Monitoring:**
```bash
systemctl status xray
journalctl -u xray -f
grep "accepted" /var/log/xray/access.log | awk '{print $3}' | sort | uniq -c | sort -rn
```

**Firewall:**
```bash
ufw allow 443/tcp && ufw allow 443/udp && ufw enable
```

## Examples

### Example 1: Deploy a VLESS + Reality proxy server for a small team
**User prompt:** "Set up Xray on our Debian 12 VPS at 198.51.100.30 using VLESS with Reality transport. Create accounts for alice, bob, and carol. Use microsoft.com as the Reality target and give me the share links for v2rayNG."

The agent will install Xray via the official script, generate a UUID for each user and an X25519 key pair, build a `config.json` with a VLESS inbound on port 443 using Reality settings targeting `www.microsoft.com`, add three client entries with `xtls-rprx-vision` flow, add routing rules to block private IPs, enable and start the xray service, open port 443 in the firewall, and output three `vless://` share links with the server IP, public key, short ID, and SNI.

### Example 2: Set up a CDN-fronted VLESS proxy with Cloudflare and a fallback website
**User prompt:** "I have proxy.mysite.com pointing to our server through Cloudflare. Configure Xray with VLESS over WebSocket on /secret-ws so traffic goes through Cloudflare's CDN. Non-proxy visitors should see a normal nginx website."

The agent will obtain a Let's Encrypt certificate with certbot, configure Xray with a main VLESS+TLS inbound on port 443 with a fallback to nginx on port 8080, add a second VLESS+WebSocket inbound on localhost:8443 with path `/secret-ws`, set up nginx to serve a static site on port 8080, verify Cloudflare SSL is set to Full (Strict) with WebSockets enabled, and provide the client connection string with the WebSocket path and Cloudflare SNI.

## Guidelines

- Always use VLESS + Reality for new deployments; it requires no domain or certificate and is the hardest protocol to detect and block
- Set `"alterId": 0` for all VMess users to enable mandatory AEAD encryption; non-zero alterId uses the deprecated, less secure legacy format
- Block access to private IP ranges (geoip:private) in routing rules to prevent the proxy from being used for SSRF attacks against internal services
- Use the `xray api` commands to add and remove users at runtime without restarting the service, which avoids disconnecting active users
- Choose the Reality `dest` and `serverNames` from a popular website (microsoft.com, apple.com) hosted on a different IP than your server, and ensure that site supports TLS 1.3 and HTTP/2
- Enable the stats API with per-user tracking (`statsUserUplink`/`statsUserDownlink`) to monitor bandwidth usage and detect abuse
