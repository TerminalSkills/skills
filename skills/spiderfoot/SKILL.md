---
name: spiderfoot
description: >-
  SpiderFoot is an open-source OSINT automation tool whose 200+ modules profile a domain, IP
  address, e-mail address, username or name from public sources. Use when: running automated
  OSINT investigations on a target, correlating data across dozens of sources, building threat
  intelligence profiles, or mapping connections between entities.
license: Apache-2.0
compatibility: "Python 3.7+ (checked on 3.12) on Linux, macOS or Windows; SpiderFoot 4.0 from the master branch"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: [spiderfoot, threat-intel, recon, profiling, osint]
  repository: https://github.com/smicallef/spiderfoot
  use-cases:
    - "Run automated OSINT scan on a company domain to build a full profile"
    - "Investigate an IP address across dark web, breach data, and social sources"
    - "Gather threat intelligence on a suspicious email or domain"
    - "Correlate data from 200+ sources to map relationships between entities"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# SpiderFoot

## Overview

SpiderFoot is an open-source (MIT) OSINT automation tool with more than 200 modules that query public data sources: DNS, Whois, certificate transparency, search engines, breach databases, threat-intelligence feeds, social sites, Tor search engines and more. Modules feed each other: a domain yields hostnames and e-mail addresses, those yield IP addresses and accounts, and so on, and 37 correlation rules then flag notable findings. Everything is stored in a local SQLite database.

**Supports two modes:** Web UI (browser-based, visual) and CLI (scriptable, automated).

Use it only on targets you own or are authorised in writing to assess. The targets below (`harborlight-freight.example`, `203.0.113.10`) stand for your own assets.

The last release is 4.0 (April 2022) and the last commit dates from November 2023, so a module can fail where its data source has changed; the scan log shows which.

## Instructions

### Step 1: Install SpiderFoot

```bash
git clone --depth 1 https://github.com/smicallef/spiderfoot.git
cd spiderfoot
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Verify
python3 sf.py --version        # SpiderFoot 4.0.0: Open Source Intelligence Automation.
```

Install from the master branch: the 4.0 release archive pins PyYAML below 6, which fails to build on Python 3.12.

### Step 2: Launch the Web UI

```bash
# Start the web server on the loopback interface
python3 sf.py -l 127.0.0.1:5001

# Open http://127.0.0.1:5001 → New Scan → enter the target, then choose modules
# "By Use Case", "By Required Data" or "By Module"
```

The UI has no login by default. To require one, create `~/.spiderfoot/passwd` with a `username:password` line (HTTP digest authentication) before starting the server, and never listen on `0.0.0.0` without it. Scan data lives in `~/.spiderfoot/spiderfoot.db`.

### Step 3: CLI usage — run scans without the UI

```bash
# Basic syntax — results go to standard output, logs to standard error
python3 sf.py -s TARGET -m MODULE1,MODULE2 -o json > results.json

# The target type is detected from the target itself:
#   harborlight-freight.example                  domain or hostname
#   203.0.113.10 / 203.0.113.0/24                IPv4 address / subnet
#   it-security@harborlight-freight.example      e-mail address
#   +14155550142                                 phone number
#   "Dana Whitfield"                             person's name (quoted, contains a space)
#   dwhitfield                                   username (no dot)

# Scan a domain by use case: passive, investigate, footprint or all
python3 sf.py -s harborlight-freight.example -u passive -o json -q > passive.json

# Scan with specific modules only (faster, focused)
python3 sf.py -s harborlight-freight.example \
  -m sfp_dnsresolve,sfp_dnsdumpster,sfp_shodan,sfp_certspotter,sfp_whois \
  -o json -q > dns_results.json

# Ask for event types and let SpiderFoot pick the modules; -f prints only those types
python3 sf.py -s harborlight-freight.example -t EMAILADDR,INTERNET_NAME -f -o csv -q > hosts.csv

# Scan an IP address
python3 sf.py -s 203.0.113.10 \
  -m sfp_shodan,sfp_virustotal,sfp_ipinfo,sfp_abuseipdb \
  -o json -q > ip_results.json

# Scan an email address
python3 sf.py -s it-security@harborlight-freight.example \
  -m sfp_haveibeenpwned,sfp_hunter,sfp_emailrep \
  -o json -q > email_results.json

python3 sf.py -M        # List all available modules
python3 sf.py -T        # List all event types
```

`-q` silences logging; drop it to watch progress. `-o` takes `tab` (default), `csv` or `json`. There is no output-file option, and `-t` selects event types, not the kind of target. With neither `-m`, `-t` nor `-u`, every module runs.

### Step 4: Key module categories and selections

