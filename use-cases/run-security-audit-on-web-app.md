---
title: Run a Security Audit on Your Web Application Before Launch
slug: run-security-audit-on-web-app
description: Perform a comprehensive security assessment of a web app using Nuclei for vulnerability scanning, ffuf for content discovery, and automated reporting with prioritized findings.
skills:
  - nuclei-scanner
  - ffuf
  - security-audit
category: devops
tags:
  - security
  - pentest
  - vulnerability
  - audit
  - nuclei
  - ffuf
---

## The Problem

Marta's startup is launching a SaaS platform next month. The codebase has been through code reviews, but nobody has tested it from an attacker's perspective. Are there exposed config files? Hidden admin endpoints left from development? Known CVEs in the server stack? Default credentials on any services? The team doesn't have a security budget for a professional pentest, but they need more than "we think it's secure."

## The Solution

Run an automated security audit using Nuclei for vulnerability scanning (8000+ community templates covering CVEs, misconfigs, and exposures) and ffuf for discovering hidden content and undocumented endpoints. Combine results into a prioritized report with severity levels and remediation steps. This catches the low-hanging fruit that automated scanners excel at — the stuff that makes professional pentesters sigh when they find it in the first 5 minutes.

## Step-by-Step Walkthrough

### Step 1: Content Discovery with ffuf

Before scanning for vulnerabilities, discover what's actually exposed. Hidden endpoints, backup files, and development artifacts are often the easiest attack vectors.

```bash
# discover.sh — Systematic content discovery
#!/bin/bash
# Run this against your STAGING environment (never production without approval)
TARGET="https://staging.myapp.com"
WORDLIST="SecLists/Discovery/Web-Content/common.txt"

echo "=== Directory Discovery ==="
ffuf -u "$TARGET/FUZZ" -w "$WORDLIST" \
  -fc 404 \
  -mc 200,301,302,403 \
  -rate 50 \
  -o results/dirs.json -of json

echo "=== Backup and Config Files ==="
ffuf -u "$TARGET/FUZZ" -w "$WORDLIST" \
  -e .bak,.old,.sql,.env,.config,.yml,.json,.xml,.log \
  -fc 404 \
  -rate 50 \
  -o results/files.json -of json

echo "=== API Endpoint Discovery ==="
ffuf -u "$TARGET/api/FUZZ" -w SecLists/Discovery/Web-Content/api/api-endpoints.txt \
  -mc 200,401,403,405 \
  -rate 50 \
  -o results/api.json -of json

echo "=== Hidden Admin Panels ==="
ffuf -u "$TARGET/FUZZ" \
  -w SecLists/Discovery/Web-Content/CMS/wordpress-admin.txt \
  -w SecLists/Discovery/Web-Content/common-admin.txt \
  -mc 200,301,302 \
  -rate 50 \
  -o results/admin.json -of json
```

Review the ffuf results before proceeding. Any exposed `.env` files, backup databases, or admin panels are critical findings that should be fixed immediately — no Nuclei scan needed.

### Step 2: Vulnerability Scanning with Nuclei

Run Nuclei with targeted template categories against the discovered attack surface.

```bash
# scan.sh — Staged vulnerability scanning
#!/bin/bash
TARGET="https://staging.myapp.com"
OUTPUT="results/nuclei"
mkdir -p "$OUTPUT"

echo "=== Stage 1: Critical and High Severity ==="
nuclei -u "$TARGET" \
  -severity critical,high \
  -tags cve,misconfig,exposure,default-login \
  -rate-limit 50 \
  -o "$OUTPUT/critical-high.txt" \
  -json -o "$OUTPUT/critical-high.json"

echo "=== Stage 2: Technology-Specific Checks ==="
# Scan based on detected tech stack
nuclei -u "$TARGET" \
  -tags nodejs,nextjs,react,nginx \
  -severity critical,high,medium \
  -rate-limit 50 \
  -o "$OUTPUT/tech-specific.txt"

echo "=== Stage 3: SSL/TLS Configuration ==="
nuclei -u "$TARGET" \
  -tags ssl,tls \
  -o "$OUTPUT/ssl.txt"

echo "=== Stage 4: Headers and Security Policies ==="
nuclei -u "$TARGET" \
  -tags headers,security-headers,cors \
  -o "$OUTPUT/headers.txt"
```

### Step 3: Custom Templates for Your Application

