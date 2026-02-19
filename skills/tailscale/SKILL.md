---
name: tailscale
category: devops
version: 1.0.0
description: >-
  Build zero-trust networks with Tailscale — mesh VPN setup, ACLs, exit nodes,
  subnet routing, MagicDNS, Funnel, SSH, and API automation. Use when tasks
  involve connecting remote machines, securing internal services, replacing
  traditional VPNs, or exposing local services to the internet.
author: terminal-skills
tags: [tailscale, vpn, networking, wireguard, zero-trust, mesh]
---

# Tailscale

Build zero-trust mesh networks that connect servers, laptops, and cloud instances as if they're on the same LAN. Built on WireGuard, managed through a control plane.

## Setup

```bash
# Linux
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# Docker
docker run -d --name tailscale \
  --cap-add NET_ADMIN --cap-add NET_RAW \
  -v tailscale-state:/var/lib/tailscale \
  -e TS_AUTHKEY=tskey-auth-... \
  tailscale/tailscale

# Authenticate with an auth key (headless servers)
sudo tailscale up --authkey=tskey-auth-...

# Check status
tailscale status
```

### Auth Keys

Generate at https://login.tailscale.com/admin/settings/keys:

- **Reusable** — same key for multiple machines (fleet provisioning)
- **Ephemeral** — machine removed when it disconnects (CI runners, containers)
- **Pre-approved** — skips admin approval

```bash
# Ephemeral node (auto-removed on disconnect — good for CI/CD runners)
tailscale up --authkey=tskey-auth-... --hostname=ci-runner-$(date +%s)
```

## Access Control (ACLs)

ACLs define who can reach what. Edit at https://login.tailscale.com/admin/acls or via API:

```json
{
  "acls": [
    // Developers can reach dev and staging servers
    {"action": "accept", "src": ["group:devs"], "dst": ["tag:dev:*", "tag:staging:*"]},

    // Only ops team can reach production
    {"action": "accept", "src": ["group:ops"], "dst": ["tag:prod:*"]},

    // Everyone can use DNS and HTTPS on shared services
    {"action": "accept", "src": ["*"], "dst": ["tag:shared:80,443,53"]},

    // SSH only for ops
    {"action": "accept", "src": ["group:ops"], "dst": ["*:22"]}
  ],

  "groups": {
    "group:devs": ["user@example.com", "dev2@example.com"],
    "group:ops": ["ops@example.com"]
  },

  "tagOwners": {
    "tag:dev": ["group:devs"],
    "tag:staging": ["group:ops"],
    "tag:prod": ["group:ops"],
    "tag:shared": ["group:ops"]
  }
}
```

## Subnet Router

Expose an entire network (e.g., AWS VPC, office LAN) to your tailnet without installing Tailscale on every machine:

```bash
# On the gateway machine in the target network
sudo tailscale up --advertise-routes=10.0.0.0/16,172.16.0.0/12

# Enable IP forwarding (required)
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

Approve routes in the admin panel or via API. Now every tailnet member can reach `10.0.0.0/16` through the subnet router.

## Exit Node

Route all internet traffic through a specific machine (like a traditional VPN):

```bash
# On the exit node (e.g., a VPS in a specific country)
sudo tailscale up --advertise-exit-node

# On the client — use the exit node
sudo tailscale up --exit-node=exit-server-hostname

# Verify — should show the exit node's IP
curl ifconfig.me
```

## MagicDNS

Every machine gets a DNS name: `hostname.tailnet-name.ts.net`. No IP addresses to remember:

```bash
# Access your home server from anywhere
ssh home-server.tailnet.ts.net

# Connect to a database
psql -h db-server.tailnet.ts.net -U postgres

# Internal service discovery
curl http://api-server.tailnet.ts.net:3000/health
```

## Tailscale SSH

Replace SSH key management entirely. Tailscale authenticates SSH connections using your identity:

```bash
# Enable Tailscale SSH on a server
sudo tailscale up --ssh

# Connect — no keys needed, authenticated by Tailscale identity
ssh user@server.tailnet.ts.net

# SSH ACL (add to your ACL policy)
# "ssh": [
#   {"action": "accept", "src": ["group:ops"], "dst": ["tag:prod"], "users": ["root"]},
#   {"action": "accept", "src": ["group:devs"], "dst": ["tag:dev"], "users": ["deploy"]}
# ]
```

## Funnel (expose to internet)

Expose a local service to the public internet through Tailscale's infrastructure — no port forwarding, no dynamic DNS:

```bash
# Serve a local port publicly
tailscale funnel 3000

# Custom hostname (requires DNS setup)
tailscale funnel --set-path /api 8080

