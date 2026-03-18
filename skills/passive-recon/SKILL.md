---
name: passive-recon
description: >-
  Comprehensive passive reconnaissance covering WHOIS, DNS history, reverse IP, SSL certificates,
  Google dorks, and Wayback Machine enumeration. Use when: initial target profiling without
  active scanning, stealth recon where no direct target contact is desired, or building a
  complete picture of a target's infrastructure from public data alone.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags: [osint, passive-recon, whois, dns, certs, google-dorks, wayback, stealth]
  use-cases:
    - "Profile a target domain without triggering IDS or firewall alerts"
    - "Discover historical DNS records and old IP addresses for a domain"
    - "Find all subdomains via SSL certificate transparency logs"
    - "Build a comprehensive WHOIS and infrastructure profile before a pentest"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Passive Reconnaissance

## Overview

Passive reconnaissance gathers intelligence about a target using only publicly available information — no packets are sent to the target's infrastructure. This makes it completely undetectable and legally safe when used against publicly accessible data. The goal is to build a comprehensive intelligence picture from WHOIS records, DNS history, SSL certificate logs, search engine caches, and web archives before making any active contact with the target.

## Instructions

### Step 1: WHOIS lookups

```python
import whois
import subprocess
import json
import re

def whois_lookup(domain):
    """Perform WHOIS lookup using python-whois library."""
    # pip install python-whois
    try:
        w = whois.whois(domain)
        print(f"\n=== WHOIS: {domain} ===")
        print(f"Registrar:       {w.registrar}")
        print(f"Created:         {w.creation_date}")
        print(f"Updated:         {w.updated_date}")
        print(f"Expires:         {w.expiration_date}")
        print(f"Name servers:    {w.name_servers}")
        print(f"Registrant org:  {getattr(w, 'org', 'N/A')}")
        print(f"Registrant email:{getattr(w, 'emails', 'N/A')}")
        print(f"Registrant country: {getattr(w, 'country', 'N/A')}")

        # Check for privacy protection
        raw = str(w.text)
        if any(word in raw.lower() for word in ["privacy", "redacted", "withheld", "domains by proxy"]):
            print("\n  ⚠ WHOIS privacy protection is enabled")

        return dict(w)
    except Exception as e:
        print(f"WHOIS error for {domain}: {e}")
        return None

def reverse_whois_email(email):
    """Find domains registered with the same email (via ViewDNS or WHOIS API)."""
    url = f"https://viewdns.info/reversewhois/?q={email}"
    print(f"Reverse WHOIS for {email}: {url}")
    # Note: ViewDNS.info has a web UI — use their API for automation
    return url

whois_lookup("example.com")
```

### Step 2: DNS enumeration and history

```python
import dns.resolver
import requests

def dns_lookup(domain):
    """Enumerate DNS records for a domain."""
    record_types = ["A", "AAAA", "MX", "NS", "TXT", "SOA", "CNAME"]
    results = {}

    print(f"\n=== DNS Records: {domain} ===")
    for rtype in record_types:
        try:
            answers = dns.resolver.resolve(domain, rtype, lifetime=5)
            records = [str(r) for r in answers]
            results[rtype] = records
            print(f"  {rtype:<8}: {', '.join(records)}")
        except (dns.resolver.NoAnswer, dns.resolver.NXDOMAIN, dns.exception.Timeout):
            pass

    return results

def dns_history_securitytrails(domain, api_key):
    """Get historical DNS records from SecurityTrails API."""
    headers = {"apikey": api_key, "Accept": "application/json"}
    base_url = "https://api.securitytrails.com/v1"

    # Historical A records
    resp = requests.get(f"{base_url}/history/{domain}/dns/a", headers=headers, timeout=15)
    data = resp.json()

    print(f"\n=== DNS History (SecurityTrails): {domain} ===")
    for record in data.get("records", []):
        first_seen = record.get("first_seen")
        last_seen = record.get("last_seen")
        ips = [v.get("ip") for v in record.get("values", [])]
        print(f"  [{first_seen} → {last_seen}] {', '.join(ips)}")

    return data

def passive_dns_free(domain):
    """Query free passive DNS sources."""
    results = {}

    # HackerTarget Passive DNS (free)
    try:
        resp = requests.get(
            f"https://api.hackertarget.com/hostsearch/?q={domain}",
            timeout=15
        )
        if "error" not in resp.text.lower():
            hosts = [line.split(",")[0] for line in resp.text.strip().split("\n") if "," in line]
            results["hackertarget_hosts"] = hosts
            print(f"HackerTarget found {len(hosts)} subdomains for {domain}")
    except Exception as e:
        print(f"HackerTarget error: {e}")

    # CIRCL Passive DNS (free, no auth)
    try:
        resp = requests.get(
            f"https://www.circl.lu/pdns/query/{domain}",
            headers={"Accept": "application/json"},
            timeout=15
        )
        records = [json.loads(line) for line in resp.text.strip().split("\n") if line]
        ips = list({r.get("rdata") for r in records if r.get("rrtype") == "A"})
        results["circl_ips"] = ips
        print(f"CIRCL passive DNS: {len(records)} records, {len(ips)} unique IPs")
    except Exception as e:
        print(f"CIRCL error: {e}")

    return results

dns_lookup("example.com")
```

