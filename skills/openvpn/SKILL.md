---
name: openvpn
description: >-
  Deploy and manage OpenVPN servers and clients. Use when a user asks to set up
  a VPN server, create client certificates, configure site-to-site tunnels,
  set up split tunneling, manage PKI with EasyRSA, harden OpenVPN security,
  automate client provisioning, configure routing and NAT, set up MFA for VPN,
  monitor connected clients, or troubleshoot VPN connectivity. Covers server
  deployment, PKI management, client configuration, and production hardening.
license: Apache-2.0
compatibility: "Linux (Ubuntu/Debian, CentOS/RHEL), OpenVPN 2.5+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: networking
  tags: ["openvpn", "vpn", "networking", "security", "pki", "tunneling"]
---

# OpenVPN

## Overview

Deploy and manage OpenVPN — the industry-standard open-source VPN. This skill covers full server setup with PKI (EasyRSA), client certificate management, routing modes (TUN/TAP), split tunneling, site-to-site links, MFA integration, performance tuning, and monitoring. Suitable for remote access VPN, connecting offices, and securing traffic on untrusted networks.

## Instructions

### Step 1: Server Installation & PKI Setup

**Install OpenVPN and EasyRSA:**
```bash
# Ubuntu/Debian
apt update && apt install -y openvpn easy-rsa

# CentOS/RHEL
yum install -y epel-release && yum install -y openvpn easy-rsa
```

**Initialize the PKI (Public Key Infrastructure):**
```bash
# Create EasyRSA directory
make-cadir ~/openvpn-ca && cd ~/openvpn-ca

# Edit vars for your org
cat > vars <<'EOF'
set_var EASYRSA_REQ_COUNTRY    "US"
set_var EASYRSA_REQ_PROVINCE   "California"
set_var EASYRSA_REQ_CITY       "San Francisco"
set_var EASYRSA_REQ_ORG        "MyCompany"
set_var EASYRSA_REQ_EMAIL      "admin@company.com"
set_var EASYRSA_REQ_OU         "IT"
set_var EASYRSA_KEY_SIZE       2048
set_var EASYRSA_ALGO           ec
set_var EASYRSA_CURVE          secp384r1
set_var EASYRSA_CA_EXPIRE      3650
set_var EASYRSA_CERT_EXPIRE    825
set_var EASYRSA_CRL_DAYS       180
EOF

# Initialize PKI and build CA
./easyrsa init-pki
./easyrsa build-ca nopass
# Enter CA common name when prompted, e.g., "MyCompany-CA"
```

**Generate server certificate and key:**
```bash
./easyrsa gen-req server nopass
./easyrsa sign-req server server

# Generate Diffie-Hellman parameters (for non-EC setups)
./easyrsa gen-dh

# Generate TLS auth key (HMAC firewall)
openvpn --genkey secret ta.key
```

**Copy files to OpenVPN directory:**
```bash
cp pki/ca.crt /etc/openvpn/server/
cp pki/issued/server.crt /etc/openvpn/server/
cp pki/private/server.key /etc/openvpn/server/
cp pki/dh.pem /etc/openvpn/server/
cp ta.key /etc/openvpn/server/
```

### Step 2: Server Configuration

**Create `/etc/openvpn/server/server.conf`:**
```ini
# Network
port 1194
proto udp
dev tun

# Certificates
ca ca.crt
cert server.crt
key server.key
dh dh.pem
tls-auth ta.key 0

# Network topology
server 10.8.0.0 255.255.255.0
topology subnet

# Push routes and DNS to clients
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 1.1.1.1"
push "dhcp-option DNS 1.0.0.1"

# Keep connections alive
keepalive 10 120

# Security
cipher AES-256-GCM
auth SHA384
tls-version-min 1.2
tls-cipher TLS-ECDHE-ECDSA-WITH-AES-256-GCM-SHA384

# Reduce privileges after init
user nobody
group nogroup
persist-key
persist-tun

# Logging
status /var/log/openvpn/status.log
log-append /var/log/openvpn/openvpn.log
verb 3
mute 20

# Client management
client-to-client
max-clients 100
ifconfig-pool-persist /etc/openvpn/server/ipp.txt

# CRL for revoking clients
crl-verify /etc/openvpn/server/crl.pem
```

**Enable IP forwarding and NAT:**
```bash
# Enable forwarding
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p

# NAT masquerade (replace eth0 with your interface)
IFACE=$(ip route get 1.1.1.1 | awk '{print $5; exit}')
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE

# Persist iptables
apt install -y iptables-persistent
netfilter-persistent save
```

**Start the server:**
```bash
systemctl enable --now openvpn-server@server
systemctl status openvpn-server@server
```

### Step 3: Client Certificate Generation

**Generate a client certificate:**
```bash
cd ~/openvpn-ca

CLIENT_NAME="alice"
./easyrsa gen-req "$CLIENT_NAME" nopass
./easyrsa sign-req client "$CLIENT_NAME"
```

**Create a unified .ovpn profile** (single file, easy to distribute):
```bash
#!/bin/bash
# generate-client.sh — creates a self-contained .ovpn file
CLIENT=$1
CA_DIR=~/openvpn-ca
SERVER_IP="your.server.ip"
OUTPUT_DIR=~/client-configs

mkdir -p "$OUTPUT_DIR"

cat > "$OUTPUT_DIR/$CLIENT.ovpn" <<EOF
client
dev tun
proto udp
remote $SERVER_IP 1194
resolv-retry infinite
nobind
persist-key
persist-tun
remote-cert-tls server
cipher AES-256-GCM
auth SHA384
key-direction 1
verb 3

<ca>
$(cat "$CA_DIR/pki/ca.crt")
</ca>

<cert>
$(sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' "$CA_DIR/pki/issued/$CLIENT.crt")
</cert>

<key>
$(cat "$CA_DIR/pki/private/$CLIENT.key")
</key>

<tls-auth>
$(cat "$CA_DIR/ta.key")
</tls-auth>
EOF

echo "Created: $OUTPUT_DIR/$CLIENT.ovpn"
```

