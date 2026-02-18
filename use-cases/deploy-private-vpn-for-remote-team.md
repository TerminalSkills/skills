---
title: Deploy a Private VPN for a Remote Team
slug: deploy-private-vpn-for-remote-team
category: networking
tags: [openvpn, xray, vpn, security, remote-work]
---

# Deploy a Private VPN for a Remote Team

Leo is a DevOps engineer at a 25-person distributed startup. The team needs secure access to internal services (staging servers, databases, admin panels) that shouldn't be exposed to the public internet. Some team members also work from countries with restricted internet access and need a reliable proxy solution. Leo wants to set up OpenVPN for corporate network access and Xray (VLESS+Reality) as a censorship-resistant proxy — both on the same server.

## Prompt

```text
I need to set up two VPN/proxy solutions on one Ubuntu 22.04 server (2 CPU, 4GB RAM, public IP):

1. **OpenVPN** for corporate access:
   - 25 employees need access to internal services (10.0.0.0/8 network)
   - Split tunneling — only internal traffic goes through VPN, internet stays direct
   - Each employee gets their own certificate
   - MFA with TOTP (Google Authenticator)
   - Auto-provisioning script: give it an email, it generates .ovpn + sets up TOTP + emails the config
   - Monitor who's connected and bandwidth usage
   - Revoke access instantly when someone leaves

2. **Xray (VLESS + Reality)** for team members in restricted regions:
   - 5 users in countries with DPI — needs to be undetectable
   - Reality protocol (no domain or TLS cert needed)
   - Per-user traffic tracking
   - Subscription link that works with v2rayNG and Hiddify
   - Auto-update Xray weekly

Both should coexist on the same server without conflicts. OpenVPN on UDP 1194, Xray on TCP 443.

Give me the full setup — configs, scripts, monitoring.
```

## Agent Response

