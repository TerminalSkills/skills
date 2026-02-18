---
title: Set Up Multi-Protocol Proxy Infrastructure
slug: set-up-multi-protocol-proxy-infrastructure
description: "Deploy a 3-server proxy infrastructure across US, EU, and Asia with WireGuard mesh networking, 3proxy for HTTP/SOCKS5 access, IP rotation, and centralized traffic monitoring."
category: networking
skills: [wireguard, 3proxy]
tags: [wireguard, 3proxy, proxy, vpn, networking, security]
---

# Set Up Multi-Protocol Proxy Infrastructure

Kai runs infrastructure for a 50-person marketing agency with offices in three cities. Remote employees need secure access to internal tools, the SEO team needs rotating proxy IPs for competitive research, and the international team needs reliable internet access from restrictive networks. Instead of paying for expensive commercial proxy services, Kai wants to build their own multi-protocol proxy infrastructure on three VPS servers.

## Prompt

```text
I need to build a proxy/VPN infrastructure across 3 VPS servers (US, EU, Asia) for our agency. Here's what we need:

1. **WireGuard mesh**: Connect all 3 servers into a mesh network so they can communicate privately. Each server should be a peer of the other two. Internal IPs: 10.10.0.1 (US), 10.10.0.2 (EU), 10.10.0.3 (Asia).

2. **WireGuard for employees**: 30 remote employees need VPN access. Split tunnel — only internal tools (10.0.0.0/8) go through VPN, internet stays direct. Auto-provisioning script that generates config + QR code. Assign employees to their nearest server.

3. **3proxy for the SEO team**: HTTP and SOCKS5 proxy on each server with authentication. The SEO team (8 people) gets proxy access for competitive research. Each user gets 50GB/month bandwidth cap. Rotate outgoing IPs if the server has multiple. Log all connections for compliance.

4. **Proxy chaining**: Set up so the EU proxy can chain through the US proxy, giving EU users a US IP when needed. Same for Asia → US chain.

5. **Monitoring dashboard**: Script that shows — connected WireGuard peers per server, 3proxy active connections, bandwidth usage per user, server health.

Give me all the configs for all 3 servers, the provisioning script, and the monitoring setup.
```

## Agent Response

