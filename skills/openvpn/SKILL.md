---
name: openvpn
description: >-
  Deploy and manage OpenVPN servers and clients. Use when a user asks to set up
  a VPN server, create client certificates, configure site-to-site tunnels, set
  up split tunneling, manage PKI with EasyRSA, harden OpenVPN security, automate
  client provisioning, configure routing and NAT, set up MFA for VPN, monitor
  connected clients, or troubleshoot VPN connectivity. Covers server deployment,
  PKI management, client configuration, and production hardening.
license: Apache-2.0
compatibility: 'Linux (Ubuntu/Debian, CentOS/RHEL), OpenVPN 2.5+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - openvpn
    - vpn
    - networking
    - security
    - pki
---

# OpenVPN

## Overview

Deploy and manage OpenVPN — the industry-standard open-source VPN. This skill covers full server setup with PKI (EasyRSA), client certificate management, routing modes (TUN/TAP), split tunneling, site-to-site links, MFA integration, performance tuning, and monitoring. Suitable for remote access VPN, connecting offices, and securing traffic on untrusted networks.

## Instructions

### Step 1: Server Installation & PKI Setup

```bash
# Ubuntu/Debian
apt update && apt install -y openvpn easy-rsa

# Initialize PKI
make-cadir ~/openvpn-ca && cd ~/openvpn-ca
cat > vars <<'EOF'
set_var EASYRSA_REQ_COUNTRY    "US"
set_var EASYRSA_REQ_PROVINCE   "California"
set_var EASYRSA_REQ_CITY       "San Francisco"
set_var EASYRSA_REQ_ORG        "MyCompany"
set_var EASYRSA_REQ_EMAIL      "admin@company.com"
set_var EASYRSA_ALGO           ec
set_var EASYRSA_CURVE          secp384r1
set_var EASYRSA_CA_EXPIRE      3650
set_var EASYRSA_CERT_EXPIRE    825
EOF

./easyrsa init-pki
./easyrsa build-ca nopass

# Server certificate + DH + TLS auth
./easyrsa gen-req server nopass
./easyrsa sign-req server server
./easyrsa gen-dh
openvpn --genkey secret ta.key

# Copy to OpenVPN
cp pki/ca.crt pki/issued/server.crt pki/private/server.key pki/dh.pem ta.key /etc/openvpn/server/
```

### Step 2: Server Configuration

**`/etc/openvpn/server/server.conf`:**
```ini
port 1194
proto udp
dev tun
ca ca.crt
cert server.crt
key server.key
dh dh.pem
tls-auth ta.key 0

server 10.8.0.0 255.255.255.0
topology subnet
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 1.1.1.1"
push "dhcp-option DNS 1.0.0.1"
keepalive 10 120

cipher AES-256-GCM
auth SHA384
tls-version-min 1.2
user nobody
group nogroup
persist-key
persist-tun

status /var/log/openvpn/status.log
log-append /var/log/openvpn/openvpn.log
verb 3
max-clients 100
crl-verify /etc/openvpn/server/crl.pem
```

**Enable forwarding and NAT:**
```bash
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf && sysctl -p
IFACE=$(ip route get 1.1.1.1 | awk '{print $5; exit}')
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE
apt install -y iptables-persistent && netfilter-persistent save
systemctl enable --now openvpn-server@server
```

### Step 3: Client Certificate & Profile Generation

```bash
cd ~/openvpn-ca
./easyrsa gen-req alice nopass
./easyrsa sign-req client alice
```

**Generate a self-contained .ovpn file:**
```bash
#!/bin/bash
# generate-client.sh
CLIENT=$1; CA_DIR=~/openvpn-ca; SERVER_IP="your.server.ip"
cat > ~/client-configs/$CLIENT.ovpn <<EOF
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
echo "Created: ~/client-configs/$CLIENT.ovpn"
```

### Step 4: Split Tunneling & Site-to-Site