```text
Here's the complete dual-stack setup. OpenVPN handles corporate access with split tunneling and MFA, Xray handles censorship bypass with Reality.

## Server Prep

apt update && apt upgrade -y
apt install -y openvpn easy-rsa libpam-google-authenticator mailutils ufw

# Install Xray
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# Firewall
ufw allow 22/tcp
ufw allow 1194/udp   # OpenVPN
ufw allow 443/tcp    # Xray
ufw enable

# IP forwarding
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf
sysctl -p

## Part 1: OpenVPN Setup

### PKI

make-cadir ~/openvpn-ca && cd ~/openvpn-ca

cat > vars <<'EOF'
set_var EASYRSA_ALGO           ec
set_var EASYRSA_CURVE          secp384r1
set_var EASYRSA_CA_EXPIRE      3650
set_var EASYRSA_CERT_EXPIRE    365
set_var EASYRSA_REQ_CN         "CompanyVPN-CA"
EOF

./easyrsa init-pki
./easyrsa build-ca nopass
./easyrsa gen-req server nopass
./easyrsa sign-req server server
./easyrsa gen-dh
openvpn --genkey secret ta.key

cp pki/ca.crt pki/issued/server.crt pki/private/server.key pki/dh.pem ta.key /etc/openvpn/server/

### Server config (/etc/openvpn/server/server.conf)

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

# Split tunneling — only internal traffic through VPN
push "route 10.0.0.0 255.0.0.0"
push "route 172.16.0.0 255.240.0.0"
push "route 192.168.0.0 255.255.0.0"
# No redirect-gateway — internet goes direct

# DNS for internal resolution
push "dhcp-option DNS 10.0.0.2"

keepalive 10 120
cipher AES-256-GCM
auth SHA384
tls-version-min 1.2

# MFA via PAM
plugin /usr/lib/openvpn/openvpn-plugin-auth-pam.so openvpn

user nobody
group nogroup
persist-key
persist-tun

status /var/log/openvpn/status.log 10
log-append /var/log/openvpn/openvpn.log
verb 3

max-clients 50
ifconfig-pool-persist ipp.txt
crl-verify crl.pem

### PAM config (/etc/pam.d/openvpn)

auth required pam_google_authenticator.so secret=/etc/openvpn/totp/${USER}
account required pam_permit.so

### NAT for internal routing

IFACE=$(ip route get 1.1.1.1 | awk '{print $5; exit}')
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE
apt install -y iptables-persistent
netfilter-persistent save

### Auto-provisioning script

#!/bin/bash
# provision-user.sh — creates cert + TOTP + .ovpn + sends email
set -e
USER=$1
EMAIL=$2
SERVER_IP="YOUR_SERVER_IP"
CA_DIR=~/openvpn-ca

if [ -z "$USER" ] || [ -z "$EMAIL" ]; then
  echo "Usage: ./provision-user.sh username email"
  exit 1
fi

echo "=== Generating certificate for $USER ==="
cd "$CA_DIR"
./easyrsa gen-req "$USER" nopass
./easyrsa sign-req client "$USER"

echo "=== Setting up TOTP ==="
mkdir -p /etc/openvpn/totp
google-authenticator -t -d -f -r 3 -R 30 -w 3 \
  -s "/etc/openvpn/totp/$USER" \
  --no-confirm
TOTP_SECRET=$(head -1 /etc/openvpn/totp/$USER)
TOTP_QR="otpauth://totp/CompanyVPN:${USER}?secret=${TOTP_SECRET}&issuer=CompanyVPN"

echo "=== Generating .ovpn ==="
mkdir -p ~/client-configs
cat > ~/client-configs/"$USER".ovpn <<OVPN
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
auth-user-pass
verb 3

<ca>
$(cat "$CA_DIR/pki/ca.crt")
</ca>

<cert>
$(sed -n '/BEGIN CERTIFICATE/,/END CERTIFICATE/p' "$CA_DIR/pki/issued/$USER.crt")
</cert>

<key>
$(cat "$CA_DIR/pki/private/$USER.key")
</key>

<tls-auth>
$(cat "$CA_DIR/ta.key")
</tls-auth>
OVPN

echo "=== Sending email ==="
cat <<MAIL | mail -s "VPN Access — $USER" -A ~/client-configs/"$USER".ovpn "$EMAIL"
Hi $USER,

Your VPN access is ready. Attached is your .ovpn configuration file.

Setup:
1. Install OpenVPN Connect (or Tunnelblick on macOS)
2. Import the attached .ovpn file
3. Set up Google Authenticator with this secret: $TOTP_SECRET
   Or scan: $TOTP_QR
4. When connecting: username = $USER, password = your TOTP code

Questions? Contact IT.
MAIL

echo "✅ Provisioned $USER ($EMAIL)"

### Revoke access

#!/bin/bash
# revoke-user.sh
USER=$1
cd ~/openvpn-ca
./easyrsa revoke "$USER"
./easyrsa gen-crl
cp pki/crl.pem /etc/openvpn/server/crl.pem
rm -f /etc/openvpn/totp/"$USER"
rm -f ~/client-configs/"$USER".ovpn
systemctl restart openvpn-server@server
echo "✅ Revoked access for $USER"

### Monitoring script

#!/bin/bash
# vpn-status.sh — show connected clients and bandwidth
echo "=== Connected VPN Clients ==="
awk '/CLIENT LIST/,/ROUTING TABLE/' /var/log/openvpn/status.log | \
  grep -v "CLIENT LIST\|Common Name\|ROUTING TABLE\|Updated" | \
  while IFS=',' read -r name addr recv sent since; do
    [ -z "$name" ] && continue
    recv_mb=$(echo "scale=1; $recv/1048576" | bc)
    sent_mb=$(echo "scale=1; $sent/1048576" | bc)
    echo "  $name | $addr | ↓${recv_mb}MB ↑${sent_mb}MB | Since: $since"
  done
echo ""
echo "Total clients: $(grep -c "," /var/log/openvpn/status.log 2>/dev/null || echo 0)"

### Start OpenVPN

mkdir -p /var/log/openvpn
systemctl enable --now openvpn-server@server

## Part 2: Xray (VLESS + Reality)

### Generate keys

xray uuid    # → save as UUID_1 through UUID_5 for each user
xray x25519  # → save private + public keys

### Xray config (/usr/local/etc/xray/config.json)

{
  "log": {
    "loglevel": "warning",
    "access": "/var/log/xray/access.log",
    "error": "/var/log/xray/error.log"
  },
  "stats": {},
  "policy": {
    "levels": {
      "0": { "statsUserUplink": true, "statsUserDownlink": true }
    },
    "system": {
      "statsInboundUplink": true,
      "statsInboundDownlink": true
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
    },
    {
      "listen": "0.0.0.0",
      "port": 443,
      "protocol": "vless",
      "tag": "proxy",
      "settings": {
        "clients": [
          { "id": "UUID_1", "flow": "xtls-rprx-vision", "email": "alice@proxy" },
          { "id": "UUID_2", "flow": "xtls-rprx-vision", "email": "bob@proxy" },
          { "id": "UUID_3", "flow": "xtls-rprx-vision", "email": "carol@proxy" },
          { "id": "UUID_4", "flow": "xtls-rprx-vision", "email": "dave@proxy" },
          { "id": "UUID_5", "flow": "xtls-rprx-vision", "email": "eve@proxy" }
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
          "serverNames": ["www.microsoft.com", "microsoft.com"],
          "privateKey": "YOUR_PRIVATE_KEY",
          "shortIds": ["", "abcdef1234567890"]
        }
      },
      "sniffing": {
        "enabled": true,
        "destOverride": ["http", "tls", "quic"]
      }
    }
  ],
  "outbounds": [
    { "protocol": "freedom", "tag": "direct" },
    { "protocol": "blackhole", "tag": "block" }
  ],
  "routing": {
    "rules": [
      { "type": "field", "inboundTag": ["api"], "outboundTag": "api" },
      { "type": "field", "ip": ["geoip:private"], "outboundTag": "block" }
    ]
  }
}

### Subscription server

#!/usr/bin/env node
// sub-server.js — serves subscription links on port 8080
const http = require("http");

const SERVER_IP = "YOUR_SERVER_IP";
const PBK = "YOUR_PUBLIC_KEY";
const SID = "abcdef1234567890";

const users = {
  "token-alice": { uuid: "UUID_1", name: "Alice-Reality" },
  "token-bob":   { uuid: "UUID_2", name: "Bob-Reality" },
  "token-carol": { uuid: "UUID_3", name: "Carol-Reality" },
  "token-dave":  { uuid: "UUID_4", name: "Dave-Reality" },
  "token-eve":   { uuid: "UUID_5", name: "Eve-Reality" },
};

http.createServer((req, res) => {
  const token = req.url.replace("/sub/", "");
  const user = users[token];

  if (!user) { res.writeHead(404); return res.end("Not found"); }

  const link = [
    `vless://${user.uuid}@${SERVER_IP}:443`,
    `?encryption=none&flow=xtls-rprx-vision`,
    `&security=reality&sni=www.microsoft.com`,
    `&fp=chrome&pbk=${PBK}&sid=${SID}&type=tcp`,
    `#${user.name}`
  ].join("");

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(Buffer.from(link).toString("base64"));
}).listen(8080, "127.0.0.1");

