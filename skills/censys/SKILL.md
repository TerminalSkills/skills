---
name: censys
description: >-
  Censys search engine for internet-connected hosts, TLS certificates, and web properties. Use when:
  certificate transparency monitoring, finding hosts by certificate fingerprint, alternative to
  Shodan for TLS/SSL analysis, discovering hosts running specific services, or tracking infrastructure
  changes via cert issuance.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: [censys, certificates, tls, attack-surface, recon]
  repository: https://github.com/censys/censys-sdk-python
  use-cases:
    - "Find all IP addresses serving a TLS certificate for a target domain"
    - "Monitor certificate transparency logs for newly issued certs for a domain"
    - "Discover hosts running a specific service version across the internet"
    - "Find shadow IT infrastructure using TLS certificate common names"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Censys

## Overview

Censys continuously scans the entire internet and indexes every reachable host, certificate, and web property with details about open ports, TLS/SSL certificates, service banners, and configurations. Censys is particularly strong for certificate-based discovery — it indexes certificate transparency logs and lets you pivot from certificate subject names to IP addresses and vice versa, which is excellent for finding unknown infrastructure tied to a target organization.

Censys retired its old Search v1/v2 API and the `censys` PyPI package in favor of the unified **Censys Platform**, queried with **CenQL** (Censys Query Language) through the `censys-platform` SDK or the `censys search` CLI. Authenticate with a Personal Access Token, not the old API ID/secret pair.

**Requires:** a Censys account and a Personal Access Token (create one from the Platform console under your user menu → API Access). Free accounts get a limited monthly search-credit allowance that Censys adjusts over time — check the current limits on your account's billing page rather than assuming a fixed number.

## Instructions

### Step 1: Install and authenticate

```bash
pip install censys-platform
```

```bash
export CENSYS_API_KEY="your-personal-access-token"
export CENSYS_ORGANIZATION_ID="your-organization-id"      # shown on the Personal Access Tokens page
```

```python
import os
from censys_platform import SDK

sdk = SDK(
    organization_id=os.environ["CENSYS_ORGANIZATION_ID"],
    personal_access_token=os.environ["CENSYS_API_KEY"],
)
```

`SDK` is also a context manager (`with SDK(...) as sdk:`), which closes the underlying HTTP session for you. Every method has an `_async` counterpart (`sdk.global_data.search_async(...)`) for use inside `asyncio` code.

### Step 2: Search with CenQL

CenQL queries start with a dataset prefix — `host.`, `cert.`, or `webproperty.` — and use `=` for an exact, case-sensitive match or `:` for a case-insensitive tokenized match.

```python
def search_hosts(query, page_size=50, fields=None):
    """Search the Censys Platform for hosts matching a CenQL query."""
    if fields is None:
        fields = [
            "host.ip",
            "host.services.port",
            "host.services.protocol",
            "host.autonomous_system.name",
            "host.location.country",
        ]

    res = sdk.global_data.search(search_query_input_body={
        "query": query,
        "fields": fields,
        "page_size": page_size,
    })

    for hit in res.result.hits:
        print(hit)
    return res

# Hosts serving a TLS cert naming a domain (any SAN)
search_hosts('host.services.cert.names = "beacontowersecurity.com"')

# Exposed Redis instances outside an internal range
search_hosts('host.services: (protocol = "REDIS") and not host.ip: "10.0.0.0/8"')

# Hosts in a specific organization's ASN, on port 443
search_hosts('host.autonomous_system.organization = "Beacon Tower Security" and host.services.port = 443')
```

### Step 3: Look up a specific host or certificate

```python
host = sdk.global_data.get_host(host="203.0.113.42")
print(host.result.ip, host.result.autonomous_system, host.result.location)

cert = sdk.global_data.get_certificate(fingerprint="a1b2c3d4e5f6...")
print(cert.result.names, cert.result.issuer)
```

### Step 4: Certificate-based discovery

```python
def find_hosts_by_domain_cert(domain):
    """Find hosts serving a TLS certificate that names this domain (any SAN)."""
    res = sdk.global_data.search(search_query_input_body={
        "query": f'host.services.cert.names = "{domain}"',
        "fields": ["host.ip", "host.services.port", "host.services.cert.names",
                   "host.autonomous_system.name", "host.location.country"],
        "page_size": 100,
    })
    for hit in res.result.hits:
        print(hit)
    return res

find_hosts_by_domain_cert("beacontowersecurity.com")
```

### Step 5: Aggregate and export

```python
# Distribution of countries for hosts running nginx
agg = sdk.global_data.aggregate(
    aggregation_input_body={
        "query": 'host.services.endpoints.http.headers: (key = "Server" and value = "nginx")',
        "field": "host.location.country",
        "num_buckets": 15,
    }
)
for bucket in agg.result.buckets:
    print(bucket.key, bucket.count)
```

```bash
# The Platform CLI (cencli) mirrors the SDK for one-off lookups and scripting.
# It ships as a standalone binary, not a pip package.
brew install censys/tap/cencli
censys auth login
censys search 'host.services.cert.names = "beacontowersecurity.com"'
```

## Examples

### Example 1: "Find every IP serving a TLS cert for beacontowersecurity.com, including subdomains"

```python
find_hosts_by_domain_cert("beacontowersecurity.com")
```

Result: prints each matching host's IP, open port, the certificate's subject/SAN names, issuer, ASN, and country — including boxes the security team never registered in DNS but that still present a valid cert for the domain (shadow IT).

### Example 2: "See which countries host the most nginx servers in our ASN before a security review"

```python
agg = sdk.global_data.aggregate(
    aggregation_input_body={
        "query": 'host.services.endpoints.http.headers: (key = "Server" and value = "nginx") '
                 'and host.autonomous_system.asn = 16509',
        "field": "host.location.country",
        "num_buckets": 10,
    }
)
for bucket in agg.result.buckets:
    print(bucket.key, bucket.count)
```

Result: a ranked list of countries by nginx host count within ASN 16509, letting the reviewer spot an unexpected region before pulling the full per-host detail.

## CenQL Reference

| Query | Description |
|-------|-------------|
| `host.services.port = 443` | Hosts with port 443 open |
| `host.services: (protocol = "HTTP")` | Hosts running HTTP |
| `host.services.cert.names = "beacontowersecurity.com"` | Any TLS cert naming the domain |
| `cert.names: "beacontowersecurity.com"` | Certificate records (not hosts) naming the domain |
| `host.autonomous_system.name = "AMAZON-02"` | Hosts in a named ASN |
| `host.autonomous_system.asn = 16509` | Hosts in ASN 16509 |
| `host.location.country = "Germany"` | Hosts in Germany |
| `host.ip: "198.51.100.0/24"` | Hosts in a CIDR range |
| `webproperty.services.http.response.html_title: "Kibana"` | Exposed Kibana instances |

## Guidelines

- **Certificate pivoting**: pivoting from a known domain → certificate → IPs → more domains is the most powerful Censys use case; it often reveals shadow IT and forgotten assets.
- **Credits, not a fixed quota**: Platform usage is metered in search credits that vary by plan; preview counts with an aggregation query before pulling full result pages.
- **Combine with Shodan**: Censys and Shodan index different things. Censys is stronger on TLS/certificate data; Shodan is stronger on IoT and raw service banners.
- **Legacy SDK is retired**: code using `from censys.search import CensysHosts` or the old `services.*:` query syntax targets the discontinued Search v1/v2 API — migrate it to `censys-platform` and CenQL.
- **SDK vs REST**: the SDK handles auth headers, pagination, and retries; prefer it over hand-built REST calls against the Platform API.
