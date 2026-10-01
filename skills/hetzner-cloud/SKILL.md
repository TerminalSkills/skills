---
name: hetzner-cloud
description: >-
  Manage Hetzner Cloud infrastructure from the terminal. Use when a user asks
  to create a Hetzner server, manage VPS instances, set up firewalls, configure
  networks, manage volumes, create snapshots, handle SSH keys, or provision
  infrastructure on Hetzner. Covers the hcloud CLI for all resource types.
  For deploying applications on top of Hetzner servers, see coolify.
license: Apache-2.0
compatibility: "Requires the hcloud CLI (commands checked against 1.69.0) and a Hetzner Cloud API token. Install: brew install hcloud (macOS, Linux), winget install HetznerCloud.CLI (Windows), or a release binary from https://github.com/hetznercloud/cli/releases"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["hetzner", "cloud", "vps", "infrastructure", "hosting"]
  repository: https://github.com/hetznercloud/cli
---

# Hetzner Cloud

## Overview

Provision and manage Hetzner Cloud infrastructure from the terminal using the `hcloud` CLI. Covers servers, networks, firewalls, volumes, snapshots, SSH keys, and load balancers. Hetzner offers high-performance VPS instances at competitive prices, commonly used to host self-managed platforms like Coolify. Every `create` command here starts billing on the user's account, so confirm type, location and count before running one.

## Instructions

When a user asks for help with Hetzner Cloud, determine which task they need:

### Task A: Initial setup

```bash
# Install with a package manager
brew install hcloud                  # macOS and Linux
winget install HetznerCloud.CLI      # Windows (or: scoop install hcloud)

# Linux without Homebrew: release binary, checked against the published checksums
curl -sSLO https://github.com/hetznercloud/cli/releases/download/v1.69.0/hcloud-linux-amd64.tar.gz
curl -sSLO https://github.com/hetznercloud/cli/releases/download/v1.69.0/checksums.txt
grep ' hcloud-linux-amd64.tar.gz$' checksums.txt | sha256sum -c -   # must print "hcloud-linux-amd64.tar.gz: OK"
tar -xzf hcloud-linux-amd64.tar.gz hcloud
mkdir -p ~/.local/bin && install -m 0755 hcloud ~/.local/bin/hcloud

# Create a context (one per Hetzner project); it prompts for the API token
# Token: Hetzner Console > project > Security > API tokens > Generate API token (Read & Write)
hcloud context create shop-prod

# Non-interactive (CI, agents): take the token from the HCLOUD_TOKEN environment variable
hcloud context create --token-from-env shop-prod

# List contexts, switch between them, check that the token works
hcloud context list
hcloud context use shop-prod
hcloud location list
```

A context is optional: with `HCLOUD_TOKEN` set, commands work without a config file. Contexts are stored in `~/.config/hcloud/cli.toml`; set `HCLOUD_CONFIG` to use another file (changing `HOME` alone does not move it). The token is 64 characters and is shown only once in the Console.

### Task B: Server management

```bash
# List server types (name, cores, memory, disk) and inspect one
hcloud server-type list
hcloud server-type describe cx33

# List available images (OS options)
hcloud image list --type system

# Create a server (the SSH key and the firewall must already exist: Task E, Task C)
hcloud server create \
  --name web-1 \
  --type cx33 \
  --image ubuntu-24.04 \
  --location fsn1 \
  --ssh-key deploy-key \
  --firewall web-firewall \
  --user-data-from-file cloud-init.yaml   # optional: cloud-init config

# List servers, get details, print the public IPv4
hcloud server list
hcloud server describe web-1
hcloud server ip web-1

# SSH into a server (root by default; -u for another user)
hcloud server ssh web-1

# Stop/start/reboot
hcloud server shutdown web-1 --wait   # graceful ACPI shutdown
hcloud server poweron web-1
hcloud server reboot web-1

# Resize a server (it must be powered off; arguments are positional)
hcloud server shutdown web-1 --wait
hcloud server change-type --keep-disk web-1 cx43   # --keep-disk keeps a later downgrade possible
hcloud server poweron web-1

# Rebuild from an image (overwrites the disk)
hcloud server rebuild web-1 --image ubuntu-24.04

# Enable rescue mode (for recovery), then reboot into it
hcloud server enable-rescue web-1 --ssh-key deploy-key
hcloud server reboot web-1

# Protect against accidental deletion and rebuild
hcloud server enable-protection web-1 delete rebuild

# Delete when no longer needed (a protected server refuses: lift the protection first)
hcloud server disable-protection web-1 delete rebuild
hcloud server delete web-1
```

**Common server types** (`cx22`–`cx52`, and outside the US `cpx11`–`cpx51`, can no longer be ordered since 1 January 2026):

