---
name: tailscale
description: >-
  Build zero-trust networks with Tailscale — mesh VPN setup, ACLs, exit nodes,
  subnet routing, MagicDNS, Funnel, SSH, and API automation. Use when tasks
  involve connecting remote machines, securing internal services, replacing
  traditional VPNs, or exposing local services to the internet.
license: Apache-2.0
compatibility: "No special requirements"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["tailscale", "vpn", "networking", "wireguard", "zero-trust"]
---

# Tailscale

## Overview

Build zero-trust mesh networks that connect servers, laptops, and cloud instances as if they're on the same LAN. Built on WireGuard, managed through a control plane.

## Instructions

### Setup

```bash
# Ubuntu 24.04 (use your release's codename instead of noble; list at https://pkgs.tailscale.com/stable/)
sudo mkdir -p --mode=0755 /usr/share/keyrings
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.noarmor.gpg | sudo tee /usr/share/keyrings/tailscale-archive-keyring.gpg >/dev/null
curl -fsSL https://pkgs.tailscale.com/stable/ubuntu/noble.tailscale-keyring.list | sudo tee /etc/apt/sources.list.d/tailscale.list
sudo apt-get update && sudo apt-get install tailscale
sudo tailscale up

# Fedora 41+ (dnf5)
sudo dnf config-manager addrepo --from-repofile=https://pkgs.tailscale.com/stable/fedora/tailscale.repo
sudo dnf install tailscale
sudo systemctl enable --now tailscaled
sudo tailscale up

# macOS (Homebrew installs the open-source CLI daemon; the App Store app is the GUI alternative)
brew install tailscale

# Headless server: authenticate with an auth key from the environment
sudo tailscale up --auth-key="$TS_AUTHKEY"

tailscale status
```

Flag spelling is `--auth-key` (the old `--authkey` is no longer in the CLI reference). `tailscale up` reapplies every flag you pass; to change one setting later use `tailscale set` (for example `sudo tailscale set --ssh`).

#### Auth Keys