```bash
chmod +x generate-client.sh
./generate-client.sh alice
./generate-client.sh bob
```

### Step 4: Split Tunneling

Only route specific traffic through VPN (not all traffic):

**Server-side** — remove the redirect-gateway push and add specific routes:
```ini
# Comment out: push "redirect-gateway def1 bypass-dhcp"

# Only route internal networks through VPN
push "route 10.0.0.0 255.0.0.0"
push "route 172.16.0.0 255.240.0.0"
push "route 192.168.0.0 255.255.0.0"
```

**Client-side override** — add to .ovpn:
```ini
# Ignore server's pushed routes, define your own
route-nopull
route 10.0.0.0 255.0.0.0
route 192.168.1.0 255.255.255.0
```

### Step 5: Site-to-Site VPN

Connect two offices with static keys or certificates:

**Office A server config (`/etc/openvpn/site-to-site.conf`):**
```ini
dev tun
proto udp
port 1195
remote office-b.example.com

ca ca.crt
cert office-a.crt
key office-a.key
tls-auth ta.key 0

ifconfig 10.9.0.1 10.9.0.2
route 192.168.2.0 255.255.255.0  # Office B's LAN

cipher AES-256-GCM
keepalive 10 60
persist-key
persist-tun
verb 3
```

**Office B client config:**
```ini
dev tun
proto udp
remote office-a.example.com 1195

ca ca.crt
cert office-b.crt
key office-b.key
tls-auth ta.key 1

ifconfig 10.9.0.2 10.9.0.1
route 192.168.1.0 255.255.255.0  # Office A's LAN

cipher AES-256-GCM
keepalive 10 60
persist-key
persist-tun
verb 3
```

Enable forwarding on both sides and add iptables rules for the remote subnets.

### Step 6: Multi-Factor Authentication

**Add TOTP (Google Authenticator) to OpenVPN:**
```bash
apt install -y libpam-google-authenticator

# For each VPN user, run:
su - vpnuser -c "google-authenticator -t -d -f -r 3 -R 30 -w 3"
```

**Add PAM plugin to server config:**
```ini
plugin /usr/lib/openvpn/openvpn-plugin-auth-pam.so openvpn
```

**Create PAM config (`/etc/pam.d/openvpn`):**
```
auth required pam_google_authenticator.so
account required pam_permit.so
```

**Client config addition:**
```ini
auth-user-pass
# User enters username + TOTP code as password
```

### Step 7: Client Revocation

**Revoke a client certificate:**
```bash
cd ~/openvpn-ca
./easyrsa revoke alice
./easyrsa gen-crl

# Copy updated CRL to server
cp pki/crl.pem /etc/openvpn/server/crl.pem
systemctl restart openvpn-server@server
```

### Step 8: Monitoring & Management

**Check connected clients:**
```bash
cat /var/log/openvpn/status.log
```

**Parse status log programmatically:**
```bash
#!/bin/bash
# vpn-clients.sh — list connected clients
awk '/CLIENT LIST/,/ROUTING TABLE/' /var/log/openvpn/status.log | \
  grep -v "CLIENT LIST\|Common Name\|ROUTING TABLE\|Updated" | \
  while IFS=',' read -r name addr recv sent since; do
    echo "$name | $addr | Rx: $recv | Tx: $sent | Since: $since"
  done
```

**Management interface** (add to server.conf):
```ini
management 127.0.0.1 7505
```

**Query via management interface:**
```bash
# Connect
echo "status" | nc 127.0.0.1 7505

# Kill a client
echo "kill alice" | nc 127.0.0.1 7505

# Get stats
echo "load-stats" | nc 127.0.0.1 7505
```

**Automated provisioning script:**
```bash
#!/bin/bash
# provision-vpn-user.sh — full user setup
set -e

USER=$1
EMAIL=$2
CA_DIR=~/openvpn-ca
SERVER_IP="vpn.company.com"

cd "$CA_DIR"
./easyrsa gen-req "$USER" nopass
./easyrsa sign-req client "$USER"

# Generate .ovpn
./generate-client.sh "$USER"

# Send config via email (requires mailutils)
echo "Your VPN config is attached. Import it into your OpenVPN client." | \
  mail -s "VPN Access: $USER" -A ~/client-configs/"$USER".ovpn "$EMAIL"

echo "Provisioned VPN access for $USER ($EMAIL)"
```

### Step 9: Performance Tuning

```ini
# In server.conf — optimize for throughput
sndbuf 0
rcvbuf 0
push "sndbuf 393216"
push "rcvbuf 393216"

# Use UDP for better performance (default)
proto udp

# Fragment large packets
fragment 1400
mssfix 1400

# Enable compression (optional, security tradeoff)
# compress lz4-v2
# push "compress lz4-v2"

# Multi-threaded (OpenVPN 2.6+)
# multihome
```

**TCP fallback** (for restrictive networks):
```ini
# Additional server instance on TCP 443
port 443
proto tcp
```

Run two server instances: one on UDP 1194 (primary) and TCP 443 (fallback).
