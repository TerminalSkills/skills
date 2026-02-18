---
title: Deploy a Private VPN for a Remote Team
slug: deploy-private-vpn-for-remote-team
description: "Set up OpenVPN for corporate network access and Xray VLESS+Reality as a censorship-resistant proxy on the same server, with automated client provisioning and monitoring."
category: devops
skills: [openvpn, xray]
tags: [openvpn, xray, vpn, security, remote-work]
---

# Deploy a Private VPN for a Remote Team

## The Problem

A 25-person distributed startup needs secure access to internal services — staging servers, databases, admin panels — that should never be exposed to the public internet. The team currently relies on IP allowlists and SSH tunnels, which break constantly as people move between locations. Five team members also work from countries with heavy internet censorship where standard VPN protocols get detected and blocked within hours. The team needs a corporate VPN with split tunneling on the same server as an undetectable proxy for restricted regions.

## The Solution

Use `openvpn` to set up a corporate VPN with split tunneling, per-user certificates, and TOTP-based MFA. Use `xray` to configure VLESS with Reality protocol for censorship-resistant access that looks like normal HTTPS traffic. Both services coexist on one server — OpenVPN on UDP 1194 and Xray on TCP 443.

## Step-by-Step Walkthrough

### Step 1: Prepare the server

```text
I have an Ubuntu 22.04 server (2 CPU, 4GB RAM, public IP). Install OpenVPN
with EasyRSA, Google Authenticator for MFA, and Xray for the Reality proxy.
Configure the firewall and enable IP forwarding.
```

```bash
apt update && apt upgrade -y
apt install -y openvpn easy-rsa libpam-google-authenticator mailutils ufw

# Install Xray via official installer
bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install

# Firewall: SSH + OpenVPN + Xray
ufw allow 22/tcp && ufw allow 1194/udp && ufw allow 443/tcp && ufw enable

# Enable IP forwarding for VPN routing
echo "net.ipv4.ip_forward = 1" >> /etc/sysctl.conf && sysctl -p
```

### Step 2: Build PKI and configure OpenVPN with split tunneling

```text
Create a CA with elliptic curve crypto, generate server certs, and configure
OpenVPN with split tunneling — only internal traffic (10.0.0.0/8) goes through
the VPN, internet stays direct. Enable MFA via PAM with Google Authenticator.
```

The agent initializes EasyRSA, builds the CA and server credentials, then writes a server config with split tunneling and PAM-based TOTP.

```bash
make-cadir ~/openvpn-ca && cd ~/openvpn-ca
cat > vars <<'EOF'
set_var EASYRSA_ALGO ec
set_var EASYRSA_CURVE secp384r1
set_var EASYRSA_CA_EXPIRE 3650
set_var EASYRSA_CERT_EXPIRE 365
EOF

./easyrsa init-pki && ./easyrsa build-ca nopass
./easyrsa gen-req server nopass && ./easyrsa sign-req server server
./easyrsa gen-dh && openvpn --genkey secret ta.key
cp pki/ca.crt pki/issued/server.crt pki/private/server.key pki/dh.pem ta.key /etc/openvpn/server/
```

Key lines from `/etc/openvpn/server/server.conf`:

```ini
port 1194
proto udp
dev tun
server 10.8.0.0 255.255.255.0

# Split tunneling — only push internal routes, no redirect-gateway
push "route 10.0.0.0 255.0.0.0"
push "route 172.16.0.0 255.240.0.0"
push "route 192.168.0.0 255.255.0.0"
push "dhcp-option DNS 10.0.0.2"

cipher AES-256-GCM
auth SHA384
tls-version-min 1.2

# MFA via Google Authenticator
plugin /usr/lib/openvpn/openvpn-plugin-auth-pam.so openvpn

status /var/log/openvpn/status.log 10
max-clients 50
crl-verify crl.pem
```

```bash
# NAT for VPN client traffic
IFACE=$(ip route get 1.1.1.1 | awk '{print $5; exit}')
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE
apt install -y iptables-persistent && netfilter-persistent save

mkdir -p /var/log/openvpn
systemctl enable --now openvpn-server@server
```

### Step 3: Automate user provisioning and revocation

```text
Write a provisioning script: given a username and email, generate a client
certificate, set up TOTP, create a self-contained .ovpn file, and email it.
Write a revocation script for instant access termination.
```

The agent creates `provision-user.sh` and `revoke-user.sh` for the full employee lifecycle.

```bash
#!/bin/bash
# provision-user.sh — cert + TOTP + .ovpn + email in one command
set -e
USER=$1; EMAIL=$2; SERVER_IP="YOUR_SERVER_IP"; CA_DIR=~/openvpn-ca
[ -z "$USER" ] || [ -z "$EMAIL" ] && echo "Usage: ./provision-user.sh user email" && exit 1

cd "$CA_DIR"
./easyrsa gen-req "$USER" nopass
./easyrsa sign-req client "$USER"

# Generate TOTP secret for Google Authenticator
mkdir -p /etc/openvpn/totp
google-authenticator -t -d -f -r 3 -R 30 -w 3 -s "/etc/openvpn/totp/$USER" --no-confirm
TOTP_SECRET=$(head -1 /etc/openvpn/totp/$USER)

# Build .ovpn with embedded certs (self-contained, no extra files needed)
mkdir -p ~/client-configs
cat > ~/client-configs/"$USER".ovpn <<OVPN
client
dev tun
proto udp
remote $SERVER_IP 1194
cipher AES-256-GCM
auth SHA384
auth-user-pass
key-direction 1
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

# Email config with setup instructions
mail -s "VPN Access" -A ~/client-configs/"$USER".ovpn "$EMAIL" <<MAIL
Your .ovpn file is attached. Install OpenVPN Connect, import it, and set up
Google Authenticator with secret: $TOTP_SECRET
When connecting: username=$USER, password=your TOTP code.
MAIL
echo "Provisioned $USER ($EMAIL)"
```

