---
title: "Build a Social Media OSINT Investigation"
description: >-
  Investigate a person's digital footprint across social media platforms using
  Sherlock and complementary OSINT tools. From username discovery to evidence report.
persona: "Cybersecurity consultant doing employee investigation"
skills:
  - sherlock
  - social-media-osint
  - breach-data
  - theharvester
tags:
  - osint
  - investigation
  - social-media
  - cybersecurity
  - digital-forensics
---

# Build a Social Media OSINT Investigation

## The Situation

Maria runs a cybersecurity consultancy. A corporate client suspects an employee is leaking proprietary data through anonymous social media accounts. The client's IT team identified the employee's work username (`jsmith_corp`) and a personal handle (`j0hnnysmth`) from Slack logs. Maria needs to find all accounts linked to these username patterns across the internet and build an evidence timeline.

## Who This Is For

- Cybersecurity consultants and incident responders
- Corporate security teams investigating insider threats
- Brand protection specialists monitoring impersonation
- Legal teams gathering digital evidence
- Penetration testers doing social engineering reconnaissance

## Prerequisites

- Python 3.8+ installed
- Sherlock installed (`pip install sherlock-project`)
- theHarvester installed (`pip install theHarvester`)
- A structured note-taking system for evidence chain-of-custody
- Understanding of local privacy laws and legal authorization

⚠️ **Legal Notice:** Always ensure you have proper legal authorization before conducting OSINT investigations. Unauthorized surveillance or data collection may violate privacy laws in your jurisdiction.

## Step 1: Define Username Variants

Start with known usernames and generate likely variations:

```python
#!/usr/bin/env python3
"""Generate username variants for OSINT investigation."""

def generate_variants(base_usernames):
    """Generate common variations of known usernames."""
    variants = set(base_usernames)

    for username in base_usernames:
        # Common separators
        variants.add(username.replace("_", ""))
        variants.add(username.replace("_", "."))
        variants.add(username.replace("_", "-"))

        # Number substitutions
        variants.add(username + "1")
        variants.add(username + "123")
        variants.add(username + "01")

        # Prefix/suffix patterns
        variants.add("the" + username)
        variants.add("real" + username)
        variants.add(username + "_official")

    return sorted(variants)

known = ["jsmith_corp", "j0hnnysmth"]
variants = generate_variants(known)
print(f"Generated {len(variants)} variants:")
for v in variants:
    print(f"  - {v}")
```

## Step 2: Run Sherlock Across All Platforms

```bash
#!/bin/bash
# Run Sherlock for each username variant
CASE_ID="CASE-2024-0042"
OUTPUT_DIR="investigation/${CASE_ID}"
mkdir -p "${OUTPUT_DIR}/sherlock"

# Primary targets
sherlock jsmith_corp j0hnnysmth \
  --json "${OUTPUT_DIR}/sherlock/primary.json" \
  --csv \
  --timeout 15 \
  --print-found

# Generated variants (batch)
sherlock jsmithcorp jsmith.corp jsmith-corp j0hnnysmth1 thej0hnnysmth \
  --json "${OUTPUT_DIR}/sherlock/variants.json" \
  --csv \
  --timeout 15 \
  --print-found

echo "[+] Sherlock results saved to ${OUTPUT_DIR}/sherlock/"
```

## Step 3: Cross-Reference with theHarvester

Extract emails and additional data from domains where accounts were found:

```bash
#!/bin/bash
# Extract emails associated with found profiles
OUTPUT_DIR="investigation/CASE-2024-0042"
mkdir -p "${OUTPUT_DIR}/harvester"

# Search for email addresses associated with the target
theHarvester -d jsmith -b all -l 200 -f "${OUTPUT_DIR}/harvester/email_results"

# Search specific domains where Sherlock found accounts
for domain in github.com reddit.com twitter.com; do
  theHarvester -d "${domain}" -b all -l 100 \
    -f "${OUTPUT_DIR}/harvester/${domain//\./_}"
done
```

## Step 4: Check Breach Databases

Query known breach databases for any emails discovered:

```python
#!/usr/bin/env python3
"""Check discovered emails against breach databases."""

import json
import requests
import time

def check_haveibeenpwned(email, api_key):
    """Check if email appears in known data breaches."""
    headers = {
        "hibp-api-key": api_key,
        "User-Agent": "OSINT-Investigation-Tool"
    }
    url = f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}"

    resp = requests.get(url, headers=headers, params={"truncateResponse": "false"})
    time.sleep(1.5)  # Rate limit compliance

    if resp.status_code == 200:
        return resp.json()
    elif resp.status_code == 404:
        return []
    else:
        print(f"  [!] Error checking {email}: {resp.status_code}")
        return None

# Load emails from previous steps
discovered_emails = [
    "jsmith@example.com",
    "j0hnnysmth@gmail.com"
]

print("[*] Checking breach databases...")
for email in discovered_emails:
    breaches = check_haveibeenpwned(email, api_key="YOUR_API_KEY")
    if breaches:
        print(f"  [!] {email} found in {len(breaches)} breaches:")
        for b in breaches:
            print(f"      - {b['Name']} ({b['BreachDate']}): {', '.join(b['DataClasses'][:3])}")
    else:
        print(f"  [✓] {email}: no breaches found")
```

