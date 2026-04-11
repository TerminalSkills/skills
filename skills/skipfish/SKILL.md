---
name: skipfish
description: >-
  Run active web application reconnaissance with SkipFish. Use when a user
  asks to scan a web app they own for directory enumeration, injection
  vulnerabilities, and misconfigurations, or wants a fast dictionary-driven
  crawl with HTML output as a starting point for manual review.
license: Apache-2.0
compatibility: 'SkipFish 2.10b, Linux/macOS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - skipfish
    - web-scanner
    - reconnaissance
    - penetration-testing
    - vulnerability-scanner
---

# SkipFish

## Overview

SkipFish is a fast, active web application reconnaissance tool originally from Google. It crawls a target, probes with a dictionary of paths and payloads, and produces an interactive HTML report grouping findings by severity. SkipFish is noisy by design — it is meant for authorized assessments of your own apps, not stealthy scans of third parties. Pair with Burp/ZAP for manual follow-up on the findings it surfaces.

## Instructions

### Step 1: Install and Pick a Dictionary

```bash
# Kali
sudo apt install -y skipfish

# From source
git clone https://github.com/spinkham/skipfish.git
cd skipfish && make

# Dictionaries ship in /usr/share/skipfish/dictionaries/
ls /usr/share/skipfish/dictionaries/
# complete.wl   extensions-only.wl   minimal.wl   medium.wl

# Rules of thumb:
#   minimal.wl   → very fast first pass (~30 min)
#   medium.wl    → balanced (1–4 hours)
#   complete.wl  → deep (overnight)
```

### Step 2: Run a Basic Scan

```bash
# Output directory must not exist — skipfish creates it
rm -rf ./report
skipfish -W /usr/share/skipfish/dictionaries/minimal.wl \
  -o ./report \
  http://webapp.local/

# Open the report
xdg-open ./report/index.html
# Findings grouped: High / Medium / Low / Warnings / Info
```

### Step 3: Scope the Crawl

```bash
# Limit to a single host (don't chase off-site links)
skipfish -o report -W minimal.wl \
  -I '^http://webapp\.local/' \
  http://webapp.local/

# Exclude paths that destroy state
skipfish -o report -W minimal.wl \
  -X '/logout' -X '/admin/delete' \
  http://webapp.local/

# Limit depth and request count (time-box the scan)
skipfish -o report -W minimal.wl \
  -d 5 -c 10 -l 1000 \
  http://webapp.local/
# -d max crawl depth, -c max children per node, -l max total requests
```

### Step 4: Authenticated Scans

```bash
# Form-based auth — pre-authenticate and pass the cookie
COOKIE=$(curl -s -c - -d 'user=admin&pass=hunter2' \
  http://webapp.local/login | awk '/session/ {print $7}')

skipfish -C "session=$COOKIE" \
  -X /logout \
  -o report-authed \
  -W /usr/share/skipfish/dictionaries/minimal.wl \
  http://webapp.local/dashboard

# Multiple cookies
skipfish -C "session=abc123" -C "csrftoken=def456" -o report http://webapp.local/

# HTTP Basic auth
skipfish -A admin:hunter2 -o report http://webapp.local/
```

### Step 5: Tune Performance and Politeness

```bash
# Polite scan for shared/staging environments
skipfish -W minimal.wl -o report \
  -m 5 -t 10 \
  http://staging.webapp.local/
# -m max concurrent connections (default 10)
# -t request timeout seconds

# Aggressive scan on your own dev box
skipfish -W medium.wl -o report \
  -m 25 -t 5 \
  http://127.0.0.1:8000/
```

## Examples

### Example 1: Fast Triage of a New Web App

```bash
# 30-minute first pass before manual testing
rm -rf ./first-pass
skipfish \
  -W /usr/share/skipfish/dictionaries/minimal.wl \
  -I '^http://app\.example\.internal/' \
  -X /logout -X /shutdown \
  -d 4 -c 8 -l 2000 \
  -o ./first-pass \
  http://app.example.internal/

# Review index.html, look for:
#   - XSS vectors (High)
#   - SQL errors in responses (High)
#   - Directory listings (Medium)
#   - Backup files (.bak, .swp, ~) (Medium)
#   - Exposed VCS dirs (.git, .svn) (High)

# Every finding → manually verify in Burp before reporting
```

### Example 2: Authenticated Scan of an Internal Dashboard

```bash
# Acquire a valid session cookie
CJ=$(mktemp)
curl -s -c "$CJ" -d 'username=tester&password=Acme2026!' \
  -X POST http://internal.acme.local/auth/login >/dev/null
SESSION=$(awk '/session/ {print $7}' "$CJ")
rm -f "$CJ"

rm -rf ./auth-scan
skipfish \
  -C "session=$SESSION" \
  -X /auth/logout \
  -X /users/delete \
  -I '^http://internal\.acme\.local/' \
  -W /usr/share/skipfish/dictionaries/medium.wl \
  -o ./auth-scan \
  http://internal.acme.local/

xdg-open ./auth-scan/index.html
```

## Guidelines

- **Written authorization is mandatory.** SkipFish sends destructive-looking payloads — run it against your own apps, staging, or in-scope targets only.
- Exclude state-changing endpoints (`/logout`, `/delete`, `/admin/reset`) with `-X`. SkipFish will happily crawl them otherwise.
- Dictionary choice dominates runtime: `minimal.wl` for a quick pass, `medium.wl` for a real assessment, `complete.wl` for overnight work.
- Start with `-I` to clamp the crawl scope — otherwise SkipFish wanders across subdomains and partners.
- Expect false positives. SkipFish is a funnel; manually verify every finding before it goes in the report.
- The HTML report is the primary output — browse it with `index.html`, not the raw logs.
- SkipFish is legacy but still useful for fast active recon. For modern web apps with SPAs and GraphQL, combine with Burp, ZAP, and ffuf.
- Never scan production without the customer's explicit sign-off and a change window; dictionary attacks generate alerts and load.
