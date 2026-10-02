---
name: trivy
description: >-
  Trivy is an open-source scanner from Aqua Security that finds vulnerabilities,
  exposed secrets, misconfigurations and license problems in container images,
  filesystems, git repos and IaC files. Use when a user asks to scan a Docker
  image for CVEs, audit a repo for leaked secrets, check Terraform or Kubernetes
  manifests for misconfigurations, generate an SBOM, or add security scanning to CI.
license: Apache-2.0
compatibility: 'Linux, macOS, Windows; Docker optional (scans local images through the Docker socket); first run downloads the vulnerability database'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/aquasecurity/trivy
  category: devops
  tags:
    - trivy
    - vulnerability
    - container
    - scanning
    - ci-cd
---

# Trivy

## Overview

Trivy is an open-source vulnerability scanner by Aqua Security (current release v0.75.0). One binary scans container images, filesystems and lockfiles, git repositories, SBOMs, and IaC (Terraform, Kubernetes, Dockerfile, CloudFormation, Helm) for known CVEs, misconfigurations, hard-coded secrets and licenses. It needs no account; it downloads a vulnerability database on first use and caches it. Docs: https://trivy.dev/docs/.

## Instructions

### Step 1: Install

Use a package manager, or a release archive verified against its published checksum. Do not pipe the install script into a shell.

```bash
brew install trivy                        # macOS / Linux
# Debian/Ubuntu: add the signed apt repository from the install docs, then: sudo apt-get install trivy

# Or a release archive, verified:
VERSION=0.75.0
curl -sLO https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/trivy_${VERSION}_Linux-64bit.tar.gz
curl -sLO https://github.com/aquasecurity/trivy/releases/download/v${VERSION}/trivy_${VERSION}_checksums.txt
sha256sum --check --ignore-missing trivy_${VERSION}_checksums.txt
tar -xzf trivy_${VERSION}_Linux-64bit.tar.gz trivy
trivy --version
```

Official container images: `aquasec/trivy`, `ghcr.io/aquasecurity/trivy`. Never use v0.69.4 (see Guidelines).

### Step 2: Container image scanning

```bash
trivy image node:20-alpine
trivy image --severity HIGH,CRITICAL --ignore-unfixed registry.lumenshop.io/api:1.8.2
trivy image --format json --output results.json registry.lumenshop.io/api:1.8.2
trivy image --input api-image.tar              # image saved with `docker save`
```

By default Trivy looks for the image in the local Docker, containerd and Podman stores, then the remote registry (`--image-src` changes the order). It scans OS packages and language dependencies inside the image.

### Step 3: Filesystem, repo and secret scan

`trivy fs` reads lockfiles (package-lock.json, poetry.lock, go.mod, Gemfile.lock ...) without installing anything. Default scanners are `vuln,secret`; add `misconfig` or `license` explicitly.

```bash
trivy fs .
trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL .
trivy fs --scanners license .
trivy repo https://github.com/aquasecurity/trivy-ci-test     # scan a remote git repo
```

### Step 4: IaC scanning

```bash
trivy config ./terraform/
trivy config --severity HIGH,CRITICAL ./k8s/
```

Each finding has an ID (for example `AWS-0107`), the file and line range, and a link to the check at avd.aquasec.com.

### Step 5: SBOM, output formats, CI gating

```bash
trivy fs --format cyclonedx --output sbom.cdx.json .      # also: spdx-json
trivy image --format sarif --output trivy.sarif registry.lumenshop.io/api:1.8.2
trivy sbom sbom.cdx.json                                   # scan an existing SBOM for vulnerabilities
trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed registry.lumenshop.io/api:1.8.2
```

`--exit-code 1` makes the command fail when findings match the severity filter (the default exit code is 0 even with findings). Suppress accepted risks with a `.trivyignore` file (one ID per line, for example `CVE-2020-8203`) or `.trivyignore.yaml` with expiry dates. In air-gapped or rate-limited CI, cache `~/.cache/trivy` and use `--skip-db-update` after a first download.

## Examples

### Example 1: Scan a repo before release

**User request:** "Check this Node project for vulnerable dependencies and leaked keys before I tag a release."

```bash
trivy fs --scanners vuln,secret --severity HIGH,CRITICAL .
```

Result (tested against a lockfile pinning lodash 4.17.15): a summary table with `package-lock.json  npm  4 vulnerabilities`, then rows such as `lodash  CVE-2020-8203  HIGH  fixed  4.17.15  4.17.19`. The agent bumps lodash to the fixed version, reinstalls to refresh the lockfile, and re-runs the scan until the table shows 0.

### Example 2: Gate CI on images and Terraform

**User request:** "Fail the pipeline if our Docker image has fixable critical CVEs, and check the Terraform in infra/."

```bash
trivy image --exit-code 1 --severity CRITICAL --ignore-unfixed registry.lumenshop.io/api:${GIT_SHA}
trivy config --exit-code 1 --severity HIGH,CRITICAL infra/
```

On a bucket without a public access block and a security group open to `0.0.0.0/0` on port 22, `trivy config` reports `AWS-0093` and `AWS-0107` with the offending lines and exits 1, which fails the job. Install Trivy in the CI job with the verified-download steps above.

## Guidelines

- **Supply-chain incident (March 2026):** Trivy v0.69.4 binaries, the Docker Hub images of v0.69.5 and v0.69.6, and the version tags of `aquasecurity/trivy-action` and `setup-trivy` were replaced with credential-stealing code. Use current releases, verify checksums, and in GitHub Actions pin third-party actions to a full commit SHA, never a tag. Details: https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23.
- Results are only as fresh as the vulnerability database; Trivy updates it on each run unless `--skip-db-update` is set.
- `--ignore-unfixed` hides CVEs with no patch yet, which keeps CI actionable but also hides real exposure; report them separately.
- Secret scanning reports patterns, so review matches by hand and rotate any real key found; Trivy does not remove it from git history.
- Misconfiguration checks are generic; tune with `--skip-dirs`, `.trivyignore` and per-check IDs rather than disabling whole scanners.
- When mounting the Docker socket into a Trivy container to scan local images, treat that container as having root on the host; prefer scanning a saved tar (`--input`) or a registry image.
- Supports SBOM output (CycloneDX, SPDX) for compliance; `trivy fs` and `trivy image` scan one target per run, so loop over images in CI.
