---
title: Set Up Multi-Protocol Proxy Infrastructure
slug: set-up-multi-protocol-proxy-infrastructure
description: "Deploy a 3-server proxy infrastructure across US, EU, and Asia with WireGuard mesh networking, 3proxy for HTTP/SOCKS5 access, IP rotation, and centralized traffic monitoring."
category: devops
skills: [wireguard, 3proxy]
tags: [wireguard, 3proxy, proxy, vpn, networking, security]
---

# Set Up Multi-Protocol Proxy Infrastructure

## The Problem

A 50-person marketing agency with offices in three cities faces several networking challenges at once. Remote employees need secure access to internal tools, the SEO team needs rotating proxy IPs for competitive research, and the international team needs reliable internet access from restrictive networks. Commercial proxy services are expensive and inflexible, and managing separate VPN and proxy solutions creates operational overhead. The agency needs a unified, self-hosted infrastructure spanning multiple regions that handles VPN access, authenticated proxies with bandwidth caps, proxy chaining for geographic flexibility, and centralized monitoring -- all on three VPS servers.

## The Solution

Build a multi-layer proxy and VPN infrastructure across three VPS servers (US, EU, Asia) using WireGuard for encrypted mesh networking and employee VPN access, and 3proxy for authenticated HTTP/SOCKS5 proxy services. The servers form a private mesh so proxy chaining travels over encrypted tunnels. A provisioning script automates employee onboarding with QR codes, and a monitoring dashboard tracks connections, bandwidth, and server health across the fleet.

## Step-by-Step Walkthrough

### Step 1: Prepare All Three Servers

```bash
# Run on all 3 servers (US, EU, Asia)
apt update && apt install -y wireguard wireguard-tools qrencode 3proxy

# Enable packet forwarding so servers can route traffic
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p
```

### Step 2: Create the WireGuard Mesh Network

Generate mesh keys on each server, then configure peer-to-peer connections.

```bash
# Run on each server to generate its mesh keypair
wg genkey | tee /etc/wireguard/mesh_private.key | wg pubkey > /etc/wireguard/mesh_public.key
```

US Server (`/etc/wireguard/wg-mesh.conf`) -- EU and Asia follow the same pattern with their own addresses:

```ini
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
```

EU Server uses `Address = 10.10.0.2/24` with US and Asia as peers. Asia Server uses `Address = 10.10.0.3/24` with US and EU as peers.

```bash
# Enable on all servers and verify
systemctl enable --now wg-quick@wg-mesh
ping 10.10.0.2  # From US, should reach EU
```

### Step 3: Set Up WireGuard VPN for Employees

Create a separate interface (`wg0`) on each server for client access. Each region gets its own subnet.

US Server (`/etc/wireguard/wg0.conf`):

```ini
[Interface]
Address = 10.20.1.1/24
ListenPort = 51820
PrivateKey = US_CLIENT_PRIVATE_KEY

# Forward traffic from VPN clients
PostUp = iptables -A FORWARD -i wg0 -j ACCEPT; iptables -A FORWARD -o wg0 -j ACCEPT
PostDown = iptables -D FORWARD -i wg0 -j ACCEPT; iptables -D FORWARD -o wg0 -j ACCEPT
# Peers added by provisioning script
```

EU uses `Address = 10.20.2.1/24`, Asia uses `Address = 10.20.3.1/24`.

### Step 4: Create the Employee Provisioning Script

Generates a WireGuard config and QR code per employee with split tunneling -- only internal traffic routes through VPN.

