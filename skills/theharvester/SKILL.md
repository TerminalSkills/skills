---
name: theharvester
description: >-
  theHarvester is an open-source OSINT tool that collects subdomains, email addresses, IP addresses and URLs for a domain from public sources such as certificate transparency logs, search engines and threat-intelligence APIs. Use it for passive pre-engagement reconnaissance, subdomain enumeration, finding exposed employee emails, and attack-surface checks on domains you are authorized to assess.
license: Apache-2.0
compatibility: "Python 3.14 and uv (source checkout), or the Kali theharvester package; outbound internet access"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: research
  tags: "theharvester, email, subdomain, passive, harvesting"
  repository: https://github.com/laramies/theHarvester
---

# theHarvester

## Overview

theHarvester queries public data sources (certificate transparency, search engines, passive DNS, code hosts, threat-intelligence APIs) for a target domain and reports hostnames, emails, IPs, ASNs, URLs and people. By default it only talks to those providers, not to the target ("P0 passive"). DNS actions are P1 and anything that touches the target directly (screenshots, takeover checks, API path scanning, virtual hosts) is P2; both run only when you ask for them.

This skill follows the 5.0.0 source on the default branch (the latest tagged release is 4.11.1, June 2026). The 5.0 CLI dropped several sources and options that older tutorials use: `-b google`, `-b bing` and `-b linkedin` no longer exist, and there is no `theHarvester.py` launcher. Run `theHarvester -h` on your version if a flag is rejected.

## Instructions

### Install

There is no usable PyPI package: the `theHarvester` name on PyPI is an unrelated 0.0.1 upload. Use one of:

```bash
# Source checkout (needs uv; it fetches Python 3.14 itself)
git clone https://github.com/laramies/theHarvester.git
cd theHarvester
uv sync
uv run theHarvester -h

# Kali Linux (may be an older 4.x version)
sudo apt install theharvester
```

The Docker image starts HarvestView (the web UI and REST API), not the CLI. Use a source checkout or the Kali package for command-line work.

### Basic runs

```bash
# Two keyless passive sources
uv run theHarvester -d terminalskills.io -b crtsh,certspotter

# All sources that can return subdomains / emails (capability selectors form a union)
uv run theHarvester -d terminalskills.io -b subdomains
uv run theHarvester -d terminalskills.io -b emails,urls

# Every P0 passive source, results capped at 200 per source, saved as report.json/.xml/.jsonl
uv run theHarvester -d terminalskills.io -b all -l 200 -f report
```

Key options: `-d` target, `-b` sources or capabilities (`subdomains`, `emails`, `ips`, `asns`, `urls`, `people`, `breaches`, `all`), `-l` per-source limit (default 500, `0` = no cap), `-f NAME` output files, `-j` parallel sources (default 3), `--no-hosts` drop hostname results, `-q` silence missing-key warnings. `-b all` runs only P0 sources; `shodan` is P1 and must be named.

### Active options (authorized targets only)

`-r` resolves discovered hostnames, `-n` does PTR lookups across each IP's /24, `-c` brute-forces DNS, `-t` checks for takeover indicators, `-a` probes common API paths, `--screenshot DIR` captures pages, `--vhost` runs virtual host discovery. These contact DNS servers or the target itself. A takeover indicator is evidence to review, not a confirmed takeover.

### API keys

The first run that selects a keyed source creates `~/.theHarvester/api-keys.yaml` (also read from `/etc/theHarvester/` and `/usr/local/etc/theHarvester/`). Edit it and restrict access:

```bash
chmod 600 ~/.theHarvester/api-keys.yaml
```

```yaml
apikeys:
  hunter:
    key: hk_4f9a1c7e2b
  virustotal:
    key: vt_8d21e0b3a5
  securityTrails:
    key: st_6c33f1d09e
  github:
    key: ghp_Zk3m9QxT1vLw
```

Sources needing a key are skipped without one. Keyless sources include `crtsh`, `certspotter`, `duckduckgo`, `yahoo`, `baidu`, `otx`, `rapiddns`, `urlscan`, `waybackarchive`, `commoncrawl`, `hudsonrock`. Keyed ones include `hunter`, `virustotal`, `securityTrails`, `dnsdumpster`, `fullhunt`, `github-code`, `intelx`, `tomba`, `netlas`, `leakix` and `shodan`. The full table is in the README ("Discovery sources"). Configure HTTP/SOCKS proxies in `~/.theHarvester/proxies.yaml` and enable them with `-p`; the run fails instead of going direct if no proxy is available.

### Process the output

`-f report` writes `report.json` with `hosts` and, when found, `emails` and `ips` lists; with `-r` each host entry is `hostname:ip`. `report.jsonl` holds the normalized evidence (per-source outcomes, counts).

```python
import json
from pathlib import Path

data = json.loads(Path("report.json").read_text())
domain = "terminalskills.io"
hosts = sorted({h.split(":")[0] for h in data.get("hosts", []) if h.split(":")[0].endswith(domain)})
emails = sorted({e for e in data.get("emails", []) if e.endswith("@" + domain)})
print(f"{len(hosts)} subdomains, {len(emails)} emails")
Path("subdomains.txt").write_text("\n".join(hosts) + "\n")
```

## Examples

### Example 1: Passive subdomain inventory before a penetration test

The user says: "List the public subdomains of terminalskills.io without touching it. We own the domain."

```bash
uv run theHarvester -d terminalskills.io -b crtsh,certspotter -l 50 -f subs
```

```console
[*] Activity: P0 passive collection
[*] Target: terminalskills.io
[*] Searching Certspotter.
[*] Searching Crtsh.
[*] Hosts found: 4
admin.terminalskills.io
api.terminalskills.io
docs.terminalskills.io
www.terminalskills.io
[*] JSONL File saved.
```

Files `subs.json`, `subs.xml` and `subs.jsonl` are written to the current directory.

### Example 2: Exposed employee emails

The user says: "Which staff emails for terminalskills.io are findable publicly?"

```bash
uv run theHarvester -d terminalskills.io -b emails -l 200 -f emails
```

The `emails` capability runs every source that can return emails; those needing a key are skipped unless configured in `api-keys.yaml`. Read `emails.json` for the `emails` list and confirm each address by hand; scraped results contain false positives. Report the naming pattern (for example `first.last@`) rather than generating guessed addresses.

## Guidelines

- Get written authorization first. Passive does not mean invisible: providers receive and may log your target string.
- Treat P1/P2 options as active testing; use them only on hosts the engagement scope names exactly (`www.terminalskills.io` and `terminalskills.io` are different targets).
- Found hostnames, IPs and ASNs are leads, not extended scope.
- Results are partial by nature: a source can finish with zero findings or stop at a rate limit. Read the per-source outcomes in the terminal or the JSONL before concluding that nothing exists.
- Do not commit `api-keys.yaml`.
- For version-specific differences from 4.x, see `docs/wiki/Moving-from-4.11-to-5.0.md` in the repository.