Generate in the admin console under Settings, Keys (https://login.tailscale.com/admin/settings/keys). Auth keys expire after 1 to 90 days (90 if you pick nothing).

- **Reusable** — same key for multiple machines (fleet provisioning)
- **Ephemeral** — machine removed when it disconnects (CI runners, containers)
- **Pre-approved** — skips device approval when your tailnet requires it
- **Tags** — a key can register devices as `tag:ci`; those devices are owned by the tag, not by a person

```bash
# Ephemeral node: the key must be created as ephemeral; the node is then removed on disconnect (CI/CD runners)
sudo tailscale up --auth-key="$TS_AUTHKEY" --hostname="ci-runner-$GITHUB_RUN_ID"
```

### Access Control (ACLs)

The policy file defines who can reach what. It is HuJSON (comments and trailing commas allowed). Edit it in the admin console under Access controls or via the API. The `acls` rules below still work; Tailscale also offers a newer `grants` syntax (network and app capabilities) in the same file.

```jsonc
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
    "group:devs": ["maria.santos@northwind.io", "dmitri.volkov@northwind.io"],
    "group:ops": ["priya.nair@northwind.io"]
  },

  "tagOwners": {
    "tag:dev": ["group:devs"],
    "tag:staging": ["group:ops"],
    "tag:prod": ["group:ops"],
    "tag:shared": ["group:ops"]
  }
}
```

### Subnet Router

Expose an entire network (e.g., AWS VPC, office LAN) to your tailnet without installing Tailscale on every machine:

```bash
# On the gateway machine in the target network
# Enable IP forwarding first (required)
echo 'net.ipv4.ip_forward = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' | sudo tee -a /etc/sysctl.d/99-tailscale.conf
sudo sysctl -p /etc/sysctl.d/99-tailscale.conf

sudo tailscale set --advertise-routes=10.0.0.0/16,172.16.0.0/12
```

Approve the routes in the admin console (Machines, Edit route settings) or via API. Linux clients must opt in with `sudo tailscale set --accept-routes`; Windows, iOS, Android and the macOS apps accept routes by default. Then tailnet members can reach `10.0.0.0/16` through the subnet router, subject to the ACLs. With firewalld, `firewall-cmd --permanent --add-masquerade` may be needed.

### Exit Node

Route all internet traffic through a specific machine (like a traditional VPN):

```bash
# On the exit node (e.g., a VPS in a specific country); on Linux enable IP forwarding first, as in Subnet Router
sudo tailscale set --advertise-exit-node
# Then approve it in the admin console (Machines, Edit route settings, Use as exit node)

# On the client — use the exit node (name or Tailscale IP)
sudo tailscale set --exit-node=exit-server-hostname
# Turn it off again: sudo tailscale set --exit-node=

# Verify — should show the exit node's IP
curl ifconfig.me
```

### MagicDNS

With MagicDNS on (the default for new tailnets), every machine gets a DNS name: `hostname.tailnet-name.ts.net` (the tailnet name looks like `tail4f9c2.ts.net` unless you renamed it), and the short `hostname` works inside the tailnet:

```bash
# Access your home server from anywhere
ssh home-server.tail4f9c2.ts.net

# Connect to a database
psql -h db-server.tail4f9c2.ts.net -U postgres

# Internal service discovery
curl http://api-server.tail4f9c2.ts.net:3000/health
```

### Tailscale SSH

Replace SSH key management entirely. Tailscale authenticates SSH connections using your identity:

```bash
# Enable Tailscale SSH on a server
sudo tailscale set --ssh

# Connect — no keys needed, authenticated by Tailscale identity
ssh deploy@server.tail4f9c2.ts.net

# SSH rules live in the "ssh" section of the policy file; without a matching rule nobody gets in:
# "ssh": [
#   {"action": "accept", "src": ["group:ops"], "dst": ["tag:prod"], "users": ["root"]},
#   {"action": "accept", "src": ["group:devs"], "dst": ["tag:dev"], "users": ["deploy"]}
# ]
```

### Serve and Funnel

`tailscale serve` shares a local service inside the tailnet; `tailscale funnel` makes it public. Both need MagicDNS and HTTPS certificates enabled for the tailnet, and Funnel also needs the `funnel` node attribute (`"nodeAttrs": [{"target": ["autogroup:member"], "attr": ["funnel"]}]`); the CLI offers to set these up.

```bash
# Share a local port inside the tailnet, in the background
tailscale serve --bg 3000
tailscale serve status

# Publish a path to the public internet; Funnel listens only on 443, 8443 or 10000
tailscale funnel --bg --set-path /webhooks 8080
tailscale funnel status
tailscale funnel reset      # stop all funnels
```

Funnel URLs always use your `*.ts.net` name (no custom domains), traffic is bandwidth-limited, and one port is either Serve (private) or Funnel (public), whichever command ran last. Without `--bg` the command runs in the foreground until interrupted.

### API Automation

Base URL `https://api.tailscale.com/api/v2`. Use `-` as the tailnet to mean the default tailnet of the credential. Authenticate with a Bearer token: an API access token (`tskey-api-…`, which expires) or an OAuth access token minted from an OAuth client with narrow scopes, which is the better choice for automation.

```python
"""tailscale_api.py — Manage a tailnet programmatically."""
import os
import requests

API = "https://api.tailscale.com/api/v2"
TAILNET = "-"  # default tailnet of the credential
headers = {"Authorization": f"Bearer {os.environ['TS_API_KEY']}"}


def call(method: str, path: str, **kwargs) -> dict:
    resp = requests.request(method, f"{API}{path}", headers=headers, timeout=30, **kwargs)
    resp.raise_for_status()
    return resp.json() if resp.content else {}


def list_devices() -> list:
    """Devices with their addresses, tags and last-seen time."""
    return call("GET", f"/tailnet/{TAILNET}/devices", params={"fields": "all"})["devices"]


def set_device_tags(device_id: str, tags: list[str]) -> None:
    """Replace the ACL tags on a device, e.g. ['tag:prod', 'tag:db']."""
    call("POST", f"/device/{device_id}/tags", json={"tags": tags})


def create_auth_key(tags: list[str], reusable=False, ephemeral=False, expiry_seconds=3600) -> str:
    """Create a pre-approved auth key that registers devices with the given tags."""
    body = {
        "capabilities": {"devices": {"create": {
            "reusable": reusable, "ephemeral": ephemeral,
            "preauthorized": True, "tags": tags,
        }}},
        "expirySeconds": expiry_seconds,
    }
    return call("POST", f"/tailnet/{TAILNET}/keys", json=body)["key"]


def approve_routes(device_id: str, routes: list[str]) -> None:
    """Enable subnet routes the device advertised, e.g. ['10.0.0.0/16']."""
    call("POST", f"/device/{device_id}/routes", json={"routes": routes})
```

## Examples

### Example 1: "Add four API servers to our tailnet"

```bash
#!/bin/bash
# provision-fleet.sh — needs TS_API_KEY in the environment
set -euo pipefail
SERVERS=("10.0.1.10" "10.0.1.11" "10.0.1.12" "10.0.1.13")

# Short-lived, tagged, pre-approved, reusable only for this batch window
AUTH_KEY=$(curl -s -X POST "https://api.tailscale.com/api/v2/tailnet/-/keys" \
  -H "Authorization: Bearer $TS_API_KEY" -H "Content-Type: application/json" \
  -d '{"capabilities":{"devices":{"create":{"reusable":true,"preauthorized":true,"tags":["tag:prod","tag:api"]}}},"expirySeconds":900}' \
  | jq -r '.key')

for server in "${SERVERS[@]}"; do
  ssh "$server" "sudo tailscale up --auth-key='$AUTH_KEY' --hostname=api-\$(hostname -s)" &
done
wait
tailscale status | grep api-
```

The key lives for 15 minutes, so a leaked copy is useless afterwards. The servers must already have Tailscale installed (see Setup), and the tags must exist in `tagOwners`.

### Example 2: "Give my dev web app a private HTTPS URL from a container"

```yaml
# docker-compose.yml — the app is reachable only inside the tailnet
services:
  tailscale:
    image: tailscale/tailscale:stable
    hostname: dashboard
    environment:
      TS_AUTHKEY: ${TS_AUTHKEY}
      TS_STATE_DIR: /var/lib/tailscale
      TS_SERVE_CONFIG: /config/serve.json
    volumes:
      - tailscale-state:/var/lib/tailscale
      - ./serve.json:/config/serve.json:ro
  app:
    image: ghcr.io/northwind/dashboard:1.4.2
    network_mode: service:tailscale   # shares the sidecar's network namespace

volumes:
  tailscale-state:
```

```json
{
  "TCP": {"443": {"HTTPS": true}},
  "Web": {"${TS_CERT_DOMAIN}:443": {"Handlers": {"/": {"Proxy": "http://127.0.0.1:3000"}}}}
}
```

The container image runs `tailscaled` in userspace mode by default, so no `NET_ADMIN` capability is needed for this setup (set `TS_USERSPACE=false` and add `NET_ADMIN` plus `/dev/net/tun` only for subnet-router or exit-node containers). Keep the state volume, otherwise the node re-registers on every restart.

## Guidelines

- **Auth keys for automation** — never use interactive login for servers. Generate auth keys with appropriate tags.
- **Tag servers** — tag servers and CI nodes at provisioning time so access follows the tag, not whoever logged in. A tagged device loses its user identity.
- **Ephemeral keys for ephemeral workloads** — CI runners, preview environments, and containers should auto-remove when they disconnect.
- **Subnet routers need IP forwarding and route approval**, and Linux clients need `--accept-routes`. Missing one of the three is the usual cause of "route advertised but unreachable".
- **MagicDNS replaces IP addresses** — use hostnames everywhere. IPs change; DNS names don't.
- **Funnel for webhooks** — expose a local endpoint to third-party services without ngrok, and remember it is public: validate webhook signatures and run `tailscale funnel reset` when done.
- **Diagnose before blaming ACLs** — `tailscale ping <host>` shows whether the path is direct or relayed, and `tailscale netcheck` reports local network conditions.
- **Key hygiene** — keep keys in environment variables or a secret manager, give auth keys short expiry, and prefer OAuth clients over personal API keys for automation.
