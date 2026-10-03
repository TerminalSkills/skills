---
name: ssh
description: >-
  OpenSSH gives encrypted remote login, file transfer and port forwarding between machines. Use when a user asks to connect to a remote server, generate or install SSH keys, write ~/.ssh/config, reach hosts through a bastion with ProxyJump, create local, remote or SOCKS tunnels, harden sshd, or fix permission denied and host key errors.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (OpenSSH client built in)'
metadata:
  author: terminal-skills
  version: "1.1.0"
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

SSH (Secure Shell, implemented by OpenSSH) provides encrypted remote shells, command execution, file copy (`scp`, `sftp`) and port forwarding. Current OpenSSH is 10.5 (August 2026). Things that changed recently and matter in practice:

- OpenSSH 10.0 removed DSA keys entirely and made the post-quantum hybrid key exchange `mlkem768x25519-sha256` the default.
- 10.1 added a warning when a connection negotiates a non-post-quantum key exchange (option `WarnWeakCrypto`, on by default). The warning means the server is old; upgrade the server rather than silencing it.
- `scp` and `sftp` now pass `ControlMaster no` to ssh, so they no longer open implicit shared sessions.
- sshd's `PasswordAuthentication` and similar settings can be overridden by files in `/etc/ssh/sshd_config.d/`; see Guidelines.

## Instructions

### Step 1: Keys

```bash
ssh-keygen -t ed25519 -a 100 -C "ci-deploy-key"      # -a raises the KDF rounds protecting the passphrase
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@203.0.113.10
ssh-add ~/.ssh/id_ed25519                              # cache the unlocked key in ssh-agent
ssh-keygen -lf ~/.ssh/id_ed25519.pub                   # show the fingerprint
```

Ed25519 is the default recommendation; use RSA 3072+ only for old systems. Keep private keys at mode 600 and `~/.ssh` at 700; sshd ignores keys with loose permissions. Always set a passphrase on keys that live on laptops. On macOS, `AddKeysToAgent yes` plus `UseKeychain yes` in config avoids retyping it.

### Step 2: Client config (`~/.ssh/config`)

```text
Host *
    ServerAliveInterval 30
    AddKeysToAgent yes
    IdentitiesOnly yes

Host bastion
    HostName bastion.acme-labs.io
    User admin
    IdentityFile ~/.ssh/id_ed25519

Host prod
    HostName 203.0.113.10
    User deploy
    Port 2222
    ProxyJump bastion
    ControlMaster auto
    ControlPath ~/.ssh/cm-%C
    ControlPersist 10m

Host dev-*
    HostName %h.internal.acme-labs.io
    User developer
    ProxyJump bastion
```

`ssh prod` reaches the host through the bastion and reuses one connection for 10 minutes; `ssh dev-api` connects to `dev-api.internal.acme-labs.io`. Check what a name resolves to with `ssh -G prod`. The first matching value for each option wins, so put specific `Host` blocks before `Host *`. Ad hoc jump: `ssh -J admin@bastion.acme-labs.io deploy@10.0.4.12`.

### Step 3: Tunnels

```bash
ssh -N -L 5432:db.internal:5432 bastion      # local port 5432 -> db.internal:5432 as seen from bastion
ssh -N -R 8080:localhost:3000 prod           # remote port 8080 -> your local port 3000
ssh -N -D 1080 prod                          # SOCKS5 proxy on localhost:1080
ssh -f -N -L 8443:10.0.4.20:443 bastion      # -f: go to background after authentication
```

Forwards listen on the loopback interface only. A remote forward is reachable from other machines only if the server sets `GatewayPorts`, which is usually unwanted. Stop a background tunnel by its PID, or with `ssh -O exit prod` when ControlMaster is in use.

### Step 4: Server hardening (`/etc/ssh/sshd_config.d/10-hardening.conf`)

```text
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
MaxAuthTries 3
AllowUsers deploy admin
ClientAliveInterval 300
ClientAliveCountMax 2
```

Validate before reloading, and keep an existing session open while testing from a second one:

```bash
sudo sshd -t && sudo sshd -T | grep -iE "passwordauthentication|permitrootlogin"
sudo systemctl reload ssh      # the unit is "sshd" on RHEL-family systems
```

## Examples

### Example 1: Reach a private database through a bastion

Request: "I need to run psql against the staging database that is only reachable from the bastion."

```bash
ssh -f -N -L 15432:db.staging.internal:5432 bastion
psql "host=127.0.0.1 port=15432 dbname=orders user=report"
```

Result: psql connects to localhost:15432 and the traffic goes over SSH to `db.staging.internal:5432`. Using local port 15432 avoids clashing with a local PostgreSQL on 5432. Close the tunnel by stopping the ssh process you started (find its PID with `pgrep -u "$USER" -fa "ssh -f -N -L 15432"`).

### Example 2: Lock down a new server without locking yourself out

Request: "Disable password logins on my VPS."

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub deploy@203.0.113.10     # 1. install your key first
ssh deploy@203.0.113.10 'sudo tee /etc/ssh/sshd_config.d/10-hardening.conf' <<'EOF'
PasswordAuthentication no
PermitRootLogin no
EOF
ssh deploy@203.0.113.10 'sudo sshd -t && sudo sshd -T | grep -i passwordauthentication'
```

Result: `sshd -T` prints `passwordauthentication no` when the setting is effective. If it still says yes, another file in `/etc/ssh/sshd_config.d/` (cloud-init often ships `50-cloud-init.conf`) set it first; sshd uses the first value it reads, and files load in alphabetical order. Reload sshd, then open a new session to confirm the key works before closing the old one.

### Example 3: Fix "REMOTE HOST IDENTIFICATION HAS CHANGED"

Request: "SSH refuses to connect after we rebuilt the server."

```bash
ssh-keygen -R 203.0.113.10                      # remove the old key from known_hosts
ssh -o StrictHostKeyChecking=ask deploy@203.0.113.10
ssh-keygen -lf <(ssh-keyscan -t ed25519 203.0.113.10 2>/dev/null)   # compare with the fingerprint from your provider console
```

Result: after you verify the new fingerprint out of band and accept it, the connection works. Do not disable host key checking globally; the warning also appears when someone is intercepting the connection.

## Guidelines

- Use key-based authentication everywhere and disable passwords on servers; protect keys with a passphrase and `ssh-agent`.
- Prefer `ProxyJump` to agent forwarding (`-A`): a forwarded agent can be used by root on the intermediate host. Never forward your agent to machines you do not control.
- `ssh-agent` is per login session; add keys with `AddKeysToAgent yes` instead of scripts that start agents repeatedly.
- Changing the SSH port reduces log noise but is not a security control; add `fail2ban` or firewall rules and limit `AllowUsers`.
- Never copy private keys between machines or commit them; generate one key per device and remove old lines from `authorized_keys` when a device is retired.
- For debugging use `ssh -vvv host`, `ssh -G host` (effective client config) and `sshd -T` (effective server config).
- `scp` uses the SFTP protocol since OpenSSH 9.0; for large or repeated copies use `rsync -e ssh`.
- Windows 10/11 ships the OpenSSH client (`ssh.exe`); the server is an optional feature.