### Step 3: Reverse IP lookup

```python
def reverse_ip_lookup(ip_address):
    """Find all domains hosted on the same IP address."""
    # HackerTarget API (free, up to 500 results)
    try:
        resp = requests.get(
            f"https://api.hackertarget.com/reverseiplookup/?q={ip_address}",
            timeout=15
        )
        if "error" not in resp.text.lower() and resp.text.strip():
            domains = [d.strip() for d in resp.text.strip().split("\n")]
            print(f"\n=== Reverse IP: {ip_address} ===")
            print(f"Hosted domains: {len(domains)}")
            for d in domains[:20]:
                print(f"  {d}")
            if len(domains) > 20:
                print(f"  ... and {len(domains) - 20} more")
            return domains
    except Exception as e:
        print(f"Reverse IP error: {e}")
    return []

def ip_info(ip_address):
    """Get IP geolocation, ASN, and organization info."""
    resp = requests.get(f"https://ipapi.co/{ip_address}/json/", timeout=10)
    data = resp.json()
    print(f"\n=== IP Info: {ip_address} ===")
    print(f"  Organization: {data.get('org', 'N/A')}")
    print(f"  ASN:          {data.get('asn', 'N/A')}")
    print(f"  Country:      {data.get('country_name', 'N/A')}")
    print(f"  City:         {data.get('city', 'N/A')}")
    print(f"  Hostname:     {data.get('hostname', 'N/A')}")
    return data

reverse_ip_lookup("93.184.216.34")
ip_info("93.184.216.34")
```

### Step 4: SSL certificate transparency (crt.sh)

```python
def crt_sh_lookup(domain, include_expired=True, deduplicate=True):
    """
    Query crt.sh for all SSL certificates issued for a domain.
    Certificate transparency logs are public and reveal all subdomains
    that have ever had a certificate issued.
    """
    # Use wildcard to find all subdomains
    query = f"%.{domain}"
    url = f"https://crt.sh/?q={query}&output=json"

    try:
        resp = requests.get(url, timeout=30)
        certs = resp.json()
    except (requests.RequestException, json.JSONDecodeError) as e:
        print(f"crt.sh error: {e}")
        return []

    # Extract all names from certificates
    all_names = set()
    for cert in certs:
        name_value = cert.get("name_value", "")
        # name_value can contain multiple names separated by newlines
        for name in name_value.split("\n"):
            name = name.strip().lstrip("*.")
            if name and domain in name:
                all_names.add(name.lower())

    subdomains = sorted(all_names)
    print(f"\n=== Certificate Transparency: {domain} ===")
    print(f"Total certificates: {len(certs)}")
    print(f"Unique subdomains: {len(subdomains)}")
    for sub in subdomains[:30]:
        print(f"  {sub}")
    if len(subdomains) > 30:
        print(f"  ... and {len(subdomains) - 30} more")

    return subdomains

# Also retrieve detailed cert info
def crt_sh_certs_detail(domain):
    """Get certificate details including issuer, validity, and fingerprint."""
    resp = requests.get(f"https://crt.sh/?q={domain}&output=json", timeout=30)
    certs = resp.json()

    print(f"\nRecent certificates for {domain}:")
    for cert in sorted(certs, key=lambda x: x.get("entry_timestamp", ""), reverse=True)[:10]:
        print(f"  [{cert.get('entry_timestamp', '')[:10]}] "
              f"CN={cert.get('common_name', '?'):<40} "
              f"Issuer: {cert.get('issuer_name', '?')[:50]}")

crt_sh_lookup("example.com")
```

