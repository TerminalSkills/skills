---
name: owasp-zap
description: >-
  OWASP ZAP (Zed Attack Proxy) is an open-source web application security scanner that crawls a site, passively inspects traffic and optionally attacks it to find XSS, SQL injection, missing security headers and other OWASP Top 10 issues. Use when configuring automated scans, running zap-baseline, zap-full-scan or zap-api-scan, adding security scanning to CI/CD or GitHub Actions, or triaging scan results. Trigger words: owasp zap, security scan, vulnerability scanner, penetration testing, zap-baseline, active scan, passive scan.
license: Apache-2.0
compatibility: "Docker (ghcr.io/zaproxy/zaproxy) or Java 17+ for the desktop/CLI install; ZAP 2.17.0"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/zaproxy/zaproxy
  tags: ["owasp-zap", "security", "vulnerability-scanning", "penetration-testing", "ci-cd"]
---

# OWASP ZAP

## Overview

OWASP ZAP is an open-source web application security scanner. It maps an application with a spider (and an Ajax spider for JavaScript apps), passively analyses every response, and can run active scans that send attack payloads. It ships as a desktop app, a headless CLI, a REST API and Docker images. Latest release checked: 2.17.0. The Docker image is `ghcr.io/zaproxy/zaproxy:stable` (other tags: `weekly`, `nightly`, `bare`); the old `owasp/zap2docker-*` names are gone. The desktop and CLI installs need Java 17 or newer.

Three packaged scripts live in the image:

| Script | What it does | Sends attacks? |
|--------|--------------|----------------|
| `zap-baseline.py` | Spiders the target (1 minute by default), waits for passive scanning, reports | No attack payloads, but it does crawl the site |
| `zap-full-scan.py` | Spider, optional Ajax spider, passive scan, then an active scan | Yes |
| `zap-api-scan.py` | Imports an OpenAPI, SOAP or GraphQL definition, then scans the endpoints | Yes, unless `-S` |

ZAP's documentation says the Automation Framework (YAML plans run with `zap.sh -cmd -autorun plan.yaml`) will in time replace the packaged scans; use it when you need authentication, contexts or custom job order.

## Instructions

1. Only scan systems you own or have written permission to test. Active and full scans modify data (they submit forms and may create records), so run them against staging or a disposable copy, never production.

2. Baseline scan with reports (exit codes: 0 clean, 1 at least one FAIL, 2 only WARNs, 3 other failure):

```bash
mkdir -p zap-out && chmod a+w zap-out     # the container user must be able to write here
docker run --rm -v "$(pwd)/zap-out:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t https://staging.shopfront.dev -r baseline.html -J baseline.json
```

   Every alert is a WARN by default. Generate a rules file with `-g gen.conf`, edit it to mark rules `IGNORE` or `FAIL` (tab-separated: rule id, action, name), and pass it with `-c gen.conf` so CI can fail only on what matters. Other useful flags: `-m 5` (spider minutes), `-j` (also use the Ajax spider), `-a` (include alpha passive rules), `-l WARN` (minimum level shown), `-I` (do not fail on warnings), `-T` (timeout in minutes).

3. Full scan, staging only: `zap-full-scan.py -t https://staging.shopfront.dev -m 10 -r full.html`. It can run for a long time; set `-T` to cap it.

4. API scan from a definition (URL or a file in the mounted `/zap/wrk`):

```bash
docker run --rm -v "$(pwd)/zap-out:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t https://staging.shopfront.dev/openapi.json -f openapi -r api.html -S
```

   `-f` is `openapi`, `soap` or `graphql`; `-S` makes it safe (passive only); `-O` overrides the hostname written in the spec. A target that runs in another container needs a network ZAP can reach, not `localhost`.

5. GitHub Actions: the maintained actions are `zaproxy/action-baseline` (v0.15.0), `zaproxy/action-full-scan` (v0.13.0) and `zaproxy/action-api-scan` (v0.10.0). By default they open or update a GitHub issue with the findings (needs `issues: write` permission; set `allow_issue_writing: false` to disable) and upload the report as an artifact named `zap_scan`. Set `fail_action: true` to fail the job on alerts, `rules_file_name` for the ignore list, `cmd_options` for extra script flags.

6. Authenticated scans and anything beyond the packaged options: write an Automation Framework plan. Jobs run top to bottom:

```yaml
# plan.yaml
env:
  contexts:
    - name: shopfront
      urls: ["https://staging.shopfront.dev"]
jobs:
  - type: spider
    parameters: { context: shopfront }
  - type: passiveScan-wait
    parameters: { maxDuration: 5 }
  - type: report
    parameters: { template: traditional-html, reportDir: /zap/wrk, reportFile: shopfront }
```

```bash
docker run --rm -v "$(pwd)/zap-out:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap.sh -cmd -autorun /zap/wrk/plan.yaml
```

   Add `spiderAjax` for SPAs, `activeScan` for attacks, and an `authentication` block on the context (form, JSON, script or browser-based) plus a verification rule so ZAP knows when it has been logged out. Put test-account credentials in environment variables, never in the plan file.

7. Triage: sort by risk, then confidence; confirm each finding manually before filing it; handle false positives with rule `IGNORE` entries or context exclusions, not by silencing a whole scan.

## Examples

### Example 1: Scan every pull request without breaking the build on noise

**User request:** "Run OWASP ZAP on every pull request against our preview URL and fail only on real problems."

```yaml
# .github/workflows/zap.yml
name: ZAP baseline
on: pull_request
permissions: { contents: read, issues: write }
jobs:
  zap:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: zaproxy/action-baseline@v0.15.0
        with:
          target: https://pr-${{ github.event.number }}.preview.shopfront.dev
          rules_file_name: .zap/rules.tsv
          fail_action: true
          cmd_options: -a
```

`.zap/rules.tsv` holds lines such as `10015	IGNORE	(Incomplete or No Cache-control Header Set)`. Result: the job passes when only ignored rules fire, fails on any remaining WARN or FAIL, and the HTML/JSON report is attached as the `zap_scan` artifact.

### Example 2: Pre-launch audit of an API on staging

**User request:** "Scan our REST API on staging before launch, including attacks, and give me a report."

```bash
mkdir -p zap-out && chmod a+w zap-out
docker run --rm -v "$(pwd)/zap-out:/zap/wrk/:rw" -t ghcr.io/zaproxy/zaproxy:stable \
  zap-api-scan.py -t https://staging.shopfront.dev/openapi.json -f openapi \
  -r api-report.html -J api-report.json -T 30
echo "exit code: $?"
```

Result: `zap-out/api-report.html` and `api-report.json` list alerts by risk with the affected URLs; exit code 2 means warnings only, 1 means at least one FAIL-level rule fired.

## Guidelines

- Never run `zap-full-scan.py`, `zap-api-scan.py` without `-S`, or an `activeScan` job against production or against a system you do not own: it sends attack payloads and may corrupt data or trigger alerts.
- Passive and baseline results are a floor, not a security audit; they miss logic flaws and broken access control. Combine with manual testing and dependency scanning.
- Unauthenticated scans only see the login page; configure authentication or the findings behind it are never tested.
- ZAP also receives a lot of data: reports can contain cookies, tokens and response bodies, so treat artifacts as sensitive and avoid public CI artifact retention for them.
- Pin the image tag (for example a release tag instead of `stable`) in CI if you need reproducible results; `weekly` and `nightly` change often.
- A scan that finishes in seconds usually means the spider found nothing (login wall, JavaScript rendering, wrong URL); check the report for the number of URLs visited.