```bash
#!/bin/bash
# revoke-user.sh — immediately revoke access
USER=$1; cd ~/openvpn-ca
./easyrsa revoke "$USER" && ./easyrsa gen-crl
cp pki/crl.pem /etc/openvpn/server/crl.pem
rm -f /etc/openvpn/totp/"$USER" ~/client-configs/"$USER".ovpn
systemctl restart openvpn-server@server
echo "Revoked access for $USER"
```

### Step 4: Configure Xray VLESS with Reality protocol

```text
Set up Xray with VLESS + Reality for 5 users. Reality impersonates a real
website (microsoft.com) to defeat DPI — no domain or TLS cert needed.
Enable per-user traffic stats via the Xray stats API.
```

```bash
# Generate credentials
xray uuid    # Run 5 times — save as UUID_1 through UUID_5
xray x25519  # Save the private and public key pair
```

The Xray config at `/usr/local/etc/xray/config.json`:

```json
{
  "stats": {},
  "policy": {
    "levels": { "0": { "statsUserUplink": true, "statsUserDownlink": true } }
  },
  "api": { "tag": "api", "services": ["StatsService"] },
  "inbounds": [
    {
      "listen": "127.0.0.1", "port": 10085,
      "protocol": "dokodemo-door",
      "settings": { "address": "127.0.0.1" }, "tag": "api"
    },
    {
      "listen": "0.0.0.0", "port": 443, "protocol": "vless", "tag": "proxy",
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
        "network": "tcp", "security": "reality",
        "realitySettings": {
          "dest": "www.microsoft.com:443",
          "serverNames": ["www.microsoft.com", "microsoft.com"],
          "privateKey": "YOUR_PRIVATE_KEY",
          "shortIds": ["", "abcdef1234567890"]
        }
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
```

### Step 5: Add subscription server and monitoring

```text
Create a subscription server for v2rayNG/Hiddify compatibility, monitoring
scripts for both services, and a weekly Xray auto-update cron job.
```

Subscription server (`sub-server.js`):

```javascript
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

  const link = `vless://${user.uuid}@${SERVER_IP}:443` +
    `?encryption=none&flow=xtls-rprx-vision` +
    `&security=reality&sni=www.microsoft.com` +
    `&fp=chrome&pbk=${PBK}&sid=${SID}&type=tcp#${user.name}`;

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end(Buffer.from(link).toString("base64"));
}).listen(8080, "127.0.0.1");
```

Monitoring scripts:

```bash
#!/bin/bash
# vpn-status.sh — connected OpenVPN clients and bandwidth
awk '/CLIENT LIST/,/ROUTING TABLE/' /var/log/openvpn/status.log | \
  grep -v "CLIENT LIST\|Common Name\|ROUTING TABLE\|Updated" | \
  while IFS=',' read -r name addr recv sent since; do
    [ -z "$name" ] && continue
    printf "  %s | %s | down:%.1fMB up:%.1fMB | %s\n" \
      "$name" "$addr" "$(echo "$recv/1048576" | bc -l)" "$(echo "$sent/1048576" | bc -l)" "$since"
  done
```

```bash
#!/bin/bash
# xray-stats.sh — per-user Xray traffic
for user in alice bob carol dave eve; do
  up=$(xray api stats -server=127.0.0.1:10085 -name "user>>>${user}@proxy>>>traffic>>>uplink" 2>/dev/null | awk '/value/{print $2}')
  down=$(xray api stats -server=127.0.0.1:10085 -name "user>>>${user}@proxy>>>traffic>>>downlink" 2>/dev/null | awk '/value/{print $2}')
  printf "  %s | up:%.1fMB down:%.1fMB\n" "$user" "$(echo "${up:-0}/1048576" | bc -l)" "$(echo "${down:-0}/1048576" | bc -l)"
done
```

```bash
# Weekly Xray auto-update — add to crontab
0 3 * * 0 bash -c "$(curl -L https://github.com/XTLS/Xray-install/raw/main/install-release.sh)" @ install && systemctl restart xray
```

Start and verify:

```bash
systemctl enable --now xray
systemctl status xray openvpn-server@server
```

### Step 6: Test end-to-end

```bash
# OpenVPN — verify split tunneling
openvpn --config alice.ovpn
ping 10.0.0.1        # Reaches internal network through VPN
curl ifconfig.me     # Shows client's own IP (internet stays direct)

# Xray — import subscription in v2rayNG, then test
curl -x socks5://127.0.0.1:1080 https://ifconfig.me  # Shows server IP
```

## Real-World Example

Leo provisions the dual-stack server on a Friday afternoon. By Monday, all 25 employees have `.ovpn` files and Google Authenticator configured via the provisioning script. Split tunneling means developers access internal staging servers through the VPN while video calls and web browsing use their local connection. When an intern's contract ends, one `revoke-user.sh` command kills access in seconds.

The five team members in restricted countries import subscription links into v2rayNG. Reality protocol makes their traffic indistinguishable from normal HTTPS visits to microsoft.com, so DPI systems let it through. Over three months, the proxy stays unblocked while other VPN solutions get detected within days. The weekly auto-update keeps Xray current, and monitoring scripts give Leo visibility into usage across both services.