## Step 5: Analyze Posting Patterns

Cross-reference timestamps and content across discovered accounts:

```python
#!/usr/bin/env python3
"""Analyze posting patterns across discovered accounts."""

import json
from datetime import datetime
from collections import Counter

def analyze_timeline(accounts_data):
    """Build activity timeline from discovered accounts."""
    timeline = []

    for account in accounts_data:
        platform = account["platform"]
        posts = account.get("posts", [])

        for post in posts:
            timeline.append({
                "timestamp": post["created_at"],
                "platform": platform,
                "content_preview": post["text"][:100] if post.get("text") else "[media]",
                "url": post.get("url", "N/A")
            })

    # Sort by timestamp
    timeline.sort(key=lambda x: x["timestamp"])

    # Analyze posting hours (potential timezone identification)
    hours = Counter()
    for entry in timeline:
        dt = datetime.fromisoformat(entry["timestamp"])
        hours[dt.hour] += 1

    peak_hours = hours.most_common(3)
    print(f"[*] Peak posting hours (UTC): {', '.join(f'{h}:00 ({c} posts)' for h, c in peak_hours)}")

    return timeline

# After manual data collection from found accounts
# Feed structured data into the analyzer
```

## Step 6: Generate Investigation Report

```python
#!/usr/bin/env python3
"""Generate structured investigation report."""

from datetime import datetime

def generate_report(case_id, findings):
    """Generate markdown investigation report."""
    report = f"""# OSINT Investigation Report
## Case: {case_id}
## Date: {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}
## Classification: CONFIDENTIAL

---

### Executive Summary

Investigation initiated to identify social media accounts associated with
target username patterns. Sherlock scan across 400+ platforms identified
{findings['total_accounts']} confirmed accounts across {findings['platforms_count']} platforms.

### Methodology

1. Username variant generation from {findings['seed_count']} seed usernames
2. Automated platform scanning via Sherlock (400+ sites)
3. Email discovery via theHarvester
4. Breach database cross-reference (HaveIBeenPwned)
5. Manual verification of high-confidence matches
6. Posting pattern and timeline analysis

### Key Findings

#### Confirmed Accounts
| Platform | Username | URL | Confidence |
|----------|----------|-----|------------|
"""
    for account in findings.get("confirmed_accounts", []):
        report += f"| {account['platform']} | {account['username']} | {account['url']} | {account['confidence']} |\n"

    report += f"""
#### Breach Exposure
- Emails found in {findings.get('breach_count', 0)} known data breaches
- Most recent breach: {findings.get('latest_breach', 'N/A')}

#### Activity Timeline
- Earliest activity: {findings.get('earliest_post', 'N/A')}
- Latest activity: {findings.get('latest_post', 'N/A')}
- Peak posting hours suggest timezone: {findings.get('likely_timezone', 'Unknown')}

### Recommendations

1. Preserve all evidence with timestamps and screenshots
2. Cross-reference findings with internal access logs
3. Consult legal counsel before taking action
4. Consider engaging law enforcement if data exfiltration confirmed

### Evidence Chain of Custody

All raw data files stored in `investigation/{case_id}/` with SHA-256 checksums.
"""
    return report

# Generate and save
report = generate_report("CASE-2024-0042", {
    "total_accounts": 12,
    "platforms_count": 8,
    "seed_count": 2,
    "confirmed_accounts": [],
    "breach_count": 3,
    "latest_breach": "2024-01-15",
    "earliest_post": "2023-03-01",
    "latest_post": "2024-02-28",
    "likely_timezone": "UTC-5 (EST)"
})

with open("investigation/CASE-2024-0042/report.md", "w") as f:
    f.write(report)
print("[+] Report generated.")
```

## Expected Outcome

By the end of this investigation, Maria has:

- **A complete map** of the target's online presence across 400+ platforms
- **Email addresses** associated with discovered accounts
- **Breach exposure data** showing what credentials may be compromised
- **A timeline** of activity with timezone analysis
- **A professional report** suitable for legal proceedings and client delivery

## Tools Used

| Tool | Purpose | Install |
|------|---------|---------|
| Sherlock | Username search across 400+ platforms | `pip install sherlock-project` |
| theHarvester | Email and subdomain discovery | `pip install theHarvester` |
| HaveIBeenPwned API | Breach database lookup | API key required |
| Python scripts | Variant generation, analysis, reporting | Python 3.8+ |

## Legal & Ethical Reminders

- Always have written authorization from the client
- Document your methodology for legal defensibility
- Respect platform Terms of Service and rate limits
- Do not access accounts — only observe publicly available information
- Comply with GDPR, CCPA, and local privacy regulations
- Maintain chain of custody for all evidence
