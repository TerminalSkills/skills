---
title: Investigate a Company or Person with OSINT
slug: investigate-company-or-person-osint
description: >-
  Full passive OSINT investigation pipeline for a target (company or individual). Build a structured
  intelligence report from public sources without active scanning or direct contact.
category: research
difficulty: intermediate
time_estimate: 2-4 hours
skills:
  - passive-recon
  - theharvester
  - hunter-io
  - amass
  - shodan
  - social-media-osint
  - breach-data
tags: [osint, recon, investigation, due-diligence, threat-intel]
---

# Investigate a Company or Person with OSINT

## Scenario

**Persona:** Sofia, a security researcher and due-diligence analyst at a VC firm.

A portfolio company is considering a major acquisition of **AcmeCorp** — a mid-sized SaaS startup. Before the legal team gets involved, Sofia needs to build a passive intelligence profile: Who are they? What infrastructure do they run? Are there any red flags (breaches, exposed services, shady affiliations)?

She'll use only public sources — no active scanning, no unauthorized access.

---

## Phase 1: Passive Recon — Foundation

Start with basic identity and infrastructure profiling.

```bash
# WHOIS lookup
pip install python-whois
```

```python
import whois

domain = "acmecorp.io"
w = whois.whois(domain)

print(f"Registrar: {w.registrar}")
print(f"Created: {w.creation_date}")
print(f"Expires: {w.expiration_date}")
print(f"Name servers: {w.name_servers}")
print(f"Registrant org: {w.org}")
print(f"Registrant email: {w.emails}")
```

```python
# SSL certificate transparency — find all subdomains passively
import requests

domain = "acmecorp.io"
r = requests.get(f"https://crt.sh/?q=%.{domain}&output=json", timeout=15)
certs = r.json()

subdomains = set()
for cert in certs:
    for name in cert["name_value"].split("\n"):
        name = name.strip().lstrip("*.")
        if domain in name:
            subdomains.add(name)

print(f"Found {len(subdomains)} subdomains via cert transparency:")
for s in sorted(subdomains):
    print(f"  {s}")
```

```python
# Reverse IP — who else is on the same server?
import requests

ip = "93.184.216.34"  # resolved from domain
r = requests.get(f"https://api.hackertarget.com/reverseiplookup/?q={ip}")
print("Co-hosted domains:", r.text)
```

---

## Phase 2: Email & People Harvesting

Find real contacts, decision-makers, and email patterns.

```bash
# theHarvester — aggregate from public sources
pip install theHarvester

theHarvester -d acmecorp.io -b google,bing,linkedin,certspotter,dnsdumpster -l 200 -f acmecorp_harvest.xml
```

```python
# Hunter.io API — structured email discovery
import requests

HUNTER_KEY = "your_hunter_api_key"
domain = "acmecorp.io"

r = requests.get(
    "https://api.hunter.io/v2/domain-search",
    params={"domain": domain, "api_key": HUNTER_KEY, "limit": 100}
)
data = r.json()["data"]

print(f"Email pattern: {data['pattern']}@{domain}")
print(f"Found {data['total']} emails\n")

for email in data["emails"]:
    print(f"  {email['value']} — {email.get('first_name', '')} {email.get('last_name', '')} "
          f"({email.get('position', 'N/A')}) confidence:{email.get('confidence')}%")
```

**What to look for:**
- Email pattern (firstname.lastname vs f.lastname etc.)
- C-level and engineering contacts
- Contractors or freelancers listed

---

## Phase 3: Infrastructure Mapping

Map the company's full internet footprint.

```bash
# OWASP Amass — comprehensive subdomain enumeration
brew install amass  # or: go install github.com/owasp-amass/amass/v4/...@master

# Passive only (no direct DNS queries to target)
amass enum -passive -d acmecorp.io -o amass_results.txt

# Get IP ranges and ASN info
amass intel -org "AcmeCorp" -o intel_results.txt
```

```python
# Shodan — find exposed services on discovered IPs
import shodan
import json

api = shodan.Shodan("YOUR_SHODAN_API_KEY")

# Search by organization name
results = api.search('org:"AcmeCorp"')
print(f"Found {results['total']} results for org:AcmeCorp\n")

for result in results["matches"]:
    print(f"IP: {result['ip_str']}:{result.get('port')}")
    print(f"  Product: {result.get('product', 'N/A')}")
    print(f"  OS: {result.get('os', 'N/A')}")
    print(f"  Hostnames: {result.get('hostnames', [])}")
    if "vulns" in result:
        print(f"  ⚠️  CVEs: {list(result['vulns'].keys())}")
    print()
```

