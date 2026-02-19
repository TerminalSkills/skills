---
name: iptables
description: >-
  Configure Linux firewall with iptables/nftables. Use when a user asks to set
  up a firewall, block ports, allow specific traffic, configure NAT, or secure
  a Linux server network.
license: Apache-2.0
compatibility: 'Linux'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - iptables
    - firewall
    - nftables
    - security
    - networking
---

# iptables / nftables

## Overview

iptables is the traditional Linux firewall. nftables is its modern replacement (default on newer distros). Both filter network packets using rules organized in chains and tables. Essential for server hardening.

## Instructions

### Step 1: Basic iptables Rules

```bash
# View current rules
sudo iptables -L -n -v

# Allow established connections
sudo iptables -A INPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# Allow SSH (port 22)
sudo iptables -A INPUT -p tcp --dport 22 -j ACCEPT

# Allow HTTP and HTTPS
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT

# Allow loopback
sudo iptables -A INPUT -i lo -j ACCEPT

# Drop everything else
sudo iptables -P INPUT DROP
sudo iptables -P FORWARD DROP
sudo iptables -P OUTPUT ACCEPT

# Save rules (persist across reboots)
sudo iptables-save | sudo tee /etc/iptables/rules.v4
```

### Step 2: UFW (Simplified Frontend)

```bash
# UFW is easier for most use cases
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow from 10.0.0.0/8 to any port 5432    # PostgreSQL from internal only
sudo ufw enable
sudo ufw status verbose
```

### Step 3: nftables (Modern)

```bash
# /etc/nftables.conf — nftables configuration
table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;
        ct state established,related accept
        iif lo accept
        tcp dport { 22, 80, 443 } accept
        icmp type echo-request accept
    }
    chain forward {
        type filter hook forward priority 0; policy drop;
    }
    chain output {
        type filter hook output priority 0; policy accept;
    }
}
```

## Guidelines

- Use UFW for simple setups — it's a frontend for iptables with human-readable commands.
- Default policy should be DROP for INPUT — only allow what you need.
- Always allow established connections first, or you'll lock yourself out.
- Test rules before saving — a wrong rule can disconnect your SSH session.
