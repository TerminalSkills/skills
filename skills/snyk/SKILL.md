---
name: snyk
description: >-
  Snyk is a developer security scanner that finds known vulnerabilities in
  open-source dependencies, container images, infrastructure-as-code files and
  source code. Use when a user asks to scan for vulnerabilities, audit npm or
  pip packages, check a Docker image for CVEs, scan Terraform or Kubernetes
  files, or add a security gate to CI/CD.
license: Apache-2.0
compatibility: 'Snyk CLI 1.1308 (npm, Homebrew, Scoop or Docker); a free Snyk account'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/snyk/cli
  category: devops
  tags:
    - snyk
    - vulnerability
    - dependencies
    - docker
    - ci-cd
---

# Snyk

## Overview

Snyk scans four things from one CLI: open-source dependencies (`snyk test`), container images (`snyk container test`), IaC files (`snyk iac test`) and your own source code (`snyk code test`, static analysis). Results can also be sent to the Snyk web app for continuous monitoring (`snyk monitor`). Every scan needs a Snyk account and token, because vulnerability data lives on Snyk's servers. Dependency scans send the dependency tree, not your source; `snyk code test` uploads source for analysis.

## Instructions

### Step 1: Install and authenticate

```bash
npm install -g snyk            # or: brew tap snyk/tap && brew install snyk/tap/snyk
                               # or: scoop bucket add snyk https://github.com/snyk/scoop-snyk && scoop install snyk
snyk --version
snyk auth                      # opens a browser to log in (local machine)
```

In CI there is no browser: create an API token (or a service account token) in the Snyk web app, store it as a CI secret and expose it as the `SNYK_TOKEN` environment variable. The CLI picks it up automatically. A Docker image (`snyk/snyk`) is also published; pass the token with `-e SNYK_TOKEN`.

### Step 2: Scan dependencies

```bash
snyk test                                   # reads the lockfile of the current project
snyk test --all-projects                    # monorepo: every manifest found below this directory
snyk test --severity-threshold=high         # report (and fail on) high and critical only
snyk test --json-file-output=snyk.json      # machine-readable report, human output stays on screen
snyk monitor                                # snapshot to the web app; re-tested daily by default
```

Install dependencies first (`npm ci`, `pip install -r requirements.txt`) so the lockfile or environment exists. Exit codes: `0` nothing found, `1` vulnerabilities found, `2` the run failed, `3` no supported project found. `--fail-on=upgradable` fails only when a fix exists.

### Step 3: Scan containers

```bash
snyk container test node:20-alpine
snyk container test ghcr.io/shopline/api:2.4.1 --file=Dockerfile    # adds base-image upgrade advice
snyk container test node:20-alpine --exclude-base-image-vulns
```

### Step 4: Scan IaC and source code

```bash
snyk iac test infra/                                  # Terraform, CloudFormation, Kubernetes, ARM
snyk iac test infra/ --severity-threshold=medium --sarif-file-output=iac.sarif
snyk iac test infra/ --report --target-name=shop-infra  # also publish the result to the web app
snyk code test src/                                   # SAST on your own code
```

`snyk monitor` does not support Snyk Code; use `snyk code test --report --project-name=shop-api` to publish code results.

### Step 5: Fixing

Upgrade the dependency named in the `snyk test` output ("Fixed in" / "Upgrade ... to"), re-run the lockfile install and test again. The old deterministic `snyk fix` command is deprecated; the new `snyk fix --agentic --experimental --sca|--sast` needs an LLM provider key and is experimental, so prefer a manual upgrade or a fix pull request opened from the web app.

## Examples

### Example 1: Fail a pull request on serious dependency issues

**User request:**

```
Add a Snyk check to our GitHub Actions workflow so builds fail on high or critical vulnerabilities.
```

The agent adds a step after `npm ci`:

```yaml
      - name: Snyk dependency scan
        run: npx --yes snyk@1 test --severity-threshold=high
        env:
          SNYK_TOKEN: ${{ secrets.SNYK_TOKEN }}
```

and tells the user to create the `SNYK_TOKEN` repository secret. Result: the job exits `1` and prints each vulnerable path (for example `lodash@4.17.15 > Prototype Pollution`) when a high or critical issue exists, and exits `0` otherwise.

### Example 2: Check a base image before upgrading

**User request:**

```
Is node:20-alpine safe to keep using, or should I move to something newer?
```

The agent runs `snyk container test node:20-alpine --file=Dockerfile` from the project, reads the "Base Image" table at the end (current image, vulnerability counts, recommended upgrade tags) and reports which tag removes the most issues. Result: a short list of the recommended tags with the number of high and critical findings removed by each.

### Example 3: Scan Terraform before apply

**User request:**

```
Scan the terraform folder for misconfigurations and give me a SARIF file for the code scanning tab.
```

The agent runs `snyk iac test terraform/ --sarif-file-output=iac.sarif` and summarises issues by severity (for example an S3 bucket without encryption); exit code `1` means issues were found.

## Guidelines

- The free plan limits tests per month (Open Source 200, Code 100, IaC 300, Container 100) and 5 projects; CI scans on every push can use that up, so scan on pull requests and merges to main.
- Use `--severity-threshold` to set what fails a build; without it every severity, including low, returns exit code 1.
- Never commit `SNYK_TOKEN` or paste it into a command line that lands in shell history; keep it in CI secrets.
- `snyk code test` uploads source files to Snyk; check company policy before running it on private code.
- Scans only cover known, published vulnerabilities; they do not replace code review or secret scanning.
- Free alternatives for part of the job: `npm audit`, GitHub Dependabot, `pip-audit`.