### Step 5: Google Dorks

```python
def generate_dorks(domain):
    """Generate a comprehensive set of Google dorks for a target domain."""
    company = domain.split(".")[0]  # Rough heuristic
    dorks = [
        # Infrastructure discovery
        (f"site:{domain}", "All indexed pages"),
        (f"site:{domain} inurl:admin", "Admin panels"),
        (f"site:{domain} inurl:login", "Login pages"),
        (f"site:{domain} inurl:api", "API endpoints"),
        (f"site:{domain} inurl:dev OR inurl:staging OR inurl:test", "Dev/staging environments"),

        # File exposure
        (f"site:{domain} filetype:pdf", "PDF documents"),
        (f"site:{domain} filetype:xlsx OR filetype:csv", "Spreadsheets"),
        (f"site:{domain} filetype:sql", "SQL database files"),
        (f"site:{domain} filetype:env OR filetype:config", "Config files"),
        (f"site:{domain} filetype:log", "Log files"),
        (f'site:{domain} ext:bak OR ext:old OR ext:backup', "Backup files"),

        # Credential exposure
        (f'site:github.com "{domain}" password OR secret OR api_key', "Credentials on GitHub"),
        (f'site:pastebin.com "{domain}"', "Domain on Pastebin"),
        (f'"{domain}" filetype:txt password', "Password files"),

        # Technology fingerprinting
        (f"site:{domain} intext:\"Powered by\"", "CMS/framework identification"),
        (f"site:{domain} inurl:wp-admin", "WordPress admin"),
        (f"site:{domain} inurl:jira", "Jira instances"),
        (f"site:{domain} inurl:confluence", "Confluence instances"),

        # Email harvesting
        (f'"@{domain}" filetype:xlsx', "Email lists in spreadsheets"),
        (f'"@{domain}" site:linkedin.com', "Employee emails on LinkedIn"),

        # Error pages (reveal technology stack)
        (f'site:{domain} intext:"Error" intext:"stack trace"', "Error pages with stack traces"),
        (f'site:{domain} "Index of /"', "Directory listings"),
    ]

    print(f"\n=== Google Dorks: {domain} ===")
    for query, description in dorks:
        encoded = query.replace(" ", "+").replace('"', '%22')
        url = f"https://www.google.com/search?q={encoded}"
        print(f"\n[{description}]")
        print(f"  Query: {query}")
        print(f"  URL:   {url}")

    return dorks

generate_dorks("example.com")
```

### Step 6: Wayback Machine enumeration

