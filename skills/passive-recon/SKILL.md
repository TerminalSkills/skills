---
name: passive-recon
description: >-
  Passive reconnaissance gathers information about a domain from public sources only: WHOIS,
  DNS records, certificate transparency logs, the Wayback Machine, reverse IP and search-engine
  dorks. Use when asked to profile a target without scanning it, find subdomains from public
  data, look up old IPs and URLs of a domain, or prepare the scoping stage of an authorized
  pentest or bug bounty.
license: Apache-2.0
compatibility: "Python 3.9+ with python-whois, dnspython and requests"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: [passive-recon, whois, dns, google-dorks, wayback]
  use-cases:
    - "Profile a target domain without sending traffic to its servers"
    - "Find subdomains through certificate transparency logs"
    - "Recover old URLs and endpoints from the Wayback Machine"
    - "Build a WHOIS and infrastructure profile before a pentest"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Passive Reconnaissance

## Overview

Passive reconnaissance collects intelligence about a target from data that third parties already hold: registration records, certificate transparency logs, web archives, search indexes and DNS aggregators. Nothing in this skill connects to the target's own web servers. Your queries do go to third parties (crt.sh, the Internet Archive, HackerTarget, ipapi.co), and DNS lookups go through your resolver, which may reach the target's authoritative name servers, so the target's DNS logs can still show a lookup. Use it on domains you own or are authorized to assess, and treat everything found as a lead to confirm, not a fact.

Setup (a virtual environment keeps the packages out of your system Python):

```console
$ python3 -m venv .venv && .venv/bin/pip install python-whois dnspython requests
```

## Instructions

All snippets share these imports and a polite User-Agent. Set `UA` once and reuse it.

```python
import json
import re
import dns.resolver
import requests
import whois

UA = {"User-Agent": "terminal-skills-check (https://terminalskills.io)"}
```

### Step 1: WHOIS

`python-whois` parses the registry reply. Since GDPR most registrant fields are redacted, so the registrar, dates and name servers are usually the useful parts.

```python
def whois_lookup(domain):
    w = whois.whois(domain)
    print(f"Registrar:    {w.registrar}")
    print(f"Created:      {w.creation_date}")
    print(f"Expires:      {w.expiration_date}")
    print(f"Name servers: {w.name_servers}")
    print(f"Org / email:  {getattr(w, 'org', None)} / {getattr(w, 'emails', None)}")
    raw = (w.text or "").lower()
    if any(word in raw for word in ("redacted", "privacy", "withheld", "proxy")):
        print("Privacy protection is on: registrant data is hidden")
    return dict(w)

whois_lookup("iana.org")
```

Dates can be a single value or a list, depending on the registry. Reverse WHOIS (other domains by the same registrant) needs a paid database such as WhoisXML API or DomainTools; free web tools return little since the redaction.

### Step 2: DNS records

```python
def dns_lookup(domain):
    results = {}
    for rtype in ("A", "AAAA", "MX", "NS", "TXT", "SOA", "CAA"):
        try:
            answers = dns.resolver.resolve(domain, rtype, lifetime=5)
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.exception.Timeout):
            continue
        results[rtype] = [str(r) for r in answers]
        print(f"{rtype:<5} {', '.join(results[rtype])}")
    return results

dns_lookup("iana.org")
```

TXT records often leak vendors (SPF includes, domain-verification tokens for SaaS tools). MX shows the mail provider.

### Step 3: Passive DNS and historical records

Free passive DNS is thin. HackerTarget's `hostsearch` returns known hostnames with IPs and is rate-limited per IP; it answers with an error text in the body, so check the text rather than the status code.

```python
def hackertarget_hosts(domain):
    r = requests.get("https://api.hackertarget.com/hostsearch/",
                     params={"q": domain}, headers=UA, timeout=20)
    text = r.text.strip()
    if text.lower().startswith("error") or "API count exceeded" in text:
        print(f"HackerTarget: {text}")
        return []
    return [line.split(",") for line in text.splitlines() if "," in line]

for host, ip in hackertarget_hosts("iana.org")[:10]:
    print(host, ip)
```