```bash
#!/bin/bash
# add-employee.sh <name> <region>
# region: us, eu, or asia (defaults to us)
set -e
NAME=$1
REGION=${2:-us}

# Map region to server details
case "$REGION" in
  us)   SERVER_IP="US_PUBLIC_IP";   SUBNET="10.20.1"; SERVER_PUB=$(cat /etc/wireguard/us_client_public.key) ;;
  eu)   SERVER_IP="EU_PUBLIC_IP";   SUBNET="10.20.2"; SERVER_PUB=$(cat /etc/wireguard/eu_client_public.key) ;;
  asia) SERVER_IP="ASIA_PUBLIC_IP"; SUBNET="10.20.3"; SERVER_PUB=$(cat /etc/wireguard/asia_client_public.key) ;;
esac

IFACE="wg0"
CONFIG_DIR=~/employee-configs
mkdir -p "$CONFIG_DIR"

# Find the next available IP in this subnet
LAST=$(grep -oP "AllowedIPs = ${SUBNET}\.\K\d+" /etc/wireguard/$IFACE.conf 2>/dev/null | sort -n | tail -1)
NEXT=$(( ${LAST:-1} + 1 ))
IP="${SUBNET}.${NEXT}"

# Generate client keypair and preshared key
PRIV=$(wg genkey)
PUB=$(echo "$PRIV" | wg pubkey)
PSK=$(wg genpsk)

# Add peer to running interface and persist to config
wg set "$IFACE" peer "$PUB" preshared-key <(echo "$PSK") allowed-ips "${IP}/32"
cat >> "/etc/wireguard/$IFACE.conf" <<EOF

# $NAME ($REGION)
[Peer]
PublicKey = $PUB
PresharedKey = $PSK
AllowedIPs = ${IP}/32
EOF

# Generate client config (split tunnel: only private ranges through VPN)
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

# Generate QR code for mobile clients
qrencode -t ansiutf8 < "$CONFIG_DIR/${NAME}-${REGION}.conf"
qrencode -t png -o "$CONFIG_DIR/${NAME}-${REGION}-qr.png" < "$CONFIG_DIR/${NAME}-${REGION}.conf"
echo "Done: ${NAME} provisioned on ${REGION} (${IP})"
```

Provision employees by assigning them to their nearest server:

```bash
./add-employee.sh alice us
./add-employee.sh bob eu
./add-employee.sh carol asia
```

### Step 5: Configure 3proxy for the SEO Team

Authenticated HTTP and SOCKS5 proxy with 50 GB monthly bandwidth caps per user. Deploy the same config on all three servers.

```properties
# /etc/3proxy/3proxy.cfg
daemon
pidfile /var/run/3proxy.pid

# Daily log rotation, keep 90 days
log /var/log/3proxy/3proxy.log D
logformat "L%t %N %p %E %U %C:%c %R:%r %O %I %T"
archiver gz /usr/bin/gzip %F
rotate 90

# DNS and timeouts
nserver 1.1.1.1
nserver 8.8.8.8
nscache 65536
timeouts 1 5 30 60 180 1800 15 60

maxconn 200
connlim 5 *

# SEO team credentials (username:cleartext:password)
users seo1:CL:proxy_pass_1
users seo2:CL:proxy_pass_2
users seo3:CL:proxy_pass_3
users seo4:CL:proxy_pass_4
users seo5:CL:proxy_pass_5
users seo6:CL:proxy_pass_6
users seo7:CL:proxy_pass_7
users seo8:CL:proxy_pass_8

# 50 GB monthly cap per user (53687091200 bytes)
counter /var/log/3proxy/traffic.counters
countin 53687091200 seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8 * * *
countout 53687091200 seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8 * * *

# Require auth, block access to private networks
auth strong
deny * * 127.0.0.0/8 *
deny * * 10.0.0.0/8 *
deny * * 172.16.0.0/12 *
deny * * 192.168.0.0/16 *
allow seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8

proxy -p3128   # HTTP proxy
socks -p1080   # SOCKS5 proxy
```

### Step 6: Set Up Proxy Chaining

Allow EU and Asia servers to chain through the US server for a US IP. Traffic travels over the encrypted WireGuard mesh.

Append to EU server's `/etc/3proxy/3proxy.cfg` (same block on Asia server):

```properties
# Chained proxy: routes through US server's SOCKS5 over mesh
flush
auth strong
allow seo1,seo2,seo3,seo4,seo5,seo6,seo7,seo8

parent 1000 socks5 10.10.0.1 1080 seo1 proxy_pass_1

proxy -p4128   # Chained HTTP (US IP)
socks -p2080   # Chained SOCKS5 (US IP)
```

The SEO team now has four proxy endpoints:

- `eu-server:3128` -- direct EU IP
- `eu-server:4128` -- chained through US (US IP)
- `asia-server:3128` -- direct Asia IP
- `asia-server:4128` -- chained through US (US IP)

### Step 7: Configure Firewalls

Lock down each server so proxy ports are only accessible from VPN and mesh networks.

```bash
# WireGuard ports (open for client connections)
ufw allow 51820/udp  # Client VPN
ufw allow 51821/udp  # Server mesh

# 3proxy ports (VPN and mesh peers only)
ufw allow from 10.10.0.0/24 to any port 3128 proto tcp
ufw allow from 10.10.0.0/24 to any port 1080 proto tcp
ufw allow from 10.20.0.0/16 to any port 3128 proto tcp
ufw allow from 10.20.0.0/16 to any port 1080 proto tcp

# Chain ports (mesh traffic only)
ufw allow from 10.10.0.0/24 to any port 4128 proto tcp
ufw allow from 10.10.0.0/24 to any port 2080 proto tcp

ufw enable
```

