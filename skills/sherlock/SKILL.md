---
name: sherlock
description: >-
  Search for social media accounts by username across 400+ platforms using Sherlock.
  Use when: OSINT investigations, finding someone's online presence, username enumeration,
  social media discovery, digital footprint analysis.
license: MIT
compatibility: "Python 3.8+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags:
    - osint
    - sherlock
    - social-media
    - username
    - reconnaissance
    - investigation
  use-cases:
    - "Find all social media accounts for a specific username"
    - "Investigate a person's digital footprint across 400+ platforms"
    - "Enumerate usernames for security research or brand monitoring"
  agents:
    - claude-code
    - openai-codex
    - gemini-cli
    - cursor
---

# Sherlock — Username OSINT Search

Search for social media accounts by username across 400+ platforms. Sherlock checks each site for the existence of a profile with the given username and reports findings.

**Source:** [sherlock-project/sherlock](https://github.com/sherlock-project/sherlock)

## Installation

### Via pip (recommended)

```bash
pip install sherlock-project
```

### Via pipx (isolated environment)

```bash
pipx install sherlock-project
```

### From source

```bash
git clone https://github.com/sherlock-project/sherlock.git
cd sherlock
pip install -r requirements.txt
python -m sherlock
```

### Docker

```bash
docker pull sherlock/sherlock
docker run --rm sherlock/sherlock <username>
```

## Basic Usage

### Search a single username

```bash
sherlock johndoe
```

### Search multiple usernames

```bash
sherlock johndoe janedoe user123
```

### Output to specific file

```bash
sherlock johndoe --output results.txt
```

## Output Formats

### Text (default)

```bash
sherlock johndoe
# Prints found URLs to stdout, saves to johndoe.txt
```

### CSV output

```bash
sherlock johndoe --csv
# Saves results to johndoe.csv with columns: username, name, url_main, url_user, exists, http_status
```

### JSON output

```bash
sherlock johndoe --json johndoe.json
# Structured output with full metadata per site
```

### Print only found accounts

```bash
sherlock johndoe --print-found
```

## Site Filtering

### Search specific sites only

```bash
sherlock johndoe --site twitter instagram github linkedin
```

### List all supported sites

```bash
sherlock --site-list
```

### Exclude specific sites (use nsfw filter)

```bash
sherlock johndoe --no-nsfw
```

## Advanced Options

### Timeout configuration

```bash
# Set per-request timeout (seconds)
sherlock johndoe --timeout 10
```

### Proxy support

```bash
# Use a SOCKS5 or HTTP proxy
sherlock johndoe --proxy socks5://127.0.0.1:9050
sherlock johndoe --proxy http://proxy:8080
```

### Tor integration

```bash
# Route through Tor (requires Tor service running)
sherlock johndoe --tor
```

### Browse results

```bash
# Open found profiles in browser automatically
sherlock johndoe --browse
```

### Verbose output

```bash
sherlock johndoe --verbose
```

## Python API — Programmatic Usage

```python
import sherlock_project

# Basic search
from sherlock_project import sherlock
from sherlock_project.sites import SitesInformation

# Load site data
sites = SitesInformation()

# You can also invoke sherlock as a module
import subprocess
import json

def search_username(username, timeout=10):
    """Search for a username across platforms and return results as JSON."""
    result = subprocess.run(
        ["sherlock", username, "--json", f"/tmp/{username}.json", "--timeout", str(timeout)],
        capture_output=True, text=True
    )

    with open(f"/tmp/{username}.json", "r") as f:
        return json.load(f)

# Search and process results
results = search_username("target_user")
found_accounts = {site: data for site, data in results.items()
                  if data.get("status", {}).get("status") == "Claimed"}

print(f"Found {len(found_accounts)} accounts:")
for site, data in found_accounts.items():
    print(f"  {site}: {data['url_user']}")
```

## Batch Processing Script

```python
#!/usr/bin/env python3
"""Batch username search with consolidated report."""

import subprocess
import json
import csv
from pathlib import Path

def batch_search(usernames, output_dir="results", timeout=15):
    """Search multiple usernames and generate a consolidated report."""
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)

    all_results = {}

    for username in usernames:
        print(f"[*] Searching: {username}")
        json_file = output_path / f"{username}.json"

        subprocess.run(
            ["sherlock", username, "--json", str(json_file), "--timeout", str(timeout)],
            capture_output=True, text=True
        )

        if json_file.exists():
            with open(json_file) as f:
                all_results[username] = json.load(f)

    # Consolidated CSV report
    report_file = output_path / "consolidated_report.csv"
    with open(report_file, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["username", "platform", "url", "status"])

        for username, sites in all_results.items():
            for site, data in sites.items():
                status = data.get("status", {}).get("status", "Unknown")
                url = data.get("url_user", "N/A")
                writer.writerow([username, site, url, status])

    print(f"[+] Report saved to {report_file}")
    return all_results

if __name__ == "__main__":
    usernames = ["target_user1", "target_user2", "target_user3"]
    batch_search(usernames)
```

## Integration with Other OSINT Tools

### Pipeline: Sherlock → theHarvester → Report

```bash
#!/bin/bash
# Full OSINT pipeline for a username
USERNAME="$1"

echo "[1/3] Running Sherlock..."
sherlock "$USERNAME" --json "sherlock_${USERNAME}.json" --timeout 15

echo "[2/3] Extracting emails from found profiles..."
# Parse found URLs and feed to theHarvester
cat "sherlock_${USERNAME}.json" | python3 -c "
import json, sys
data = json.load(sys.stdin)
for site, info in data.items():
    status = info.get('status', {}).get('status', '')
    if status == 'Claimed':
        print(info.get('url_user', ''))
" > "urls_${USERNAME}.txt"

echo "[3/3] Generating report..."
echo "# OSINT Report: $USERNAME" > "report_${USERNAME}.md"
echo "## Found Accounts" >> "report_${USERNAME}.md"
cat "urls_${USERNAME}.txt" >> "report_${USERNAME}.md"
echo "" >> "report_${USERNAME}.md"
echo "Generated: $(date -u)" >> "report_${USERNAME}.md"

echo "[+] Done. Report: report_${USERNAME}.md"
```

## Tips & Best Practices

1. **Rate limiting** — Some sites will block rapid requests. Use `--timeout` to add delays and avoid bans.
2. **Proxy rotation** — For large-scale searches, rotate proxies to avoid IP blocks.
3. **Verify results** — Sherlock uses heuristics; false positives happen. Always verify found accounts manually.
4. **Legal compliance** — Ensure your use complies with local laws. OSINT is legal in most jurisdictions for lawful purposes, but misuse can have legal consequences.
5. **Combine tools** — Sherlock finds accounts; combine with tools like theHarvester, Maltego, or SpiderFoot for deeper analysis.
6. **Update regularly** — Site structures change. Keep Sherlock updated: `pip install --upgrade sherlock-project`.

## References

- [Sherlock GitHub](https://github.com/sherlock-project/sherlock)
- [Sherlock Documentation](https://sherlock-project.github.io/sherlock/)
- [OSINT Framework](https://osintframework.com/)
