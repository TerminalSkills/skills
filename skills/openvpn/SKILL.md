---
name: openvpn
description: >-
  OpenVPN is an open-source VPN daemon that builds encrypted TLS tunnels for
  remote access and site-to-site links. Use when a user asks to set up a VPN
  server, create client certificates, configure site-to-site tunnels, set up
  split tunneling, manage PKI with EasyRSA, harden OpenVPN security, automate
  client provisioning, configure routing and NAT, set up MFA for VPN, monitor
  connected clients, revoke a client, or troubleshoot VPN connectivity.
license: Apache-2.0
compatibility: 'Linux server; commands are for Debian 12+/Ubuntu 22.04+. OpenVPN 2.5 or newer with Easy-RSA 3 (checked on 2.5.11, 2.6.14 and 2.7.7).'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/OpenVPN/openvpn
  tags:
    - openvpn
    - vpn
    - networking
    - security
    - pki
---

# OpenVPN

## Overview

Deploy and manage OpenVPN — the industry-standard open-source VPN. This skill covers full server setup with PKI (EasyRSA), client certificate management, split tunneling, site-to-site links, MFA integration, revocation, and monitoring. Suitable for remote access VPN, connecting offices, and securing traffic on untrusted networks. The configuration below works on OpenVPN 2.5 through 2.7; 2.7 (current stable) refuses static-key mode unless `--allow-deprecated-insecure-static-crypto` is set (2.8 removes it) and uses the in-kernel `ovpn` data channel offload on Linux 6.16+.

## Instructions

### Step 1: Server Installation & PKI Setup

Run as root. `--batch` stops Easy-RSA from prompting, which matters when an agent runs the commands.

```bash
# Ubuntu/Debian (netcat-openbsd: the nc that can talk to the management socket; Debian's default nc cannot)
apt update && apt install -y openvpn easy-rsa netcat-openbsd

# Initialize PKI
make-cadir ~/openvpn-ca && cd ~/openvpn-ca
cat > vars <<'EOF'
set_var EASYRSA_ALGO           ec
set_var EASYRSA_CURVE          secp384r1
set_var EASYRSA_CA_EXPIRE      3650
set_var EASYRSA_CERT_EXPIRE    825
set_var EASYRSA_CRL_DAYS       180
EOF

./easyrsa init-pki
mv vars pki/vars   # Easy-RSA 3.0 (Ubuntu 22.04) reads vars only from the PKI directory; left here it is ignored and keys become RSA-2048
./easyrsa --batch --req-cn="Northwind VPN CA" build-ca nopass

# Server certificate, CRL and control-channel key (EC keys need no DH parameters)
./easyrsa --batch build-server-full server nopass
./easyrsa gen-crl
openvpn --genkey tls-crypt-v2-server /etc/openvpn/server/tls-crypt-v2-server.key

# Copy to OpenVPN; the CRL must stay readable after the daemon drops root
cp pki/ca.crt pki/issued/server.crt pki/private/server.key /etc/openvpn/server/
install -m 644 pki/crl.pem /etc/openvpn/server/crl.pem
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
dh none
tls-crypt-v2 tls-crypt-v2-server.key

server 10.8.0.0 255.255.255.0
topology subnet
push "redirect-gateway def1 bypass-dhcp"
push "dhcp-option DNS 1.1.1.1"
push "dhcp-option DNS 1.0.0.1"
keepalive 10 120

data-ciphers AES-256-GCM:CHACHA20-POLY1305
tls-version-min 1.2
user nobody
group nogroup
persist-key
persist-tun

verb 3
max-clients 100
crl-verify crl.pem
management /run/openvpn-server/mgmt.sock unix
```

`cipher` is ignored in TLS mode since 2.6; `data-ciphers` sets what may be negotiated. `persist-key` is needed up to 2.6 and is the default on 2.7, which logs a harmless deprecation note for it.

**Enable forwarding and NAT:**
```bash
echo "net.ipv4.ip_forward = 1" > /etc/sysctl.d/99-openvpn.conf && sysctl --system
DEBIAN_FRONTEND=noninteractive apt install -y iptables-persistent   # also installs iptables
IFACE=$(ip route get 1.1.1.1 | sed -n 's/.* dev \([^ ]*\).*/\1/p')   # the interface that carries the default route
iptables -t nat -A POSTROUTING -s 10.8.0.0/24 -o "$IFACE" -j MASQUERADE
netfilter-persistent save
systemctl enable --now openvpn-server@server
```

