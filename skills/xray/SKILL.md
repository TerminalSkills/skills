---
name: xray
description: >-
  Deploy and configure Xray proxy servers. Use when a user asks to set up
  VLESS, VMess, Trojan, or Shadowsocks proxies, configure Reality or TLS
  transport, deploy Xray with XTLS, set up fallback routing, manage multi-user
  access, configure traffic routing rules, set up CDN-based tunneling,
  build subscription links for client apps, monitor Xray traffic, or bypass
  network restrictions. Covers all major Xray protocols, transports, and
  deployment patterns.
license: Apache-2.0
compatibility: "Linux (any distro), Xray-core 1.8+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: networking
  tags: ["xray", "vless", "vmess", "trojan", "proxy", "reality", "xtls", "networking"]
---

# Xray

## Overview

Deploy and configure Xray-core — the advanced proxy platform supporting VLESS, VMess, Trojan, and Shadowsocks protocols with modern transports like Reality, XTLS-Vision, WebSocket, gRPC, and HTTP/2. This skill covers server deployment, protocol selection, TLS/Reality configuration, traffic routing, multi-user management, CDN integration, client configuration, and monitoring.

## Instructions

### Step 1: Installation

**Install Xray-core:**
```bash
# Official install script
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# Verify
xray version

# Files:
# Binary: /usr/local/bin/xray
# Config: /usr/local/etc/xray/config.json
# Logs: /var/log/xray/
```

