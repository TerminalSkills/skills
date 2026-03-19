---
name: censys
description: >-
  Censys search engine for internet-connected hosts, TLS certificates, and domains. Use when:
  certificate transparency monitoring, finding hosts by certificate fingerprint, alternative to
  Shodan for TLS/SSL analysis, discovering hosts running specific services, or tracking infrastructure
  changes via cert issuance.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: research
  tags: [censys, certificates, tls, attack-surface, recon]
  use-cases:
    - "Find all IP addresses serving a TLS certificate for a target domain"
    - "Monitor certificate transparency logs for newly issued certs for a domain"
    - "Discover hosts running a specific service version across the internet"
    - "Find shadow IT infrastructure using TLS certificate common names"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Censys

## Overview

Censys continuously scans the entire internet and indexes every reachable host with detailed information about open ports, TLS/SSL certificates, service banners, and configurations. Censys is particularly strong for certificate-based discovery — it indexes certificate transparency logs and lets you pivot from certificate subject names to IP addresses and vice versa. This makes it excellent for finding unknown infrastructure tied to a target organization.

**Requires:** Censys API key (free account at censys.io gives 250 queries/month).

## Instructions

### Step 1: Install and configure

```bash
pip install censys
```

```python
import os
from censys.search import CensysHosts, CensysCerts
from censys.common.exceptions import CensysRateLimitExceededException, CensysNotFoundException
import json
import time

# Set credentials via environment variables (recommended)
# export CENSYS_API_ID="your-api-id"
# export CENSYS_API_SECRET="your-api-secret"

# Or pass directly
CENSYS_API_ID = os.getenv("CENSYS_API_ID", "YOUR_API_ID")
CENSYS_API_SECRET = os.getenv("CENSYS_API_SECRET", "YOUR_API_SECRET")

# Initialize clients
h = CensysHosts(api_id=CENSYS_API_ID, api_secret=CENSYS_API_SECRET)

# Check account quota
account = h.account()
print(f"Quota: {account.get('quota', {})}")
```

### Step 2: Search for hosts by query

```python
def search_hosts(query, max_results=100, fields=None):
    """
    Search Censys for hosts matching a query.
    
    Common query examples:
    - services.tls.certificates.leaf_data.subject.common_name: "example.com"
    - services.port: 3389 and autonomous_system.name: "Company"
    - services.http.response.html_title: "Dashboard"
    - services.service_name: "REDIS" and not ip: "10.0.0.0/8"
    """
    if fields is None:
        fields = ["ip", "services.port", "services.service_name", "autonomous_system.name",
                  "autonomous_system.asn", "location.country", "services.tls.certificates.leaf_data.subject.common_name"]

    print(f"Searching: {query}")
    results = []
    try:
        for hit in h.search(query, fields=fields, pages=max_results // 100 + 1):
            results.append(hit)
            if len(results) >= max_results:
                break
            time.sleep(0.1)  # Gentle rate limiting
    except CensysRateLimitExceededException:
        print("Rate limit reached. Results so far:")

    print(f"Found {len(results)} hosts")
    for r in results[:20]:
        ip = r.get("ip")
        services = r.get("services", [])
        ports = [str(s.get("port", "?")) for s in services]
        asn_name = r.get("autonomous_system", {}).get("name", "N/A")
        country = r.get("location", {}).get("country", "N/A")
        print(f"  {ip:<20} ports: {','.join(ports):<20} {asn_name} ({country})")

    return results

# Find hosts serving TLS certs for a domain
search_hosts('services.tls.certificates.leaf_data.subject.common_name: "*.example.com"')

# Find exposed Redis servers
search_hosts('services.service_name: "REDIS"', max_results=50)

# Find hosts in a specific org
search_hosts('autonomous_system.name: "Example Corporation" and services.port: 443')
```

### Step 3: Look up a specific IP address

```python
def lookup_host(ip_address):
    """Get detailed information about a specific IP from Censys."""
    try:
        host = h.view(ip_address)
        print(f"\n=== Censys Host View: {ip_address} ===")
        print(f"IP: {host.get('ip')}")

        asn = host.get("autonomous_system", {})
        print(f"ASN: {asn.get('asn')} — {asn.get('name')} ({asn.get('country_code')})")

        loc = host.get("location", {})
        print(f"Location: {loc.get('city')}, {loc.get('country')}")

        print(f"\nServices:")
        for service in host.get("services", []):
            port = service.get("port")
            svc_name = service.get("service_name", "unknown")
            transport = service.get("transport_protocol", "tcp")
            banner = service.get("banner", "")[:80]

            tls = service.get("tls", {})
            cert_cn = ""
            if tls:
                leaf = tls.get("certificates", {}).get("leaf_data", {})
                cert_cn = leaf.get("subject", {}).get("common_name", "")

            print(f"  {port}/{transport} — {svc_name}", end="")
            if cert_cn:
                print(f" | cert: {cert_cn}", end="")
            if banner:
                print(f" | banner: {banner}", end="")
            print()

        return host
    except CensysNotFoundException:
        print(f"Host {ip_address} not found in Censys.")
        return None

lookup_host("8.8.8.8")
```

