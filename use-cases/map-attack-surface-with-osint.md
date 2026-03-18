---
title: Map Attack Surface with OSINT Before a Pentest
description: >-
  Pre-engagement attack surface discovery using passive OSINT tools. Build a complete external footprint
  of a target organization — subdomains, exposed services, emails, certificates — before active testing begins.
difficulty: intermediate
time_estimate: 3-5 hours
skills:
  - amass
  - theharvester
  - shodan
  - censys
  - spiderfoot
  - passive-recon
  - hunter-io
  - breach-data
tags: [osint, recon, pentest, attack-surface, red-team, security]
---

# Map Attack Surface with OSINT Before a Pentest

## Scenario

**Persona:** Marcus, a red team engineer at a security consultancy.

Client: **GlobalFinance Ltd** — a financial services firm. They've signed off on a black-box external pentest. Marcus has the scope: `*.globalfinance.com` and any IPs owned by the organization.

Before touching anything actively, he runs a full OSINT sweep. The goal: build a complete external attack surface map and prioritize targets before writing a single exploit.

---

## Phase 1: Subdomain Enumeration

Cast the widest net passively before any active probing.

```bash
# Amass passive enumeration — queries 50+ data sources
amass enum -passive -d globalfinance.com -o amass_passive.txt -json amass_passive.json

# Check results
wc -l amass_passive.txt
cat amass_passive.txt | sort -u
```

```bash
# theHarvester — additional subdomain sources
theHarvester \
  -d globalfinance.com \
  -b google,bing,yahoo,baidu,certspotter,dnsdumpster,crtsh,hackertarget \
  -l 500 \
  -f globalfinance_harvest

# Parse XML output
python3 - <<'EOF'
import xml.etree.ElementTree as ET

tree = ET.parse("globalfinance_harvest.xml")
root = tree.getroot()

hosts = set()
for host in root.findall(".//host"):
    hosts.add(host.text)

print(f"Total unique hosts: {len(hosts)}")
for h in sorted(hosts):
    print(f"  {h}")
EOF
```

```python
# crt.sh — certificate transparency logs
import requests

domain = "globalfinance.com"
r = requests.get(f"https://crt.sh/?q=%.{domain}&output=json", timeout=20)
certs = r.json()

subdomains = set()
for cert in certs:
    for name in cert["name_value"].split("\n"):
        name = name.strip().lstrip("*.")
        if domain in name and " " not in name:
            subdomains.add(name)

print(f"crt.sh found {len(subdomains)} unique subdomains")

# Save for next phases
with open("subdomains_all.txt", "w") as f:
    f.write("\n".join(sorted(subdomains)))
```

```python
# Merge all subdomain sources
with open("amass_passive.txt") as f:
    amass = set(f.read().splitlines())

with open("subdomains_all.txt") as f:
    crtsh = set(f.read().splitlines())

all_subdomains = amass | crtsh
print(f"Total unique subdomains: {len(all_subdomains)}")

with open("subdomains_merged.txt", "w") as f:
    f.write("\n".join(sorted(all_subdomains)))
```

---

## Phase 2: Resolve & Identify Live Hosts

```bash
# Install massdns for fast bulk resolution
apt install massdns  # or build from source

# Resolve all subdomains to IPs
massdns -r /usr/share/massdns/lists/resolvers.txt \
        -t A \
        -o S \
        subdomains_merged.txt > resolved.txt

# Extract live IPs
grep " A " resolved.txt | awk '{print $3}' | sort -u > live_ips.txt
wc -l live_ips.txt
```

```python
# Identify unique IP ranges / ASNs
import ipaddress
import requests

with open("live_ips.txt") as f:
    ips = [line.strip() for line in f if line.strip()]

asn_map = {}
for ip in ips[:50]:  # Sample first 50
    r = requests.get(f"http://ip-api.com/json/{ip}?fields=as,org,isp,country", timeout=5)
    data = r.json()
    asn = data.get("as", "unknown")
    if asn not in asn_map:
        asn_map[asn] = {"org": data.get("org"), "ips": []}
    asn_map[asn]["ips"].append(ip)

print("\nASN Distribution:")
for asn, info in sorted(asn_map.items(), key=lambda x: -len(x[1]["ips"])):
    print(f"  {asn} ({info['org']}): {len(info['ips'])} IPs")
```

