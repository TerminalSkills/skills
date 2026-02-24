---
name: ssh
description: >-
  Secure server access and tunneling with SSH. Use when a user asks to connect
  to remote servers, set up SSH keys, create tunnels, configure jump hosts,
  manage SSH config, or automate remote commands.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (OpenSSH)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - ssh
    - remote
    - tunneling
    - security
    - servers
---

# SSH

## Overview

SSH (Secure Shell) provides encrypted remote access to servers. Beyond basic login, it handles key-based auth, port forwarding (tunnels), jump hosts (bastion), file transfer (SCP/SFTP), and agent forwarding.

## Instructions

### Step 1: Key Setup

```bash
# Generate ED25519 key (recommended over RSA)
ssh-keygen -t ed25519 -C "your@email.com"

# Copy public key to server
ssh-copy-id user@server.example.com

# Or manually:
cat ~/.ssh/id_ed25519.pub | ssh user@server "mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys"
```

### Step 2: SSH Config

```text
# ~/.ssh/config — Named host configurations
Host prod
    HostName 203.0.113.10
    User deploy
    Port 2222
    IdentityFile ~/.ssh/deploy_key

Host staging
    HostName staging.example.com
    User deploy
    ProxyJump bastion

Host bastion
    HostName bastion.example.com
    User admin
    IdentityFile ~/.ssh/bastion_key

Host dev-*
    HostName %h.internal.example.com
    User developer
    ProxyJump bastion
```

```bash
# Now just:
ssh prod          # connects to 203.0.113.10:2222 as deploy
ssh staging       # connects through bastion
ssh dev-api       # connects to dev-api.internal.example.com via bastion
```

### Step 3: Tunneling

```bash
# Local forward: access remote service locally
ssh -L 5432:db.internal:5432 bastion
# Now connect to localhost:5432 to reach the internal database

# Remote forward: expose local service to remote
ssh -R 8080:localhost:3000 prod
# Remote server can now reach your local app at localhost:8080

# Dynamic SOCKS proxy
ssh -D 1080 prod
# Use as SOCKS proxy for all traffic
```

### Step 4: Server Hardening

```text
# /etc/ssh/sshd_config — Production SSH hardening
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers deploy admin
Port 2222
```

## Guidelines

- Always use key-based auth in production — disable password auth.
- ED25519 keys are shorter and more secure than RSA.
- Use ProxyJump (bastion/jump host) instead of exposing internal servers to the internet.
- `ssh-agent` caches keys in memory — no need to enter passphrase repeatedly.