| Type | vCPU | RAM | Disk | Use case |
|------|------|-----|------|----------|
| cx23 | 2 | 4 GB | 40 GB | Small apps, staging (cost-optimized, EU only) |
| cx33 | 4 | 8 GB | 80 GB | Production apps |
| cx43 | 8 | 16 GB | 160 GB | Databases, heavy workloads |
| cx53 | 16 | 32 GB | 320 GB | High-traffic applications |
| cpx22 | 2 | 4 GB | 80 GB | Regular-performance shared AMD (EU and Singapore) |
| cax11 | 2 | 4 GB | 40 GB | Arm (Ampere), EU only; needs an Arm image |
| ccx13 | 2 | 8 GB | 80 GB | Dedicated vCPU, consistent performance |

**Locations:** `fsn1` (Falkenstein), `nbg1` (Nuremberg), `hel1` (Helsinki) in network zone `eu-central`; `ash` (Ashburn, `us-east`), `hil` (Hillsboro, `us-west`), `sin` (Singapore, `ap-southeast`). Not every type exists everywhere: the US locations offer the older `cpx11`–`cpx51` and the `ccx` types. Check with `hcloud server-type describe`.

### Task C: Networking

```bash
# Create a private network
hcloud network create --name backend-net --ip-range 10.0.0.0/16

# Add a subnet
hcloud network add-subnet backend-net --type cloud --network-zone eu-central --ip-range 10.0.1.0/24

# Attach server to network
hcloud server attach-to-network web-1 --network backend-net --ip 10.0.1.2

# Create a firewall
hcloud firewall create --name web-firewall

# Add firewall rules (IPv4 and IPv6 sources)
hcloud firewall add-rule web-firewall --direction in --protocol tcp --port 22 --source-ips 203.0.113.10/32 --description "SSH from office"
hcloud firewall add-rule web-firewall --direction in --protocol tcp --port 80 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTP"
hcloud firewall add-rule web-firewall --direction in --protocol tcp --port 443 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTPS"

# Apply firewall to one server, or to every server carrying a label
hcloud firewall apply-to-resource web-firewall --type server --server web-1
hcloud firewall apply-to-resource web-firewall --type label_selector --label-selector role=web

# Allocate a floating IP and assign it to a server
hcloud floating-ip create --type ipv4 --home-location fsn1 --name prod-ip --description "Production IP"
hcloud floating-ip assign prod-ip web-1

# Load balancer in front of two servers
hcloud load-balancer create --name web-lb --type lb11 --location fsn1
hcloud load-balancer add-target web-lb --server web-1
hcloud load-balancer add-target web-lb --server web-2
hcloud load-balancer add-service web-lb --protocol tcp --listen-port 80 --destination-port 8080
```

### Task D: Volumes and snapshots

```bash
# Create a volume, attach it and mount it under /mnt
hcloud volume create --name data-volume --size 50 --server web-1 --format ext4 --automount

# List volumes; describe shows the device (/dev/disk/by-id/scsi-0HC_Volume_...)
hcloud volume list
hcloud volume describe data-volume

# Resize a volume (grow only), then grow the filesystem on the server
hcloud volume resize data-volume --size 100
hcloud server ssh web-1 'resize2fs /dev/disk/by-id/scsi-0HC_Volume_103418762'

# Detach/attach a volume
hcloud volume detach data-volume
hcloud volume attach data-volume --server web-2 --automount

# Create a server snapshot
hcloud server create-image web-1 --type snapshot --description "Before upgrade"

# List snapshots, create a server from one (by image ID), delete it
hcloud image list --type snapshot
hcloud server create --name restored-web --type cx33 --image 248117630 --ssh-key deploy-key
hcloud image delete 248117630

# Daily automatic backups (7 slots, 20% of the server price)
hcloud server enable-backup web-1
```

### Task E: SSH keys and security

```bash
# Upload an SSH key
hcloud ssh-key create --name deploy-key --public-key-from-file ~/.ssh/id_ed25519.pub

# Use it for every new server in this context without passing --ssh-key (no active context: add --global)
hcloud config set default-ssh-keys deploy-key

# List SSH keys, delete one
hcloud ssh-key list
hcloud ssh-key delete deploy-key
```

### Task F: Set up a server for Coolify

A common workflow — provision a Hetzner server and install Coolify:

```bash
# 1. Create the firewall first: SSH and the setup ports only from the admin's address
hcloud firewall create --name coolify-firewall
hcloud firewall add-rule coolify-firewall --direction in --protocol tcp --port 22 --source-ips 203.0.113.10/32 --description "SSH"
hcloud firewall add-rule coolify-firewall --direction in --protocol tcp --port 80 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTP"
hcloud firewall add-rule coolify-firewall --direction in --protocol tcp --port 443 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTPS"
hcloud firewall add-rule coolify-firewall --direction in --protocol tcp --port 8000 --source-ips 203.0.113.10/32 --description "Coolify UI"
hcloud firewall add-rule coolify-firewall --direction in --protocol tcp --port 6001-6002 --source-ips 203.0.113.10/32 --description "Coolify realtime and terminal"

# 2. Create the server behind it
hcloud server create \
  --name coolify-server \
  --type cx33 \
  --image ubuntu-24.04 \
  --location fsn1 \
  --ssh-key deploy-key \
  --firewall coolify-firewall

# 3. Get the server IP and connect
hcloud server ip coolify-server
hcloud server ssh coolify-server
```

