---
name: maltego-transforms
description: >-
  Build custom Maltego transforms for visual OSINT graph analysis and relationship mapping. Use when: mapping connections between domains, IPs, emails, persons, and organizations; visual threat intelligence; complex OSINT correlation across multiple data sources.
license: Apache-2.0
compatibility: "Python 3.9+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags: [osint, maltego, transforms, threat-intel, graph, visualization, recon]
  use-cases:
    - "Build a custom transform to map domain to associated email addresses"
    - "Create an IP-to-ASN transform for network ownership mapping"
    - "Visualize relationships between threat actor infrastructure nodes"
    - "Correlate email addresses across breach databases in Maltego"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# Maltego Transforms

## Overview

Maltego is a visual link analysis tool used for OSINT and threat intelligence. Custom transforms let you query any API or data source and display results as connected graph nodes. Build transforms using Python with the Canari framework or the official TRX (Transform eXchange) library.

## Setup

### Install dependencies

```bash
pip install canari maltego-trx requests
```

### Project structure

```
my-transforms/
├── project.conf
├── src/
│   └── mytransforms/
│       ├── __init__.py
│       ├── transforms/
│       │   ├── __init__.py
│       │   ├── domain_to_emails.py
│       │   └── ip_to_asn.py
│       └── entities.py
```

## Core Concepts

### Entity types (built-in)

| Entity | Maltego class | Description |
|--------|--------------|-------------|
| Domain | `Domain` | Domain name (example.com) |
| IP Address | `IPAddress` | IPv4/IPv6 address |
| Email | `EmailAddress` | Email address |
| Person | `Person` | Individual name |
| Organization | `Organization` | Company or org name |
| URL | `URL` | Web URL |
| Phone | `PhoneNumber` | Phone number |

## Transform Examples

### 1. Domain to Emails (using Hunter.io)

```python
# transforms/domain_to_emails.py
from maltego_trx.maltego import MaltegoMsg, MaltegoTransform
from maltego_trx.transform import DiscoverableTransform
import requests

class DomainToEmails(DiscoverableTransform):
    """Find email addresses associated with a domain using Hunter.io."""

    @classmethod
    def create_entities(cls, request: MaltegoMsg, response: MaltegoTransform):
        domain = request.Value
        api_key = request.getTransformSetting("hunter_api_key")

        url = f"https://api.hunter.io/v2/domain-search"
        params = {
            "domain": domain,
            "api_key": api_key,
            "limit": 100
        }

        try:
            r = requests.get(url, params=params, timeout=10)
            data = r.json()

            for email_data in data.get("data", {}).get("emails", []):
                email = response.addEntity("maltego.EmailAddress", email_data["value"])
                email.addProperty("confidence", "Confidence", "loose",
                                  str(email_data.get("confidence", 0)))
                if email_data.get("first_name"):
                    email.addProperty("firstname", "First Name", "loose",
                                      email_data["first_name"])
                if email_data.get("last_name"):
                    email.addProperty("lastname", "Last Name", "loose",
                                      email_data["last_name"])
                if email_data.get("position"):
                    email.addProperty("title", "Title", "loose",
                                      email_data["position"])

        except Exception as e:
            response.addUIMessage(f"Error: {str(e)}", messageType="PartialError")
```

### 2. IP to ASN Transform

```python
# transforms/ip_to_asn.py
from maltego_trx.maltego import MaltegoMsg, MaltegoTransform
from maltego_trx.transform import DiscoverableTransform
import requests

class IPToASN(DiscoverableTransform):
    """Lookup ASN and network owner for an IP address."""

    @classmethod
    def create_entities(cls, request: MaltegoMsg, response: MaltegoTransform):
        ip = request.Value

        # Use ip-api.com (free, no key required)
        url = f"http://ip-api.com/json/{ip}?fields=status,org,as,asname,isp,country,city"

        try:
            r = requests.get(url, timeout=10)
            data = r.json()

            if data.get("status") == "success":
                # Add ASN as organization entity
                org_name = data.get("org", data.get("isp", "Unknown"))
                org = response.addEntity("maltego.Organization", org_name)
                org.addProperty("as", "AS Number", "loose", data.get("as", ""))
                org.addProperty("country", "Country", "loose", data.get("country", ""))
                org.addProperty("city", "City", "loose", data.get("city", ""))

                # Add location note
                response.addUIMessage(
                    f"ASN: {data.get('as')} | ISP: {data.get('isp')} | {data.get('country')}"
                )

        except Exception as e:
            response.addUIMessage(f"Error: {str(e)}", messageType="PartialError")
```