---

## Phase 3: Exposed Services Discovery

```python
# Shodan — find what's running on discovered IPs and org
import shodan

api = shodan.Shodan("YOUR_SHODAN_KEY")

# Search by org name
results = api.search('org:"GlobalFinance"')
print(f"Shodan: {results['total']} results for org:GlobalFinance\n")

interesting_ports = [21, 22, 23, 25, 80, 443, 445, 1433, 3306, 3389, 5432, 6379, 8080, 8443, 27017]
exposed = []

for r in results["matches"]:
    port = r.get("port")
    if port in interesting_ports:
        exposed.append({
            "ip": r["ip_str"],
            "port": port,
            "product": r.get("product", "unknown"),
            "version": r.get("version", ""),
            "hostnames": r.get("hostnames", []),
            "vulns": list(r.get("vulns", {}).keys())
        })

# Sort by risk (vulns first)
exposed.sort(key=lambda x: -len(x["vulns"]))

print("⚠️  Exposed services:")
for s in exposed:
    vuln_str = f" [CVEs: {', '.join(s['vulns'])}]" if s["vulns"] else ""
    print(f"  {s['ip']}:{s['port']} — {s['product']} {s['version']}{vuln_str}")
```

```python
# Censys — TLS/certificate analysis
from censys.search import CensysHosts

h = CensysHosts()

# Find hosts with GlobalFinance certificates
query = 'services.tls.certificates.leaf_data.subject.organization="GlobalFinance"'
results = list(h.search(query, pages=3))

print(f"\nCensys: {len(results)} hosts with GlobalFinance TLS certs")
for host in results[:20]:
    print(f"  {host['ip']} — services: {[s['port'] for s in host.get('services', [])]}")
```

---

## Phase 4: Technology Fingerprinting

```bash
# SpiderFoot CLI — automated multi-source recon
git clone https://github.com/smicallef/spiderfoot
cd spiderfoot
pip3 install -r requirements.txt

# Run passive modules only
python3 sf.py \
  -s globalfinance.com \
  -t INTERNET_NAME \
  -m sfp_dnsresolve,sfp_ssl,sfp_certspotter,sfp_shodan,sfp_censys,sfp_hackertarget,sfp_whois \
  -o JSON \
  -f spiderfoot_results.json \
  --no-color
```

```python
# Parse SpiderFoot results for tech stack
import json

with open("spiderfoot_results.json") as f:
    results = json.load(f)

tech_findings = [r for r in results if r["type"] in ["WEBSERVER_TECHNOLOGY", "WEBFRAMEWORK", "SOFTWARE_USED"]]
print("\nTechnology stack:")
for t in tech_findings:
    print(f"  {t['data']} (found on {t['module']})")
```

---

## Phase 5: Email Exposure for Phishing Scope

```python
# Hunter.io — get email addresses and pattern
import requests

HUNTER_KEY = "your_hunter_key"

r = requests.get(
    "https://api.hunter.io/v2/domain-search",
    params={"domain": "globalfinance.com", "api_key": HUNTER_KEY, "limit": 50}
)
data = r.json()["data"]

print(f"\nEmail pattern: {data['pattern']}@globalfinance.com")
print(f"Total emails found: {data['total']}")

# Identify high-value targets for phishing simulation
roles_of_interest = ["cto", "cfo", "engineer", "developer", "admin", "it", "security"]
targets = []

for email in data["emails"]:
    position = email.get("position", "").lower()
    if any(role in position for role in roles_of_interest):
        targets.append(email)
        print(f"  🎯 {email['value']} — {email.get('first_name')} {email.get('last_name')} ({email.get('position')})")
```