```bash
# Passive DNS and infrastructure
PASSIVE_DNS_MODULES="sfp_dnsresolve,sfp_dnsdumpster,sfp_certspotter,sfp_crt,sfp_securitytrails"

# Subdomain discovery (sfp_dnsbrute sends guesses to the target's DNS servers)
SUBDOMAIN_MODULES="sfp_dnsbrute,sfp_dnsdumpster,sfp_certspotter,sfp_virustotal,sfp_shodan"

# Social media and people
SOCIAL_MODULES="sfp_accounts,sfp_socialprofiles,sfp_twitter,sfp_github,sfp_keybase"

# Breach and leaked data
BREACH_MODULES="sfp_haveibeenpwned,sfp_dehashed,sfp_leakix,sfp_intelx"

# Dark web
DARKWEB_MODULES="sfp_torch,sfp_ahmia,sfp_onionsearchengine"

# Geolocation
GEO_MODULES="sfp_ipinfo,sfp_ipstack,sfp_abstractapi"

# Malware / threat intel
THREAT_MODULES="sfp_virustotal,sfp_threatcrowd,sfp_abuseipdb,sfp_maltiverse"

# Run a focused infrastructure scan
python3 sf.py -s harborlight-freight.example \
  -m "$PASSIVE_DNS_MODULES,$SUBDOMAIN_MODULES" \
  -o json -q > infra_scan.json
```

### Step 5: Parse JSON output programmatically

```python
import json
from collections import defaultdict

def parse_sf_output(json_file):
    """Group CLI JSON output by event type.

    Each row is {"generated", "type", "data", "module", "source"}; "type" holds the
    readable name ("Internet Name"), not the code (INTERNET_NAME).
    """
    with open(json_file) as f:
        rows = json.load(f)
    findings = defaultdict(list)
    for row in rows:
        findings[row["type"]].append({"value": row["data"], "module": row["module"], "source": row["source"]})
    return dict(findings)

def summarize_findings(findings, limit=10):
    for event_type in sorted(findings, key=lambda t: -len(findings[t])):
        items = findings[event_type]
        print(f"\n{event_type} ({len(items)}):")
        for item in items[:limit]:
            print(f"  {item['value']}  [{item['module']}]")
    print(f"\nTotal events: {sum(len(v) for v in findings.values())}")

summarize_findings(parse_sf_output("dns_results.json"))
```

### Step 6: Configure API keys in SpiderFoot

About 80 modules need an API key and do nothing without one. Keys are stored in the SpiderFoot database, not in a config file:

- Web UI: **Settings** → select the module → fill in its key field → **Save Changes**.
- **Export API Keys** saves them as `SpiderFoot.cfg` (lines such as `sfp_shodan:api_key=...`); **Import API Keys** loads that file on another installation. Keep the file out of version control.
- Most modules name the option `api_key`; `sfp_censys` uses `censys_api_key_uid` and `censys_api_key_secret`, `sfp_dehashed` adds `api_key_username`.

CLI scans read the same database, so keys saved in the UI apply to `sf.py -s` as well.

### Step 7: Use the HTTP endpoints for automation

The web UI's own endpoints can be scripted while `sf.py -l` is running.

```python
import os
import time
import requests
from requests.auth import HTTPDigestAuth

SPIDERFOOT_URL = "http://127.0.0.1:5001"
session = requests.Session()
session.headers["Accept"] = "application/json"      # without it /startscan answers with a redirect
if os.environ.get("SPIDERFOOT_USER"):               # only when ~/.spiderfoot/passwd exists
    session.auth = HTTPDigestAuth(os.environ["SPIDERFOOT_USER"], os.environ["SPIDERFOOT_PASSWORD"])

def start_scan(name, target, modules="", use_case=""):
    """All five fields are required; pass modules, or a use case: Passive, Investigate, Footprint, all."""
    resp = session.post(f"{SPIDERFOOT_URL}/startscan", data={
        "scanname": name, "scantarget": target,
        "modulelist": modules, "typelist": "", "usecase": use_case,
    })
    resp.raise_for_status()                          # 401 when the passwd file exists and no credentials were sent
    status, value = resp.json()                      # ["SUCCESS", scan_id] or ["ERROR", message]
    if status != "SUCCESS":
        raise RuntimeError(value)
    return value

def wait_for_scan(scan_id, poll_interval=30):
    while True:
        status = session.get(f"{SPIDERFOOT_URL}/scanstatus", params={"id": scan_id}).json()[5]
        if status in ("FINISHED", "ABORTED", "ERROR-FAILED"):
            return status
        time.sleep(poll_interval)

def get_scan_results(scan_id):
    """Rows with data, event_type, module, source_data, false_positive, last_seen."""
    return session.get(f"{SPIDERFOOT_URL}/scanexportjsonmulti", params={"ids": scan_id}).json()

scan_id = start_scan("Harborlight DNS footprint", "harborlight-freight.example",
                     modules="sfp_dnsresolve,sfp_crt,sfp_certspotter")
if wait_for_scan(scan_id) == "FINISHED":
    print(f"Got {len(get_scan_results(scan_id))} findings")
```