```python
def wayback_cdx_enumeration(domain, limit=1000):
    """
    Use the Wayback Machine CDX API to enumerate all historically crawled
    URLs for a domain. Reveals old endpoints, APIs, and forgotten pages.
    """
    cdx_url = "https://web.archive.org/cdx/search/cdx"
    params = {
        "url": f"*.{domain}/*",
        "output": "json",
        "fl": "original,timestamp,statuscode",
        "filter": "statuscode:200",
        "collapse": "original",
        "limit": limit,
    }

    resp = requests.get(cdx_url, params=params, timeout=60)
    data = resp.json()

    if len(data) <= 1:
        print(f"No Wayback data found for {domain}")
        return []

    urls = [row[0] for row in data[1:]]  # Skip header row
    timestamps = [row[1] for row in data[1:]]

    print(f"\n=== Wayback Machine: {domain} ===")
    print(f"Total unique URLs: {len(urls)}")

    # Find interesting endpoints
    interesting_patterns = [
        r'/api/', r'/admin/', r'/login', r'/dashboard',
        r'\.php', r'\.asp', r'\.env', r'\.bak', r'\.sql',
        r'/wp-', r'/cgi-bin/', r'\.xml', r'\.json',
    ]

    for pattern in interesting_patterns:
        matching = [u for u in urls if re.search(pattern, u, re.IGNORECASE)]
        if matching:
            print(f"\n  [{pattern}] {len(matching)} URLs:")
            for u in matching[:5]:
                print(f"    {u}")

    # Find unique subdomains from Wayback
    subdomains = set()
    for url in urls:
        match = re.match(r'https?://([^/]+)', url)
        if match:
            host = match.group(1)
            if domain in host:
                subdomains.add(host.lower())

    print(f"\n  Subdomains in Wayback: {len(subdomains)}")
    for sub in sorted(subdomains):
        print(f"    {sub}")

    return urls

wayback_cdx_enumeration("example.com", limit=500)
```

### Step 7: Full passive recon pipeline

```python
def full_passive_recon(domain, output_dir="."):
    """Run a complete passive recon pipeline for a target domain."""
    import os
    os.makedirs(output_dir, exist_ok=True)

    results = {"domain": domain, "timestamp": __import__("datetime").datetime.utcnow().isoformat()}

    print(f"\n{'='*60}")
    print(f"PASSIVE RECON: {domain}")
    print(f"{'='*60}")

    # 1. WHOIS
    results["whois"] = whois_lookup(domain)

    # 2. DNS records
    results["dns"] = dns_lookup(domain)

    # 3. Passive DNS (free sources)
    results["passive_dns"] = passive_dns_free(domain)

    # 4. Certificate transparency
    results["subdomains_crt"] = crt_sh_lookup(domain)

    # 5. Reverse IP for primary domain IP
    try:
        primary_ip = str(dns.resolver.resolve(domain, "A")[0])
        results["primary_ip"] = primary_ip
        results["reverse_ip"] = reverse_ip_lookup(primary_ip)
        results["ip_info"] = ip_info(primary_ip)
    except Exception as e:
        print(f"IP lookup failed: {e}")

    # 6. Wayback Machine
    results["wayback_urls"] = wayback_cdx_enumeration(domain, limit=200)

    # 7. Dorks (just generate, not execute automatically)
    results["dorks"] = [(q, d) for q, d in generate_dorks(domain)]

    # Save
    output_file = f"{output_dir}/passive_recon_{domain.replace('.', '_')}.json"
    with open(output_file, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\n✓ Full passive recon saved to {output_file}")

    return results

full_passive_recon("example.com")
```

## Passive Recon Checklist

| Technique | Tool | Data Obtained |
|-----------|------|---------------|
| WHOIS lookup | `python-whois` | Registrar, creation date, name servers, registrant |
| DNS records | `dnspython` | A, MX, NS, TXT, SOA records |
| DNS history | SecurityTrails, CIRCL | Historical IPs, old name servers |
| Reverse IP | HackerTarget API | Other domains on same server |
| SSL certs | crt.sh | All subdomains ever issued a cert |
| Wayback Machine | CDX API | Historical URLs, old endpoints |
| Google Dorks | Google Search | Exposed files, admin panels, credentials |
| Shodan | `shodan` library | Open ports, services, banners |
| Passive DNS | CIRCL, HackerTarget | Current and historical DNS records |

## Guidelines

- **Zero contact**: All techniques in this skill make zero requests to the target's infrastructure. Requests go to third-party services (crt.sh, HackerTarget, CIRCL, etc.) only.
- **Rate limits**: HackerTarget free tier allows 100 API calls per day. Spread queries or cache results.
- **crt.sh is gold**: Certificate transparency is the fastest way to find subdomains. Combined with Wayback Machine, it often reveals more than active brute-force DNS.
- **Historical IPs**: Old IPs from DNS history may point to WAF bypass opportunities or forgotten servers. Always check historical data.
- **Google cache**: Combine `cache:example.com` with regular dorks to access pages that have since been removed.