```python
# Check key emails for breach exposure
import requests
import time

HIBP_KEY = "your_hibp_key"

def check_email_breach(email: str) -> list:
    r = requests.get(
        f"https://haveibeenpwned.com/api/v3/breachedaccount/{email}",
        headers={"hibp-api-key": HIBP_KEY, "user-agent": "RedTeam-PreEngagement"}
    )
    time.sleep(1.5)
    return r.json() if r.status_code == 200 else []

print("\nBreach exposure check:")
for target in targets[:10]:
    email = target["value"]
    breaches = check_email_breach(email)
    if breaches:
        breach_names = [b["Name"] for b in breaches]
        print(f"  ⚠️  {email}: {breach_names}")
    else:
        print(f"  ✅ {email}: clean")
```

---

## Phase 6: Prioritize Attack Surface

```python
# Score and prioritize findings for active testing
findings = []

# High priority: exposed sensitive services
HIGH_RISK_PORTS = {22: "SSH", 3306: "MySQL", 5432: "PostgreSQL",
                   6379: "Redis", 27017: "MongoDB", 1433: "MSSQL"}

for service in exposed:
    risk = "HIGH" if service["vulns"] else ("MEDIUM" if service["port"] in HIGH_RISK_PORTS else "LOW")
    findings.append({
        "priority": risk,
        "type": "exposed_service",
        "target": f"{service['ip']}:{service['port']}",
        "detail": f"{service['product']} {service['version']}",
        "cves": service["vulns"]
    })

# Medium priority: subdomains with interesting names
interesting_patterns = ["dev", "staging", "admin", "api", "internal", "vpn", "test", "backup", "jenkins", "jira"]
for sub in all_subdomains:
    for pattern in interesting_patterns:
        if pattern in sub.lower():
            findings.append({
                "priority": "MEDIUM",
                "type": "interesting_subdomain",
                "target": sub,
                "detail": f"Contains keyword: {pattern}"
            })
            break

# Sort by priority
priority_order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2}
findings.sort(key=lambda x: priority_order[x["priority"]])

print("\n📋 Attack Surface Summary")
print("=" * 60)
for p in ["HIGH", "MEDIUM", "LOW"]:
    count = sum(1 for f in findings if f["priority"] == p)
    print(f"  {p}: {count} findings")

print("\n🎯 Top 10 Targets for Active Testing:")
for f in findings[:10]:
    print(f"  [{f['priority']}] {f['target']} — {f['detail']}")
    if f.get("cves"):
        print(f"         CVEs: {', '.join(f['cves'])}")
```

---

## Deliverable: Pre-Engagement Recon Report

```markdown
# Pre-Engagement OSINT Report: GlobalFinance Ltd
**Date:** 2024-01-15  
**Analyst:** Marcus  
**Scope:** *.globalfinance.com

## Summary
- Subdomains discovered: 134
- Live hosts: 89
- Unique IP ranges (ASNs): 4
- Exposed services: 12
- High-risk findings: 3
- Emails identified: 47
- Breach-exposed accounts: 6

## High Priority
1. MongoDB exposed on 10.0.0.5:27017 — no auth (CVE-2019-2389)
2. Jenkins at jenkins.globalfinance.com — default creds possible
3. dev.globalfinance.com — staging API with debug mode enabled

## Phishing Targets
6 employee emails found in breach data (LinkedIn, Adobe).
Email pattern: firstname.lastname@globalfinance.com

## Recommended Active Testing Starting Points
1. jenkins.globalfinance.com (admin panel)
2. api.globalfinance.com (REST API, check for auth issues)
3. vpn.globalfinance.com (credential stuffing with breach data)
```

---

## Legal Reminder

This workflow is for **authorized engagements only**. Always verify scope in writing before beginning. Passive OSINT does not require system access, but using the data actively (exploitation, credential stuffing) does require explicit written authorization.
