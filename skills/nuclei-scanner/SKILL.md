---
name: nuclei-scanner
description: >-
  Scans web applications and infrastructure for vulnerabilities with Nuclei, a
  template-based security scanner. Use when someone asks to "scan for
  vulnerabilities", "security scan my website", "Nuclei scanner", "find CVEs",
  "automated security testing", "vulnerability assessment", or "check for
  misconfigurations" on systems they own or are authorized to test. Covers
  template scanning, custom templates, CI integration, and severity-based
  reporting.
license: Apache-2.0
compatibility: "Nuclei 3.x (checked against 3.11.1) on Linux, macOS or Windows. `go install` needs Go 1.26+. Protocols: HTTP, DNS, TCP, SSL, JavaScript, headless browser."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags: ["security", "vulnerability", "scanning", "nuclei", "pentest"]
  repository: https://github.com/projectdiscovery/nuclei
---

# Nuclei Scanner

## Overview

Nuclei is a fast, template-based vulnerability scanner by ProjectDiscovery. Instead of running monolithic scanners, Nuclei uses YAML templates — each one checks for a specific vulnerability, misconfiguration, or exposure. The community repository `nuclei-templates` holds more than 13,000 templates (release v10.4.9) covering CVEs, default credentials, exposed panels, misconfigurations, and more. Runs in CI, scripted pipelines, or manual assessments.

Nuclei sends real attack-shaped requests. Run it only against systems you own or have written permission to test; the examples below use a local app and a staging host that stand for your own.

## When to Use

- Security assessment of web applications before deployment
- Checking infrastructure for known CVEs and misconfigurations
- Continuous security scanning in CI/CD pipelines
- Authorized penetration tests and bug bounty programs, within the published scope
- Compliance checks (exposed admin panels, default credentials, SSL issues)

## Instructions

### Setup

```bash
# Homebrew (macOS or Linux)
brew install nuclei

# Or with Go 1.26+ (the `go` line of go.mod at v3.11.1)
go install -v github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest

# Or a release archive — file names carry the version, and the checksum must match before unpacking
VERSION=3.11.1
curl -sSLO "https://github.com/projectdiscovery/nuclei/releases/download/v${VERSION}/nuclei_${VERSION}_linux_amd64.zip"
curl -sSLO "https://github.com/projectdiscovery/nuclei/releases/download/v${VERSION}/nuclei_${VERSION}_checksums.txt"
sha256sum -c "nuclei_${VERSION}_checksums.txt" --ignore-missing   # nuclei_3.11.1_linux_amd64.zip: OK
unzip "nuclei_${VERSION}_linux_amd64.zip" nuclei -d ~/.local/bin      # any directory on PATH

# Install or update the community templates (stored in ~/nuclei-templates)
nuclei -update-templates
nuclei -version
```

A Docker image is published as `projectdiscovery/nuclei` (tags `latest`, `v3.11.1`).

### Basic Scanning

```bash
# Scan a single target with the default template set
nuclei -u http://127.0.0.1:3000

# Scan with specific severity
nuclei -u https://staging.fernhill.test -severity critical,high

# Scan multiple targets from a file (one URL or host per line)
nuclei -l targets.txt -severity critical,high,medium

# Scan specific template categories
nuclei -u https://staging.fernhill.test -tags cve,misconfig,exposure

# Scan with rate limiting (the default is 150 requests per second)
nuclei -u https://staging.fernhill.test -rate-limit 50 -concurrency 10

# See what a filter would run, without sending anything
nuclei -tags exposure -severity critical,high -tl
```

The default set leaves out templates tagged `dos`, `fuzz`, `bruteforce` and a few others listed in `.nuclei-ignore` in the Nuclei config directory (`~/.config/nuclei` on Linux); `-itags` brings a tag back. Template types that need extra capabilities are opt-in: `-headless` (browser), `-code` (runs local code), `-dast` (fuzzing).

Each finding is one line — template id, protocol, severity, matched URL — as in Example 1. `-new-templates` runs only the templates added in the latest templates release.

### Output

```bash
nuclei -u https://staging.fernhill.test -severity critical,high -o findings.txt \
  -jsonl-export findings.jsonl -sarif-export findings.sarif -markdown-export report/
```

`-jsonl` (`-j`) prints one JSON object per finding to stdout; the v2 flag `-json` no longer exists. Useful keys: `template-id`, `info.name`, `info.severity`, `host`, `matched-at`, `extracted-results`, `timestamp`. Add `-omit-raw -omit-template` to leave the full request, response and template out of each object.

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
```

`nuclei -validate -t templates/` checks the syntax ("All templates validated successfully") and `-t templates/` runs only your own templates, as in Example 2. An `extractors` block prints the matched text next to the finding. Leave it out of templates that match secrets, or the key ends up in terminal scrollback, CI logs and report files.

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
      - uses: projectdiscovery/nuclei-action@v3
        with:
          args: >-
            -u ${{ vars.STAGING_URL }} -severity critical,high
            -tags cve,misconfig,exposure -rate-limit 50 -jsonl-export nuclei.jsonl

      - name: Fail on findings
        run: |
          if [ -s nuclei.jsonl ]; then
            jq -r '"[\(.info.severity)] \(.info.name) \(."matched-at")"' nuclei.jsonl
            exit 1
          fi
```

