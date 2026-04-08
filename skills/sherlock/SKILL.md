---
name: sherlock
description: >-
  Search for social media accounts by username across 400+ platforms using Sherlock.
  Use when: OSINT investigations, finding online presence by username, digital
  footprint analysis, brand monitoring across social platforms.
license: MIT
compatibility: "Python 3.8+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: research
  tags: ["osint", "social-media", "username-search"]
---

# Sherlock

## Overview

Sherlock searches for a username across 400+ social networks and websites simultaneously. It reports which platforms have an account with that username, useful for OSINT investigations, brand monitoring, and digital footprint analysis.

## Instructions

### Installation

```bash
pip install sherlock-project
```

### Basic Search

```bash
sherlock targetusername
```

This checks 400+ sites and outputs results to terminal plus a text file.

### Output Formats

```bash
# CSV output
sherlock targetusername --csv

# Save to specific file
sherlock targetusername --output results.txt

# JSON for programmatic use
sherlock targetusername --json results.json
```

### Advanced Options

```bash
# Search specific sites only
sherlock targetusername --site twitter --site github --site instagram

# Set timeout (seconds) per site
sherlock targetusername --timeout 10

# Use proxy
sherlock targetusername --proxy socks5://127.0.0.1:1080

# Multiple usernames
sherlock user1 user2 user3
```

### Python API

```python
import sherlock_project
from sherlock_project import sherlock

results = sherlock.search("targetusername")
for site, result in results.items():
    if result["status"] == "Claimed":
        print(f"{site}: {result['url_user']}")
```

## Examples

**Example 1: Find all accounts for a username**

```bash
$ sherlock johndoe2024
[+] GitHub: https://github.com/johndoe2024
[+] Twitter: https://twitter.com/johndoe2024
[+] Instagram: https://instagram.com/johndoe2024
[+] Reddit: https://reddit.com/user/johndoe2024
[-] Facebook: Not Found
[+] LinkedIn: https://linkedin.com/in/johndoe2024
...
Found 47 accounts across 400+ sites
```

**Example 2: Brand monitoring**

```bash
$ sherlock mycompanyname --csv
# Outputs CSV with all platforms where the brand name is taken
# Useful for trademark protection and consistent brand presence
```

## Guidelines

- Always verify results manually — false positives occur on sites with generic URL patterns
- Respect platform terms of service and rate limits
- Use `--timeout 5` for faster scans (some sites are slow)
- For investigations, combine with other OSINT tools (theHarvester, amass) for comprehensive results
- Consider ethical implications — this tool is for legitimate research, not harassment
- Proxy support helps avoid IP-based rate limiting on repeated searches
