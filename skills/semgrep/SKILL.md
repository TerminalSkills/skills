---
name: semgrep
description: Expert guidance for Semgrep, the fast, open-source static analysis tool that finds bugs, security vulnerabilities, and anti-patterns in code. Helps developers write custom rules, integrate Semgrep into CI/CD pipelines, and use the registry of community rules for security scanning.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - sast
  - code-analysis
  - security
  - linting
  - patterns
---

# Semgrep — Lightweight Static Analysis


## Overview


Semgrep, the fast, open-source static analysis tool that finds bugs, security vulnerabilities, and anti-patterns in code. Helps developers write custom rules, integrate Semgrep into CI/CD pipelines, and use the registry of community rules for security scanning.


## Instructions

### Quick Start

```bash
# Install
pip install semgrep

# Scan with recommended security rules
semgrep scan --config=auto

# Scan with specific rulesets
semgrep scan --config=p/security-audit
semgrep scan --config=p/owasp-top-ten
semgrep scan --config=p/typescript
semgrep scan --config=p/python

# Scan a specific directory
semgrep scan --config=auto src/
```

### Custom Rules

```yaml
# .semgrep/sql-injection.yml — Custom rule for SQL injection
rules:
  - id: raw-sql-with-user-input
    message: >
      Possible SQL injection: user input is concatenated into a SQL query.
      Use parameterized queries instead: db.query("SELECT * FROM users WHERE id = $1", [userId])
    severity: ERROR
    languages: [typescript, javascript]
    patterns:
      - pattern: |
          $DB.query(`... ${$USER_INPUT} ...`)
      - pattern: |
          $DB.query("..." + $USER_INPUT + "...")
      - pattern: |
          $DB.query(`... ${{$USER_INPUT}} ...`)
    fix: |
      $DB.query("... $1 ...", [$USER_INPUT])
    metadata:
      cwe: ["CWE-89"]
      owasp: ["A03:2021"]
      confidence: HIGH

  - id: hardcoded-secret
    message: >
      Hardcoded secret detected. Use environment variables instead:
      process.env.API_KEY
    severity: ERROR
    languages: [typescript, javascript]
    patterns:
      - pattern: |
          $KEY = "sk_live_..."
      - pattern: |
          $KEY = "sk_test_..."
      - pattern: |
          apiKey: "..."
    pattern-not:
      - pattern: |
          $KEY = process.env.$VAR
    metadata:
      cwe: ["CWE-798"]
      confidence: HIGH

  - id: missing-auth-middleware
    message: >
      Route handler without authentication middleware.
      Add authMiddleware before the handler.
    severity: WARNING
    languages: [typescript, javascript]
    pattern: |
      router.$METHOD($PATH, async (req, res) => { ... })
    pattern-not: |
      router.$METHOD($PATH, authMiddleware, async (req, res) => { ... })
    metadata:
      confidence: MEDIUM
```

```yaml
# .semgrep/react-security.yml — React-specific rules
rules:
  - id: dangerous-html
    message: >
      Using dangerouslySetInnerHTML with user input risks XSS.
      Sanitize with DOMPurify: dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(content) }}
    severity: ERROR
    languages: [typescript, javascript]
    pattern: |
      <$TAG dangerouslySetInnerHTML={{__html: $INPUT}} />
    metadata:
      cwe: ["CWE-79"]
      owasp: ["A03:2021"]

  - id: missing-rel-noopener
    message: >
      Links with target="_blank" should include rel="noopener noreferrer"
      to prevent tab-napping attacks.
    severity: WARNING
    languages: [typescript, javascript]
    pattern: |
      <a target="_blank" href={$URL}>...</a>
    pattern-not: |
      <a target="_blank" rel="noopener noreferrer" href={$URL}>...</a>
```

### CI/CD Integration

```yaml
# .github/workflows/security.yml — Semgrep in CI
name: Security Scan
on: [pull_request]

jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Semgrep Scan
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/owasp-top-ten
            .semgrep/
        env:
          SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}
```

```bash
# Run in CI with SARIF output (for GitHub Security tab)
semgrep scan --config=auto --sarif --output=semgrep.sarif

# Fail CI on high-severity findings only
semgrep scan --config=auto --severity=ERROR --error
```

## Installation

```bash
pip install semgrep

# Or via Docker
docker run -v $(pwd):/src semgrep/semgrep scan --config=auto /src

# Or via Homebrew
brew install semgrep
```


## Examples


### Example 1: Setting up Semgrep for a microservices project

**User request:**

```
I have a Node.js API and a React frontend running in Docker. Set up Semgrep for monitoring/deployment.
```

The agent creates the necessary configuration files based on patterns like `# Install`, sets up the integration with the existing Docker setup, configures appropriate defaults for a Node.js + React stack, and provides verification commands to confirm everything is working.

### Example 2: Troubleshooting custom rules issues

**User request:**

```
Semgrep is showing errors in our custom rules. Here are the logs: [error output]
```

The agent analyzes the error output, identifies the root cause by cross-referencing with common Semgrep issues, applies the fix (updating configuration, adjusting resource limits, or correcting syntax), and verifies the resolution with appropriate health checks.


## Guidelines

1. **Start with `--config=auto`** — Uses Semgrep's recommended rules; catches common security issues without configuration
2. **Write project-specific rules** — Generic rules miss domain-specific bugs; write rules for your auth patterns, API conventions, and common mistakes
3. **Fix suggestions** — Include `fix` in custom rules for auto-fix capability; developers adopt tools faster when fixes are one click away
4. **Severity levels** — Use ERROR for security vulnerabilities (block CI), WARNING for code quality (report but don't block)
5. **Metadata for context** — Add CWE, OWASP references to rules; helps developers understand why something is flagged
6. **Incremental scans** — In CI, scan only changed files with `--diff-depth=1` for faster feedback on pull requests
7. **Rule registry** — Browse community rules at semgrep.dev/explore before writing your own; thousands of rules for every framework
8. **Semgrep Cloud** — Use Semgrep Cloud for dashboard, triage, and tracking fixes across the organization