`GET /stopscan?id=7219CC93` aborts a running scan; the ID is the one `/startscan` returned.

### Common SpiderFoot Modules Reference

| Module | Purpose | API key |
|--------|---------|---------|
| `sfp_dnsresolve` | Resolve discovered hosts and IP addresses | no |
| `sfp_dnsdumpster` | Passive subdomain enumeration (DNSDumpster) | no |
| `sfp_crt` | Hostnames from certificates logged in crt.sh | no |
| `sfp_certspotter` | Certificate transparency search (SSLMate) | yes |
| `sfp_whois` | WHOIS lookup for domains and netblocks | no |
| `sfp_shodan` | Shodan data on identified IP addresses | yes |
| `sfp_virustotal` | VirusTotal domain and IP reputation | yes |
| `sfp_haveibeenpwned` | E-mail addresses found in breaches | yes |
| `sfp_hunter` | E-mail addresses and names from hunter.io | yes |
| `sfp_accounts` | Accounts with the same name on 500+ sites | no |
| `sfp_github` | Public GitHub repositories of a name or user | no |
| `sfp_abuseipdb` | IP abuse blacklist check | yes |
| `sfp_threatcrowd` | ThreatCrowd data on IPs and domains | no |
| `sfp_leakix` | LeakIX leaks, open ports and software | yes |

## Examples

### Example 1: Check the installation with a scan that stays on this machine

User: "Make sure SpiderFoot works before we point it at anything real."

```bash
python3 sf.py -s 127.0.0.1 -m sfp_dnsresolve -o json -q
```

Result: the loopback address and the names it resolves to (the machine's own hostname appears as one more row), within a couple of seconds.

```json
[{"generated": 1790874902, "type": "IP Address", "data": "127.0.0.1", "module": "SpiderFoot UI", "source": "127.0.0.1"},
{"generated": 1790874902, "type": "Internet Name", "data": "localhost", "module": "sfp_dnsresolve", "source": "127.0.0.1"}]
```

### Example 2: Passive footprint of your own domain

User: "Map what the internet knows about our domain harborlight-freight.example without touching our servers."

```bash
python3 sf.py -s harborlight-freight.example -u passive -o json -q > passive.json
python3 -c 'import json, collections; rows = json.load(open("passive.json")); print(collections.Counter(r["type"] for r in rows).most_common())'
```

Result: `passive.json` holds one object per finding in the format of Example 1, and the second command prints how many findings each type has (`Internet Name`, `IP Address`, `Email Address`, `Co-Hosted Site` and so on). Feed the file to `parse_sf_output()` from Step 5 to list the values, and review the hostnames you did not expect first.

## Guidelines

- **Legal notice**: SpiderFoot should only be used on targets you have authorization to investigate. Even passive OSINT may violate terms of service of some data providers, and findings about people are personal data: collect only what the engagement needs.
- **Module selection matters**: Running all 200+ modules against a target takes hours and consumes significant API credits. Select focused module sets for specific investigative goals.
- **Passive is not all**: only the `passive` use case avoids contact with the target. `footprint`, `investigate` and `all` include crawling, DNS brute-forcing and port scanning; four modules are flagged invasive.
- **API keys**: Many modules are no-ops without API keys. Configure at least Shodan, VirusTotal, and HIBP for meaningful results.
- **Correlation is the superpower**: SpiderFoot's unique value is automatically chaining discoveries. Let it run fully on a focused set of modules rather than stopping it early. `python3 sf.py -C 7219CC93` re-runs the correlation rules on the stored scan with that ID.
- **Protect the UI**: without `~/.spiderfoot/passwd` anyone who reaches the port can read results and API keys. The bundled `docker-compose.yml` publishes port 5001 on all interfaces; change it to `127.0.0.1:5001:5001`.
- **Dark web modules**: `sfp_torch`, `sfp_ahmia` and `sfp_onionsearchengine` are flagged as Tor modules. To route requests through Tor, run a local Tor service and set the SOCKS options under Settings → Global (type `TOR`, address `127.0.0.1`, port `9050`).
- **Usernames and numbers on the CLI**: a target with no dot, space or leading `+` is treated as a username, so an AS number cannot be scanned from the command line; use the web UI.