# HTTPS serve (local dev with real TLS cert)
tailscale serve https / http://localhost:3000
tailscale serve status  # Show what's being served
```

## API Automation

```python
"""tailscale_api.py — Manage tailnet programmatically."""
import requests

API = "https://api.tailscale.com/api/v2"
TAILNET = "example.com"  # Your tailnet name
API_KEY = "tskey-api-..."  # Generate at admin panel → Settings → Keys

headers = {"Authorization": f"Bearer {API_KEY}"}

def list_devices() -> list:
    """List all devices in the tailnet with their IPs and status."""
    resp = requests.get(f"{API}/tailnet/{TAILNET}/devices", headers=headers)
    return resp.json()["devices"]

def set_device_tags(device_id: str, tags: list[str]):
    """Set ACL tags on a device (e.g., ['tag:prod', 'tag:db']).

    Args:
        device_id: Device ID from list_devices.
        tags: List of ACL tags to apply.
    """
    requests.post(f"{API}/device/{device_id}/tags",
                  json={"tags": tags}, headers=headers)

def create_auth_key(reusable: bool = False, ephemeral: bool = False,
                    tags: list[str] = None) -> str:
    """Create an auth key for automated device registration.

    Args:
        reusable: Allow key to register multiple devices.
        ephemeral: Devices auto-removed on disconnect.
        tags: ACL tags applied to devices using this key.
    """
    body = {
        "capabilities": {
            "devices": {
                "create": {
                    "reusable": reusable,
                    "ephemeral": ephemeral,
                    "tags": tags or [],
                }
            }
        }
    }
    resp = requests.post(f"{API}/tailnet/{TAILNET}/keys",
                         json=body, headers=headers)
    return resp.json()["key"]

def approve_routes(device_id: str, routes: list[str]):
    """Approve advertised subnet routes for a device.

    Args:
        device_id: Device ID.
        routes: Routes to approve (e.g., ['10.0.0.0/16']).
    """
    resp = requests.post(f"{API}/device/{device_id}/routes",
                         json={"routes": routes}, headers=headers)
    return resp.json()
```

### Fleet Provisioning

```bash
#!/bin/bash
# provision-fleet.sh — Add a batch of servers to the tailnet

SERVERS=("10.0.1.10" "10.0.1.11" "10.0.1.12" "10.0.1.13")
TAGS="tag:prod,tag:api"

# Create a reusable, pre-approved auth key with tags
AUTH_KEY=$(curl -s -X POST "https://api.tailscale.com/api/v2/tailnet/$TAILNET/keys" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"capabilities\":{\"devices\":{\"create\":{\"reusable\":true,\"tags\":[\"$TAGS\"]}}}}" \
  | jq -r '.key')

for server in "${SERVERS[@]}"; do
  ssh "$server" "curl -fsSL https://tailscale.com/install.sh | sh && \
    sudo tailscale up --authkey=$AUTH_KEY --hostname=api-$(hostname -s)" &
done
wait

echo "Fleet provisioning complete"
```

## Docker Integration

Run services inside Docker accessible via tailnet:

```yaml
# docker-compose.yml — Service accessible via Tailscale
services:
  tailscale:
    image: tailscale/tailscale
    cap_add: [NET_ADMIN, NET_RAW]
    volumes:
      - tailscale-state:/var/lib/tailscale
    environment:
      TS_AUTHKEY: tskey-auth-...
      TS_EXTRA_ARGS: --hostname=my-service
      TS_SERVE_CONFIG: /config/serve.json
    volumes:
      - ./serve.json:/config/serve.json

  app:
    image: my-app:latest
    network_mode: service:tailscale  # Share Tailscale's network namespace

volumes:
  tailscale-state:
```

## Guidelines

- **Auth keys for automation** — never use interactive login for servers. Generate auth keys with appropriate tags.
- **Tag everything** — ACLs are tag-based. Untagged devices can't be referenced in policies. Tag at provisioning time.
- **Ephemeral keys for ephemeral workloads** — CI runners, preview environments, and containers should auto-remove when they disconnect.
- **Subnet routers need IP forwarding** — forgetting `sysctl net.ipv4.ip_forward=1` is the #1 setup issue.
- **MagicDNS replaces IP addresses** — use hostnames everywhere. IPs change; DNS names don't.
- **Funnel for webhooks** — expose a local development endpoint for testing webhooks from third-party services without ngrok.
- **ACL testing** — use `tailscale ping` and `tailscale netcheck` to diagnose connectivity issues before blaming ACLs.
- **Key rotation** — API keys and auth keys should be rotated regularly. Use short-lived keys where possible.