**Split tunnel** — only route specific networks through VPN:
```ini
# Server: replace redirect-gateway with specific routes
push "route 10.0.0.0 255.0.0.0"
push "route 192.168.0.0 255.255.0.0"
```

**Client-side override:**
```ini
route-nopull
route 10.0.0.0 255.0.0.0
route 192.168.1.0 255.255.255.0
```

**Site-to-site** — connect two offices:
```ini
# Office A (server): route to Office B LAN
ifconfig 10.9.0.1 10.9.0.2
route 192.168.2.0 255.255.255.0

# Office B (client): route to Office A LAN
remote office-a.example.com 1195
ifconfig 10.9.0.2 10.9.0.1
route 192.168.1.0 255.255.255.0
```

### Step 5: MFA & Client Revocation

**Add TOTP (Google Authenticator):**
```bash
apt install -y libpam-google-authenticator
su - vpnuser -c "google-authenticator -t -d -f -r 3 -R 30 -w 3"
```

Add to server.conf: `plugin /usr/lib/openvpn/openvpn-plugin-auth-pam.so openvpn`
Client adds: `auth-user-pass`

**Revoke a client:**
```bash
cd ~/openvpn-ca
./easyrsa revoke alice
./easyrsa gen-crl
cp pki/crl.pem /etc/openvpn/server/crl.pem
systemctl restart openvpn-server@server
```

### Step 6: Monitoring & Performance

```bash
# Connected clients
cat /var/log/openvpn/status.log

# Management interface (add to server.conf: management 127.0.0.1 7505)
echo "status" | nc 127.0.0.1 7505
echo "kill alice" | nc 127.0.0.1 7505
```

**Performance tuning** (add to server.conf):
```ini
sndbuf 0
rcvbuf 0
push "sndbuf 393216"
push "rcvbuf 393216"
fragment 1400
mssfix 1400
```

## Examples

### Example 1: Deploy a full OpenVPN server with client provisioning
**User prompt:** "Set up an OpenVPN server on our Ubuntu 22.04 VPS at 198.51.100.25. Create a full PKI with EasyRSA, configure UDP on port 1194 with AES-256-GCM, push DNS 1.1.1.1 to clients, and generate .ovpn profiles for alice, bob, and carol."

The agent will install openvpn and easy-rsa, initialize a PKI with EC keys (secp384r1), build a CA, generate server and three client certificates, create a server.conf with UDP/TUN/AES-256-GCM and NAT masquerading, write a `generate-client.sh` script, produce self-contained `.ovpn` files for alice, bob, and carol with embedded certificates, enable IP forwarding, persist iptables rules, and start the service.

### Example 2: Add TOTP two-factor authentication to an existing OpenVPN server
**User prompt:** "Our OpenVPN server is running but we need to add Google Authenticator MFA. Set it up so each user needs their certificate plus a TOTP code to connect."

The agent will install `libpam-google-authenticator`, create a PAM config at `/etc/pam.d/openvpn` requiring the Google Authenticator module, add the PAM plugin directive to server.conf, run `google-authenticator` setup for each VPN system user, add `auth-user-pass` to the client `.ovpn` templates, and restart the OpenVPN service. It will explain that users enter their username and TOTP code when prompted.

## Guidelines

- Always use `tls-auth` or `tls-crypt` to add an HMAC firewall that drops unauthenticated packets before they reach the TLS stack
- Use elliptic curve keys (`EASYRSA_ALGO ec`, `EASYRSA_CURVE secp384r1`) for faster handshakes and stronger security than RSA-2048
- Keep the CA private key offline or on a separate machine; if compromised, an attacker can issue valid client certificates
- Set `crl-verify` in server.conf and regenerate the CRL after every revocation, or revoked clients will still be able to connect
- Prefer UDP over TCP for the VPN tunnel to avoid TCP-over-TCP performance degradation; use TCP 443 only as a fallback for restrictive networks
- Test split tunnel configurations by checking client routing tables (`ip route`) after connecting to verify only intended traffic routes through the VPN