### 3. Domain to Subdomains (via crt.sh)

```python
# transforms/domain_to_subdomains.py
from maltego_trx.maltego import MaltegoMsg, MaltegoTransform
from maltego_trx.transform import DiscoverableTransform
import requests

class DomainToSubdomains(DiscoverableTransform):
    """Find subdomains via certificate transparency logs (crt.sh)."""

    @classmethod
    def create_entities(cls, request: MaltegoMsg, response: MaltegoTransform):
        domain = request.Value
        url = f"https://crt.sh/?q=%.{domain}&output=json"

        try:
            r = requests.get(url, timeout=15)
            entries = r.json()

            seen = set()
            for entry in entries:
                name = entry.get("name_value", "").strip()
                for subdomain in name.split("\n"):
                    subdomain = subdomain.strip().lstrip("*.")
                    if subdomain and subdomain not in seen and domain in subdomain:
                        seen.add(subdomain)
                        entity = response.addEntity("maltego.Domain", subdomain)
                        entity.addProperty("issuer", "Issuer", "loose",
                                           entry.get("issuer_name", ""))

            response.addUIMessage(f"Found {len(seen)} unique subdomains")

        except Exception as e:
            response.addUIMessage(f"Error: {str(e)}", messageType="PartialError")
```

## Running Transforms Locally

### Start local transform server

```python
# runner.py
from maltego_trx.registry import register_transform_function
from maltego_trx.server import application
from transforms.domain_to_emails import DomainToEmails
from transforms.ip_to_asn import IPToASN
from transforms.domain_to_subdomains import DomainToSubdomains

register_transform_function(DomainToEmails)
register_transform_function(IPToASN)
register_transform_function(DomainToSubdomains)

if __name__ == "__main__":
    application.run(host="0.0.0.0", port=8080, debug=True)
```

```bash
python runner.py
# Transforms available at http://localhost:8080
```

### Configure in Maltego

1. Open Maltego → Transform Manager
2. Add new transform server: `http://localhost:8080`
3. Import transforms via `Discover Transforms`
4. Run transforms on graph entities

## Batch Transform Runner (without Maltego UI)

```python
import requests
import json

def run_transform_batch(targets: list, transform_url: str) -> dict:
    """Run a transform against multiple targets without Maltego UI."""
    results = {}

    for target in targets:
        payload = {
            "Value": target,
            "Type": "maltego.Domain",
            "Properties": {}
        }
        r = requests.post(transform_url, json=payload, timeout=30)
        results[target] = r.json()

    return results

# Example usage
domains = ["example.com", "target.org", "company.io"]
emails_found = run_transform_batch(
    domains,
    "http://localhost:8080/DomainToEmails"
)

for domain, result in emails_found.items():
    entities = result.get("MaltegoMessage", {}).get("MaltegoTransformResponseMessage", {}).get("UIMessages", [])
    print(f"{domain}: {len(entities)} results")
```

## Tips

- **Rate limiting**: Add delays between API calls in transforms to avoid bans
- **Caching**: Cache results locally (SQLite) to avoid repeat API calls
- **Error handling**: Always use `try/except` and `addUIMessage` for errors — don't let transforms crash silently
- **Transform settings**: Use `getTransformSetting()` to pass API keys per-user without hardcoding
- **Entity weight**: Use `entity.setWeight()` to visually emphasize important nodes in the graph
