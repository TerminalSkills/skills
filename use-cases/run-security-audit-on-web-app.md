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

Everything below is run only against an app the team owns, on a staging deployment they control, with the CTO's written go-ahead. Both tools send attack-shaped requests; never point them at someone else's system.

## The Solution

Run an automated audit in three passes: **ffuf** for discovering hidden content and undocumented endpoints, **Nuclei** for template-based checks (CVEs, misconfigurations, exposed files, default logins; the community `nuclei-templates` repository holds more than 13,000 templates), and the **security-audit** skill for the code-side checks a black-box scan can't see (vulnerable dependencies, committed secrets). Results are combined into a prioritized report with remediation steps. This catches the low-hanging fruit that automated scanners excel at, not the business-logic flaws a human pentester finds.

## Step-by-Step Walkthrough

### Step 1: Content Discovery with ffuf

Before scanning for vulnerabilities, discover what's actually exposed. Install the release binary after checking its checksum (ffuf 2.3.0 shown; see the ffuf skill), and fetch SecLists for wordlists.

```bash
#!/bin/bash
# discover.sh — content discovery against YOUR staging environment
set -eu
TARGET="https://staging.myapp.com"
WL="SecLists/Discovery/Web-Content"
mkdir -p results

# Directories, plus backup/config extensions. -ac auto-calibrates away soft-404 pages.
ffuf -u "$TARGET/FUZZ" -w "$WL/common.txt"   -e .bak,.old,.sql,.env,.zip,.log   -ac -rate 50 -noninteractive -o results/files.json -of json

# API paths: 401/403/405 mean the path exists
ffuf -u "$TARGET/api/FUZZ" -w "$WL/api/api-endpoints.txt"   -mc 200,401,403,405 -ac -rate 50 -noninteractive -o results/api.json -of json

# Login and admin paths
ffuf -u "$TARGET/FUZZ" -w "$WL/Logins.fuzz.txt"   -mc 200,301,302,401,403 -ac -rate 50 -noninteractive -o results/admin.json -of json
```

Tested against a local stand-in app, this flags a planted `.env` (200), `db.bak` (200) and `admin` (301) among 4,751 words. Review the ffuf results before proceeding: an exposed `.env`, a backup database or an open admin panel is critical and should be fixed immediately, with no Nuclei scan needed. A 405 on an API path means it exists but not for GET; repeat with `-X POST`.

### Step 2: Vulnerability Scanning with Nuclei

Install Nuclei (3.x, checksum-verified release archive or `go install`) and update the templates with `nuclei -update-templates`. Then run targeted template categories.

```bash
#!/bin/bash
# scan.sh — staged scanning of YOUR staging environment
set -eu
TARGET="https://staging.myapp.com"
OUT="results/nuclei"
mkdir -p "$OUT"

# Stage 1: critical and high
nuclei -u "$TARGET" -severity critical,high \
  -tags cve,misconfig,exposure,default-login \
  -rate-limit 50 -jsonl-export "$OUT/critical-high.jsonl"

# Stage 2: technology-specific checks (use the stack ffuf and the response headers showed)
nuclei -u "$TARGET" -tags nextjs,nodejs,nginx -severity critical,high,medium \
  -rate-limit 50 -jsonl-export "$OUT/tech.jsonl"

# Stage 3: TLS configuration and missing security headers
nuclei -u "$TARGET" -tags ssl,tls,headers -jsonl-export "$OUT/tls-headers.jsonl"
```

`-jsonl-export` writes one JSON object per finding (the v2 `-json` flag no longer exists). Add `-omit-raw -omit-template` to keep full responses, which may contain secrets, out of the files. Preview what a filter would run, without sending anything, with `-tl`, for example `nuclei -tags exposure -severity critical,high -tl`.

### Step 3: Custom Templates for Your Application

Community templates catch generic issues. Write custom templates for your own endpoints.

```yaml
# templates/auth-bypass.yaml — protected endpoints must not answer without credentials
id: auth-bypass-check

info:
  name: Protected API Endpoint Answers Without Authentication
  author: terminal-skills
  severity: critical
  description: Requests protected endpoints with no credentials and flags any that return data.
  tags: auth,custom

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/users"
      - "{{BaseURL}}/api/admin/dashboard"
      - "{{BaseURL}}/api/billing/invoices"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        part: body
        words:
          - '"email"'
```

