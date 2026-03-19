---
name: breach-data
description: >-
  Check for data breaches and credential leaks using HaveIBeenPwned API and other sources. Use
  when: checking if an email or domain is in a known breach, assessing corporate credential
  exposure, password hygiene audits, or pre-engagement phishing simulation scoping.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: research
  tags: [breach, hibp, credential-leak, exposure, security-audit]
  use-cases:
    - "Check if a corporate domain's emails appear in known data breaches"
    - "Assess credential exposure risk for a target organization before a pentest"
    - "Verify if a specific email is in a breach for a security awareness report"
    - "Generate a breach exposure report for all known employee emails"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Breach Data

## Overview

Data breach intelligence allows security teams to understand credential exposure risk — which employees have leaked passwords, which services have been compromised, and what data types attackers may already possess. The primary source is HaveIBeenPwned (HIBP), which aggregates billions of compromised accounts from hundreds of breaches. Additional sources like DeHashed, IntelX, and LeakCheck provide deeper data for authorized investigations.

**Requires:** HIBP API key for account/domain lookups (free for personal use, paid for domain search).

## Instructions

### Step 1: HIBP setup

```python
import requests
import time
import hashlib
import json
from typing import Optional

HIBP_API_KEY = "YOUR_HIBP_API_KEY"
HIBP_BASE = "https://haveibeenpwned.com/api/v3"

HEADERS = {
    "hibp-api-key": HIBP_API_KEY,
    "User-Agent": "OSINT-Security-Research-Tool",
}

def hibp_request(endpoint, params=None):
    """Make a rate-limited request to the HIBP API."""
    url = f"{HIBP_BASE}/{endpoint}"
    response = requests.get(url, headers=HEADERS, params=params, timeout=15)

    if response.status_code == 200:
        return response.json()
    elif response.status_code == 404:
        return None  # Not found in any breach
    elif response.status_code == 429:
        retry_after = int(response.headers.get("Retry-After", 5))
        print(f"Rate limited. Waiting {retry_after}s...")
        time.sleep(retry_after)
        return hibp_request(endpoint, params)  # Retry
    else:
        response.raise_for_status()
```

### Step 2: Check a single email address

```python
def check_email(email, include_unverified=False):
    """
    Check if an email address appears in any known data breach.
    
    Returns list of breaches or None if not breached.
    """
    params = {"truncateResponse": "false"}
    if include_unverified:
        params["includeUnverified"] = "true"

    breaches = hibp_request(f"breachedaccount/{email}", params=params)

    if breaches is None:
        print(f"✓ {email} — Not found in any breach")
        return []

    print(f"⚠ {email} — Found in {len(breaches)} breach(es):")
    for breach in sorted(breaches, key=lambda x: x.get("BreachDate", ""), reverse=True):
        name = breach.get("Name")
        date = breach.get("BreachDate")
        pwn_count = breach.get("PwnCount", 0)
        data_classes = breach.get("DataClasses", [])
        verified = breach.get("IsVerified", False)
        sensitive = breach.get("IsSensitive", False)

        print(f"  [{date}] {name:<30} {pwn_count:>15,} accounts")
        print(f"    Data: {', '.join(data_classes[:5])}", end="")
        if not verified:
            print(" [UNVERIFIED]", end="")
        if sensitive:
            print(" [SENSITIVE]", end="")
        print()

    return breaches

check_email("user@example.com")
```

### Step 3: Check if email appears in paste sites

```python
def check_pastes(email):
    """
    Check if an email appears in any public paste (Pastebin, etc.).
    Pastes often contain leaked credential dumps.
    """
    pastes = hibp_request(f"pasteaccount/{email}")

    if pastes is None:
        print(f"✓ {email} — Not found in any paste")
        return []

    print(f"⚠ {email} — Found in {len(pastes)} paste(s):")
    for paste in pastes:
        source = paste.get("Source")
        paste_id = paste.get("Id")
        date = paste.get("Date", "Unknown date")
        email_count = paste.get("EmailCount", 0)
        title = paste.get("Title", "Untitled")

        url = f"https://pastebin.com/{paste_id}" if source == "Pastebin" else f"{source}/{paste_id}"
        print(f"  [{date}] {title} — {email_count} emails — {url}")

    return pastes

check_pastes("user@example.com")
```

### Step 4: Domain-level breach search (paid HIBP feature)

```python
def check_domain_breaches(domain):
    """
    Get all email addresses for a domain that appear in breaches.
    Requires HIBP Pwned Domains subscription.
    """
    data = hibp_request(f"breacheddomain/{domain}")

    if data is None:
        print(f"✓ No breached accounts found for @{domain}")
        return {}

    print(f"\n=== Breach Exposure Report: @{domain} ===")
    print(f"Total breached accounts: {sum(len(v) for v in data.values())}")
    print(f"Unique breach sources: {len(data)}")

    # data is dict: {BreachName: [email1, email2, ...]}
    for breach_name, emails in sorted(data.items(), key=lambda x: -len(x[1])):
        print(f"\n  {breach_name} ({len(emails)} accounts):")
        for email in emails[:5]:
            print(f"    {email}")
        if len(emails) > 5:
            print(f"    ... and {len(emails) - 5} more")

    return data

check_domain_breaches("example.com")
```

### Step 5: Password hash check — k-Anonymity model

