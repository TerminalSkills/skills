---
name: nikto
description: >-
  Scan web servers for vulnerabilities with Nikto. Use when a user asks to
  audit web server configuration, find outdated software, detect dangerous
  files, check for misconfigurations, or perform web server security scanning.
license: Apache-2.0
compatibility: 'Linux, macOS (Perl)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: security
  tags:
    - nikto
    - web-server
    - vulnerability-scanner
    - penetration-testing
    - misconfiguration
---

# Nikto

## Overview

Nikto is a web server scanner that checks for 7,000+ potentially dangerous files, outdated server versions, version-specific problems, and server configuration issues. It's noisy (not stealthy) but comprehensive — catches misconfigurations, default files, exposed admin interfaces, and known vulnerable components that automated scanners often miss.

## Instructions

### Step 1: Basic Scan

```bash
# Scan a web server
nikto -h https://target.example.com
# Checks:
# - Server version and known CVEs
# - Dangerous HTTP methods (PUT, DELETE, TRACE)
# - Default files (/phpinfo.php, /server-status, /.env)
# - Directory indexing
# - Missing security headers
# - Outdated components

# Scan specific port
nikto -h target.example.com -p 8080

# Scan multiple ports
nikto -h target.example.com -p 80,443,8080,8443

# Scan with SSL
nikto -h https://target.example.com -ssl
```

### Step 2: Tuning and Targeting

```bash
# Tune scan to specific check categories
nikto -h https://target.example.com -Tuning 123456789abcde
# 1: Interesting file / seen in logs
# 2: Misconfiguration / default file
# 3: Information disclosure
# 4: Injection (XSS/Script/HTML)
# 5: Remote file retrieval (inside web root)
# 6: Denial of service (skip in production)
# 7: Remote file retrieval (server-wide)
# 8: Command execution / remote shell
# 9: SQL injection
# a: Authentication bypass
# b: Software identification
# c: Remote source inclusion
# d: WebService
# e: Admin console

# Only check for misconfigurations and info disclosure
nikto -h https://target.example.com -Tuning 23

# Use a specific wordlist for CGI directories
nikto -h https://target.example.com -Cgidirs "all"

# Authenticated scanning
nikto -h https://target.example.com \
  -id admin:password123
# or with cookie
nikto -h https://target.example.com \
  -cookie "session=abc123; token=xyz789"
```

### Step 3: Output and Integration

```bash
# Save results in multiple formats
nikto -h https://target.example.com -o nikto-report.html -Format html
nikto -h https://target.example.com -o nikto-report.xml -Format xml
nikto -h https://target.example.com -o nikto-report.csv -Format csv

# JSON output for automation
nikto -h https://target.example.com -o nikto-report.json -Format json

# Scan targets from Nmap output
nmap -sV -p 80,443,8080 -oG - 192.168.1.0/24 | \
  grep "open" | awk '{print $2}' | \
  while read ip; do nikto -h $ip -o "nikto-$ip.html" -Format html; done
```

## Guidelines

- **Nikto is loud** — it sends thousands of requests. Don't use it for stealth assessments.
- Run Nikto early in the assessment — it catches low-hanging fruit (default files, misconfigs).
- Check tuning categories: `-Tuning 23` for quick misconfiguration scan, full scan for thorough assessment.
- Combine with Nmap: scan ports first, then run Nikto against discovered web servers.
- XML/JSON output integrates with reporting tools and vulnerability management platforms.
- False positives are common — verify each finding manually before including in the report.
- Run with `-Cgidirs all` to check CGI directories for legacy vulnerabilities (ShellShock, etc.).
- Nikto is complementary to Burp Suite — Nikto checks server config, Burp tests application logic.
