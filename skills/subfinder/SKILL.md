---
name: subfinder
description: >-
  Discover subdomains of a target domain using passive and active enumeration
  techniques. Use when tasks involve subdomain enumeration, attack surface mapping,
  DNS reconnaissance, finding hidden services, identifying forgotten subdomains,
  or expanding the scope of a security assessment. Subfinder uses passive sources
  (certificate transparency logs, DNS datasets, search engines) to find subdomains
  without touching the target directly.
license: Apache-2.0
compatibility: "Go 1.21+ or Docker"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: devops
  tags:
    - subdomain
    - reconnaissance
    - security
    - dns
    - enumeration
---

# Subfinder

## Overview

Discover subdomains of a target domain using passive sources. Subfinder queries certificate transparency logs, DNS datasets, search engines, and other OSINT sources to enumerate subdomains without directly touching the target infrastructure.

## Instructions

### Installation

```bash
# Go install (requires Go 1.21+)
go install -v github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest

# Or download binary
# https://github.com/projectdiscovery/subfinder/releases

# Or Docker
docker pull projectdiscovery/subfinder:latest
```

### Basic Usage

```bash
# Enumerate subdomains for a single domain
subfinder -d example.com

# Multiple domains
subfinder -d example.com,example.org

# From a file of domains
subfinder -dL domains.txt

# Output to file
subfinder -d example.com -o subdomains.txt

# JSON output (includes source information)
subfinder -d example.com -oJ -o subdomains.json
```

### Configuration

### API keys for better results

Subfinder works without API keys but returns significantly more results with them. Configure in `~/.config/subfinder/provider-config.yaml`:

```yaml
# ~/.config/subfinder/provider-config.yaml
# Add API keys for passive sources to dramatically increase results

binaryedge:
  - your-binaryedge-api-key          # https://app.binaryedge.io

censys:
  - your-censys-api-id:api-secret    # https://search.censys.io/account/api

chaos:
  - your-chaos-api-key               # https://chaos.projectdiscovery.io

github:
  - your-github-token                # Personal access token (public repos scope)

shodan:
  - your-shodan-api-key              # https://account.shodan.io

securitytrails:
  - your-securitytrails-key          # https://securitytrails.com/app/account

virustotal:
  - your-virustotal-api-key          # https://www.virustotal.com/gui/my-apikey

# Free sources that don't need keys:
# Certificate Transparency (crtsh), DNSdumpster, HackerTarget,
# Wayback Machine, AlienVault OTX, RapidDNS
```

### Source selection

```bash
# Use all sources (default)
subfinder -d example.com -all

# Use only specific sources
subfinder -d example.com -s crtsh,dnsdumpster,hackertarget

# Exclude noisy sources
subfinder -d example.com -es github

# List available sources
subfinder -ls
```

### Advanced Usage

### Recursive enumeration

Find subdomains of subdomains (e.g., dev.api.example.com):

```bash
# Enable recursive mode — finds deeper subdomains
subfinder -d example.com -recursive

# Limit recursion depth
subfinder -d example.com -recursive -max-depth 3
```

### Filtering and processing

```bash
# Show only results from specific sources
subfinder -d example.com -cs  # Show source for each subdomain

# Pipe to other tools for validation
subfinder -d example.com -silent | httpx -silent  # Check which are live
subfinder -d example.com -silent | dnsx -silent    # Resolve DNS
subfinder -d example.com -silent | naabu -silent   # Port scan

# Rate limiting (respect API limits)
subfinder -d example.com -rate-limit 5  # 5 requests/second max
subfinder -d example.com -t 10          # 10 concurrent threads
```

### Integration with other recon tools

```bash
# Full recon pipeline:
# 1. Find subdomains
subfinder -d target.com -o subs.txt

# 2. Check which are live (httpx)
cat subs.txt | httpx -silent -status-code -title -o live.txt

# 3. Screenshot live hosts (gowitness)
cat live.txt | gowitness file -f -

# 4. Port scan discovered hosts (naabu)
cat subs.txt | naabu -silent -top-ports 1000 -o ports.txt

# 5. Run vulnerability scan (nuclei)
cat live.txt | nuclei -t cves/ -severity critical,high -o vulns.txt
```

### Passive vs Active Enumeration

Subfinder is passive by default — it queries third-party data sources, NOT the target:

```
PASSIVE (subfinder default) — safe, stealthy
├── Certificate Transparency logs (crt.sh, Google CT)
├── DNS aggregation (SecurityTrails, DNSdumpster)
├── Search engines (Google, Bing dorking)
├── Threat intelligence (Shodan, Censys, BinaryEdge)
└── Internet archives (Wayback Machine)

ACTIVE (use additional tools) — touches the target
├── DNS brute-forcing (shuffledns, puredns)
├── DNS zone transfers (dig axfr)
├── Virtual host discovery (ffuf -H "Host: FUZZ.target.com")
└── TLS/SSL cert inspection (direct connection)
```

For authorized pentests, combine both: subfinder for passive discovery, then active brute-forcing for what passive sources missed.

### Interpreting Results

Common subdomain patterns and what they reveal:

```
admin.example.com        → Admin panel (high-value target)
staging.example.com      → Staging environment (often less secured)
dev.example.com          → Development server (may have debug enabled)
api.example.com          → API endpoint (test for auth bypass)
old.example.com          → Legacy application (likely unpatched)
vpn.example.com          → VPN gateway (credential attacks)
mail.example.com         → Mail server (phishing target)
jenkins.example.com      → CI/CD (code execution potential)
grafana.example.com      → Monitoring (information disclosure)
*.s3.amazonaws.com       → S3 buckets (check for public access)
```

Prioritize targets: admin panels, staging environments, and legacy hosts are the highest-value findings because they're often less secured than production.

## Examples

### Map the attack surface of a target domain

```prompt
Run subdomain enumeration on our domain example.com using subfinder. Find all subdomains, check which ones are live with httpx, identify the web technologies with whatweb, and produce a prioritized target list. Flag any staging, development, or admin subdomains as high-priority. Include the source for each subdomain so we know which passive sources are most valuable for this target.
```

### Find forgotten or shadow IT subdomains

```prompt
Our company has 5 registered domains. Enumerate all subdomains across all of them, cross-reference with our known asset inventory (list provided), and identify any subdomains we don't recognize — potential shadow IT or forgotten services. For each unknown subdomain, check if it's live, what it's running, and whether it has a valid TLS certificate.
```

### Set up continuous subdomain monitoring

```prompt
Build a subdomain monitoring pipeline that runs weekly on our 3 primary domains. It should compare results against the previous week's baseline, alert on new subdomains (potential new attack surface or subdomain takeover), and generate a diff report. Store historical data for trend analysis. Use subfinder for enumeration and httpx for liveness checks.
```

## Guidelines

- Only run against domains you have explicit written authorization to test
- Passive enumeration (subfinder default) does not touch the target, but active tools like httpx and naabu do — ensure they are in scope
- Configure API keys for better coverage — free sources alone miss many subdomains
- Use rate limiting (`-rate-limit`) to avoid overwhelming third-party data sources
- Validate findings before reporting — some passive sources return stale or incorrect data
- Combine with active DNS brute-forcing (puredns, shuffledns) for comprehensive coverage on authorized engagements