### Step 3: Client Certificate & Profile Generation

```bash
cd ~/openvpn-ca
./easyrsa --batch build-client-full alice nopass
```

**Generate a self-contained .ovpn file** (save the script as `~/generate-client.sh`; each client gets its own tls-crypt-v2 key):
```bash
#!/bin/bash
# generate-client.sh — usage: VPN_SERVER_HOST=vpn.northwind.dev ./generate-client.sh alice
set -euo pipefail
umask 077
CLIENT=$1; CA_DIR=~/openvpn-ca; OUT=~/client-configs
mkdir -p "$OUT"
openvpn --tls-crypt-v2 /etc/openvpn/server/tls-crypt-v2-server.key \
  --genkey tls-crypt-v2-client "$OUT/$CLIENT-tc.key"
cat > "$OUT/$CLIENT.ovpn" <<PROFILE
client
dev tun
proto udp
remote $VPN_SERVER_HOST 1194
resolv-retry infinite
nobind
persist-tun
remote-cert-tls server
data-ciphers AES-256-GCM:CHACHA20-POLY1305
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
<tls-crypt-v2>
$(cat "$OUT/$CLIENT-tc.key")
</tls-crypt-v2>
PROFILE
rm "$OUT/$CLIENT-tc.key"
echo "Created: $OUT/$CLIENT.ovpn"
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

**Site-to-site** — Office B (LAN 192.168.2.0/24) connects as an ordinary client with its own certificate, and the server routes B's LAN to it. Static-key point-to-point tunnels no longer start on 2.7.
```ini
# Office A server.conf: A's LAN is 192.168.1.0/24
client-config-dir ccd
route 192.168.2.0 255.255.255.0
push "route 192.168.1.0 255.255.255.0"

# /etc/openvpn/server/ccd/office-b  (file name = the client's certificate CN, mode 644)
iroute 192.168.2.0 255.255.255.0
```

Enable IP forwarding on both gateways, and on each LAN route the other office's subnet to the local VPN gateway.

### Step 5: MFA & Client Revocation

**Add TOTP (Google Authenticator).** The systemd unit sets `ProtectHome=true`, so keep the secrets outside `/home`:
```bash
apt install -y libpam-google-authenticator
mkdir -p /etc/openvpn/google-authenticator
# -C skips the interactive "enter a code" check; the QR code and scratch codes it prints go to the user
google-authenticator -t -d -f -r 3 -R 30 -w 3 -C -l alice -i "Northwind VPN" \
  -s /etc/openvpn/google-authenticator/alice

cat > /etc/pam.d/openvpn <<'EOF'
auth    required  pam_google_authenticator.so secret=/etc/openvpn/google-authenticator/${USER} user=root
account required  pam_permit.so
EOF
```

Add to server.conf, then restart the service:
```ini
plugin /usr/lib/openvpn/openvpn-plugin-auth-pam.so openvpn
auth-gen-token 43200
```

Client adds: `auth-user-pass`. The user enters their name and the current 6-digit code; `auth-gen-token` lets the hourly renegotiation reuse a session token instead of asking for a new code.

**Revoke a client** (no restart needed — the CRL is re-read on the next connection):
```bash
cd ~/openvpn-ca
./easyrsa --batch revoke alice
./easyrsa gen-crl
install -m 644 pki/crl.pem /etc/openvpn/server/crl.pem
echo "kill alice" | nc -N -U /run/openvpn-server/mgmt.sock   # drop the live session
```

### Step 6: Monitoring & Performance

```bash
# Connected clients (path set by the Debian/Ubuntu openvpn-server@ unit)
cat /run/openvpn-server/status-server.log
journalctl -u openvpn-server@server -f

