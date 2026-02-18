---
name: wireguard
description: >-
  Deploy and manage WireGuard VPN tunnels. Use when a user asks to set up
  a WireGuard server, create peer configurations, build mesh networks,
  configure split tunneling, set up site-to-site links, automate peer
  provisioning, integrate with DNS (Pi-hole/AdGuard), manage keys,
  monitor connections, or build WireGuard-based overlay networks.
  Covers server setup, peer management, routing, DNS integration,
  and production deployment patterns.
license: Apache-2.0
compatibility: "Linux kernel 5.6+ (built-in), or wireguard-tools on older kernels"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: networking
  tags: ["wireguard", "vpn", "networking", "tunneling", "security", "mesh"]
---

# WireGuard

## Overview

Deploy WireGuard — the modern, high-performance VPN protocol built into the Linux kernel. Simpler than OpenVPN, faster than IPsec, with a minimal attack surface (~4,000 lines of code). This skill covers server setup, peer management, split tunneling, site-to-site links, mesh topologies, DNS integration (Pi-hole/AdGuard), automated provisioning with QR codes, and monitoring.

## Instructions

### Step 1: Installation & Key Generation

**Install WireGuard:**
```bash
# Ubuntu/Debian (kernel 5.6+ has it built-in)
apt update && apt install -y wireguard wireguard-tools qrencode

# CentOS/RHEL 8+
dnf install -y wireguard-tools

# Verify
wg --version
```

**Generate server keys:**
```bash
umask 077
wg genkey | tee /etc/wireguard/server_private.key | wg pubkey > /etc/wireguard/server_public.key
```

**Generate a peer's keys:**
```bash
wg genkey | tee client1_private.key | wg pubkey > client1_public.key
# Optional: preshared key for post-quantum resistance
wg genpsk > client1_preshared.key
```

### Step 2: Server Configuration

**Create `/etc/wireguard/wg0.conf`:**
```ini
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = SERVER_PRIVATE_KEY
SaveConfig = false

# NAT and forwarding
PostUp = iptables -t nat -A POSTROUTING -s 10.10.0.0/24 -o %i -j MASQUERADE; iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -t nat -D POSTROUTING -s 10.10.0.0/24 -o %i -j MASQUERADE; iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT

# Peer 1 — Alice
[Peer]
PublicKey = ALICE_PUBLIC_KEY
PresharedKey = ALICE_PRESHARED_KEY
AllowedIPs = 10.10.0.2/32

# Peer 2 — Bob
[Peer]
PublicKey = BOB_PUBLIC_KEY
PresharedKey = BOB_PRESHARED_KEY
AllowedIPs = 10.10.0.3/32
```

**Fix PostUp/PostDown** — replace `%i` with actual internet interface:
```bash
IFACE=$(ip route get 1.1.1.1 | awk '{print $5; exit}')
sed -i "s/%i/$IFACE/g" /etc/wireguard/wg0.conf
```

**Enable IP forwarding and start:**
```bash
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p

systemctl enable --now wg-quick@wg0
wg show
```

**Firewall:**
```bash
ufw allow 51820/udp
```

### Step 3: Client/Peer Configuration

**Full tunnel** (all traffic through VPN):
```ini
[Interface]
PrivateKey = CLIENT_PRIVATE_KEY
Address = 10.10.0.2/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = SERVER_PUBLIC_KEY
PresharedKey = PRESHARED_KEY
Endpoint = server.example.com:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
```

**Split tunnel** (only specific networks through VPN):
```ini
[Interface]
PrivateKey = CLIENT_PRIVATE_KEY
Address = 10.10.0.2/32
# No DNS override — use local DNS

[Peer]
PublicKey = SERVER_PUBLIC_KEY
PresharedKey = PRESHARED_KEY
Endpoint = server.example.com:51820
AllowedIPs = 10.10.0.0/24, 10.0.0.0/8, 192.168.0.0/16
PersistentKeepalive = 25
```

**Generate QR code for mobile clients:**
```bash
qrencode -t ansiutf8 < client1.conf
# Or save as PNG:
qrencode -t png -o client1-qr.png < client1.conf
```

### Step 4: Automated Peer Provisioning

