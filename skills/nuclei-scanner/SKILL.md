---
name: nuclei-scanner
description: >-
  Scan web applications and infrastructure for vulnerabilities with Nuclei —
  template-based security scanner. Use when someone asks to "scan for
  vulnerabilities", "security scan my website", "Nuclei scanner", "find CVEs",
  "automated security testing", "vulnerability assessment", or "check for
  misconfigurations". Covers template scanning, custom templates, CI integration,
  and severity-based reporting.
license: Apache-2.0
compatibility: "Any OS. Go binary. Targets: HTTP, DNS, TCP, SSL, headless browser."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: security
  tags: ["security", "vulnerability", "scanning", "nuclei", "pentest", "cve"]
---

# Nuclei Scanner

## Overview

Nuclei is a fast, template-based vulnerability scanner by ProjectDiscovery. Instead of running monolithic scanners, Nuclei uses YAML templates — each one checks for a specific vulnerability, misconfiguration, or exposure. Community maintains 8000+ templates covering CVEs, default credentials, exposed panels, misconfigurations, and more. Runs in CI, scripted pipelines, or manual assessments.

## When to Use

- Security assessment of web applications before deployment
- Checking infrastructure for known CVEs and misconfigurations
- Continuous security scanning in CI/CD pipelines
- Bug bounty reconnaissance and vulnerability discovery
- Compliance checks (exposed admin panels, default credentials, SSL issues)

## Instructions

### Setup

```bash
# Install via Go
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

# Or download binary
curl -sL https://github.com/projectdiscovery/nuclei/releases/latest/download/nuclei_linux_amd64.zip -o nuclei.zip
unzip nuclei.zip

# Update templates (8000+ community templates)
nuclei -update-templates
```

### Basic Scanning

```bash
# Scan a single target with all templates
nuclei -u https://example.com

# Scan with specific severity
nuclei -u https://example.com -severity critical,high

# Scan multiple targets from a file
nuclei -l targets.txt -severity critical,high,medium

# Scan specific template categories
nuclei -u https://example.com -tags cve,misconfig,exposure

# Scan with rate limiting (respectful scanning)
nuclei -u https://example.com -rate-limit 50 -concurrency 10
```

### Custom Templates

```yaml
# templates/exposed-env.yaml — Check for exposed .env files
id: exposed-env-file

info:
  name: Exposed .env File
  author: terminal-skills
  severity: high
  description: Checks if .env file is publicly accessible
  tags: misconfig,exposure

http:
  - method: GET
    path:
      - "{{BaseURL}}/.env"
    matchers-condition: and
    matchers:
      - type: word
        words:
          - "DB_PASSWORD"
          - "API_KEY"
          - "SECRET"
        condition: or
      - type: status
        status:
          - 200
```

```yaml
# templates/api-key-leak.yaml — Detect API keys in responses
id: api-key-in-response

info:
  name: API Key Leaked in Response
  author: terminal-skills
  severity: medium
  tags: exposure,api

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/config"
      - "{{BaseURL}}/api/settings"
      - "{{BaseURL}}/config.json"
    matchers:
      - type: regex
        regex:
          - "sk_live_[a-zA-Z0-9]{24}"     # Stripe live key
          - "AKIA[0-9A-Z]{16}"            # AWS access key
          - "ghp_[a-zA-Z0-9]{36}"         # GitHub token
    extractors:
      - type: regex
        regex:
          - "sk_live_[a-zA-Z0-9]{24}"
          - "AKIA[0-9A-Z]{16}"
```

### CI/CD Integration

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on:
  schedule:
    - cron: "0 6 * * 1"  # Weekly Monday 6 AM
  workflow_dispatch:

jobs:
  nuclei-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: projectdiscovery/nuclei-action@main
        with:
          target: https://myapp.com
          flags: "-severity critical,high -tags cve,misconfig"
          output: nuclei-report.txt

      - name: Alert on findings
        if: success()
        run: |
          if [ -s nuclei-report.txt ]; then
            echo "⚠️ Vulnerabilities found!"
            cat nuclei-report.txt
            # Send to Slack/email
          fi
```

### Programmatic Usage (Go/Python)

```python
# scan.py — Run Nuclei from Python and parse results
import subprocess
import json

def run_nuclei_scan(target: str, severity: str = "critical,high") -> list[dict]:
    """Run Nuclei scan and return structured results."""
    result = subprocess.run(
        ["nuclei", "-u", target, "-severity", severity, "-json", "-silent"],
        capture_output=True, text=True,
    )

    findings = []
    for line in result.stdout.strip().split("\n"):
        if line:
            findings.append(json.loads(line))

    return findings

# Usage
findings = run_nuclei_scan("https://example.com")
for f in findings:
    print(f"[{f['info']['severity']}] {f['info']['name']} — {f['matched-at']}")
```

## Examples

### Example 1: Pre-deployment security check

**User prompt:** "Before we go live, scan our staging site for any critical vulnerabilities or misconfigurations."

The agent will run Nuclei with critical/high severity templates, check for exposed files, default credentials, known CVEs, and generate a report with remediation steps.

### Example 2: Custom template for internal API

**User prompt:** "Write a Nuclei template that checks if our internal admin endpoints are accessible without auth."

The agent will create a YAML template that hits admin endpoints, checks for 200 status without auth headers, and flags exposed admin panels.

## Guidelines

- **Always get authorization** — only scan targets you own or have written permission to test
- **Start with `-severity critical,high`** — focus on what matters first
- **Rate limit scans** — `-rate-limit 50` to avoid overwhelming targets
- **Use `-tags` for targeted scans** — `cve`, `misconfig`, `exposure`, `default-login`
- **JSON output for automation** — `-json` flag for parseable results
- **Custom templates for your app** — community templates are generic; write app-specific checks
- **Update templates regularly** — `nuclei -update-templates` gets new CVE checks
- **Headless templates for JS apps** — some checks require browser rendering
- **Never scan production during peak hours** — schedule scans for low-traffic windows
