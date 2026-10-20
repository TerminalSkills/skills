---
name: fail2ban
description: >-
  Protect servers from brute force attacks with Fail2Ban. Use when a user asks
  to block repeated failed login attempts, protect SSH, secure web servers from
  brute force, or ban malicious IPs automatically.
license: Apache-2.0
compatibility: 'Linux'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/fail2ban/fail2ban
  category: devops
  tags:
    - fail2ban
    - brute-force
    - ssh
    - security
    - firewall
---

# Fail2Ban

## Overview

Fail2Ban (1.1.1, August 2026, is the latest release) monitors log files or the systemd journal for failed authentication attempts and bans offending IPs through the firewall (nftables or iptables). Protects SSH, Nginx, Apache, Postfix, and any service with log-based authentication.

## Instructions

### Step 1: Install

```bash
sudo apt install fail2ban
sudo systemctl enable --now fail2ban
sudo fail2ban-client -V   # confirm version
```

On Debian and Ubuntu the distribution package ships an enabled `sshd` jail that reads the systemd journal (upstream `paths-debian.conf` sets `sshd_backend = systemd` and, since 1.1.1, `banaction = nftables`; check `fail2ban-client get sshd actions` on your host). Elsewhere the upstream default `banaction` is `iptables-multiport`, and `bantime`/`findtime` default to 10m with `maxretry = 5`.

### Step 2: Configure

```ini
# /etc/fail2ban/jail.local — Custom configuration (never edit jail.conf)
[DEFAULT]
bantime = 1h
findtime = 10m
maxretry = 5
# match your firewall: nftables, or iptables-multiport on older hosts
banaction = nftables
# your own office or VPN address, so you cannot lock yourself out
ignoreip = 127.0.0.1/8 ::1 203.0.113.10

[sshd]
enabled = true
port = ssh
maxretry = 3
bantime = 24h

[nginx-http-auth]
enabled = true
port = http,https
maxretry = 5

[nginx-botsearch]
enabled = true
port = http,https
maxretry = 2
bantime = 7d
```

After editing, check and apply: `sudo fail2ban-client -t` (config test), then `sudo fail2ban-client reload`.

### Step 3: Monitor

```bash
sudo fail2ban-client status               # list active jails
sudo fail2ban-client status sshd           # show banned IPs
sudo fail2ban-client set sshd unbanip 198.51.100.23   # unban
sudo fail2ban-client set sshd banip 198.51.100.77     # manual ban
sudo fail2ban-client unban --all                      # lift every ban
```

## Examples

### Example 1: "Stop people hammering SSH on my VPS"

Add the `[sshd]` block above to `/etc/fail2ban/jail.local` with `maxretry = 3`, run `sudo fail2ban-client reload`, then `sudo fail2ban-client status sshd`. Result: `Currently banned` and `Banned IP list` appear in the output, and an address that fails three logins within `findtime` is banned for `bantime`.

### Example 2: "Test a custom filter before enabling the jail"

Run `fail2ban-regex /var/log/nginx/error.log /etc/fail2ban/filter.d/nginx-botsearch.conf`. Result: a summary such as `Lines: 18450 lines, 0 ignored, 212 matched, 18238 missed` shows whether the regex catches what you expect; only then set `enabled = true` for the jail.

## Guidelines

- Always create jail.local — jail.conf gets overwritten on updates.
- Start conservative: 5 retries, 1h ban. Adjust based on logs.
- For modern alternative with community threat sharing, consider CrowdSec.
- Use `fail2ban-regex` to test custom filters before deploying.
- Add your own addresses to `ignoreip`; a forgotten-password loop from your office IP will otherwise ban you.
- Bans only work if the log path or journal the filter reads actually contains the failures (`backend = systemd` when there is no `/var/log/auth.log`).
- Fail2Ban reacts after the fact; it does not replace key-only SSH (`PasswordAuthentication no`).
