---
name: amass
description: >-
  OWASP Amass for in-depth DNS enumeration, subdomain discovery, and network mapping with active
  and passive modes. Use when: comprehensive subdomain enumeration, ASN and IP range mapping, attack
  surface discovery, building full network topology of a target organization.
license: Apache-2.0
compatibility: "Go 1.18+ (binary) or Docker"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags: [osint, amass, dns, subdomain, recon, attack-surface, network-mapping]
  use-cases:
    - "Enumerate all subdomains for a target domain using passive sources"
    - "Map ASN, IP ranges, and CIDR blocks for an organization"
    - "Discover shadow IT and forgotten subdomains before a pentest"
    - "Build a visual network graph of target infrastructure"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# OWASP Amass

## Overview

OWASP Amass performs network mapping of attack surfaces and external asset discovery using open source information gathering and active reconnaissance techniques. It supports dozens of passive data sources (certificate transparency, DNS datasets, APIs) and active techniques (brute force, DNS zone transfers). Amass is the industry standard for comprehensive subdomain enumeration during penetration tests and red team engagements.

## Instructions

### Step 1: Install Amass

```bash
# Option 1: Download pre-built binary (recommended)
# Visit https://github.com/owasp-amass/amass/releases
wget https://github.com/owasp-amass/amass/releases/latest/download/amass_Linux_amd64.zip
unzip amass_Linux_amd64.zip
sudo mv amass_Linux_amd64/amass /usr/local/bin/

# Option 2: Go install
go install -v github.com/owasp-amass/amass/v4/...@master

# Option 3: Docker
docker pull caffix/amass
alias amass='docker run --rm -v ~/.config/amass:/root/.config/amass caffix/amass'

# Verify installation
amass -version
```

### Step 2: Passive enumeration (safe, no target contact)

```bash
# Basic passive subdomain enumeration
amass enum -passive -d example.com

# Multiple domains at once
amass enum -passive -d example.com -d example.org

# Save results to file
amass enum -passive -d example.com -o subdomains.txt

# JSON output for programmatic processing
amass enum -passive -d example.com -json amass_output.json

# Verbose mode to see which sources are returning data
amass enum -passive -d example.com -v
```

### Step 3: Active enumeration (comprehensive, touches target DNS)

```bash
# Active mode: passive + DNS brute force + zone transfer attempts
amass enum -active -d example.com -o active_subdomains.txt

# Use a custom wordlist for brute force
amass enum -active -d example.com -brute -w /usr/share/wordlists/subdomains.txt

# Specify DNS resolvers
amass enum -active -d example.com -r 8.8.8.8,1.1.1.1,9.9.9.9

# Limit to specific port for alterations
amass enum -active -d example.com -alts -o subs_with_alts.txt

# Full active scan with brute force and alterations
amass enum -active -d example.com -brute -alts -min-for-recursive 2 -o full_enum.txt
```

### Step 4: Intelligence gathering — org and ASN mapping

```bash
# Find ASNs and IP ranges for an organization name
amass intel -org "Example Corporation"

# Reverse lookup: find domains from a known IP or CIDR
amass intel -ip 203.0.113.1
amass intel -cidr 203.0.113.0/24

# Find ASN for a domain, then map the full ASN
amass intel -d example.com -asn
amass intel -asn 12345 -o asn_domains.txt

# Combine: find org → get ASN → enumerate all domains
amass intel -org "Example Corp" 2>/dev/null | grep ASN | awk '{print $1}' | \
  while read asn; do amass intel -asn $asn; done
```

### Step 5: Configure API keys for maximum coverage

```yaml
# ~/.config/amass/config.yaml
scope:
  domains:
    - example.com

# Data source API keys
data_sources:
  Shodan:
    credentials:
      key: YOUR_SHODAN_API_KEY
  VirusTotal:
    credentials:
      key: YOUR_VT_API_KEY
  SecurityTrails:
    credentials:
      key: YOUR_ST_API_KEY
  GitHub:
    credentials:
      key: YOUR_GITHUB_TOKEN
  Censys:
    credentials:
      api_id: YOUR_CENSYS_ID
      secret: YOUR_CENSYS_SECRET
  Hunter:
    credentials:
      key: YOUR_HUNTER_KEY
  URLScan:
    credentials:
      key: YOUR_URLSCAN_KEY
  WhoisXMLAPI:
    credentials:
      key: YOUR_WHOISXML_KEY
  BinaryEdge:
    credentials:
      key: YOUR_BINARYEDGE_KEY

# Rate limiting (be respectful of free tier limits)
resolvers:
  - 8.8.8.8
  - 8.8.4.4
  - 1.1.1.1
  - 1.0.0.1
```