**Generate UUIDs for users:**
```bash
xray uuid
# Example: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Generate X25519 keys (for Reality):**
```bash
xray x25519
# Output:
# Private key: ABC123...
# Public key:  XYZ789...
```

### Step 2: VLESS + Reality (Recommended)

The most secure and undetectable setup. Reality eliminates the need for domain/TLS certificates — it mimics a real HTTPS website's TLS handshake.

**Server config (`/usr/local/etc/xray/config.json`):**
```json
{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log"
  },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "YOUR-UUID-HERE",
            "flow": "xtls-rprx-vision",
            "email": "user1@proxy"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "tcp",
        "security": "reality",
        "realitySettings": {
          "show": false,
          "dest": "www.microsoft.com:443",
          "xver": 0,
          "serverNames": [
            "www.microsoft.com",
            "microsoft.com"
          ],
          "privateKey": "YOUR-PRIVATE-KEY",
          "shortIds": [
            "",
            "0123456789abcdef"
          ]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    {
      "protocol": "freedom",
      "tag": "direct"
    },
    {
      "protocol": "blackhole",
      "tag": "block"
    }
  ],
  "routing": {
    "rules": [
      {
        "type": "field",
        "ip": ["geoip:private"],
        "outboundTag": "block"
      }
    ]
  }
}
```

**Client connection string (share link):**
```
vless://UUID@SERVER_IP:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=PUBLIC_KEY&sid=0123456789abcdef&type=tcp#MyProxy
```

**Start:**
```bash
systemctl enable --now xray
systemctl status xray
journalctl -u xray -f
```

### Step 3: VLESS + WebSocket + TLS (CDN-Compatible)

For routing through CDN (Cloudflare) to hide the server IP:

**Prerequisites:**
- Domain pointing to Cloudflare
- Cloudflare proxying enabled (orange cloud)
- Origin certificate or Let's Encrypt on the server

**Get TLS certificate:**
```bash
apt install -y certbot
certbot certonly --standalone -d proxy.yourdomain.com
```

**Server config:**
```json
{
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "YOUR-UUID",
            "email": "user1@proxy"
          }
        ],
        "decryption": "none",
        "fallbacks": [
          {
            "dest": 8080
          },
          {
            "path": "/ws-path",
            "dest": 8443,
            "xver": 1
          }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "tls",
        "tlsSettings": {
          "certificates": [
            {
              "certificateFile": "/etc/letsencrypt/live/proxy.yourdomain.com/fullchain.pem",
              "keyFile": "/etc/letsencrypt/live/proxy.yourdomain.com/privkey.pem"
            }
          ],
          "alpn": ["h2", "http/1.1"]
        }
      }
    },
    {
      "listen": "127.0.0.1",
      "port": 8443,
      "protocol": "vless",
      "settings": {
        "clients": [
          {
            "id": "YOUR-UUID",
            "email": "user1@ws"
          }
        ],
        "decryption": "none"
      },
      "streamSettings": {
        "network": "ws",
        "wsSettings": {
          "path": "/ws-path"
        }
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ]
}
```

**Fallback web server** (nginx on port 8080 — serves a real website when non-proxy traffic hits):
```nginx
server {
    listen 8080;
    server_name proxy.yourdomain.com;
    root /var/www/html;
    index index.html;
}
```

**Cloudflare settings:**
- SSL/TLS → Full (Strict)
- Network → WebSockets: ON
- DNS → A record: server IP, proxied (orange cloud)

### Step 4: VMess + gRPC

High-performance transport, works through CDN with gRPC support:

```json
{
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vmess",
      "settings": {
        "clients": [
          {
            "id": "YOUR-UUID",
            "alterId": 0,
            "email": "user1@grpc"
          }
        ]
      },
      "streamSettings": {
        "network": "grpc",
        "security": "tls",
        "tlsSettings": {
          "certificates": [
            {
              "certificateFile": "/etc/letsencrypt/live/proxy.yourdomain.com/fullchain.pem",
              "keyFile": "/etc/letsencrypt/live/proxy.yourdomain.com/privkey.pem"
            }
          ]
        },
        "grpcSettings": {
          "serviceName": "grpc-service",
          "multiMode": true
        }
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" }
  ]
}
```

**Note:** Always use `alterId: 0` for VMess — it enables AEAD encryption (mandatory in modern Xray).

### Step 5: Trojan Protocol

Compatible with Trojan-Go clients. Looks like normal HTTPS traffic:

```json
{
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "trojan",
      "settings": {
        "clients": [
          {
            "password": "your-strong-password",
            "email": "user1@trojan"
          }
        ],
        "fallbacks": [
          { "dest": 8080 }
        ]
      },
      "streamSettings": {
        "network": "tcp",
        "security": "tls",
        "tlsSettings": {
          "certificates": [
            {
              "certificateFile": "/etc/letsencrypt/live/proxy.yourdomain.com/fullchain.pem",
              "keyFile": "/etc/letsencrypt/live/proxy.yourdomain.com/privkey.pem"
            }
          ],
          "alpn": ["h2", "http/1.1"]
        }
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" }
  ]
}
```

### Step 6: Shadowsocks (2022 Edition)

Modern Shadowsocks with AEAD-2022 ciphers:

```json
{
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": 8388,
      "protocol": "shadowsocks",
      "settings": {
        "method": "2022-blake3-aes-128-gcm",
        "password": "BASE64_16_BYTE_KEY",
        "network": "tcp,udp"
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" }
  ]
}
```

**Generate a valid key:**
```bash
openssl rand -base64 16
# For aes-256: openssl rand -base64 32
```

### Step 7: Multi-User Management

**Multiple users on one inbound:**
```json
"clients": [
  { "id": "uuid-1", "email": "alice@proxy", "flow": "xtls-rprx-vision" },
  { "id": "uuid-2", "email": "bob@proxy", "flow": "xtls-rprx-vision" },
  { "id": "uuid-3", "email": "carol@proxy", "flow": "xtls-rprx-vision" }
]
```

**Per-user traffic stats** (enable stats):
```json
{
  "stats": {},
  "policy": {
    "levels": {
      "0": {
        "statsUserUplink": true,
        "statsUserDownlink": true
      }
    },
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true,
      "statsOutboundUplink": true,
      "statsOutboundDownlink": true
    }
  },
  "api": {
    "tag": "api",
    "services": ["StatsService", "HandlerService"]
  },
  "inbounds": [
    {
      "listen": "127.0.0.1",
      "port": 10085,
      "protocol": "dokodemo-door",
      "settings": { "address": "127.0.0.1" },
      "tag": "api"
    }
  ],
  "routing": {
    "rules": [
      { "type": "field", "inboundTag": ["api"], "outboundTag": "api" }
    ]
  }
}
```

**Query traffic stats:**
```bash
# Total traffic for a user
xray api stats --server=127.0.0.1:10085 -name "user>>>alice@proxy>>>traffic>>>uplink"
xray api stats --server=127.0.0.1:10085 -name "user>>>alice@proxy>>>traffic>>>downlink"

# All stats
xray api stats --server=127.0.0.1:10085

