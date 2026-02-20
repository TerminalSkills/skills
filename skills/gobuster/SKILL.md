---
name: gobuster
description: >-
  Brute force directories, files, DNS subdomains, and virtual hosts with
  Gobuster. Use when a user asks to discover hidden endpoints, enumerate
  subdomains, find backup files, or perform web content discovery during
  penetration testing.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows (Go binary)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - gobuster
    - directory-bruteforce
    - subdomain-enumeration
    - penetration-testing
    - content-discovery
---

# Gobuster

## Overview

Gobuster is a fast brute-force tool for discovering hidden web content. Written in Go for speed (multi-threaded), it discovers directories, files, DNS subdomains, virtual hosts, and S3 buckets. Essential for finding admin panels, backup files, API documentation, and forgotten endpoints that weren't meant to be public.

## Instructions

### Step 1: Directory and File Discovery

```bash
# Basic directory brute force
gobuster dir -u https://target.example.com -w /usr/share/wordlists/dirb/common.txt
# dir: directory/file mode
# -w: wordlist (common.txt has ~4,600 entries)

# With extensions — find backup files, configs, source code
gobuster dir -u https://target.example.com \
  -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt \
  -x php,txt,html,js,json,xml,bak,old,sql,zip,tar.gz,env \
  -t 50 \
  --status-codes 200,204,301,302,307,401,403
# -x: file extensions to append
# -t 50: 50 concurrent threads
# --status-codes: only show these HTTP status codes

# Authenticated scanning
gobuster dir -u https://target.example.com/api/v1 \
  -w api-wordlist.txt \
  -H "Authorization: Bearer eyJ..." \
  -H "Cookie: session=abc123"

# Recursive scanning
gobuster dir -u https://target.example.com \
  -w common.txt \
  --no-error \
  -o results.txt
# -o: save results to file
# Run again against discovered directories
```

### Step 2: DNS Subdomain Enumeration

```bash
# Discover subdomains
gobuster dns -d example.com \
  -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  -t 50
# Finds: dev.example.com, staging.example.com, admin.example.com, etc.

# Use custom DNS resolver
gobuster dns -d example.com \
  -w subdomains.txt \
  -r 8.8.8.8
# -r: custom DNS resolver (bypass local DNS caching)

# Show IP addresses
gobuster dns -d example.com -w subdomains.txt --show-ips
```

### Step 3: Virtual Host Discovery

```bash
# Find virtual hosts on the same IP
gobuster vhost -u https://target.example.com \
  -w /usr/share/wordlists/seclists/Discovery/DNS/subdomains-top1million-5000.txt \
  --append-domain
# Sends requests with different Host headers
# Finds virtual hosts not in public DNS

# Filter by response size (exclude default pages)
gobuster vhost -u https://10.0.0.1 \
  -w vhosts.txt \
  --exclude-length 11234
```

### Step 4: S3 Bucket Enumeration

```bash
# Discover S3 buckets related to a company
gobuster s3 -w company-names.txt
# Tests: company.s3.amazonaws.com, company-dev, company-backup, etc.
# Finds: misconfigured public buckets with sensitive data
```

## Guidelines

- Use quality wordlists. SecLists (`/usr/share/wordlists/seclists/`) is the standard.
- `-x` extensions matter — `.bak`, `.old`, `.env`, `.sql`, `.zip` often contain sensitive data.
- Start with `common.txt` (fast), then `directory-list-2.3-medium.txt` (thorough).
- `403 Forbidden` is interesting — it confirms the path exists even if access is denied.
- DNS mode bypasses web servers entirely — finds subdomains directly via DNS resolution.
- VHost mode finds internal apps hosted on the same server but different Host headers.
- Combine with Nmap: scan discovered subdomains for additional attack surface.
- Save output (`-o results.txt`) — you'll reference it throughout the engagement.