```python
def check_password(password):
    """
    Check if a password has been seen in a breach using HIBP's k-Anonymity model.
    The actual password is NEVER sent — only the first 5 chars of the SHA-1 hash.
    """
    sha1_hash = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix = sha1_hash[:5]
    suffix = sha1_hash[5:]

    # Send only the prefix — HIBP returns all hashes starting with that prefix
    response = requests.get(f"https://api.pwnedpasswords.com/range/{prefix}", timeout=10)
    response.raise_for_status()

    # Check if our hash suffix appears in the results
    for line in response.text.split("\n"):
        line = line.strip()
        if ":" in line:
            hash_suffix, count = line.split(":", 1)
            if hash_suffix == suffix:
                count = int(count)
                print(f"⚠ Password found in {count:,} breaches! Do not use this password.")
                return count

    print("✓ Password not found in any known breach.")
    return 0

# Check common passwords (for security audits)
check_password("Password123!")
check_password("Summer2023")
check_password("SuperSecureP@ssw0rd")
```

### Step 6: Bulk email checking with rate limiting

```python
def bulk_check_emails(email_list, output_file="breach_report.json", delay=1.5):
    """
    Check multiple emails for breaches with proper rate limiting.
    HIBP free tier allows 10 requests per minute (1 per 6 seconds recommended).
    """
    results = []
    total = len(email_list)

    print(f"Checking {total} email addresses (estimated time: {total * delay / 60:.1f} minutes)")

    for i, email in enumerate(email_list, 1):
        print(f"[{i}/{total}] {email}")
        breaches = check_email(email)
        pastes = check_pastes(email)

        results.append({
            "email": email,
            "breach_count": len(breaches),
            "paste_count": len(pastes),
            "breaches": [b.get("Name") for b in breaches],
            "critical_data": list(set(
                dc for b in breaches for dc in b.get("DataClasses", [])
                if dc in ["Passwords", "Credit cards", "Social security numbers", "Bank account numbers"]
            )),
        })
        time.sleep(delay)

    # Summary report
    exposed = [r for r in results if r["breach_count"] > 0]
    print(f"\n=== Bulk Breach Report ===")
    print(f"Total emails checked: {total}")
    print(f"Emails in breaches:   {len(exposed)} ({100*len(exposed)//total}%)")
    print(f"Emails in pastes:     {sum(1 for r in results if r['paste_count'] > 0)}")

    # Most common breaches
    all_breaches = [b for r in results for b in r["breaches"]]
    breach_freq = {}
    for b in all_breaches:
        breach_freq[b] = breach_freq.get(b, 0) + 1
    print("\nTop breach sources:")
    for breach, count in sorted(breach_freq.items(), key=lambda x: -x[1])[:10]:
        print(f"  {breach}: {count} accounts")

    with open(output_file, "w") as f:
        json.dump({"summary": {"total": total, "exposed": len(exposed)}, "results": results}, f, indent=2)
    print(f"\nSaved to {output_file}")
    return results
```

### Step 7: Additional sources

```python
# DeHashed (paid) — deeper leaked credential search
def check_dehashed(query, query_type="email", api_key=None, api_email=None):
    """Query DeHashed for leaked credential data."""
    resp = requests.get(
        "https://api.dehashed.com/search",
        params={"query": f"{query_type}:{query}", "size": 100},
        auth=(api_email, api_key),
        headers={"Accept": "application/json"},
        timeout=15,
    )
    data = resp.json()
    entries = data.get("entries", []) or []
    print(f"DeHashed results for {query}: {len(entries)} entries")
    for entry in entries[:10]:
        print(f"  {entry.get('email')} | hash: {entry.get('hashed_password', '?')[:20]}... | source: {entry.get('database_name')}")
    return entries

# IntelX (paid) — dark web and breach search
def check_intelx(query, api_key):
    """Search Intelligence X for leaked data."""
    headers = {"x-key": api_key}
    # Start search
    resp = requests.post("https://2.intelx.io/intelligent/search",
                         json={"term": query, "maxresults": 100, "media": 0, "sort": 4},
                         headers=headers, timeout=15)
    search_id = resp.json().get("id")
    time.sleep(3)  # Wait for results
    # Get results
    resp = requests.get(f"https://2.intelx.io/intelligent/search/result?id={search_id}",
                        headers=headers, timeout=15)
    results = resp.json().get("records", [])
    print(f"IntelX results: {len(results)} records")
    return results
```

## Breach Data Source Comparison

| Source | Free Tier | Domain Search | Raw Passwords | Dark Web |
|--------|-----------|---------------|---------------|----------|
| **HIBP** | ✓ (email/pass check) | Paid | No (hashes only) | No |
| **DeHashed** | Limited | Paid | Yes (hashed) | Yes |
| **IntelX** | Limited | Paid | Yes | Yes |
| **LeakCheck** | Limited | Paid | Yes (hashed) | No |
| **Snusbase** | Limited | Paid | Yes (hashed) | No |

## Guidelines

- **HIBP rate limits**: The API enforces rate limiting. Free API keys allow ~10 req/min. Always add `time.sleep(1.5)` between requests.
- **k-Anonymity for passwords**: Never send full passwords or hashes to external APIs. The Pwned Passwords API uses k-Anonymity — only the first 5 characters of the SHA-1 hash are sent.
- **Legal and ethical use**: Use breach data only for defensive security purposes (testing your own organization, authorized engagements, security awareness). Do not use to access accounts you don't own.
- **Not all breaches are verified**: HIBP marks some breaches as unverified. Use `IsVerified: true` to filter to confirmed breaches in high-stakes reporting.
- **Sensitive breaches**: HIBP hides results from sensitive categories (adult sites, political sites) by default. These require specific API flags and should only be queried when directly relevant to the investigation.