`nuclei-action@v3` takes the whole command line in `args`. The older inputs (`target`, `urls`, `templates`, `flags`, `output`) belong to v2 and `@main`, which are deprecated and unsupported since March 1, 2026. Nuclei exits with status 0 whether or not it finds anything, so the job needs its own check; the export file is created empty when there are no findings.

### Programmatic Usage (Python)

```python
# scan.py — Run Nuclei from Python and parse results
import json
import subprocess
import sys

def run_nuclei_scan(target: str, severity: str = "critical,high") -> list[dict]:
    """Run Nuclei against a target you are authorized to test and return its findings."""
    result = subprocess.run(
        ["nuclei", "-u", target, "-severity", severity, "-jsonl", "-silent", "-omit-raw", "-omit-template"],
        capture_output=True, text=True,
        stdin=subprocess.DEVNULL,   # otherwise nuclei waits for targets on an open stdin pipe
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip())
    return [json.loads(line) for line in result.stdout.splitlines() if line]

findings = run_nuclei_scan(sys.argv[1])
for f in findings:
    print(f"[{f['info']['severity']}] {f['info']['name']} — {f['matched-at']}")
sys.exit(1 if findings else 0)   # nuclei itself exits 0 even when it finds something
```

## Examples

### Example 1: Pre-deployment security check

**User prompt:** "Before we go live, scan our staging site for any critical vulnerabilities or misconfigurations."

After confirming that the staging host belongs to the user's team, update the templates and run the high-impact checks at a rate the server can take:

```bash
nuclei -update-templates
nuclei -u https://staging.fernhill.test \
  -severity critical,high -tags cve,misconfig,exposure,default-login \
  -rate-limit 50 -jsonl-export staging-findings.jsonl -markdown-export staging-report/
```

Result:

```text
[INF] Templates loaded for current scan: 3622
[INF] Using Interactsh Server: oast.fun
[codeigniter-env] [http] [high] https://staging.fernhill.test/.env [paths="/.env"]
[laravel-env] [http] [high] https://staging.fernhill.test/.env [paths="/.env"]
[generic-env] [http] [high] https://staging.fernhill.test/.env [paths="/.env"]
[INF] Scan completed in 2m. 3 matches found.
```

All three findings point at the same file. The report to the user names the cause (the web server serves `/.env`), the fix (deny dotfiles in the server config, rotate every secret in that file) and the re-test command, `nuclei -u https://staging.fernhill.test -id generic-env,laravel-env`. `staging-report/` holds one Markdown file per finding with the request and response.

### Example 2: Custom template for internal API

**User prompt:** "Write a Nuclei template that checks if our internal admin endpoints are accessible without auth."

```yaml
# nuclei-templates-custom/admin-no-auth.yaml
id: admin-no-auth

info:
  name: Admin endpoint reachable without authentication
  author: fernhill-security
  severity: high
  description: An admin route answers 200 to a request that carries no session cookie or token.
  tags: misconfig,auth,custom

http:
  - method: GET
    path:
      - "{{BaseURL}}/admin/"
      - "{{BaseURL}}/admin/users"
      - "{{BaseURL}}/internal/metrics"
    matchers-condition: and
    matchers:
      - type: status
        status:
          - 200
      - type: word
        part: body
        words:
          - "Sign in"
          - "Log in"
        condition: or
        negative: true
```

```bash
nuclei -validate -t nuclei-templates-custom/
nuclei -u http://127.0.0.1:3000 -t nuclei-templates-custom/
```

Result: the request is sent without credentials, so a protected route answers 401, 403, a redirect or a login page and nothing is reported. An open route prints

```text
[admin-no-auth] [http] [high] http://127.0.0.1:3000/admin/
```

Redirects are not followed unless `-follow-redirects` is given, so a 302 to the login page counts as protected.

## Guidelines

- **Always get authorization** — only scan targets you own or have written permission to test; scanning anyone else's systems can be a criminal offence
- **Start with `-severity critical,high`** — focus on what matters first
- **Rate limit scans** — `-rate-limit 50` to avoid overwhelming targets; the default is 150 requests per second
- **Use `-tags` for targeted scans** — `cve`, `misconfig`, `exposure`, `default-login`; `nuclei -tgl` lists every tag
- **JSONL output for automation** — `-jsonl` on stdout or `-jsonl-export` to a file; never rely on the exit code to detect findings
- **Close stdin in scripts** — when stdin is an open pipe, Nuclei waits on it for targets even with `-u`; pass `-no-stdin` or redirect from `/dev/null`
- **Custom templates for your app** — community templates are generic; write app-specific checks and run `-validate` on them in CI
- **Update templates regularly** — `nuclei -update-templates` gets new CVE checks
- **Headless templates for JS apps** — checks that need browser rendering run only with `-headless`
- **Out-of-band checks call a public service** — some templates confirm a flaw by making the target contact ProjectDiscovery's interactsh servers (`oast.*`); use `-no-interactsh` when the scan must not involve a third party
- **Never scan production during peak hours** — schedule scans for low-traffic windows
- **A finding is a lead, not a verdict** — templates match on response patterns and can be wrong in both directions; confirm by hand before reporting, and do not treat a clean scan as proof of security
