---
name: breach-data
description: >-
  Checks whether email addresses, domains and passwords appear in known data breaches using the
  Have I Been Pwned (HIBP) API v3 and the Pwned Passwords range API. Use when auditing your own
  organization's credential exposure, checking a password against breach corpora, reviewing
  breached accounts on a verified domain, or scoping an authorized phishing simulation.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: "breach, hibp, credential-leak, exposure, security-audit"
  repository: https://github.com/HaveIBeenPwned
  use-cases: "Check if a corporate domain's emails appear in known data breaches, Assess credential exposure risk for a target organization before a pentest, Verify that your own address is in a breach for a security awareness report, Generate a breach exposure report for all known employee emails"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Breach Data

## Overview

Breach intelligence shows which accounts and which kinds of data (passwords, phone numbers, payment details) have leaked, so a security team can force resets and brief staff. The reference source is Have I Been Pwned (HIBP), API v3 at `https://haveibeenpwned.com/api/v3`.

What the API needs, per the HIBP documentation:

- **Breach, paste and domain endpoints need a paid API key** (`hibp-api-key` header, 32 hex characters). There is no free production key. Plans differ in requests per minute; read the limit from the subscription status endpoint instead of assuming one.
- **Every request needs a descriptive `User-Agent`**, otherwise HIBP answers 403.
- **Pwned Passwords needs no key and has no rate limit.**
- **Domain search only works for domains you have verified** in your HIBP account (DNS TXT record or an e-mail to admin, hostmaster, info, security or webmaster at that domain). It returns aliases and breach names, not full addresses.

Only look up addresses and domains your organization owns or that you are explicitly authorized to assess. Never look up other people. This skill documents the HIBP API only; commercial breach-search services (DeHashed, Intelligence X, LeakCheck, Snusbase) have their own contracts and terms, so follow their current documentation and do not paste their keys or results into shared tools.

## Instructions

### Step 1: Client setup

Keep the key in the environment, never in code.

```bash
export HIBP_API_KEY="..."          # from the HIBP dashboard, 32 hex characters
python3 -m pip install requests
```

```python
import os
import time
import requests

HIBP_BASE = "https://haveibeenpwned.com/api/v3"
HEADERS = {
    "hibp-api-key": os.environ["HIBP_API_KEY"],
    "User-Agent": "northwind-secops-breach-audit/1.1",
}

def hibp_get(endpoint, params=None, retries=3):
    """GET a v3 endpoint. Returns parsed JSON, or None on 404 (nothing found)."""
    for _ in range(retries):
        r = requests.get(f"{HIBP_BASE}/{endpoint}", headers=HEADERS, params=params, timeout=15)
        if r.status_code == 200:
            return r.json()
        if r.status_code == 404:
            return None
        if r.status_code == 429:
            time.sleep(int(r.headers.get("retry-after", 5)) + 1)  # pad the wait
            continue
        r.raise_for_status()
    raise RuntimeError(f"Still rate limited after {retries} tries: {endpoint}")
```

Status codes: 401 missing or bad key, 403 missing User-Agent or a resource your account cannot use (for example an unverified domain), 404 nothing found, 429 rate limit (wait `retry-after` seconds), 503 usually a Cloudflare block after persistent overuse.

### Step 2: Check your plan and limits

```python
sub = hibp_get("subscription/status")
print(sub["SubscriptionName"], "-", sub["Rpm"], "requests/minute")
```

The response also lists `DomainSearchMaxBreachedAccounts` and feature flags such as `IncludesStealerLogs`. Use `Rpm` to set the delay in bulk jobs.

### Step 3: Check one address you own

```python
from urllib.parse import quote

def check_email(email):
    # truncateResponse defaults to true (names only); false returns the full breach model
    breaches = hibp_get(f"breachedaccount/{quote(email)}", {"truncateResponse": "false"})
    if not breaches:
        print(f"{email}: not found in any breach")
        return []
    print(f"{email}: {len(breaches)} breach(es)")
    for b in sorted(breaches, key=lambda x: x["BreachDate"], reverse=True):
        flags = "" if b["IsVerified"] else " [unverified]"
        print(f"  {b['BreachDate']}  {b['Name']:<25} {b['PwnCount']:>13,} accounts{flags}")
        print(f"      data: {', '.join(b['DataClasses'][:6])}")
    return breaches
```

Details from the docs: the address is trimmed and case-insensitive; `Domain=adobe.com` filters to one breached site; unverified breaches are included by default, so pass `IncludeUnverified=false` to drop them. Sensitive and retired breaches are never returned by this endpoint. To try the code without a real address, HIBP's documented test addresses on `hibp-integration-tests.com` (for example `account-exists@hibp-integration-tests.com`) work with any well-formed 32-character test key.

### Step 4: Pastes

```python
def check_pastes(email):
    pastes = hibp_get(f"pasteaccount/{quote(email)}")
    for p in pastes or []:
        print(f"  {p.get('Date')}  {p['Source']}  id={p['Id']}  {p.get('EmailCount', 0)} addresses")
    return pastes or []
```

The paste `Id` is source-specific (a Pastebin key, for instance); do not assume it forms a URL for every source.

### Step 5: Breached accounts on a verified domain

