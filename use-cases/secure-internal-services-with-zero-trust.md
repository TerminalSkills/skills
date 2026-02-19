---
title: Secure Internal Services with Zero-Trust Networking
slug: secure-internal-services-with-zero-trust
description: "Connect distributed servers and internal tools through a Tailscale mesh network with Caddy as a reverse proxy, replacing VPN appliances and firewall rules with identity-based access control."
skills: [tailscale, caddy]
category: devops
tags: [tailscale, caddy, zero-trust, networking, security, vpn]
---

# Secure Internal Services with Zero-Trust Networking

## The Problem

A 40-person startup runs internal tools across three environments: a Hetzner VPS cluster for production, a home office NAS for backups, and various developer laptops. The tools -- Grafana dashboards, a staging environment, an internal admin panel, a wiki, and a CI runner -- sit behind a patchwork of SSH tunnels, IP allowlists, and a self-hosted OpenVPN server that someone set up two years ago and nobody wants to touch.

The VPN breaks constantly. Developers reconnect 3-4 times a day, the VPN server needs manual certificate renewal every 90 days (and someone always forgets), and the flat network means anyone connected to the VPN can reach everything -- the new intern has the same network access as the infrastructure lead. When someone works from a coffee shop, they VPN in, and all their traffic routes through the company VPN (no split tunneling was configured), making video calls lag.

IP allowlists are worse. The staging server allows traffic from the office IP, but half the team is remote. Adding each developer's home IP means maintaining a list that changes every time someone's ISP rotates their address or they work from a new location.

## The Solution

Replace the VPN and IP allowlists with **tailscale** for identity-based mesh networking and **caddy** as a reverse proxy for internal services. Tailscale connects all machines into a WireGuard mesh -- every server, laptop, and home NAS can reach each other by hostname, with access controlled by who you are (not where you connect from). Caddy sits on each server and proxies internal services with automatic HTTPS, even on internal tailnet addresses.

## Step-by-Step Walkthrough

### Step 1: Set Up the Tailnet

```text
I have 3 Hetzner VPS instances (prod-api, prod-db, monitoring), a home NAS, 
and 15 developer laptops. Set up Tailscale to connect them all with ACLs that 
give developers access to staging and monitoring but restrict production database 
access to the ops team only.
```

Install Tailscale on each server using auth keys tagged by role. Auth keys automate the process -- no interactive login needed on headless servers:

```bash
# Generate tagged auth keys via the API (or admin panel)
# Reusable key for production servers
curl -s -X POST "https://api.tailscale.com/api/v2/tailnet/example.com/keys" \
  -H "Authorization: Bearer $TS_API_KEY" \
  -d '{"capabilities":{"devices":{"create":{"reusable":true,"tags":["tag:prod"]}}}}' \
  | jq -r '.key'

# Reusable key for monitoring/staging
curl -s -X POST "https://api.tailscale.com/api/v2/tailnet/example.com/keys" \
  -H "Authorization: Bearer $TS_API_KEY" \
  -d '{"capabilities":{"devices":{"create":{"reusable":true,"tags":["tag:monitoring"]}}}}' \
  | jq -r '.key'
```

```bash
# On each production server
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --authkey=tskey-auth-prod-... --hostname=prod-api

# On the monitoring server
sudo tailscale up --authkey=tskey-auth-mon-... --hostname=monitoring

# On the home NAS
sudo tailscale up --authkey=tskey-auth-backup-... --hostname=home-nas

# Verify mesh connectivity
tailscale status
# prod-api         100.64.0.1    linux   -
# prod-db          100.64.0.2    linux   -
# monitoring       100.64.0.3    linux   -
# home-nas         100.64.0.4    linux   -
```

Every machine gets a stable IP (`100.64.x.x`) and a MagicDNS name (`prod-api.example.ts.net`). The mesh is peer-to-peer -- traffic between two servers in the same Hetzner datacenter goes directly, not through a central VPN server.

### Step 2: Configure Access Control

