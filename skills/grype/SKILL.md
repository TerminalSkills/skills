---
name: grype
description: >-
  Grype is an open-source vulnerability scanner from Anchore that finds known CVEs in container images, directories and SBOMs. Use it to scan images in CI/CD, fail builds on severity, triage and suppress false positives, upload SARIF to GitHub code scanning, or scan Syft-generated SBOMs.
license: Apache-2.0
compatibility: "Linux, macOS or Windows; Docker optional; network access to download the vulnerability database"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  repository: https://github.com/anchore/grype
  tags:
  - vulnerability-scanning
  - container-security
  - sbom
  - cve
  - supply-chain
---

# Grype — Container Vulnerability Scanner

## Overview

Grype (github.com/anchore/grype, latest release v0.120.0 at the time of writing) matches the packages it finds in an image, directory or SBOM against a local vulnerability database built from NVD, GitHub advisories and distro security feeds. It covers OS packages (Alpine, Debian, Ubuntu, RHEL, Amazon Linux, SLES and others) and language packages (Java, JavaScript, Python, Go, Ruby, PHP, .NET, Rust). Findings carry EPSS, KEV and risk scores, and OpenVEX documents can filter them. Its sibling Syft produces the SBOMs.

## Instructions

### Install

```bash
# macOS / Linux with Homebrew
brew tap anchore/grype && brew install grype

# Other package managers: winget install Anchore.Grype, scoop install main/grype,
# sudo port install grype, snap install grype, sudo pacman -S grype-bin

# Linux release archive, verified against the published checksum
VERSION=0.120.0
curl -sSfLO https://github.com/anchore/grype/releases/download/v${VERSION}/grype_${VERSION}_linux_amd64.tar.gz
curl -sSfLO https://github.com/anchore/grype/releases/download/v${VERSION}/grype_${VERSION}_checksums.txt
sha256sum --check --ignore-missing grype_${VERSION}_checksums.txt
tar -xzf grype_${VERSION}_linux_amd64.tar.gz grype && sudo install grype /usr/local/bin/

grype version
```

Anchore also documents an installer script (`get.anchore.io/grype`); prefer the steps above so the download is verified before it runs.

### Scan

```bash
grype alpine:3.20                       # image: pulled from the Docker daemon or registry
grype ghcr.io/acme-shop/api:v1.2.3
grype dir:./services/api                # project directory (lockfiles, manifests)
grype docker-archive:api.tar            # also oci-archive:, oci-dir:, singularity:
grype sbom:./sbom.spdx.json             # SBOM file; `cat sbom.json | grype` also works

grype api:latest --fail-on high         # exit 2 if any finding is high or critical
grype api:latest --only-fixed           # hide vulnerabilities that have no fix yet
grype api:latest -o json > findings.json
grype api:latest -o sarif=grype.sarif   # write one format to a file
grype api:latest -o table -o json=findings.json   # several outputs at once
grype api:latest --show-suppressed      # table output only: lists matches hidden by ignore rules or VEX
```

Output formats: `table` (default), `json`, `sarif`, `cyclonedx`, `cyclonedx-json`, `template` (Go template via `-t`). `--fail-on` accepts negligible, low, medium, high, critical.

### Database

Grype downloads its database on first use and refreshes it when it is stale.

```bash
grype db status        # location, build date, validity
grype db check         # is a newer database available?
grype db update        # download the latest
grype db list          # available databases
```

In air-gapped CI, set `GRYPE_DB_AUTO_UPDATE=false` and ship the database directory with `GRYPE_DB_CACHE_DIR`.

### Configuration and ignore rules

Grype reads `./.grype.yaml`, `./.grype/config.yaml`, `~/.grype.yaml` or `$XDG_CONFIG_HOME/grype/config.yaml` (first found). Every key has a `GRYPE_` environment variable, for example `GRYPE_FAIL_ON_SEVERITY=high`.

```yaml
# .grype.yaml
fail-on-severity: high
only-fixed: true

ignore:
  - vulnerability: CVE-2024-45337
    reason: "x/crypto ServerConfig.PublicKeyCallback is not used by this service"
  - vulnerability: CVE-2023-5678
    package:
      name: openssl
      type: deb
    reason: "Patched in our base image build"
  - package:
      location: "**/testdata/**"
  - fix-state: wont-fix
    reason: "Distro will not patch; tracked in SEC-412"

db:
  auto-update: true
  max-allowed-built-age: 120h
```

Rules can also match by `namespace`, `match-type`, `vex-status` and `vex-justification`. For a maintained exception list use OpenVEX: `grype api:latest --vex vex.openvex.json`.

### Combine with Syft and GitHub Actions

```bash
syft api:v1.2.3 -o spdx-json=sbom.spdx.json
grype sbom:sbom.spdx.json --fail-on critical
cosign attest --yes --predicate sbom.spdx.json --type spdxjson ghcr.io/acme-shop/api:v1.2.3
```

```yaml
# .github/workflows/security.yml
jobs:
  scan:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      security-events: write
    steps:
      - uses: actions/checkout@v4
      - run: docker build -t api:${{ github.sha }} .
      - uses: anchore/scan-action@v7
        id: scan
        with:
          image: api:${{ github.sha }}
          fail-build: true
          severity-cutoff: high
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with:
          sarif_file: ${{ steps.scan.outputs.sarif }}
```

The action defaults to `fail-build: true`, `severity-cutoff: medium` and SARIF output. Pin third-party actions to a full commit SHA in production.

## Examples

### Example 1: Gate a Node.js image in CI

**User request:** "Fail our pipeline when the api image has a fixable high or critical CVE."

```bash
docker build -t api:ci .
grype api:ci --only-fixed --fail-on high -o table
echo "exit code: $?"
```

The table lists package, installed version, fixed-in version, type, vulnerability ID and severity. Exit code 2 fails the job when a fixable high or critical finding exists; exit 0 means clean.

### Example 2: Triage a noisy finding

**User request:** "CVE-2024-45337 shows up on our Go binary but we never call that function."

Add an ignore rule with a reason to `.grype.yaml` (see above), rerun `grype api:ci`, and the finding disappears. `grype api:ci --show-suppressed` still lists it under suppressed matches, so reviewers can audit the decision. The finding stays hidden until the rule is removed.

## Guidelines

- Scan on every build and again on a schedule: new CVEs are published against packages you already shipped.
- Every ignore rule needs a `reason`; add a ticket ID or expiry note so it is reviewed later.
- `--fail-on` only gates on severity; combine with `--only-fixed` if you cannot act on unfixed issues.
- A stale database gives false confidence: keep `validate-age` on and fail the job if the update fails.
- Most findings come from the base image; prefer slim or distroless bases.
- Scanning a directory sees only lockfiles and manifests; scan the built image to include OS packages.
- Grype reports known vulnerabilities, not reachability or misconfiguration; pair with other tools for secrets and IaC.
