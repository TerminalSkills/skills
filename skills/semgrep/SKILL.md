---
name: semgrep
description: Semgrep is an open-source static analysis tool that finds bugs, security vulnerabilities and anti-patterns by matching code patterns. Use it to scan a repository, write custom YAML rules, auto-fix findings, or add a Semgrep scan with SARIF output to GitHub Actions or other CI.
license: Apache-2.0
compatibility: "Python 3.10+ (pip), Homebrew on macOS/Linux, or the semgrep/semgrep Docker image."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  tags:
  - sast
  - code-analysis
  - security
  - linting
  - patterns
  repository: https://github.com/semgrep/semgrep
---

# Semgrep

## Overview

Semgrep is an open-source static analysis engine (LGPL-2.1 CLI, repository semgrep/semgrep) that matches code structure instead of text, so a rule reads almost like the source it finds. It supports 30+ languages. The CLI runs locally and offline with your own rules; community rules come from the Semgrep Registry; the paid Semgrep AppSec Platform adds dashboards, triage and diff-aware CI. This skill was checked against Semgrep 1.178 and 1.179 (September 2026).

## Instructions

### Install

```bash
python3 -m pip install semgrep      # needs Python 3.10+
# or: brew install semgrep          # Homebrew no longer supports Intel Macs
# or: docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep scan --config p/security-audit
semgrep --version
```

### Scan

```bash
semgrep scan --config p/security-audit src/        # a registry ruleset
semgrep scan --config p/owasp-top-ten --config p/typescript
semgrep scan --config .semgrep/ --metrics=off      # local rules only, fully offline
semgrep scan --config auto .                       # rules picked for the project's languages
```

`--config auto` sends the project URL to the Registry and enables metrics; for private code or air-gapped runs use explicit `p/...` rulesets or local files with `--metrics=off`. Registry rulesets are listed at semgrep.dev/explore.

Useful flags: `--severity=ERROR`, `--error` (exit code 1 when findings exist), `--json`, `--sarif --output=semgrep.sarif`, `--exclude-rule`, `--include='*.ts'`, `-a/--autofix` (applies each rule's `fix`), `--baseline-commit=origin/main` (report only findings new since that commit). Ignore a line with a trailing `// nosemgrep: rule-id`; a `.semgrepignore` file excludes paths. Since 1.117 `.gitignore` is no longer read automatically.

### Custom rules

Required keys are `id`, `message`, `severity`, `languages` and one pattern operator. Severities in rules are `ERROR`, `WARNING`, `INFO` (newer docs also list `LOW` to `CRITICAL`). Operator logic: `pattern-either` is OR, `patterns` is AND, and `pattern-not` and `metavariable-regex` only work inside `patterns`. A string such as `"sk_live_..."` is not a prefix match (`"..."` matches any string); use `metavariable-regex` for that.

```yaml
# .semgrep/node-security.yml
rules:
  - id: sql-query-built-from-input
    message: SQL built from user input. Use a parameterized query, for example db.query("SELECT * FROM users WHERE id = $1", [userId]).
    severity: ERROR
    languages: [typescript, javascript]
    pattern-either:
      - pattern: $DB.query(`...${$INPUT}...`)
      - pattern: $DB.query("..." + $INPUT)
    metadata:
      cwe: ["CWE-89: SQL Injection"]
      confidence: HIGH

  - id: hardcoded-stripe-key
    message: Hardcoded Stripe key. Read it from process.env.STRIPE_SECRET_KEY.
    severity: ERROR
    languages: [typescript, javascript]
    patterns:
      - pattern-either:
          - pattern: $KEY = "$VALUE"
          - pattern: const $KEY = "$VALUE"
      - metavariable-regex:
          metavariable: $VALUE
          regex: ^sk_(live|test)_

  - id: route-without-auth
    message: Route handler without authMiddleware.
    severity: WARNING
    languages: [typescript, javascript]
    patterns:
      - pattern: router.$METHOD($PATH, async (req, res) => { ... })
      - pattern-not: router.$METHOD($PATH, authMiddleware, async (req, res) => { ... })

  - id: unsanitized-inner-html
    message: dangerouslySetInnerHTML with unsanitized input risks XSS.
    severity: ERROR
    languages: [typescript, javascript]
    pattern: |
      <$TAG dangerouslySetInnerHTML={{__html: $INPUT}} />
    fix: |
      <$TAG dangerouslySetInnerHTML={{__html: DOMPurify.sanitize($INPUT)}} />
```

Quote or use `|` for any message or pattern that contains `: `, otherwise YAML fails with "mapping values are not allowed here". Check a rule file with `semgrep --validate --config .semgrep/`, and unit-test rules by putting `// ruleid: rule-id` above lines that must match and `// ok: rule-id` above lines that must not in a file next to the rule, then run `semgrep --test .semgrep/`.

### CI (GitHub Actions)

The `semgrep/semgrep-action` is the old way; the documented setup runs `semgrep ci` in the official container. `semgrep ci` needs `SEMGREP_APP_TOKEN` (a platform account) and scans only changed files on pull requests.

```yaml
# .github/workflows/semgrep.yml
name: Semgrep
on:
  pull_request: {}
  push:
    branches: [main]
jobs:
  semgrep:
    runs-on: ubuntu-latest
    container:
      image: semgrep/semgrep
    steps:
      - uses: actions/checkout@v4
      - run: semgrep ci
        env:
          SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}
```

Without an account, run the open-source CLI directly and upload SARIF:

```yaml
      - run: pip install semgrep
      - run: semgrep scan --config p/security-audit --config .semgrep/ --metrics=off --sarif --output=semgrep.sarif --error --baseline-commit=origin/${{ github.base_ref }}
```

Use `fetch-depth: 0` on checkout so `--baseline-commit` can see the base branch.

## Examples

### Example 1: First security scan of a Node.js API

**User request:** "Scan our Express API in src/ for security problems and give me a report I can attach to the PR."

```bash
python3 -m pip install semgrep
semgrep scan --config p/security-audit --config p/nodejs --metrics=off --sarif --output=semgrep.sarif src/
```

The agent reports the summary line (for example `Findings: 7 (5 blocking)`), groups findings by rule id and file, fixes the clear ones (parameterized queries, secrets moved to environment variables) and leaves `semgrep.sarif` for upload.

### Example 2: A team rule that bans a deprecated helper

**User request:** "Every call to legacyAuth.check(req) must be replaced by session.require(req). Make Semgrep flag it and fix it automatically."

The agent writes `.semgrep/migrate-auth.yml` with `pattern: legacyAuth.check($REQ)` and `fix: session.require($REQ)`, validates it with `semgrep --validate --config .semgrep/`, previews with `semgrep scan --config .semgrep/ --severity=WARNING src/`, then applies it with `--autofix` and reviews the diff.

## Guidelines

- Keep ERROR for findings that should fail the build and WARNING for the rest; pair `--error` with `--severity=ERROR` to gate CI only on the former.
- Start with a registry ruleset, then add project rules for your own auth and data-access conventions; always add `metadata` (CWE, confidence) so reviewers know why a line is flagged.
- Review `--autofix` output before committing; a fix is a text substitution and can break formatting or semantics.
- Semgrep is pattern-based, not a full data-flow prover: expect false positives and negatives; suppress deliberately with `nosemgrep` plus a reason.
- Cross-file (interfile) analysis and many Pro rules need a Semgrep account; the open-source CLI analyses one file at a time.
- Do not commit `SEMGREP_APP_TOKEN`; keep it in CI secrets.