Community templates catch generic issues. Write custom templates for your specific application's endpoints and business logic.

```yaml
# templates/auth-bypass.yaml — Check for auth bypass on protected endpoints
id: auth-bypass-check

info:
  name: Authentication Bypass on Protected Endpoints
  author: terminal-skills
  severity: critical
  description: Checks if protected API endpoints are accessible without authentication

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/users"
      - "{{BaseURL}}/api/admin/dashboard"
      - "{{BaseURL}}/api/billing/invoices"
      - "{{BaseURL}}/api/settings"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        words:
          - '"data"'
          - '"users"'
          - '"email"'
        condition: or
    # If we get a 200 with data and NO auth header, it's a bypass
```

```yaml
# templates/sensitive-data-exposure.yaml — Check API responses for data leaks
id: api-data-leak

info:
  name: Sensitive Data in API Responses
  author: terminal-skills
  severity: high
  description: Checks if API responses contain sensitive fields that should be filtered

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/users/me"
      - "{{BaseURL}}/api/profile"
    headers:
      Authorization: "Bearer {{token}}"
    matchers:
      - type: word
        words:
          - "password"
          - "passwordHash"
          - "secret"
          - "ssn"
          - "creditCard"
        condition: or
    extractors:
      - type: kval
        kval:
          - content_type
```

```bash
# Run custom templates
nuclei -u "$TARGET" -t ./templates/ -o "$OUTPUT/custom.txt" -json -o "$OUTPUT/custom.json"
```

### Step 4: Generate a Prioritized Report

```python
# report.py — Parse Nuclei JSON output into a prioritized report
"""
Parses all Nuclei scan results and generates a markdown report
sorted by severity. Includes remediation suggestions for common findings.
"""
import json
from pathlib import Path
from collections import defaultdict

REMEDIATION = {
    "exposed-env-file": "Add `.env` to `.gitignore` and block in web server config: `location ~ /\\.env { deny all; }`",
    "missing-x-frame-options": "Add header: `X-Frame-Options: DENY` or use CSP `frame-ancestors 'none'`",
    "missing-csp": "Add Content-Security-Policy header restricting script-src, style-src, img-src",
    "ssl-weak-cipher": "Update TLS config to disable CBC ciphers; use AEAD ciphers only (AES-GCM, ChaCha20)",
    "default-login": "Change default credentials immediately. Enable MFA on admin accounts.",
}

def parse_results(results_dir: str) -> list[dict]:
    findings = []
    for json_file in Path(results_dir).glob("*.json"):
        with open(json_file) as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        findings.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    return findings

def generate_report(findings: list[dict]) -> str:
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    by_severity = defaultdict(list)

    for f in findings:
        sev = f.get("info", {}).get("severity", "info")
        by_severity[sev].append(f)

    report = ["# Security Audit Report\n"]
    report.append(f"**Total findings:** {len(findings)}\n")

    for sev in ["critical", "high", "medium", "low", "info"]:
        items = by_severity.get(sev, [])
        if not items:
            continue
        emoji = {"critical": "🔴", "high": "🟠", "medium": "🟡", "low": "🔵", "info": "⚪"}
        report.append(f"\n## {emoji[sev]} {sev.upper()} ({len(items)})\n")

        for item in items:
            name = item["info"]["name"]
            url = item.get("matched-at", "N/A")
            template_id = item.get("template-id", "")
            report.append(f"### {name}")
            report.append(f"- **URL:** {url}")
            report.append(f"- **Template:** {template_id}")
            if template_id in REMEDIATION:
                report.append(f"- **Fix:** {REMEDIATION[template_id]}")
            report.append("")

    return "\n".join(report)

if __name__ == "__main__":
    findings = parse_results("results/nuclei")
    report = generate_report(findings)
    Path("SECURITY-REPORT.md").write_text(report)
    print(f"Report generated: {len(findings)} findings")
```

## The Outcome

Marta's audit reveals 3 critical findings (exposed .env file with database credentials, authentication bypass on `/api/admin/users`, and a default Nginx status page at `/nginx_status`), 7 high-severity issues (missing security headers, weak TLS cipher suites, and CORS misconfiguration allowing any origin), and 12 medium findings. The team fixes the criticals in a day, addresses high-severity issues by end of week, and schedules the medium findings for the next sprint. The Nuclei scan is added to weekly CI cron, so any regression is caught before it reaches production. Total cost: zero dollars and four hours of engineering time.