# Management interface (unix socket from server.conf)
echo "status 2" | nc -N -U /run/openvpn-server/mgmt.sock
```

**Performance:** OpenVPN 2.7 moves the data channel into the kernel (DCO) when the `ovpn` module is available (Linux 6.16+); the log then shows `DCO device tun0 opened`. DCO needs `dev tun`, `topology subnet` and an AEAD cipher, and options such as `fragment` or compression switch it off (`Note: --fragment disables data channel offload.`). Leave `fragment` out: it must match on both ends and breaks clients that lack it.

## Examples

### Example 1: Deploy a full OpenVPN server with client provisioning
**User prompt:** "Set up an OpenVPN server on our Ubuntu 22.04 VPS at 198.51.100.25. Create a full PKI with EasyRSA, configure UDP on port 1194 with AES-256-GCM, push DNS 1.1.1.1 to clients, and generate .ovpn profiles for alice, bob, and carol."

The agent will install openvpn and easy-rsa, initialize a PKI with EC keys (secp384r1), build a CA, generate server and three client certificates, create a server.conf with UDP/TUN/AES-256-GCM and NAT masquerading, write a `generate-client.sh` script, produce self-contained `.ovpn` files for alice, bob, and carol with embedded certificates, enable IP forwarding, persist iptables rules, and start the service.

```bash
cd ~/openvpn-ca
for c in alice bob carol; do
  ./easyrsa --batch build-client-full "$c" nopass
  VPN_SERVER_HOST=198.51.100.25 bash ~/generate-client.sh "$c"
done
echo "status 2" | nc -N -U /run/openvpn-server/mgmt.sock
```

Each run prints `Created: /root/client-configs/alice.ovpn`. Once a client imports its profile, its log ends with `Initialization Sequence Completed` and the status output lists it:

```
CLIENT_LIST,alice,203.0.113.47:44521,10.8.0.2,,3909,3835,2026-10-01 09:58:16,1790848696,UNDEF,0,0,AES-256-GCM
```

### Example 2: Add TOTP two-factor authentication to an existing OpenVPN server
**User prompt:** "Our OpenVPN server is running but we need to add Google Authenticator MFA. Set it up so each user needs their certificate plus a TOTP code to connect."

The agent will install `libpam-google-authenticator`, create a PAM config at `/etc/pam.d/openvpn` requiring the Google Authenticator module, add the PAM plugin directive and `auth-gen-token` to server.conf, run `google-authenticator` once per user to create `/etc/openvpn/google-authenticator/carol` (and show the QR code to that user), add `auth-user-pass` to the client `.ovpn` templates, and restart the OpenVPN service. It will explain that users enter their username and TOTP code when prompted.

```bash
systemctl restart openvpn-server@server
journalctl -u openvpn-server@server -n 20 | grep -E "PLUGIN|authentication"
```

After a restart the log shows `PLUGIN AUTH-PAM: BACKGROUND: initialization succeeded`; a correct code logs `TLS: Username/Password authentication succeeded for username 'carol'`, and a wrong code makes the client stop with `AUTH: Received control message: AUTH_FAILED`.

## Guidelines

- Always protect the control channel with `tls-crypt-v2` (per-client keys) or `tls-crypt`; unauthenticated packets are then dropped before they reach the TLS stack and the certificates are hidden from observers
- Use elliptic curve keys (`EASYRSA_ALGO ec`, `EASYRSA_CURVE secp384r1`) for faster handshakes and stronger security than RSA-2048
- Keep the CA private key offline or on a separate machine; if compromised, an attacker can issue valid client certificates
- Set `crl-verify` and regenerate the CRL after every revocation — and before it expires (`EASYRSA_CRL_DAYS`, 180 by default): an expired CRL makes the server reject all new connections
- Install the CRL with mode 644. Easy-RSA writes it as 600, and a server running as `nobody` that cannot re-read a replaced CRL fails every client with `VERIFY ERROR: CRL not loaded`
- Prefer UDP over TCP for the VPN tunnel to avoid TCP-over-TCP performance degradation; use TCP 443 only as a fallback for restrictive networks
- Keep the management interface on a unix socket; a TCP management port without a password lets any local user control the server, and OpenVPN warns about it at startup
- Linux clients older than 2.7 do not apply pushed DNS servers on their own; they need an `up`/`down` script such as `update-resolv-conf`
- Do not enable compression: the manual calls it a potentially dangerous option, and 2.7 never compresses outgoing data
- Test split tunnel configurations by checking client routing tables (`ip route`) after connecting to verify only intended traffic routes through the VPN