```python
import sys

def domain_exposure(domain):
    """Needs a verified domain. Returns {alias: [breach names]}."""
    data = hibp_get(f"breacheddomain/{domain}")
    if not data:
        print(f"No breached addresses on {domain}")
        return {}
    by_breach = {}
    for alias, names in data.items():
        for name in names:
            by_breach.setdefault(name, []).append(alias)
    print(f"{len(data)} breached accounts on {domain}")
    for name, aliases in sorted(by_breach.items(), key=lambda kv: -len(kv[1])):
        print(f"  {name}: {len(aliases)} accounts")
    return data

domain_exposure(sys.argv[1])  # run: python3 domain_exposure.py meridianfreight.io
```

A 403 means the domain is not verified in the account tied to the key. Domain search, unlike the public e-mail search, includes sensitive breaches because ownership is proven.

### Step 6: Check a password with k-anonymity

```python
import getpass
import hashlib

def pwned_count(password):
    digest = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = digest[:5], digest[5:]
    r = requests.get(
        f"https://api.pwnedpasswords.com/range/{prefix}",
        headers={"Add-Padding": "true", "User-Agent": HEADERS["User-Agent"]},
        timeout=10,
    )
    r.raise_for_status()
    for line in r.text.splitlines():
        candidate, _, count = line.partition(":")
        if candidate == suffix:
            return int(count)  # padded decoy rows have count 0
    return 0

n = pwned_count(getpass.getpass("Password to test: "))
print(f"Seen {n:,} times in breaches - do not use" if n else "Not found in the corpus")
```

Only the first 5 characters of the SHA-1 hash leave the machine. `Add-Padding: true` pads the reply to at least 800-1,000 rows so its size does not leak the prefix; padded rows have count 0 and never match. `?mode=ntlm` returns NTLM hashes instead, which is useful for auditing Active Directory hashes against the corpus. A match means the password is known to attackers, not that your account was breached.

### Step 7: Bulk audit of your own staff list

```python
import json

def bulk_audit(path, out="breach_report.json"):
    emails = [l.strip() for l in open(path) if l.strip()]
    rpm = hibp_get("subscription/status")["Rpm"]
    delay = 60 / rpm + 0.25
    rows = []
    for i, email in enumerate(emails, 1):
        found = hibp_get(f"breachedaccount/{quote(email)}", {"truncateResponse": "false"}) or []
        rows.append({
            "email": email,
            "breaches": [b["Name"] for b in found],
            "password_exposed": any("Passwords" in b["DataClasses"] for b in found),
        })
        print(f"[{i}/{len(emails)}] {email}: {len(found)}")
        time.sleep(delay)
    with open(out, "w") as f:
        json.dump(rows, f, indent=2)
    exposed = sum(1 for r in rows if r["breaches"])
    print(f"{exposed}/{len(rows)} addresses appear in at least one breach -> {out}")
```

For a whole domain, prefer Step 5 (one call) over looping over addresses.

### Step 8: Stealer logs (Pro plans, verified domains)

`/stealerLogsByEmail/{email}` returns the websites an address has credentials for in infostealer logs, `/stealerLogsByWebsiteDomain/{domain}` returns affected addresses, and `/stealerLogsByEmailDomain/{domain}` maps aliases to websites. The domain (for the by-email endpoint, the address's domain) must be verified (403 otherwise), the endpoints have their own much lower rate limit, and none of them returns passwords. Treat any hit as a compromised device: reset credentials and reimage or scan the machine.

## Examples

### Example 1: "Are any of our staff in breaches? We own meridianfreight.io" (a domain you have verified)

Verify the domain in the HIBP dashboard, then run `python3 domain_exposure.py meridianfreight.io`. Put the Step 1 client and the Step 5 function in `domain_exposure.py` first. Result: a count of breached accounts and a per-breach table such as `Collection1: 14 accounts`. The domain endpoint returns only breach names, so fetch each one with `GET /breach/{name}` (no key needed) and hand the alias list to IT for forced resets where its `DataClasses` include `Passwords`.

### Example 2: "Is this password safe to use?"

Run the Step 6 script and type the password at the prompt. It prints `Seen 3,861 times in breaches - do not use` or `Not found in the corpus`. Nothing but a 5-character hash prefix is sent.

### Example 3: Smoke-test the setup with HIBP's test account

Put the Step 1 and Step 3 code in `hibp_check.py`, end it with `check_email("account-exists@hibp-integration-tests.com")`, set `HIBP_API_KEY` to a 32-character hex test value and run `python3 hibp_check.py`. With a test key this prints one breach (Adobe); the test key works only for test addresses on the breach endpoint (subscription status and paste lookups answer 401). A 401 means the key is malformed; a 403 means the User-Agent is missing.

## Guidelines

- **Authorization first.** Query only addresses and domains your organization owns or that a written scope covers. Never look up an individual's accounts to profile them.
- **Respect rate limits.** Read `Rpm` from `subscription/status`, sleep accordingly, and honor `retry-after`. Persistent overuse earns a Cloudflare block (503).
- **No free API key.** Without a paid key, only Pwned Passwords works; say so rather than suggesting a workaround.
- **Never log secrets.** Keep the API key in the environment, test passwords with `getpass`, and do not write plaintext passwords to reports.
- **Scope of results.** The public e-mail endpoint omits sensitive and retired breaches; absence from it is not proof of safety. Filter `IsVerified`, `IsFabricated` and `IsSpamList` when a report must be strict.
- **Treat reports as sensitive.** A list of breached staff addresses is itself a phishing target list; store it with access control and delete it when the remediation is done.
- **Other vendors.** For DeHashed, Intelligence X and similar paid services, use their current official documentation and your own contract; their request formats are not covered here.