Private addresses (10.x) in the output are internal names leaked into DNS, a finding worth noting. For historical A records use SecurityTrails (API key from your account, free tier is small):

```python
import os

def securitytrails_history(domain):
    r = requests.get(f"https://api.securitytrails.com/v1/history/{domain}/dns/a",
                     headers={"APIKEY": os.environ["SECURITYTRAILS_API_KEY"]}, timeout=20)
    r.raise_for_status()
    for rec in r.json().get("records", []):
        ips = [v.get("ip") for v in rec.get("values", [])]
        print(rec.get("first_seen"), "->", rec.get("last_seen"), ips)
```

CIRCL's passive DNS service requires an approved account and returns 401 without one, so it is not a no-signup source.

### Step 4: Certificate transparency (crt.sh)

Every publicly trusted certificate is logged, so crt.sh lists hostnames that ever had one, including internal-looking names. Let `requests` encode the `%` wildcard through `params`. The service is run by volunteers and often answers 502 or times out; retry a few times before giving up.

```python
import time

def crt_sh_subdomains(domain, retries=4):
    for attempt in range(retries):
        try:
            r = requests.get("https://crt.sh/", params={"q": f"%.{domain}", "output": "json"},
                             headers=UA, timeout=60)
            r.raise_for_status()
            certs = r.json()
            break
        except (requests.RequestException, ValueError):
            time.sleep(5 * (attempt + 1))
    else:
        print("crt.sh unavailable, try again later")
        return []
    names = set()
    for cert in certs:
        for name in cert.get("name_value", "").split("\n"):
            name = name.strip().lower().removeprefix("*.")
            if name == domain or name.endswith("." + domain):
                names.add(name)
    print(f"{len(certs)} certificates, {len(names)} unique names")
    return sorted(names)

for name in crt_sh_subdomains("iana.org")[:30]:
    print(" ", name)
```

A name in the log does not mean the host is alive today. Resolve the candidates (`dns.resolver`) before reporting them.

### Step 5: Wayback Machine URL enumeration

The CDX API lists every archived URL. `matchType=domain` includes all subdomains; `collapse=urlkey` removes duplicates.

```python
def wayback_urls(domain, limit=5000):
    r = requests.get("https://web.archive.org/cdx/search/cdx", headers=UA, timeout=90, params={
        "url": domain, "matchType": "domain", "output": "json",
        "fl": "original,timestamp", "filter": "statuscode:200",
        "collapse": "urlkey", "limit": limit})
    try:
        rows = r.json()[1:]  # first row is the header
    except ValueError:  # the archive sometimes answers with an empty or error page
        print(f"Wayback CDX unavailable (HTTP {r.status_code}), try again later")
        return []
    urls = [row[0] for row in rows]
    hosts = sorted({re.match(r"https?://([^/:]+)", u).group(1).lower() for u in urls
                    if re.match(r"https?://([^/:]+)", u)})
    print(f"{len(urls)} URLs on {len(hosts)} hosts")
    for pat in (r"/api/", r"/admin", r"\.(env|bak|sql|old)(\?|$)", r"/wp-", r"\.(json|xml)(\?|$)"):
        hits = [u for u in urls if re.search(pat, u, re.I)]
        if hits:
            print(f"  {pat}: {len(hits)}  e.g. {hits[0]}")
    return urls

wayback_urls("iana.org", limit=2000)
```

Old URLs may be dead; fetch the archived copy (`https://web.archive.org/web/<timestamp>/<url>`) instead of the live site, so you stay passive. Narrow with `from=2020` / `to=2022` or `filter=original:.*api.*` when results hit the limit.

### Step 6: Reverse IP and IP ownership

Both services are third parties. Shared hosting makes reverse IP noisy: a hit means "on the same server", not "owned by the same organization".

