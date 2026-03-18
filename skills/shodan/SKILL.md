---
name: shodan
description: >-
  Shodan API integration for discovering internet-connected devices and services. Use when: mapping
  attack surface, finding exposed services by port/product/CVE, IoT device discovery, IP reputation
  checks, monitoring infrastructure exposure.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags: [osint, shodan, recon, attack-surface, iot, security]
  use-cases:
    - "Find all hosts in an organization exposed on port 22 or 3389"
    - "Look up IP reputation and open services for a suspicious address"
    - "Discover devices affected by a specific CVE across the internet"
    - "Map attack surface of a target organization by ASN and IP range"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Shodan

## Overview

Shodan is a search engine for internet-connected devices. Unlike traditional search engines that index web content, Shodan scans the entire internet and indexes open ports, banners, certificates, and service metadata. Use it to discover exposed services, audit your own infrastructure, perform OSINT on target organizations, and track vulnerable devices at scale.

**Requires:** Shodan API key (free tier available at shodan.io; paid plans unlock full search)

## Instructions

### Step 1: Install and authenticate

```bash
pip install shodan
```

```python
import shodan
import json
import csv

API_KEY = "YOUR_SHODAN_API_KEY"
api = shodan.Shodan(API_KEY)

# Verify the key works
info = api.info()
print(f"Plan: {info['plan']}, Query credits: {info['query_credits']}, Scan credits: {info['scan_credits']}")
```

### Step 2: IP lookup — get all services on a specific host

```python
def lookup_ip(ip_address):
    """Retrieve all information about a host from Shodan."""
    try:
        host = api.host(ip_address)
        print(f"\n=== Host: {ip_address} ===")
        print(f"Organization:  {host.get('org', 'N/A')}")
        print(f"OS:            {host.get('os', 'N/A')}")
        print(f"Country:       {host.get('country_name', 'N/A')}")
        print(f"City:          {host.get('city', 'N/A')}")
        print(f"ISP:           {host.get('isp', 'N/A')}")
        print(f"Last updated:  {host.get('last_update', 'N/A')}")
        print(f"\nOpen ports: {host['ports']}")
        print(f"\nServices:")
        for item in host['data']:
            print(f"  Port {item['port']}/{item.get('transport', 'tcp')}: {item.get('product', 'unknown')} {item.get('version', '')}")
            if 'vulns' in item:
                print(f"    ⚠ CVEs: {', '.join(item['vulns'].keys())}")
        return host
    except shodan.APIError as e:
        print(f"Error: {e}")
        return None

lookup_ip("8.8.8.8")
```

### Step 3: Search queries — find hosts matching filters

```python
def search_hosts(query, max_results=100):
    """Search Shodan with a filter query and return matching hosts."""
    try:
        print(f"\nSearching: {query}")
        count = api.count(query)
        print(f"Total results: {count['total']:,}")

        results = []
        # Iterate through pages (each page = 100 results)
        for banner in api.search_cursor(query):
            results.append({
                "ip": banner.get("ip_str"),
                "port": banner.get("port"),
                "org": banner.get("org", "N/A"),
                "product": banner.get("product", "N/A"),
                "version": banner.get("version", "N/A"),
                "country": banner.get("location", {}).get("country_name", "N/A"),
                "vulns": list(banner.get("vulns", {}).keys()),
                "timestamp": banner.get("timestamp"),
            })
            if len(results) >= max_results:
                break

        return results
    except shodan.APIError as e:
        print(f"API Error: {e}")
        return []

# Common search filter examples:
# port:22 org:"Company Name"              — SSH servers at a specific org
# product:"Apache httpd" port:80          — Apache servers on port 80
# vuln:CVE-2021-44228                     — Log4Shell vulnerable hosts
# org:"Amazon" port:3389                  — RDP exposed on AWS
# ssl.cert.subject.cn:"*.example.com"     — Wildcard certs for a domain
# http.title:"Dashboard" port:8080        — Exposed dashboards

results = search_hosts('org:"Example Corp" port:3389', max_results=50)
for r in results[:10]:
    print(f"  {r['ip']}:{r['port']} — {r['org']} ({r['country']}) {r['vulns'] or ''}")
```

### Step 4: Export results to CSV

```python
def export_to_csv(results, filename="shodan_results.csv"):
    """Export Shodan search results to a CSV file."""
    if not results:
        print("No results to export.")
        return

    fieldnames = ["ip", "port", "org", "product", "version", "country", "vulns", "timestamp"]
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            r_copy = r.copy()
            r_copy["vulns"] = "|".join(r_copy.get("vulns", []))
            writer.writerow(r_copy)

    print(f"Exported {len(results)} results to {filename}")

export_to_csv(results, "exposed_rdp.csv")
```

### Step 5: Monitor alerts — get notified when new hosts appear

```python
def list_alerts():
    """List all active Shodan monitor alerts."""
    alerts = api.alerts()
    for alert in alerts:
        print(f"Alert: {alert['name']} | ID: {alert['id']} | Triggers: {alert.get('triggers', {})}")

def create_network_alert(name, network_cidr):
    """Create a Shodan alert for a network range (requires paid plan)."""
    alert = api.create_alert(name, network_cidr)
    print(f"Created alert '{name}' for {network_cidr} — ID: {alert['id']}")
    return alert

# Example: monitor your company's IP range
# create_network_alert("Corp Network Monitor", "203.0.113.0/24")
```

### Step 6: Facet analysis — summarize results by field

```python
def facet_analysis(query, facets=["org", "country", "port", "product"]):
    """Analyze the distribution of results across different fields."""
    result = api.search(query, facets=facets, page=1)
    print(f"\nFacet analysis for: {query}")
    print(f"Total matches: {result['total']:,}\n")
    for facet in result.get("facets", {}):
        print(f"  Top {facet}s:")
        for item in result["facets"][facet][:5]:
            print(f"    {item['value']}: {item['count']:,}")
        print()

facet_analysis('vuln:CVE-2021-44228')
```

## Common Shodan Filters Reference

| Filter | Example | Description |
|--------|---------|-------------|
| `port:` | `port:22` | Hosts with a specific open port |
| `org:` | `org:"Google"` | Hosts belonging to an organization |
| `product:` | `product:"nginx"` | Hosts running a specific product |
| `version:` | `version:"2.4.49"` | Specific software version |
| `vuln:` | `vuln:CVE-2021-44228` | Hosts with a known vulnerability |
| `country:` | `country:US` | Hosts in a specific country |
| `asn:` | `asn:AS15169` | Hosts in an ASN |
| `net:` | `net:8.8.8.0/24` | Hosts in a CIDR range |
| `ssl.cert.subject.cn:` | `ssl.cert.subject.cn:"example.com"` | SSL cert common name |
| `http.title:` | `http.title:"Login"` | HTTP page title |

## Guidelines

- **Ethics and legality**: Only query Shodan for targets you own or have explicit authorization to assess. Do not use Shodan to attack or access systems without permission.
- **Rate limits**: Free API key is limited to 1 result per search query. Paid plans allow full result sets. Use `search_cursor()` for paginated access.
- **API credits**: Each search query consumes query credits. Use `api.count()` first to preview result counts before pulling full data.
- **Combine filters**: Use multiple filters to narrow searches, e.g., `port:443 org:"Target Corp" country:US`
- **CVE hunting**: The `vuln:` filter requires a Shodan membership plan (not free tier).