```text
Here's the full 3-server infrastructure. I'll go server by server, then the shared scripts.

## Server Prep (all 3 servers)

apt update && apt install -y wireguard wireguard-tools qrencode 3proxy
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p

## 1. WireGuard Mesh — Server-to-Server

Generate keys on each server:

# On each server:
wg genkey | tee /etc/wireguard/mesh_private.key | wg pubkey > /etc/wireguard/mesh_public.key

### US Server (10.10.0.1) — /etc/wireguard/wg-mesh.conf

[Interface]
Address = 10.10.0.1/24
ListenPort = 51821
PrivateKey = US_MESH_PRIVATE_KEY

[Peer]
# EU Server
PublicKey = EU_MESH_PUBLIC_KEY
Endpoint = EU_SERVER_IP:51821
AllowedIPs = 10.10.0.2/32
PersistentKeepalive = 25

[Peer]
# Asia Server
PublicKey = ASIA_MESH_PUBLIC_KEY
Endpoint = ASIA_SERVER_IP:51821
AllowedIPs = 10.10.0.3/32
PersistentKeepalive = 25

### EU Server (10.10.0.2) — /etc/wireguard/wg-mesh.conf

[Interface]
Address = 10.10.0.2/24
ListenPort = 51821
PrivateKey = EU_MESH_PRIVATE_KEY

[Peer]
# US Server
PublicKey = US_MESH_PUBLIC_KEY
Endpoint = US_SERVER_IP:51821
AllowedIPs = 10.10.0.1/32
PersistentKeepalive = 25

[Peer]
# Asia Server
PublicKey = ASIA_MESH_PUBLIC_KEY
Endpoint = ASIA_SERVER_IP:51821
AllowedIPs = 10.10.0.3/32
PersistentKeepalive = 25

### Asia Server (10.10.0.3) — same pattern

Enable on all servers:

systemctl enable --now wg-quick@wg-mesh
# Test: ping 10.10.0.2 from US server

## 2. WireGuard for Employees

Separate WireGuard interface (wg0) for client access on each server.

### US Server — /etc/wireguard/wg0.conf

[Interface]
Address = 10.20.1.1/24
ListenPort = 51820
PrivateKey = US_CLIENT_PRIVATE_KEY

PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT

# Peers added by provisioning script

### EU Server — same but Address = 10.20.2.1/24
### Asia Server — same but Address = 10.20.3.1/24

### Provisioning script (runs on each server)

#!/bin/bash
# add-employee.sh <name> <region>
set -e
NAME=$1
REGION=${2:-us}  # us, eu, asia

case "$REGION" in
  us)   SERVER_IP="US_PUBLIC_IP";   SUBNET="10.20.1"; SERVER_PUB=$(cat /etc/wireguard/us_client_public.key) ;;
  eu)   SERVER_IP="EU_PUBLIC_IP";   SUBNET="10.20.2"; SERVER_PUB=$(cat /etc/wireguard/eu_client_public.key) ;;
  asia) SERVER_IP="ASIA_PUBLIC_IP"; SUBNET="10.20.3"; SERVER_PUB=$(cat /etc/wireguard/asia_client_public.key) ;;
esac

IFACE="wg0"
CONFIG_DIR=~/employee-configs
mkdir -p "$CONFIG_DIR"

# Find next IP
LAST=$(grep -oP "AllowedIPs = ${SUBNET}\.\K\d+" /etc/wireguard/$IFACE.conf 2>/dev/null | sort -n | tail -1)
NEXT=$(( ${LAST:-1} + 1 ))
IP="${SUBNET}.${NEXT}"

# Generate keys
PRIV=$(wg genkey)
PUB=$(echo "$PRIV" | wg pubkey)
PSK=$(wg genpsk)

# Add to server (live)
wg set "$IFACE" peer "$PUB" preshared-key <(echo "$PSK") allowed-ips "${IP}/32"

# Add to config file
cat >> "/etc/wireguard/$IFACE.conf" <<EOF

# $NAME ($REGION)
[Peer]
PublicKey = $PUB
PresharedKey = $PSK
AllowedIPs = ${IP}/32
EOF

# Generate client config (split tunnel)
cat > "$CONFIG_DIR/${NAME}-${REGION}.conf" <<EOF
[Interface]
PrivateKey = $PRIV
Address = ${IP}/32
DNS = 1.1.1.1

[Peer]
PublicKey = $SERVER_PUB
PresharedKey = $PSK
Endpoint = ${SERVER_IP}:51820
AllowedIPs = 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
PersistentKeepalive = 25
EOF

# QR for mobile
qrencode -t ansiutf8 < "$CONFIG_DIR/${NAME}-${REGION}.conf"
qrencode -t png -o "$CONFIG_DIR/${NAME}-${REGION}-qr.png" < "$CONFIG_DIR/${NAME}-${REGION}.conf"

echo "✅ ${NAME} provisioned on ${REGION} server (${IP})"
echo "Config: $CONFIG_DIR/${NAME}-${REGION}.conf"

Usage:

./add-employee.sh alice us
./add-employee.sh bob eu
./add-employee.sh carol asia

## 3. 3proxy for SEO Team

### US Server — /etc/3proxy/3proxy.cfg

daemon
pidfile /var/run/3proxy.pid

log /var/log/3proxy/3proxy.log D
logformat "L%t %N %p %E %U %C:%c %R:%r %O %I %T"
archiver gz /usr/bin/gzip %F
rotate 90

nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
timeouts 1 5 30 60 180 1800 15 60

maxconn 200
connlim 5 *

# SEO team users
users seo1:CL:proxy_pass_1
users seo2:CL:proxy_pass_2
users seo3:CL:proxy_pass_3
users seo4:CL:proxy_pass_4
users seo5:CL:proxy_pass_5
users seo6:CL:proxy_pass_6
users seo7:CL:proxy_pass_7
users seo8:CL:proxy_pass_8

# Traffic counters — 50GB monthly per user
counter /var/log/3proxy/traffic.counters
countin 53687091200 seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8 * * *
countout 53687091200 seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8 * * *

# Block access to private networks
auth strong
deny * * 127.0.0.0/8 *
deny * * 10.0.0.0/8 *
deny * * 172.16.0.0/12 *
deny * * 192.168.0.0/16 *
allow seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8

# HTTP proxy
proxy -p3128

# SOCKS5 proxy
socks -p1080

### EU and Asia servers — identical config, same users (team uses nearest server)

## 4. Proxy Chaining

### EU → US chain (gives EU users a US IP)

On the EU server, add a second 3proxy config section:

# /etc/3proxy/3proxy.cfg on EU server — append:

# US-chained proxy on port 4128 (HTTP) and port 2080 (SOCKS5)
flush
auth strong
allow seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8

# Route through US server's 3proxy via mesh network
parent 1000 socks5 10.10.0.1 1080 seo1 proxy_pass_1

proxy -p4128
socks -p2080

### Asia → US chain — same pattern on Asia server:

parent 1000 socks5 10.10.0.1 1080 seo1 proxy_pass_1
proxy -p4128
socks -p2080

SEO team usage:
- Direct EU proxy: eu-server:3128 (EU IP)
- Chained US proxy: eu-server:4128 (US IP)
- Direct Asia proxy: asia-server:3128 (Asia IP)
- Chained US from Asia: asia-server:4128 (US IP)

## 5. Monitoring Dashboard

### monitor.sh — run from any server via mesh

#!/bin/bash
# infrastructure-monitor.sh — full status across all servers

SERVERS=("10.10.0.1:US" "10.10.0.2:EU" "10.10.0.3:Asia")

echo "╔══════════════════════════════════════════╗"
echo "║     PROXY INFRASTRUCTURE STATUS          ║"
echo "║     $(date '+%Y-%m-%d %H:%M:%S UTC')              ║"
echo "╚══════════════════════════════════════════╝"

for entry in "${SERVERS[@]}"; do
  IFS=':' read -r ip name <<< "$entry"
  echo ""
  echo "━━━ $name Server ($ip) ━━━"

  # Ping check
  if ping -c1 -W2 "$ip" >/dev/null 2>&1; then
    echo "  Status: ✅ Online"
  else
    echo "  Status: ❌ Unreachable"
    continue
  fi

  # WireGuard peers (via SSH or locally)
  if [ "$ip" = "$(hostname -I | awk '{print $1}')" ]; then
    # Local server
    MESH_PEERS=$(wg show wg-mesh 2>/dev/null | grep -c "peer:")
    CLIENT_PEERS=$(wg show wg0 2>/dev/null | grep -c "latest handshake")
    echo "  Mesh peers: $MESH_PEERS"
    echo "  VPN clients online: $CLIENT_PEERS"

    # WireGuard transfer stats
    echo "  VPN clients:"
    wg show wg0 dump 2>/dev/null | tail -n +2 | while IFS=$'\t' read -r pub psk ep aip hs rx tx ka; do
      [ "$hs" = "0" ] && continue
      age=$(( $(date +%s) - hs ))
      [ $age -gt 180 ] && continue
      name_tag=$(grep -B1 "$pub" /etc/wireguard/wg0.conf | grep "^#" | sed 's/# //')
      rx_mb=$(echo "scale=1; $rx/1048576" | bc 2>/dev/null || echo "?")
      tx_mb=$(echo "scale=1; $tx/1048576" | bc 2>/dev/null || echo "?")
      echo "    ${name_tag:-unknown} | ↓${rx_mb}MB ↑${tx_mb}MB"
    done

    # 3proxy connections
    PROXY_CONNS=$(ss -tnp | grep -c 3proxy || echo 0)
    echo "  3proxy connections: $PROXY_CONNS"

    # Traffic per user
    if [ -f /var/log/3proxy/traffic.counters ]; then
      echo "  3proxy traffic:"
      cat /var/log/3proxy/traffic.counters | while read line; do
        echo "    $line"
      done
    fi

    # Server health
    LOAD=$(uptime | awk -F'load average:' '{print $2}' | xargs)
    MEM=$(free -h | awk '/Mem:/ {printf "%s/%s (%.0f%%)", $3, $2, $3/$2*100}')
    DISK=$(df -h / | awk 'NR==2 {print $3"/"$2" ("$5")"}')
    echo "  Load: $LOAD"
    echo "  Memory: $MEM"
    echo "  Disk: $DISK"
  else
    # Remote server via SSH
    ssh -o ConnectTimeout=3 "root@$ip" '
      MESH=$(wg show wg-mesh 2>/dev/null | grep -c "peer:")
      CLIENTS=$(wg show wg0 2>/dev/null | grep -c "latest handshake")
      PROXY=$(ss -tnp | grep -c 3proxy || echo 0)
      LOAD=$(uptime | awk -F"load average:" "{print \$2}" | xargs)
      echo "  Mesh peers: $MESH"
      echo "  VPN clients: $CLIENTS"
      echo "  3proxy connections: $PROXY"
      echo "  Load: $LOAD"
    ' 2>/dev/null || echo "  SSH failed — check connectivity"
  fi
done

echo ""
echo "━━━ Summary ━━━"
echo "Run this script via cron every 5 min and pipe to a log,"
echo "or expose as a simple web dashboard with a status page."

### Cron for monitoring

# Every 5 minutes, log status
*/5 * * * * /root/monitor.sh >> /var/log/infra-status.log 2>&1

## Firewall (all servers)

# WireGuard
ufw allow 51820/udp  # Client VPN
ufw allow 51821/udp  # Mesh VPN

# 3proxy — only from VPN and known IPs
ufw allow from 10.10.0.0/24 to any port 3128 proto tcp
ufw allow from 10.10.0.0/24 to any port 1080 proto tcp
ufw allow from 10.20.0.0/16 to any port 3128 proto tcp
ufw allow from 10.20.0.0/16 to any port 1080 proto tcp

# Chain ports (internal mesh only)
ufw allow from 10.10.0.0/24 to any port 4128 proto tcp
ufw allow from 10.10.0.0/24 to any port 2080 proto tcp

ufw enable

Start all services on each server:

systemctl enable --now wg-quick@wg-mesh
systemctl enable --now wg-quick@wg0
systemctl enable --now 3proxy

That gives you the full stack: mesh between servers, split-tunnel VPN for 30 employees with QR provisioning, authenticated proxies with bandwidth caps for the SEO team, US-chained proxy from EU and Asia, and a monitoring script. The mesh ensures 3proxy chaining goes over encrypted WireGuard tunnels, not the open internet.
```

Skills used: `wireguard`, `3proxy`