```python
def reverse_ip(ip):
    r = requests.get("https://api.hackertarget.com/reverseiplookup/",
                     params={"q": ip}, headers=UA, timeout=20)
    return [] if r.text.lower().startswith("error") else r.text.split()

def ip_info(ip):
    data = requests.get(f"https://ipapi.co/{ip}/json/", headers=UA, timeout=15).json()
    print(data.get("org"), data.get("asn"), data.get("country_name"))
    return data

print(reverse_ip("192.0.43.8"))
ip_info("192.0.43.8")
```

To tell whether an IP belongs to a CDN (Cloudflare, Fastly) compare the ASN: scanning or "bypassing" a CDN is out of scope for passive work.

### Step 7: Search-engine dorks

Generate the queries and run them yourself in a browser; automated scraping of Google violates its terms and gets blocked. Bing and DuckDuckGo support `site:` and `filetype:` too.

```python
def dorks(domain):
    return {
        "Indexed subdomains": f"site:{domain} -site:www.{domain}",
        "Login and admin pages": f"site:{domain} inurl:login OR inurl:admin",
        "Staging and dev hosts": f"site:{domain} inurl:staging OR inurl:dev OR inurl:test",
        "Documents": f"site:{domain} filetype:pdf OR filetype:xlsx OR filetype:docx",
        "Backups and configs": f"site:{domain} ext:bak OR ext:old OR ext:env OR ext:sql",
        "Directory listings": f'site:{domain} intitle:"index of /"',
        "Code mentioning the domain": f'site:github.com "{domain}" password OR secret OR token',
        "Paste sites": f'site:pastebin.com "{domain}"',
    }

for label, query in dorks("iana.org").items():
    print(f"{label:<28} {query}")
```

Google no longer offers the `cache:` operator, so use the Wayback Machine for removed pages. If you find live credentials, stop and report them to the owner; do not use them.

### Step 8: Save a profile

```python
from datetime import datetime, timezone

def passive_profile(domain, path=None):
    profile = {
        "domain": domain,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "whois": whois_lookup(domain),
        "dns": dns_lookup(domain),
        "hosts_hackertarget": hackertarget_hosts(domain),
        "names_crtsh": crt_sh_subdomains(domain),
        "wayback_url_count": len(wayback_urls(domain, limit=2000)),
        "dorks": dorks(domain),
    }
    path = path or f"passive_{domain.replace('.', '_')}.json"
    with open(path, "w") as f:
        json.dump(profile, f, indent=2, default=str)
    print("saved", path)

passive_profile("iana.org")
```

## Examples

### Example 1: "List the subdomains of our company domain before the pentest"

Run `crt_sh_subdomains("northwind-logistics.io")` and `hackertarget_hosts(...)`, merge both lists, then resolve each name with `dns.resolver.resolve(name, "A")`. Report only names that resolve, grouped by IP. The result is a table such as `api.northwind-logistics.io  203.0.113.20` and `staging.northwind-logistics.io  203.0.113.45`, with names that no longer resolve listed separately as "historical".

### Example 2: "Did this domain ever expose an API or backup file?"

Run `wayback_urls("northwind-logistics.io", limit=20000)`. The pattern summary prints counts such as `/api/: 214  e.g. https://api.northwind-logistics.io/v1/users` and `\.(env|bak|sql|old): 3`. Open each hit through the archive copy, never the live host, and note the first and last archive timestamps for the report.

## Guidelines

- Get written authorization before assessing a domain you do not own; passive does not mean unrestricted. Moving on to port scans or probing is active reconnaissance and needs its own scope.
- Do not claim "undetectable": third-party services log your queries, and DNS resolution can reach the target's name servers. Use a dedicated resolver or network if that matters.
- Free sources rate-limit by IP. Cache results to disk and spread queries out.
- Certificate names and archived URLs are history. Verify that a host is still live (by an allowed method) before listing it as an asset.
- Redacted WHOIS is normal. Do not try to un-redact it.
- Send a `User-Agent` that names your tool and never put personal details in requests.
