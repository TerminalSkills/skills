---
name: hunter-io
description: >-
  Hunter.io API for finding and verifying corporate email addresses by domain. Use when: finding
  contact emails for a target domain, discovering email naming patterns, verifying whether an email
  address is deliverable, or bulk-searching emails for lead generation or OSINT.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags: [osint, hunter, email, recon, lead-generation, email-verification]
  use-cases:
    - "Find all publicly known email addresses for a target company domain"
    - "Discover the email naming convention used by a company"
    - "Verify if a guessed email address is valid before a phishing simulation"
    - "Bulk-search emails for multiple domains in an OSINT investigation"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Hunter.io

## Overview

Hunter.io is a professional email discovery service that indexes publicly available email addresses from websites, LinkedIn, corporate directories, and other sources. Its API provides domain-level email search, individual email lookup, email pattern detection, and deliverability verification. In OSINT contexts, Hunter is invaluable for building contact lists during pre-engagement recon and identifying employee email formats.

**Requires:** Hunter.io API key (free tier: 25 searches/month; paid plans for bulk use).

## Instructions

### Step 1: Setup

```bash
pip install requests
```

```python
import requests
import time
import json
from typing import Optional

HUNTER_API_KEY = "YOUR_HUNTER_IO_API_KEY"
BASE_URL = "https://api.hunter.io/v2"

def hunter_request(endpoint, params):
    """Make an authenticated request to the Hunter.io API."""
    params["api_key"] = HUNTER_API_KEY
    response = requests.get(f"{BASE_URL}/{endpoint}", params=params)
    response.raise_for_status()
    return response.json()

# Check your account status and remaining credits
def check_account():
    data = hunter_request("account", {})
    account = data["data"]
    print(f"Plan: {account['plan_name']}")
    print(f"Searches used: {account['requests']['searches']['used']} / {account['requests']['searches']['available']}")
    print(f"Verifications used: {account['requests']['verifications']['used']} / {account['requests']['verifications']['available']}")

check_account()
```

### Step 2: Domain search — find all emails for a domain

```python
def domain_search(domain, limit=10, offset=0, seniority=None, department=None):
    """
    Search for all email addresses associated with a domain.
    
    seniority: junior, senior, executive
    department: it, finance, management, sales, legal, communication, marketing, hr, engineering
    """
    params = {
        "domain": domain,
        "limit": limit,
        "offset": offset,
    }
    if seniority:
        params["seniority"] = seniority
    if department:
        params["department"] = department

    data = hunter_request("domain-search", params)
    result = data["data"]

    print(f"\n=== Domain Search: {domain} ===")
    print(f"Total emails indexed: {result['meta']['total']}")
    print(f"Email pattern: {result.get('pattern', 'Unknown')}")
    print(f"Organization: {result.get('organization', 'N/A')}")
    print(f"Domain type: {result.get('type', 'N/A')}")

    emails = result.get("emails", [])
    print(f"\nFound {len(emails)} emails (showing up to {limit}):")
    for email in emails:
        confidence = email.get("confidence", 0)
        name = f"{email.get('first_name', '')} {email.get('last_name', '')}".strip()
        position = email.get("position", "")
        dept = email.get("department", "")
        sources = len(email.get("sources", []))
        print(f"  {email['value']:<40} {confidence}% confidence | {name} | {position} | {dept} | {sources} sources")

    return result

# Basic domain search
result = domain_search("example.com", limit=20)

# Filter by department
result = domain_search("example.com", department="engineering", limit=10)

# Filter by seniority
result = domain_search("example.com", seniority="executive", limit=5)
```

### Step 3: Paginate through all emails

```python
def get_all_emails(domain, delay_seconds=1.0):
    """Retrieve all emails for a domain, handling pagination."""
    all_emails = []
    offset = 0
    limit = 100  # Max per request

    # Get total count first
    first_page = hunter_request("domain-search", {"domain": domain, "limit": 1, "offset": 0})
    total = first_page["data"]["meta"]["total"]
    pattern = first_page["data"].get("pattern", "unknown")
    print(f"Fetching {total} emails for {domain} (pattern: {pattern})")

    while offset < total:
        page_data = hunter_request("domain-search", {
            "domain": domain,
            "limit": limit,
            "offset": offset,
        })
        emails = page_data["data"].get("emails", [])
        all_emails.extend(emails)
        offset += limit
        print(f"  Retrieved {len(all_emails)}/{total}")
        if len(emails) < limit:
            break
        time.sleep(delay_seconds)  # Respect rate limits

    print(f"Total collected: {len(all_emails)}")
    return all_emails, pattern

emails, pattern = get_all_emails("example.com")

# Save to JSON
with open("emails_example_com.json", "w") as f:
    json.dump({"pattern": pattern, "emails": emails}, f, indent=2)
```

### Step 4: Email finder — generate a specific person's email