### Step 4: Certificate-based discovery

```python
def find_hosts_by_domain_cert(domain, include_subdomains=True):
    """
    Find all IP addresses serving TLS certificates for a domain.
    This is highly effective for finding unknown/shadow infrastructure.
    """
    if include_subdomains:
        query = f'services.tls.certificates.leaf_data.names: "{domain}"'
    else:
        query = f'services.tls.certificates.leaf_data.subject.common_name: "{domain}"'

    fields = [
        "ip",
        "services.port",
        "services.tls.certificates.leaf_data.subject.common_name",
        "services.tls.certificates.leaf_data.names",
        "services.tls.certificates.leaf_data.issuer.common_name",
        "autonomous_system.name",
        "location.country",
    ]

    print(f"Finding hosts with TLS certs for: {domain}")
    results = []
    for hit in h.search(query, fields=fields, pages=5):
        results.append(hit)

    print(f"\n{len(results)} hosts found:\n")
    for r in results:
        ip = r.get("ip")
        asn = r.get("autonomous_system", {}).get("name", "?")
        country = r.get("location", {}).get("country", "?")
        services = r.get("services", [])
        for svc in services:
            tls = svc.get("tls", {})
            if tls:
                leaf = tls.get("certificates", {}).get("leaf_data", {})
                cn = leaf.get("subject", {}).get("common_name", "")
                names = leaf.get("names", [])
                issuer = leaf.get("issuer", {}).get("common_name", "")
                port = svc.get("port")
                print(f"  {ip}:{port} | CN: {cn} | SAN: {names[:3]} | Issuer: {issuer} | {asn} ({country})")

    return results

find_hosts_by_domain_cert("example.com")
```

### Step 5: Aggregation queries

```python
def aggregate_query(query, field, num_buckets=10):
    """
    Aggregate Censys results to get a distribution overview.
    Useful for understanding what products/versions/countries/orgs are common.
    """
    result = h.aggregate(query, field, num_buckets=num_buckets)

    print(f"\nAggregation: {query}")
    print(f"Field: {field}")
    print(f"Total matching: {result.get('total', 0):,}")
    print(f"\nTop {num_buckets} values:")
    for bucket in result.get("buckets", []):
        print(f"  {bucket['key']:<50} {bucket['count']:>10,}")

# Distribution of countries for Apache servers on port 80
aggregate_query("services.http.response.headers.Server: Apache", "location.country", 15)

# Distribution of services for a specific ASN
aggregate_query("autonomous_system.asn: 15169", "services.service_name", 20)

# TLS version distribution
aggregate_query("services.tls: *", "services.tls.version_selected", 10)
```

### Step 6: Export results to file

```python
def export_hosts_to_json(query, output_file, max_results=500):
    """Export Censys search results to a JSON file for offline analysis."""
    print(f"Exporting up to {max_results} hosts for query: {query}")
    results = []

    for hit in h.search(query, pages=max_results // 100 + 1):
        results.append(hit)
        if len(results) >= max_results:
            break

    with open(output_file, "w") as f:
        json.dump(results, f, indent=2)

    print(f"Exported {len(results)} records to {output_file}")
    return results

# Export all exposed Elasticsearch instances
export_hosts_to_json(
    'services.service_name: "ELASTICSEARCH" and services.elasticsearch.indices_count > 0',
    "exposed_elasticsearch.json",
    max_results=200
)
```

## Censys Query Language Reference

| Query | Description |
|-------|-------------|
| `services.port: 443` | Hosts with port 443 open |
| `services.service_name: "HTTP"` | Hosts running HTTP |
| `services.tls.certificates.leaf_data.subject.common_name: "*.example.com"` | Wildcard cert for domain |
| `services.tls.certificates.leaf_data.names: "example.com"` | Any cert naming the domain |
| `autonomous_system.name: "Amazon"` | Hosts in Amazon ASN |
| `autonomous_system.asn: 16509` | Hosts in ASN 16509 |
| `location.country: "Germany"` | Hosts in Germany |
| `ip: "8.8.8.0/24"` | Hosts in CIDR range |
| `services.http.response.html_title: "Kibana"` | Exposed Kibana instances |
| `labels: "cloud"` | Cloud-hosted infrastructure |

## Guidelines

- **Certificate pivoting**: The most powerful Censys use case is pivoting from a known domain → certificate → IPs → more domains. This often reveals shadow IT and forgotten assets.
- **Quota management**: Free accounts have 250 queries/month. Use aggregation queries to preview result counts before pulling full data.
- **Combine with Shodan**: Censys and Shodan index different things. Use both for complete coverage. Censys is stronger on TLS/certificate data; Shodan is stronger on IoT and raw service banners.
- **Historical data**: Censys Search 2.0 does not provide historical data by default. Use the Censys Data platform for historical snapshots.
- **SDK vs REST**: The Python SDK handles authentication, pagination, and rate limiting automatically. Prefer it over raw REST calls.