### Step 6: Parse and process JSON output

```python
import json
import subprocess
from collections import defaultdict

def run_amass_passive(domain, output_file=None):
    """Run Amass passive enumeration and return parsed results."""
    json_file = output_file or f"amass_{domain.replace('.', '_')}.json"
    cmd = [
        "amass", "enum",
        "-passive",
        "-d", domain,
        "-json", json_file
    ]
    print(f"Running Amass passive scan for {domain}...")
    subprocess.run(cmd, timeout=600)
    return parse_amass_json(json_file)

def parse_amass_json(json_file):
    """Parse Amass JSON output (newline-delimited JSON)."""
    subdomains = []
    ip_map = defaultdict(list)

    with open(json_file) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                record = json.loads(line)
                name = record.get("name", "")
                addresses = record.get("addresses", [])
                subdomains.append(name)
                for addr in addresses:
                    ip = addr.get("ip", "")
                    if ip:
                        ip_map[ip].append(name)
            except json.JSONDecodeError:
                continue

    return {
        "subdomains": sorted(set(subdomains)),
        "ip_to_hosts": dict(ip_map),
        "unique_ips": sorted(ip_map.keys()),
    }

def print_summary(results, domain):
    print(f"\n=== Amass Results: {domain} ===")
    print(f"Unique subdomains: {len(results['subdomains'])}")
    print(f"Unique IPs:        {len(results['unique_ips'])}")
    print("\nTop-level subdomains found:")
    for sub in results['subdomains'][:30]:
        print(f"  {sub}")
    print("\nIPs hosting multiple domains (potential shared hosting):")
    for ip, hosts in results['ip_to_hosts'].items():
        if len(hosts) > 1:
            print(f"  {ip}: {', '.join(hosts[:5])}")

results = run_amass_passive("example.com")
print_summary(results, "example.com")
```

### Step 7: Visualize with network graph (dot format)

```bash
# Generate a DOT graph of discovered network relationships
amass viz -d3 -d example.com -o network_graph.html

# Open in browser
# The HTML file contains an interactive D3.js visualization

# Export to Graphviz dot format
amass viz -dot -d example.com -o network.dot
dot -Tpng network.dot -o network.png

# Import into Neo4j for advanced graph analysis
amass viz -neo4j neo4j://neo4j:password@localhost:7474 -d example.com
```

### Step 8: Track changes over time (database mode)

```bash
# Amass stores results in a local graph database (~/.config/amass/amass.db)
# Run scans over time and compare

# First scan
amass enum -passive -d example.com -o scan1.txt

# Later scan (Amass will highlight new discoveries)
amass enum -passive -d example.com -o scan2.txt

# Show tracked assets from the database
amass db -d example.com -names

# Show differences between scans
amass track -d example.com -last 2
```

## Common Amass Commands Reference

| Command | Description |
|---------|-------------|
| `amass enum -passive -d domain.com` | Passive subdomain enumeration |
| `amass enum -active -d domain.com -brute` | Active + brute force |
| `amass intel -org "Corp Name"` | Find domains by org name |
| `amass intel -asn 12345` | Enumerate domains in an ASN |
| `amass intel -cidr 1.2.3.0/24` | Reverse IP lookup for CIDR |
| `amass viz -d3 -d domain.com -o out.html` | Interactive D3 visualization |
| `amass db -d domain.com -names` | Show tracked subdomains |
| `amass track -d domain.com` | Show newly discovered assets |

## Guidelines

- **Passive first**: Always start with `-passive` mode. Active mode makes DNS queries that may be logged.
- **API keys matter**: Without API keys, Amass is limited to certificate transparency and a few free sources. With keys, coverage increases dramatically.
- **Time**: A thorough passive scan can take 5–30 minutes depending on the number of sources. Active scans with brute force take longer.
- **False positives**: Some discovered subdomains may be wildcards or expired entries. Always verify with DNS resolution before reporting.
- **Authorization required**: Active enumeration (especially zone transfer attempts and brute force) is only appropriate with explicit written permission from the target.
