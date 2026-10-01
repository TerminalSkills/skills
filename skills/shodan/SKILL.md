---
name: shodan
description: >-
  Shodan is a search engine for internet-connected devices: it indexes open ports, service banners,
  certificates and known vulnerabilities for every public IP. Use when: mapping the attack surface of
  an organization you are authorized to assess, finding exposed services by port, product or CVE,
  checking what a suspicious IP exposes, or monitoring your own network ranges for new exposure with
  the Shodan CLI, Python library or API.
license: Apache-2.0
compatibility: "Python 3 (checked on 3.12); Shodan API key (searches with filters need query credits)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  repository: https://github.com/achillean/shodan-python
  tags: [shodan, recon, attack-surface, iot, security]
  use-cases:
    - "Find all hosts in an organization exposed on port 22 or 3389"
    - "Look up IP reputation and open services for a suspicious address"
    - "Discover devices affected by a specific CVE across the internet"
    - "Map attack surface of a target organization by ASN and IP range"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Shodan

## Overview

Shodan is a search engine for internet-connected devices. Unlike traditional search engines that index web content, Shodan scans the entire internet and indexes open ports, banners, certificates, and service metadata. Use it to discover exposed services, audit your own infrastructure, perform OSINT on target organizations, and track vulnerable devices at scale. Queries read Shodan's database — they send nothing to the target — and are available through the `shodan` CLI, the Python library and a REST API.

**Requires:** Shodan API key from https://account.shodan.io, kept in the `SHODAN_API_KEY` environment variable. Host lookups and result counts spend nothing; search filters and paging spend query credits, which come with a Membership or an API subscription.

## Instructions

### Step 1: Install and authenticate

```bash
pip install shodan "setuptools<81"
shodan init "$SHODAN_API_KEY"     # validates the key, stores it in ~/.config/shodan/api_key (mode 600)
shodan info                       # Query credits available / Scan credits available
```

The CLI in the current release (1.31.0) imports `pkg_resources`, which setuptools removed in version 81; without the pin, `shodan` exits with `ModuleNotFoundError: No module named 'pkg_resources'`. The Python library itself does not need setuptools.

```python
import csv
import os
import shodan

api = shodan.Shodan(os.environ["SHODAN_API_KEY"])

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
        print(f"ISP:           {host.get('isp', 'N/A')}")
        print(f"Last updated:  {host.get('last_update', 'N/A')}")
        print(f"\nOpen ports: {host['ports']}")
        for item in host['data']:
            print(f"  Port {item['port']}/{item.get('transport', 'tcp')}: {item.get('product', 'unknown')} {item.get('version', '')}")
            if 'vulns' in item:
                print(f"    CVEs: {', '.join(item['vulns'].keys())}")
        return host
    except shodan.APIError as e:
        print(f"Error: {e}")      # raised for an unknown IP, a bad key or an exhausted plan
        return None

lookup_ip("45.33.32.156")         # scanme.nmap.org, a host the Nmap project keeps for testing
```

Host lookups do not spend query credits. `api.host(ip, history=True)` adds historical banners. The CLI equivalent is `shodan host 45.33.32.156`.

For a quick look without any key, the InternetDB API returns open ports, hostnames, CPEs, tags and CVEs for one IP (free for non-commercial use; commercial use needs the Corporate plan or an enterprise license):

```bash
curl -s https://internetdb.shodan.io/8.8.8.8
# {"cpes":[],"hostnames":["mysegi.my","dns.google"],"ip":"8.8.8.8","ports":[53,443],"tags":[],"vulns":[]}
```

### Step 3: Search queries — find hosts matching filters

```python
def search_hosts(query, max_results=100):
    """Search Shodan with a filter query and return matching hosts."""
    try:
        count = api.count(query)                      # free: counting never spends credits
        print(f"Searching: {query} — total results: {count['total']:,}")

        results = []
        # search_cursor pages for you; every page of 100 results costs 1 query credit
        for banner in api.search_cursor(query, minify=False):
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

results = search_hosts('net:203.0.113.0/24 port:3389', max_results=50)
for r in results[:10]:
    print(f"  {r['ip']}:{r['port']} — {r['org']} ({r['country']}) {r['vulns'] or ''}")
```

### Step 4: Export results to CSV

```python
def export_to_csv(results, filename="shodan_results.csv"):
    """Export Shodan search results to a CSV file."""
    fieldnames = ["ip", "port", "org", "product", "version", "country", "vulns", "timestamp"]
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for r in results:
            writer.writerow({**r, "vulns": "|".join(r.get("vulns", []))})
    print(f"Exported {len(results)} results to {filename}")

export_to_csv(results, "exposed_rdp.csv")
```

### Step 5: Monitor alerts — get notified when new hosts appear

```python
def create_network_alert(name, network_cidr, triggers=("uncommon", "malware")):
    """Monitor a network range you own; how many IPs can be monitored depends on the plan."""
    alert = api.create_alert(name, network_cidr)
    for trigger in triggers:                 # api.alert_triggers() lists every trigger with its rule
        api.enable_alert_trigger(alert["id"], trigger)
    print(f"Created alert '{name}' for {network_cidr} — ID: {alert['id']}")
    return alert

create_network_alert("Northwind edge network", "203.0.113.0/28")
for alert in api.alerts():
    print(f"Alert: {alert['name']} | ID: {alert['id']} | Triggers: {alert.get('triggers', {})}")
```