```yaml
# templates/data-leak.yaml — a test account's own profile must not contain secrets
id: api-data-leak

info:
  name: Sensitive Field in API Response
  author: terminal-skills
  severity: high
  description: Calls profile endpoints with a test account token and flags sensitive field names.
  tags: exposure,custom

http:
  - method: GET
    path:
      - "{{BaseURL}}/api/users/me"
    headers:
      Authorization: "Bearer {{token}}"
    matchers:
      - type: regex
        part: body
        regex:
          - '"(password|passwordHash|secret|ssn|creditCard)"\s*:'
```

```bash
nuclei -validate -t templates/    # "All templates validated successfully"
# token of a throwaway staging account, read from the environment
nuclei -u "$TARGET" -t templates/ -var token="$STAGING_TEST_TOKEN" \
  -jsonl-export results/nuclei/custom.jsonl
```

Against the local stand-in app, `auth-bypass-check` reported `/api/users` as critical. There is deliberately no `extractors` block on the leak template, so a matched secret doesn't end up in logs and report files.

### Step 4: Code-Side Checks with security-audit

A black-box scan can't see what is in the repository. The security-audit skill covers dependencies and committed secrets:

```bash
npm audit --omit=dev --audit-level=high       # exits non-zero when it finds anything
trivy fs --scanners vuln,secret .             # lockfiles and committed secrets, if trivy is installed
```

The agent triages the output by severity, discards findings in dev-only dependencies, and adds the real ones to the same report as the scan results.

### Step 5: Generate a Prioritized Report

```python
# report.py — merge Nuclei JSONL output into one markdown report, worst first
import json
from collections import defaultdict
from pathlib import Path

REMEDIATION = {
    "generic-env": "Remove the file from the web root, rotate every secret in it, and block dotfiles in the web server config: `location ~ /\\. { deny all; }`",
    "http-missing-security-headers:x-frame-options": "Add `X-Frame-Options: DENY` or CSP `frame-ancestors 'none'`",
    "http-missing-security-headers:content-security-policy": "Add a Content-Security-Policy header restricting script-src, style-src and img-src",
    "deprecated-tls": "Disable TLS 1.0/1.1; allow TLS 1.2 and 1.3 only",
    "weak-cipher-suites": "Disable weak cipher suites; keep AEAD ciphers (AES-GCM, ChaCha20)",
    "auth-bypass-check": "Enforce authentication and authorization on the route in middleware, not per handler",
}
ORDER = ["critical", "high", "medium", "low", "info"]

def parse_results(results_dir: str) -> list[dict]:
    findings = []
    for path in sorted(Path(results_dir).glob("*.jsonl")):
        for line in path.read_text().splitlines():
            if line.strip():
                findings.append(json.loads(line))
    return findings

def remediation(f: dict) -> str | None:
    tid, matcher = f.get("template-id", ""), f.get("matcher-name")
    return REMEDIATION.get(f"{tid}:{matcher}") or REMEDIATION.get(tid)

def generate_report(findings: list[dict]) -> str:
    by_severity = defaultdict(list)
    for f in findings:
        by_severity[f["info"]["severity"]].append(f)
    lines = ["# Security Audit Report", "", f"**Total findings:** {len(findings)}"]
    for sev in ORDER:
        items = by_severity.get(sev, [])
        if not items:
            continue
        lines += ["", f"## {sev.upper()} ({len(items)})"]
        for f in items:
            lines += ["", f"### {f['info']['name']}", f"- **URL:** {f.get('matched-at', 'n/a')}",
                      f"- **Template:** {f['template-id']}"]
            if fix := remediation(f):
                lines.append(f"- **Fix:** {fix}")
    return "\n".join(lines) + "\n"

if __name__ == "__main__":
    findings = parse_results("results/nuclei")
    Path("SECURITY-REPORT.md").write_text(generate_report(findings))
    print(f"Report generated: {len(findings)} findings")
```

## The Outcome

Marta's audit reveals 3 critical findings (an exposed `.env` file with database credentials, authentication bypass on `/api/admin/users`, and a default Nginx status page at `/nginx_status`), 7 high-severity issues (missing security headers, weak TLS cipher suites and an outdated dependency with a known CVE), and 12 medium findings. The team fixes the criticals in a day, addresses high-severity issues by end of week, and schedules the medium findings for the next sprint. A weekly Nuclei run against staging in CI (the nuclei skill shows a workflow) catches regressions before they reach production. The tools are free; the example team's cost was about four hours of engineering time.

## Related Skills

- **ffuf** -- content, API and admin-path discovery against the team's own staging (Step 1).
- **nuclei-scanner** -- template scans, custom templates and JSONL output for the report (Steps 2, 3 and 5).
- **security-audit** -- dependency and secrets checks on the code itself (Step 4).