# Reset stats
xray api stats --server=127.0.0.1:10085 -name "user>>>alice@proxy>>>traffic>>>uplink" -reset
```

**Add/remove users at runtime** (no restart needed):
```bash
# Add user
xray api adi --server=127.0.0.1:10085 \
  --inbound-tag proxy \
  --id "new-uuid" \
  --email "newuser@proxy" \
  --flow "xtls-rprx-vision"

# Remove user
xray api rmi --server=127.0.0.1:10085 \
  --inbound-tag proxy \
  --email "olduser@proxy"
```

### Step 8: Traffic Routing Rules

**Route by domain/IP/geo:**
```json
{
  "routing": {
    "domainStrategy": "IPIfNonMatch",
    "rules": [
      {
        "type": "field",
        "domain": ["geosite:category-ads-all"],
        "outboundTag": "block"
      },
      {
        "type": "field",
        "ip": ["geoip:private"],
        "outboundTag": "block"
      },
      {
        "type": "field",
        "domain": ["geosite:cn"],
        "outboundTag": "direct"
      },
      {
        "type": "field",
        "ip": ["geoip:cn"],
        "outboundTag": "direct"
      },
      {
        "type": "field",
        "network": "tcp,udp",
        "outboundTag": "proxy"
      }
    ]
  }
}
```

**Chain proxies** (double hop):
```json
{
  "outbounds": [
    {
      "tag": "proxy-hop2",
      "protocol": "vless",
      "settings": {
        "vnext": [{ "address": "server2.com", "port": 443, "users": [{ "id": "uuid-2", "flow": "xtls-rprx-vision" }] }]
      },
      "streamSettings": { "network": "tcp", "security": "reality" },
      "proxySettings": { "tag": "proxy-hop1" }
    },
    {
      "tag": "proxy-hop1",
      "protocol": "vless",
      "settings": {
        "vnext": [{ "address": "server1.com", "port": 443, "users": [{ "id": "uuid-1" }] }]
      },
      "streamSettings": { "network": "ws", "wsSettings": { "path": "/ws" }, "security": "tls" }
    }
  ]
}
```

### Step 9: Subscription & Client Config Generation

**Generate subscription links for client apps** (v2rayNG, Hiddify, Streisand):

```bash
#!/bin/bash
# generate-sub.sh — create base64 subscription for clients
SERVER="your.server.ip"
PORT=443
UUID="your-uuid"
PBK="your-public-key"
SID="0123456789abcdef"
SNI="www.microsoft.com"

# VLESS Reality link
LINK="vless://${UUID}@${SERVER}:${PORT}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=${SNI}&fp=chrome&pbk=${PBK}&sid=${SID}&type=tcp#MyVPN"

echo "$LINK" | base64 -w 0 > /var/www/html/sub.txt
echo "Subscription URL: https://yourdomain.com/sub.txt"
```

**Multi-user subscription server** (Node.js):
```javascript
const http = require("http");

const users = {
  alice: { uuid: "uuid-1", name: "Alice-VPN" },
  bob: { uuid: "uuid-2", name: "Bob-VPN" },
};

const SERVER = "your.server.ip";
const PBK = "your-public-key";

http.createServer((req, res) => {
  const token = req.url.replace("/sub/", "");
  const user = users[token];

  if (!user) {
    res.writeHead(404);
    return res.end("Not found");
  }

  const link = `vless://${user.uuid}@${SERVER}:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=${PBK}&sid=0123456789abcdef&type=tcp#${user.name}`;

  res.writeHead(200, {
    "Content-Type": "text/plain",
    "Subscription-Userinfo": "upload=0; download=0; total=107374182400; expire=1735689600",
  });
  res.end(Buffer.from(link).toString("base64"));
}).listen(8080);
```

### Step 10: Monitoring & Troubleshooting

**Check Xray is running:**
```bash
systemctl status xray
ss -tlnp | grep xray
```

**Test connectivity from client:**
```bash
curl -x socks5://127.0.0.1:1080 https://ifconfig.me
```

**Log analysis:**
```bash
# Real-time logs
journalctl -u xray -f

# Count connections by user
grep "accepted" /var/log/xray/access.log | awk '{print $3}' | sort | uniq -c | sort -rn

# Failed connections
grep "rejected" /var/log/xray/access.log | tail -20
```

**Auto-update Xray:**
```bash
# Cron: check weekly
0 3 * * 1 bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install
```

**Firewall:**
```bash
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
```