On the server, install Coolify by following its installation guide (https://coolify.io/docs/get-started/installation; the `coolify` skill covers it). The dashboard then answers on port 8000 of the server's IP. Once it is reachable through a domain, remove the 8000 and 6001-6002 rules with `hcloud firewall delete-rule`.

## Examples

### Example 1: Provision a production server with firewall and volume

**User request:** "Create a Hetzner server for my production app with a firewall and a 100GB data volume"

**Steps taken:**
```bash
# Create and configure the firewall
$ hcloud firewall create --name prod-firewall
Firewall 2298417 created
$ hcloud firewall add-rule prod-firewall --direction in --protocol tcp --port 22 --source-ips 203.0.113.10/32 --description "SSH from office"
Firewall Rules for Firewall 2298417 updated
$ hcloud firewall add-rule prod-firewall --direction in --protocol tcp --port 443 --source-ips 0.0.0.0/0 --source-ips ::/0 --description "HTTPS"
Firewall Rules for Firewall 2298417 updated

# Create the server with the firewall already attached
$ hcloud server create --name prod-api --type cx33 --image ubuntu-24.04 --location fsn1 --ssh-key deploy-key --firewall prod-firewall
Server 71204455 created
IPv4: 203.0.113.24
IPv6: 2001:db8:c012:4e1f::1
IPv6 Network: 2001:db8:c012:4e1f::/64

# Attach and mount a data volume
$ hcloud volume create --name prod-data --size 100 --server prod-api --format ext4 --automount
Volume 103418762 created
```

The volume is mounted on the server at `/mnt/HC_Volume_103418762`.

### Example 2: Create a snapshot before a risky upgrade

**User request:** "Take a snapshot of my server before I upgrade the database"

**Steps taken:**
```bash
$ hcloud server create-image prod-api --type snapshot --description "Pre-DB-upgrade 2026-09-14"
Image 248117630 created from Server 71204455

# Verify snapshot is ready (output shortened)
$ hcloud image describe 248117630
ID:            248117630
Type:          snapshot
Status:        available
Description:   Pre-DB-upgrade 2026-09-14
Image size:    18.40 GB

# After upgrade, if something goes wrong (this overwrites the server's disk):
# hcloud server rebuild prod-api --image 248117630
```

## Guidelines

- Always create a firewall before exposing a server to the internet. At minimum, restrict SSH to known IPs. A firewall with no rules blocks all inbound traffic and allows all outbound.
- Use SSH keys instead of passwords. A server created without `--ssh-key` gets a generated root password, which the CLI prints once.
- A powered-off server is billed like a running one; billing stops only when it is deleted. `hcloud all list --paid` shows everything in the project that costs money.
- `delete` and `rebuild` cannot be undone. Confirm with the user first, and set `enable-protection` on servers, volumes and IPs that must survive.
- Take snapshots before risky operations (OS upgrades, database migrations). Snapshots are billed per GB and do not include attached volumes; shut the server down first for a consistent disk image.
- Coolify's stated minimum is 2 cores and 2 GB RAM, which `cx23` covers; `cx33` (4 vCPU, 8 GB RAM) leaves room for the applications it will host.
- Use private networks for server-to-server communication instead of public IPs. A subnet belongs to one network zone, and a server can only join a subnet of its own zone.
- Volumes can be resized up (not down) and need the filesystem grown afterwards (`resize2fs` for ext4, `xfs_growfs` for xfs). Plan initial sizes conservatively.
- Floating IPs let you swap servers behind a stable IP address — useful for zero-downtime migrations. The address must also be configured inside the server's OS, and since 1 May 2026 an assigned Floating or Primary IP must be unassigned before it can be deleted.
- A server type can be changed only while the server is off, and only to a type with an equal or larger disk. Once the disk has been enlarged there is no way back, so use `--keep-disk` if a downgrade may follow.
- Use `hcloud server list -o columns=name,status,ipv4,type` for clean output in scripts, or `-o json` with `jq`. Each `list --help` prints the valid column names.
- The `--datacenter` flag and the datacenter API were removed in 2026; place resources with `--location`.
- Hetzner locations in Europe (fsn1, nbg1, hel1) generally have the best pricing and the most included traffic. US and Asia locations cost more.
- For anything the CLI has no command for, `hcloud api` sends an authenticated request to `https://api.hetzner.cloud/v1` (limit: 3600 requests per hour per project).