ACLs define who can reach what. The policy is code -- version-controlled, auditable, and testable:

```json
{
  "acls": [
    {
      "action": "accept",
      "src": ["group:engineering"],
      "dst": [
        "tag:monitoring:80,443,3000",
        "tag:staging:*"
      ]
    },
    {
      "action": "accept",
      "src": ["group:ops"],
      "dst": ["tag:prod:*", "tag:monitoring:*", "tag:staging:*"]
    },
    {
      "action": "accept",
      "src": ["group:ops"],
      "dst": ["tag:backup:22,443,5000"]
    },
    {
      "action": "accept",
      "src": ["tag:prod"],
      "dst": ["tag:prod:*"]
    },
    {
      "action": "accept",
      "src": ["tag:monitoring"],
      "dst": ["tag:prod:9090,9100,5432"]
    }
  ],

  "groups": {
    "group:engineering": [
      "dev1@example.com", "dev2@example.com", "dev3@example.com"
    ],
    "group:ops": [
      "ops-lead@example.com", "sre@example.com"
    ]
  },

  "tagOwners": {
    "tag:prod": ["group:ops"],
    "tag:staging": ["group:ops"],
    "tag:monitoring": ["group:ops"],
    "tag:backup": ["group:ops"]
  },

  "ssh": [
    {
      "action": "accept",
      "src": ["group:ops"],
      "dst": ["tag:prod"],
      "users": ["deploy", "root"]
    },
    {
      "action": "accept",
      "src": ["group:engineering"],
      "dst": ["tag:staging"],
      "users": ["deploy"]
    }
  ]
}
```

What this policy says: developers can reach monitoring dashboards and staging on web ports. Only the ops team can access production servers and the backup NAS. Production servers can talk to each other (for the API to reach the database). The monitoring server can scrape Prometheus metrics and query the production database for health checks. SSH access is restricted by role -- developers can only SSH into staging, ops can SSH into production.

### Step 3: Set Up Caddy as Internal Reverse Proxy

Each server runs Caddy to proxy internal services. Since everything is on the tailnet, Caddy uses Tailscale's built-in HTTPS certificates -- no Let's Encrypt, no DNS challenge, no cert management:

```caddyfile
# /etc/caddy/Caddyfile on the monitoring server

# Grafana dashboard — accessible to all engineers
monitoring.example.ts.net:443 {
    reverse_proxy localhost:3000

    # Tailscale handles auth at the network level,
    # but add Grafana's own auth as a second layer
    header {
        Strict-Transport-Security "max-age=31536000"
        X-Frame-Options "DENY"
    }
}

# Prometheus UI — restricted to ops via Tailscale ACLs (port 9090)
monitoring.example.ts.net:9090 {
    reverse_proxy localhost:9091  # Prometheus runs on 9091 internally
}

# Alertmanager
monitoring.example.ts.net:9093 {
    reverse_proxy localhost:9094
}
```

```caddyfile
# /etc/caddy/Caddyfile on the prod-api server

# Internal admin panel — only ops team can reach prod servers via ACLs
prod-api.example.ts.net:443 {
    handle /admin/* {
        reverse_proxy localhost:3001

        # Additional basic auth as defense-in-depth
        basicauth /admin/* {
            admin $2a$14$...  # caddy hash-password
        }
    }

    # API health endpoint for monitoring
    handle /health {
        reverse_proxy localhost:3000
    }

    # Block everything else on the tailnet interface
    handle {
        respond "Not found" 404
    }
}
```

```caddyfile
# /etc/caddy/Caddyfile on the home NAS

# Backup dashboard — only ops team
home-nas.example.ts.net:443 {
    reverse_proxy localhost:5000

    header {
        Strict-Transport-Security "max-age=31536000"
        -Server
    }
}
```

### Step 4: Expose Staging with Tailscale Serve

For the staging environment, Tailscale Serve provides HTTPS with valid certificates on the tailnet hostname. No Caddy needed for simple cases:

```bash
# On the staging server — serve the staging app on the tailnet
sudo tailscale serve --bg https / http://localhost:3000

# Verify
tailscale serve status
# https://staging.example.ts.net/ -> http://localhost:3000
```

Developers access staging at `https://staging.example.ts.net` -- no port numbers, no self-signed cert warnings, no VPN reconnection.

### Step 5: Set Up the Subnet Router for Legacy Services

Some internal services (a printer, an old Jenkins server, a network-attached storage device) can't run Tailscale. A subnet router exposes their network to the tailnet:

```bash
# On a machine in the office network that can reach legacy services
sudo tailscale up --authkey=tskey-auth-... \
  --advertise-routes=192.168.1.0/24 \
  --hostname=office-router

# Enable IP forwarding
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

After approving the route in the admin panel, any tailnet member can reach `192.168.1.x` devices through the office router. The old Jenkins server at `192.168.1.50:8080` is now accessible from anywhere on the tailnet -- no port forwarding, no dynamic DNS, no VPN.

### Step 6: Automate Onboarding and Offboarding

```python
"""tailnet_admin.py — Automate team member onboarding/offboarding."""
import requests

API = "https://api.tailscale.com/api/v2"
TAILNET = "example.com"
headers = {"Authorization": f"Bearer {TS_API_KEY}"}

def onboard_developer(email: str):
    """Add a developer to the engineering group in the ACL policy.

    Args:
        email: Developer's email (must match their Tailscale identity).
    """
    # Fetch current ACL policy
    resp = requests.get(f"{API}/tailnet/{TAILNET}/acl", headers=headers)
    policy = resp.json()

    # Add to engineering group
    if email not in policy["groups"]["group:engineering"]:
        policy["groups"]["group:engineering"].append(email)

    # Update policy
    requests.post(f"{API}/tailnet/{TAILNET}/acl",
                  json=policy, headers=headers)
    print(f"Added {email} to group:engineering")

def offboard_member(email: str):
    """Remove a team member from all groups and delete their devices.

    Args:
        email: Team member's email.
    """
    # Remove from all groups
    resp = requests.get(f"{API}/tailnet/{TAILNET}/acl", headers=headers)
    policy = resp.json()
    for group in policy.get("groups", {}).values():
        if email in group:
            group.remove(email)
    requests.post(f"{API}/tailnet/{TAILNET}/acl",
                  json=policy, headers=headers)

    # Delete their devices
    devices = requests.get(f"{API}/tailnet/{TAILNET}/devices", headers=headers).json()
    for device in devices["devices"]:
        if device.get("user", "") == email:
            requests.delete(f"{API}/device/{device['id']}", headers=headers)
            print(f"Removed device: {device['name']}")

    print(f"Offboarded {email}")
```

## Real-World Example

The ops lead sets up the tailnet on a Thursday afternoon. By Friday morning, all three Hetzner servers, the monitoring box, and the home NAS are connected. Developers install Tailscale on their laptops (one command), and MagicDNS gives them instant access to `monitoring.example.ts.net` for Grafana and `staging.example.ts.net` for the staging environment. No VPN client configuration, no certificate files to distribute, no IP addresses to remember.

The old OpenVPN server gets decommissioned the following week. The immediate difference: developers stop complaining about VPN disconnections. Tailscale's WireGuard mesh reconnects transparently when switching between Wi-Fi and mobile, between home and coffee shop. The "reconnect to VPN" step that happened 3-4 times per day per developer disappears entirely.

When a contractor's engagement ends, the ops lead runs the offboarding script. Their devices are removed from the tailnet and their email is dropped from all ACL groups. Access revocation takes 30 seconds and is auditable -- the ACL policy diff shows exactly what changed and when. No more "did anyone remember to revoke their VPN certificate?" messages in Slack three weeks after someone left.

## Related Skills

- [wireguard](../skills/wireguard/) -- Manual WireGuard setup when Tailscale's control plane isn't an option
- [openvpn](../skills/openvpn/) -- Traditional VPN for environments requiring OpenVPN compatibility