**Red flags to note:**
- Open databases (MongoDB, Elasticsearch, Redis without auth)
- Outdated software versions
- Known CVEs on production IPs
- Dev/staging environments exposed publicly

---

## Phase 4: Social Media Footprint

```bash
# Sherlock — find username across 400+ platforms
pip install sherlock-project
sherlock acmecorp

# Check key employees too
sherlock john_smith_acme
```

```python
# LinkedIn company profile via Google dorks (no auth needed)
import requests

company = "AcmeCorp"
dorks = [
    f'site:linkedin.com/in "{company}"',
    f'site:linkedin.com/company "{company}"',
    f'site:twitter.com "{company}" (CEO OR CTO OR founder)',
    f'site:github.com "{company}"',
]

# Use a search API or web_fetch with direct URLs
# GitHub org check
r = requests.get(f"https://api.github.com/orgs/acmecorp")
if r.status_code == 200:
    org = r.json()
    print(f"GitHub org: {org['login']}")
    print(f"Public repos: {org['public_repos']}")
    print(f"Members: {org['public_members_url']}")
```

**What to gather:**
- Founding team and advisors
- Employee count growth over time
- Tech stack clues from job postings
- GitHub public repos — check for secrets in commits

---

## Phase 5: Breach Exposure Check

```python
import requests
import time

HIBP_KEY = "your_hibp_api_key"

def check_breach(email: str) -> list:
    """Check if an email appears in known data breaches."""
    r = requests.get(
        f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}",
        headers={
            "hibp-api-key": HIBP_KEY,
            "user-agent": "OSINT-Investigation-Tool"
        }
    )
    if r.status_code == 200:
        return r.json()
    elif r.status_code == 404:
        return []
    else:
        time.sleep(1.5)  # Rate limit
        return []

# Check key emails found in Phase 2
key_emails = ["ceo@acmecorp.io", "cto@acmecorp.io", "admin@acmecorp.io"]

for email in key_emails:
    breaches = check_breach(email)
    if breaches:
        print(f"⚠️  {email} found in {len(breaches)} breaches:")
        for b in breaches:
            print(f"   - {b['Name']} ({b['BreachDate']}): {', '.join(b['DataClasses'])}")
    else:
        print(f"✅ {email} — no breaches found")
    time.sleep(1.5)
```

```python
# Check entire domain
r = requests.get(
    "https://haveibeenpwned.com/api/v3/breaches",
    headers={"hibp-api-key": HIBP_KEY}
)
all_breaches = r.json()

# Filter breaches that include the domain
domain_breaches = [b for b in all_breaches if "acmecorp.io" in b.get("Domain", "")]
print(f"Domain-level breaches: {len(domain_breaches)}")
```

---

## Phase 6: Compile Intelligence Report

```python
# Generate structured report
import json
from datetime import datetime

report = {
    "target": "AcmeCorp (acmecorp.io)",
    "date": datetime.now().isoformat(),
    "analyst": "Sofia",
    "summary": {
        "subdomains_found": 47,
        "emails_found": 23,
        "exposed_services": 3,
        "breach_exposures": 2,
        "risk_level": "MEDIUM"
    },
    "infrastructure": {
        "main_ip": "93.184.216.34",
        "asn": "AS13335 Cloudflare",
        "hosting": "AWS us-east-1",
        "cdn": "Cloudflare",
        "notable_subdomains": ["admin.acmecorp.io", "staging.acmecorp.io", "api.acmecorp.io"]
    },
    "people": {
        "ceo": "John Smith <j.smith@acmecorp.io>",
        "cto": "Anna Lee <a.lee@acmecorp.io>",
        "email_pattern": "firstname.lastname"
    },
    "red_flags": [
        "Staging environment publicly accessible (staging.acmecorp.io)",
        "CTO email found in 2021 LinkedIn breach",
        "MongoDB port 27017 open on IP 93.184.216.100"
    ],
    "recommendations": [
        "Request security questionnaire addressing exposed services",
        "Verify breach response procedures with CTO",
        "Review access controls on staging environment"
    ]
}

with open("acmecorp_osint_report.json", "w") as f:
    json.dump(report, f, indent=2)

print("Report saved to acmecorp_osint_report.json")
```

---

## Key Takeaways

- **Always stay passive** — active scanning without authorization is illegal in most jurisdictions
- **Document sources** — note where each data point came from for legal defensibility
- **Correlate across phases** — a subdomain found in Phase 1 may tie to an exposed service in Phase 3 and a breach in Phase 5
- **Context matters** — exposed staging environments are common; the question is what's on them