An alert is a private feed of the banners Shodan collects for the range (`shodan stream --alert=all`); triggers turn selected events into notifications. `uncommon` fires on services other than ports 22, 80, 443 and 7547; `any` fires on every discovered service. Shodan Monitor (https://monitor.shodan.io) is the web interface for the same alerts.

### Step 6: Facet analysis — summarize results by field

```python
def facet_analysis(query, facets=(("org", 5), ("country", 5), ("port", 5), ("product", 5))):
    """Top values per field. count() returns facets without spending query credits."""
    result = api.count(query, facets=list(facets))
    print(f"Facet analysis for: {query} — total matches: {result['total']:,}")
    for facet, items in result.get("facets", {}).items():
        print(f"  Top {facet}:")
        for item in items:
            print(f"    {item['value']}: {item['count']:,}")

facet_analysis('product:"OpenSSH" country:DE')
```

### Step 7: The same from the command line

```bash
shodan count 'port:3389 net:203.0.113.0/24'                       # just the number, no credits spent
shodan stats --facets port,product --limit 5 'net:203.0.113.0/24'
shodan search --fields ip_str,port,org,product --limit 100 'net:203.0.113.0/24 port:22'
shodan download --limit 1000 edge-exposure 'net:203.0.113.0/24'   # full banners → edge-exposure.json.gz
shodan parse --fields ip_str,port,product --separator , edge-exposure.json.gz
shodan alert create "Northwind edge network" 203.0.113.0/28
```

### Common Shodan filters

| Filter | Example | Description |
|--------|---------|-------------|
| `port:` | `port:22` | Hosts with a specific open port |
| `org:` | `org:"Google"` | Hosts belonging to an organization |
| `product:` | `product:"nginx"` | Hosts running a specific product |
| `version:` | `version:"2.4.49"` | Specific software version |
| `vuln:` | `vuln:CVE-2021-44228` | Hosts with a known vulnerability (Small Business plan and up) |
| `country:` | `country:US` | Hosts in a specific country |
| `asn:` | `asn:AS15169` | Hosts in an ASN |
| `net:` | `net:8.8.8.0/24` | Hosts in a CIDR range |
| `hostname:` | `hostname:nmap.org` | Hosts whose hostname contains the value |
| `ssl.cert.subject.cn:` | `ssl.cert.subject.cn:"scanme.nmap.org"` | SSL cert common name |
| `http.title:` | `http.title:"Login"` | HTTP page title |
| `has_vuln:` | `has_vuln:true` | Hosts with at least one known CVE |

Filters combine with spaces (AND); a `-` prefix excludes: `net:203.0.113.0/24 -port:80,443`. The full list is at https://www.shodan.io/search/filters.

## Examples

### Example 1: Audit your own network range for exposed remote access

**User request:** "We own 203.0.113.0/24. Which of our hosts expose RDP or SSH to the internet?"

```bash
shodan count 'net:203.0.113.0/24 port:22,3389'
shodan search --fields ip_str,port,product,version --separator , 'net:203.0.113.0/24 port:22,3389'
```

The count costs nothing, so check it before the search, which spends one query credit per 100 results:

```text
4
203.0.113.17,22,OpenSSH,8.9p1 Ubuntu 3ubuntu0.13,
203.0.113.17,3389,Remote Desktop Protocol,,
203.0.113.42,22,OpenSSH,7.4,
203.0.113.96,3389,Remote Desktop Protocol,,
```

The agent reports each host and port, flags the outdated OpenSSH 7.4, and suggests `shodan alert create` on the range so new exposure is reported automatically.

### Example 2: Check a suspicious IP from the firewall logs

**User request:** "45.33.32.156 keeps showing up in our logs. What is it?"

```bash
curl -s https://internetdb.shodan.io/45.33.32.156 | jq -c '{hostnames, ports, tags, cves: (.vulns | length)}'
```

```json
{"hostnames":["scanme.nmap.org"],"ports":[22,80,123,31337],"tags":["cloud"],"cves":120}
```

No key or credits were needed. For banners, software versions and the list of CVEs per service, the agent continues with `shodan host 45.33.32.156` (or `lookup_ip` from step 2) and summarizes: a cloud-hosted test machine of the Nmap project running an old Apache and OpenSSH.

## Guidelines

- **Ethics and legality**: Only query Shodan for targets you own or have explicit authorization to assess. Do not use Shodan to attack or access systems without permission. Finding a host in Shodan does not grant any right to connect to it.
- **Query credits**: A search spends 1 query credit when it contains a filter or asks for a page past the first; 1 credit covers 100 results. Credits renew monthly (100 with Membership, 10,000 on the Freelancer API plan). Without credits only unfiltered first-page searches, counts and host lookups remain.
- **Count first**: `api.count()` and `shodan count` / `shodan stats` return totals and facets without spending credits. Use them to size a query before `search_cursor()` or `shodan download`.
- **Restricted filters**: `vuln:` needs the Small Business plan or higher, `tag:` the Corporate plan; Membership and Freelancer keys cannot use them.
- **Rate limit**: All plans are limited to 1 request per second; the Python library waits between calls by itself. Do not parallelize requests with one key.
- **Key handling**: The API key travels as a `key=` URL parameter, so it shows up in proxy logs and shell history. Read it from `SHODAN_API_KEY`; never paste it into scripts or commit it.
- **Data freshness**: Shodan shows what its crawlers saw at each banner's `timestamp`, which may be days or weeks in the past. Confirm a finding against the live system (with authorization) before acting on it.
- **On-demand scans**: `shodan scan submit` makes Shodan actively probe an address and spends scan credits (1 per IP). Request scans only for networks you are responsible for.
- **Combine filters**: Use multiple filters to narrow searches, e.g., `port:443 org:"Northwind Logistics" country:US`
