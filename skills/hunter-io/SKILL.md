---
name: hunter-io
description: >-
  Hunter.io is an email-finding and verification service with a REST API: list the public email addresses of a company domain, find one person's work email, check whether an address is deliverable, and detect a company's email pattern. Use when asked to "find emails for a domain", "find the email of a person at a company", "verify an email address with Hunter", "discover a company's email format", or for lead generation and authorized OSINT or phishing-simulation scoping.
license: Apache-2.0
compatibility: Python 3.9+ with requests; a Hunter API key (free plan available)
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: "hunter, email, recon, lead-generation, email-verification"
  use-cases: "Find all publicly known email addresses for a target company domain, Discover the email naming convention used by a company, Verify that an email address is deliverable before sending outreach, Enrich a prospect list with work emails for a sales campaign"
  agents: "claude-code, openai-codex, gemini-cli, cursor"
---

# Hunter.io

## Overview

Hunter indexes professional email addresses found on the public web and exposes them through a REST API at `https://api.hunter.io/v2`. The endpoints that matter: Domain Search (emails for a domain, plus the company's email pattern), Email Finder (one person's address from name and domain), Email Verifier (deliverability check), Email Count (how many addresses are indexed, free) and Account (plan and credits). Checked against Hunter's API reference and OpenAPI file in October 2026.

Hunter also publishes a hosted MCP server at `https://mcp.hunter.io/mcp` (OAuth for Claude, ChatGPT and Gemini; `X-API-Key` header for Cursor, VS Code, Codex and similar clients). If the agent has it connected, prefer the tools `Domain-Search`, `Email-Finder` and `Email-Verifier` over hand-written HTTP.

Billing is by credits: a search or finder lookup costs 1 credit and a verification 0.5. The Free plan includes 50 credits a month; check `pricing` and `/account` before bulk work.

## Instructions

### 1. Authenticate

Create a key at hunter.io/api-keys and export it. Send it in the `X-API-KEY` header; `?api_key=` also works but leaks the key into URLs and logs. The special key `test-api-key` validates parameters on Domain Search, Email Finder and Email Verifier and returns a fixed dummy response, which is useful for testing code without spending credits.

```bash
export HUNTER_API_KEY="..."   # from hunter.io/api-keys; never commit it
```

```python
import os
import requests

BASE = "https://api.hunter.io/v2"
session = requests.Session()
session.headers["X-API-KEY"] = os.environ["HUNTER_API_KEY"]

def hunter(endpoint: str, **params) -> requests.Response:
    r = session.get(f"{BASE}/{endpoint}", params=params, timeout=30)
    if r.status_code == 403:
        raise RuntimeError("Hunter rate limit hit; slow down and retry later")
    if r.status_code == 429:
        raise RuntimeError("Hunter usage limit reached; check /account or upgrade the plan")
    r.raise_for_status()
    return r

account = hunter("account").json()["data"]
print(account["plan_name"], account["requests"])   # remaining credits or search/verification quotas
```

### 2. Domain Search

Parameters: `domain` (or `company`), `limit` 1-100 (default 10), `offset`, `type` (`personal` or `generic`), `department` and `seniority` (comma-separated, from Hunter's live taxonomy; unknown values are ignored and an all-unknown list returns 400), `job_titles`, `provenance` (`found` or `inferred`), `verification_status`. On the Free plan `limit + offset` may not exceed 10 and `limit` is capped at 10.

```python
def domain_search(domain: str, limit: int = 10, offset: int = 0, **filters):
    data = hunter("domain-search", domain=domain, limit=limit, offset=offset, **filters).json()["data"]
    print(f"{data['domain']}: pattern={data.get('pattern')} org={data.get('organization')}")
    for e in data["emails"]:
        name = f"{e.get('first_name') or ''} {e.get('last_name') or ''}".strip()
        print(f"  {e['value']:<38} {e['confidence']:>3}%  {name}  {e.get('position') or ''}")
    return data

domain_search("stripe.com", limit=10, department="engineering", seniority="senior,executive")
```

To page through everything on a paid plan, raise `offset` by `limit` until `len(emails) < limit` or `offset` reaches the top-level `meta["results"]` of the response (a sibling of `data`); check `/email-count` first (free) to know the size.

### 3. Email Finder

Needs `domain` or `company`, plus `first_name` and `last_name` (or `full_name`), or a `linkedin_handle`. `max_duration` (3-20 seconds) bounds the wait.

```python
def find_email(first: str, last: str, domain: str):
    r = hunter("email-finder", domain=domain, first_name=first, last_name=last)
    d = r.json()["data"]
    print(d["email"], d["score"], d["position"])
    return d
```

A 404 means no address was found. The `score` (0-100) is Hunter's confidence.

### 4. Email Verifier

`status` is one of `valid`, `invalid`, `accept_all` (server accepts anything, so deliverability cannot be proven), `webmail`, `disposable`, `unknown`. Fields `result` and `score` still appear but `result` carries a deprecation notice; rely on `status`. HTTP 202 means verification is still running (call again after a few seconds); 222 means it failed for external reasons and can be retried later; 451 means the address cannot be processed for privacy reasons.

```python
import time

def verify(email: str, tries: int = 4) -> dict:
    for _ in range(tries):
        r = hunter("email-verifier", email=email)
        if r.status_code == 200:
            return r.json()["data"]
        time.sleep(5)          # 202: still in progress
    return {"email": email, "status": "unknown"}

print(verify("patrick@stripe.com")["status"])
```

### 5. Email Count and pattern

`GET /email-count?domain=stripe.com` is free (documented; needs a real key, the test key is rejected) and returns totals (optionally `type=personal|generic`). The `pattern` in a Domain Search response, such as `{first}.{last}`, tells you the format; combine it with a verified lookup rather than guessing addresses.

## Examples

### Example 1: "Find the engineering leads at a company and their email format"

```python
data = domain_search("vercel.com", limit=10, department="engineering", seniority="senior,executive")
```

Result: a printed list of up to 10 addresses with confidence scores and positions, and the company pattern (for example `{first}`), which you can reuse for people not in the list.

### Example 2: "Check this lead list before the campaign goes out"

```python
leads = ["maria.lopez@northwind.dev", "info@northwind.dev", "tmp123@mailinator.com"]
for email in leads:
    print(email, verify(email)["status"])
    time.sleep(0.2)            # stays well under the 10 requests/second verifier limit
```

Result: one status per address; drop `invalid` and `disposable`, and treat `accept_all` as risky rather than confirmed.

## Guidelines

- Rate limits per endpoint: Domain Search and Email Finder 15 requests/second and 500/minute, Email Verifier 10/second and 300/minute, Discover 5/second and 50/minute. HTTP 403 means you hit a rate limit: back off. HTTP 429 means your plan's usage limit is used up: backing off does not help.
- Email Finder and Email Verifier save found or valid addresses into your Hunter leads automatically unless you turn that off in the account settings. Keep that in mind when running tests against real people.
- Credits are spent per call, including when the result is poor. Use the free `/email-count` and the `test-api-key` first.
- A confidence score is not proof; verify before sending, and treat `accept_all` domains as unverifiable.
- Use the data only for lawful purposes: sales outreach that respects GDPR/CAN-SPAM opt-out rules, journalism, or security work you are authorized to do (such as scoping a phishing simulation in a signed engagement). Do not build lists of private individuals' addresses.
- Never log or print the API key, and keep it out of source control.