### Step 8: Build the Monitoring Script

Checks WireGuard peers, 3proxy connections, bandwidth, and server health across all servers via the mesh.

```bash
#!/bin/bash
# infrastructure-monitor.sh — Run from any server in the mesh
SERVERS=("10.10.0.1:US" "10.10.0.2:EU" "10.10.0.3:Asia")

echo "=== PROXY INFRASTRUCTURE STATUS $(date '+%Y-%m-%d %H:%M') ==="

for entry in "${SERVERS[@]}"; do
  IFS=':' read -r ip name <<< "$entry"
  echo ""
  echo "--- $name Server ($ip) ---"

  if ! ping -c1 -W2 "$ip" >/dev/null 2>&1; then
    echo "  UNREACHABLE"; continue
  fi

  if [ "$ip" = "$(hostname -I | awk '{print $1}')" ]; then
    # Local: gather stats directly
    echo "  Mesh peers: $(wg show wg-mesh 2>/dev/null | grep -c 'peer:')"
    echo "  VPN clients: $(wg show wg0 2>/dev/null | grep -c 'latest handshake')"
    echo "  3proxy conns: $(ss -tnp | grep -c 3proxy || echo 0)"

    # Per-client bandwidth for recently active peers
    wg show wg0 dump 2>/dev/null | tail -n +2 | while IFS=$'\t' read -r pub psk ep aip hs rx tx ka; do
      [ "$hs" = "0" ] && continue
      [ $(( $(date +%s) - hs )) -gt 180 ] && continue
      tag=$(grep -B1 "$pub" /etc/wireguard/wg0.conf | grep "^#" | sed 's/# //')
      rx_mb=$(echo "scale=1; $rx/1048576" | bc 2>/dev/null || echo "?")
      tx_mb=$(echo "scale=1; $tx/1048576" | bc 2>/dev/null || echo "?")
      echo "    ${tag:-unknown} | down:${rx_mb}MB up:${tx_mb}MB"
    done

    # Server health
    echo "  Load: $(uptime | awk -F'load average:' '{print $2}' | xargs)"
    echo "  Memory: $(free -h | awk '/Mem:/ {printf "%s/%s (%.0f%%)", $3, $2, $3/$2*100}')"
    echo "  Disk: $(df -h / | awk 'NR==2 {print $3"/"$2" ("$5")"}')"
  else
    # Remote: gather stats via SSH over mesh
    ssh -o ConnectTimeout=3 "root@$ip" '
      echo "  Mesh peers: $(wg show wg-mesh 2>/dev/null | grep -c "peer:")"
      echo "  VPN clients: $(wg show wg0 2>/dev/null | grep -c "latest handshake")"
      echo "  3proxy conns: $(ss -tnp | grep -c 3proxy || echo 0)"
      echo "  Load: $(uptime | awk -F"load average:" "{print \$2}" | xargs)"
    ' 2>/dev/null || echo "  SSH failed"
  fi
done
```

Schedule it via cron for continuous monitoring:

```bash
*/5 * * * * /root/monitor.sh >> /var/log/infra-status.log 2>&1
```

### Step 9: Enable All Services

```bash
# Run on all 3 servers
systemctl enable --now wg-quick@wg-mesh
systemctl enable --now wg-quick@wg0
systemctl enable --now 3proxy
```

## Real-World Example

Kai provisions the infrastructure on three Hetzner VPS instances. After deploying the WireGuard mesh configs, a ping from the US server to `10.10.0.2` confirms the EU link is live at 85ms latency.

Kai runs the provisioning script 30 times to onboard every employee. Each person gets a `.conf` file and a QR code PNG. The split-tunnel config means web browsing goes direct through their home ISP, but requests to `10.x.x.x` route through WireGuard to internal tools like the company wiki and staging servers.

The SEO team configures their browsers with proxy credentials. For standard research, they use their nearest server's port 3128. When they need a US IP for geo-targeted search results from Europe, they switch to port 4128 on the EU server, which chains through the US server over the encrypted mesh. The 50 GB monthly cap keeps bandwidth costs predictable, and daily-rotated logs satisfy compliance requirements.

Every 5 minutes, the monitoring cron job SSHes into the EU and Asia boxes over the mesh, collects WireGuard peer counts, 3proxy stats, and system health, and appends everything to a log. When a VPN connection drops or 3proxy hits its connection limit, the issue shows up within minutes.