```python
def find_email(first_name, last_name, domain):
    """
    Find the email address for a specific person at a company.
    Returns the most likely email and confidence score.
    """
    params = {
        "first_name": first_name,
        "last_name": last_name,
        "domain": domain,
    }
    data = hunter_request("email-finder", params)
    result = data["data"]

    email = result.get("email")
    confidence = result.get("score", 0)
    sources = result.get("sources", [])

    if email:
        print(f"Found: {email} (confidence: {confidence}%)")
        print(f"Sources: {len(sources)} public references")
        for source in sources[:3]:
            print(f"  - {source.get('uri', 'N/A')}")
    else:
        print(f"No email found for {first_name} {last_name} @ {domain}")
        print(f"Pattern: {result.get('pattern', 'unknown')}")

    return result

find_email("John", "Smith", "example.com")
find_email("Jane", "Doe", "example.com")
```

### Step 5: Email verifier — check if an email is deliverable

```python
def verify_email(email):
    """
    Verify whether an email address is deliverable.
    
    Result statuses:
    - valid: email exists and is deliverable
    - invalid: email does not exist
    - accept_all: server accepts all emails (can't verify)
    - webmail: free email provider (Gmail, Yahoo, etc.)
    - disposable: temporary/disposable email service
    - unknown: could not be determined
    """
    data = hunter_request("email-verifier", {"email": email})
    result = data["data"]

    status = result.get("status")
    score = result.get("score", 0)
    mx_records = result.get("mx_records", False)
    smtp_check = result.get("smtp_server", False)
    disposable = result.get("disposable", False)

    print(f"\nVerification: {email}")
    print(f"  Status:     {status}")
    print(f"  Score:      {score}/100")
    print(f"  MX Records: {'✓' if mx_records else '✗'}")
    print(f"  SMTP Check: {'✓' if smtp_check else '✗'}")
    print(f"  Disposable: {'⚠ Yes' if disposable else 'No'}")

    return result

verify_email("john.smith@example.com")
verify_email("test@mailinator.com")  # Disposable email example
```

### Step 6: Bulk operations and reporting

```python
def bulk_verify_emails(email_list, output_file="verification_results.json", delay=0.5):
    """Verify multiple email addresses and save results."""
    results = []
    for i, email in enumerate(email_list):
        print(f"[{i+1}/{len(email_list)}] Verifying {email}...")
        result = verify_email(email)
        results.append({"email": email, **result})
        time.sleep(delay)  # Avoid hitting rate limits

    # Summary
    statuses = {}
    for r in results:
        s = r.get("status", "unknown")
        statuses[s] = statuses.get(s, 0) + 1

    print(f"\nVerification Summary:")
    for status, count in sorted(statuses.items(), key=lambda x: -x[1]):
        print(f"  {status}: {count}")

    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Saved to {output_file}")
    return results

def infer_email_pattern(pattern_str, first_name, last_name, domain):
    """Generate an email from the Hunter pattern for a person."""
    f = first_name.lower()
    l = last_name.lower()
    fi = f[0]  # First initial
    li = l[0]  # Last initial

    replacements = {
        "{first}": f,
        "{last}": l,
        "{f}": fi,
        "{l}": li,
        "{f}.{last}": f"{fi}.{l}",
        "{first}.{last}": f"{f}.{l}",
        "{first}{last}": f"{f}{l}",
        "{first}_{last}": f"{f}_{l}",
        "{f}{last}": f"{fi}{l}",
    }
    email = pattern_str
    for placeholder, value in replacements.items():
        email = email.replace(placeholder, value)

    return f"{email}@{domain}"

# Usage: generate emails from the discovered pattern
pattern = "{first}.{last}"
names = [("Alice", "Johnson"), ("Bob", "Williams"), ("Carol", "Davis")]
generated = [infer_email_pattern(pattern, fn, ln, "example.com") for fn, ln in names]
bulk_verify_emails(generated)
```

## Hunter.io API Endpoints Reference

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/domain-search` | GET | All emails for a domain |
| `/email-finder` | GET | Find email for a person |
| `/email-verifier` | GET | Verify deliverability |
| `/email-count` | GET | Count emails for domain (free) |
| `/account` | GET | Account status and credits |

## Guidelines

- **Rate limits**: Free plan allows 25 searches/month and 50 verifications/month. Add delays between requests to avoid 429 errors. Paid plans have higher limits.
- **Confidence scores**: A score above 90% indicates high confidence the email is correct. Below 50% means it was inferred from pattern, not directly observed.
- **Pattern detection**: The email pattern (e.g., `{first}.{last}@domain.com`) is the most valuable single piece of data — use it to generate emails for known employees.
- **Ethical use**: Hunter.io data comes from publicly indexed sources. Use it only for legitimate purposes such as authorized penetration testing scoping, sales prospecting, or journalism.
- **Combine with verification**: Always verify generated emails before using them to avoid bounces and reduce waste of phishing simulation scope.