// Run behind the OpenVPN or as a systemd service
// Subscription URL: https://your-server/sub/token-alice
// (proxy through nginx if needed)

### Traffic stats script

#!/bin/bash
# xray-stats.sh — show per-user traffic
USERS=("alice@proxy" "bob@proxy" "carol@proxy" "dave@proxy" "eve@proxy")

echo "=== Xray User Traffic ==="
for user in "${USERS[@]}"; do
  up=$(xray api stats -server=127.0.0.1:10085 -name "user>>>$user>>>traffic>>>uplink" 2>/dev/null | grep value | awk '{print $2}')
  down=$(xray api stats -server=127.0.0.1:10085 -name "user>>>$user>>>traffic>>>downlink" 2>/dev/null | grep value | awk '{print $2}')
  up=${up:-0}; down=${down:-0}
  up_mb=$(echo "scale=1; $up/1048576" | bc)
  down_mb=$(echo "scale=1; $down/1048576" | bc)
  echo "  $user | ↑${up_mb}MB ↓${down_mb}MB"
done

### Auto-update cron

# Weekly Xray update — Sundays at 3 AM
0 3 * * 0 bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install && systemctl restart xray

### Start everything

systemctl enable --now xray
systemctl status xray
systemctl status openvpn-server@server

## Verification

# Test OpenVPN (from client machine)
openvpn --config alice.ovpn
ping 10.0.0.1        # Should reach internal network
curl ifconfig.me     # Should show YOUR IP (split tunnel working)

# Test Xray (from restricted region)
# Import subscription in v2rayNG:
# https://your-server:8080/sub/token-alice
curl -x socks5://127.0.0.1:1080 https://ifconfig.me  # Should show server IP

No port conflicts — OpenVPN on UDP 1194, Xray on TCP 443. Both run as separate systemd services. The provisioning script handles the full lifecycle: create → distribute → revoke.
```

Skills used: `openvpn`, `xray`