```bash
#!/bin/bash
# add-peer.sh — generate keys, add to server, create client config + QR
set -e

PEER_NAME=$1
SERVER_IP="your.server.ip"
SERVER_PORT=51820
SERVER_PUBKEY=$(cat /etc/wireguard/server_public.key)
WG_SUBNET="10.10.0"
CONFIG_DIR=~/wg-clients

if [ -z "$PEER_NAME" ]; then
  echo "Usage: ./add-peer.sh <name>"
  exit 1
fi

mkdir -p "$CONFIG_DIR"

# Find next available IP
LAST_IP=$(grep -oP 'AllowedIPs = 10\.10\.0\.\K\d+' /etc/wireguard/wg0.conf | sort -n | tail -1)
NEXT_IP=$((${LAST_IP:-1} + 1))

# Generate keys
PRIV=$(wg genkey)
PUB=$(echo "$PRIV" | wg pubkey)
PSK=$(wg genpsk)

# Add peer to server (live + config)
wg set wg0 peer "$PUB" preshared-key <(echo "$PSK") allowed-ips "${WG_SUBNET}.${NEXT_IP}/32"

cat >> /etc/wireguard/wg0.conf <<EOF

# ${PEER_NAME}
[Peer]
PublicKey = ${PUB}
PresharedKey = ${PSK}
AllowedIPs = ${WG_SUBNET}.${NEXT_IP}/32
EOF

# Generate client config
cat > "${CONFIG_DIR}/${PEER_NAME}.conf" <<EOF
[Interface]
PrivateKey = ${PRIV}
Address = ${WG_SUBNET}.${NEXT_IP}/32
DNS = 1.1.1.1, 1.0.0.1

[Peer]
PublicKey = ${SERVER_PUBKEY}
PresharedKey = ${PSK}
Endpoint = ${SERVER_IP}:${SERVER_PORT}
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25
EOF

# Generate QR
qrencode -t ansiutf8 < "${CONFIG_DIR}/${PEER_NAME}.conf"
qrencode -t png -o "${CONFIG_DIR}/${PEER_NAME}-qr.png" < "${CONFIG_DIR}/${PEER_NAME}.conf"

echo ""
echo "✅ Peer added: ${PEER_NAME} (${WG_SUBNET}.${NEXT_IP})"
echo "Config: ${CONFIG_DIR}/${PEER_NAME}.conf"
echo "QR:     ${CONFIG_DIR}/${PEER_NAME}-qr.png"
```

**Remove a peer:**
```bash
#!/bin/bash
# remove-peer.sh
PEER_PUB=$1
wg set wg0 peer "$PEER_PUB" remove
# Also remove from wg0.conf manually or with sed
```

### Step 5: Site-to-Site VPN

**Office A (server, LAN: 192.168.1.0/24):**
```ini
[Interface]
Address = 10.10.0.1/24
ListenPort = 51820
PrivateKey = OFFICE_A_PRIVATE

PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT

[Peer]
# Office B
PublicKey = OFFICE_B_PUBLIC
Endpoint = office-b.example.com:51820
AllowedIPs = 10.10.0.2/32, 192.168.2.0/24
PersistentKeepalive = 25
```

**Office B (client, LAN: 192.168.2.0/24):**
```ini
[Interface]
Address = 10.10.0.2/24
ListenPort = 51820
PrivateKey = OFFICE_B_PRIVATE

PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT

[Peer]
# Office A
PublicKey = OFFICE_A_PUBLIC
Endpoint = office-a.example.com:51820
AllowedIPs = 10.10.0.1/32, 192.168.1.0/24
PersistentKeepalive = 25
```

Both offices need IP forwarding enabled and routes for the remote LAN.

### Step 6: Mesh Network

For a full mesh with N nodes, each node peers with every other:

```bash
#!/bin/bash
# generate-mesh.sh — creates configs for N-node mesh
NODES=("node1:1.1.1.1" "node2:2.2.2.2" "node3:3.3.3.3")
BASE_IP="10.10.0"
PORT=51820

for i in "${!NODES[@]}"; do
  IFS=':' read -r name endpoint <<< "${NODES[$i]}"
  IP="${BASE_IP}.$((i+1))"

  PRIV=$(wg genkey)
  PUB=$(echo "$PRIV" | wg pubkey)
  eval "${name}_priv=$PRIV"
  eval "${name}_pub=$PUB"
  eval "${name}_ip=$IP"
  eval "${name}_endpoint=$endpoint"
done

for i in "${!NODES[@]}"; do
  IFS=':' read -r name _ <<< "${NODES[$i]}"
  eval "MY_PRIV=\${${name}_priv}"
  eval "MY_IP=\${${name}_ip}"

  cat > "mesh-${name}.conf" <<EOF
[Interface]
PrivateKey = $MY_PRIV
Address = ${MY_IP}/24
ListenPort = $PORT
EOF

  for j in "${!NODES[@]}"; do
    [ "$i" = "$j" ] && continue
    IFS=':' read -r pname _ <<< "${NODES[$j]}"
    eval "PEER_PUB=\${${pname}_pub}"
    eval "PEER_IP=\${${pname}_ip}"
    eval "PEER_EP=\${${pname}_endpoint}"

    cat >> "mesh-${name}.conf" <<EOF

[Peer]
PublicKey = $PEER_PUB
Endpoint = ${PEER_EP}:${PORT}
AllowedIPs = ${PEER_IP}/32
PersistentKeepalive = 25
EOF
  done

  echo "Generated: mesh-${name}.conf"
done
```

### Step 7: DNS Integration (Pi-hole / AdGuard)

Run Pi-hole or AdGuard Home alongside WireGuard for ad-blocking + DNS:

**Server-side — push VPN DNS:**
```ini
# In client config or pushed via wg
DNS = 10.10.0.1
```

**Install Pi-hole on the WireGuard server:**
```bash
curl -sSL https://install.pi-hole.net | bash
# Set Pi-hole to listen on wg0 interface
# Edit /etc/pihole/setupVars.conf:
# PIHOLE_INTERFACE=wg0
pihole -a -i wg0
```

**AdGuard Home alternative:**
```bash
curl -s -S -L https://raw.githubusercontent.com/AdguardTeam/AdGuardHome/master/scripts/install.sh | sh -s -- -v
# Configure to listen on 10.10.0.1:53
```

### Step 8: Monitoring

**Show active peers and transfer stats:**
```bash
wg show
# Output:
# peer: ABC123...
#   endpoint: 1.2.3.4:54321
#   allowed ips: 10.10.0.2/32
#   latest handshake: 32 seconds ago
#   transfer: 1.42 GiB received, 356.78 MiB sent
```

**Monitoring script:**
```bash
#!/bin/bash
# wg-status.sh
echo "=== WireGuard Peers ==="
wg show wg0 dump | tail -n +2 | while IFS=$'\t' read -r pub psk ep aip hs rx tx ka; do
  # Find peer name from config
  name=$(grep -B1 "$pub" /etc/wireguard/wg0.conf | grep "^#" | sed 's/# //')
  name=${name:-"Unknown"}
  
  if [ "$hs" = "0" ]; then
    status="never connected"
  else
    age=$(( $(date +%s) - hs ))
    if [ $age -lt 180 ]; then
      status="online (${age}s ago)"
    else
      status="offline ($(( age / 60 ))m ago)"
    fi
  fi
  
  rx_mb=$(echo "scale=1; $rx/1048576" | bc)
  tx_mb=$(echo "scale=1; $tx/1048576" | bc)
  
  echo "  $name | $ep | $status | ↓${rx_mb}MB ↑${tx_mb}MB"
done
```

**Prometheus exporter:**
```bash
# Install wireguard_exporter
# https://github.com/MindFlavor/prometheus_wireguard_exporter
# Exposes metrics on :9586/metrics
```

### Step 9: Performance Tuning

```bash
# Increase UDP buffer sizes
sysctl -w net.core.rmem_max=2500000
sysctl -w net.core.wmem_max=2500000

# Set MTU (default 1420, adjust for your network)
# In [Interface]:
MTU = 1380  # For networks with extra encapsulation

# Enable BBR congestion control
echo "net.core.default_qdisc = fq" >> /etc/sysctl.conf
echo "net.ipv4.tcp_congestion_control = bbr" >> /etc/sysctl.conf
sysctl -p
```

**WireGuard vs OpenVPN performance:**
- WireGuard: ~800-900 Mbps throughput (kernel-space)
- OpenVPN: ~300-400 Mbps throughput (user-space)
- WireGuard uses ~50% less CPU for same throughput
