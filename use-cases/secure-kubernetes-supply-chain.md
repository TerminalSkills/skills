---
title: Secure the Kubernetes Supply Chain from Code to Cluster
slug: secure-kubernetes-supply-chain
description: Implement a complete software supply chain security pipeline using Semgrep for code scanning, Checkov for IaC validation, Grype for vulnerability scanning, Cosign for image signing, and Kyverno for admission control — ensuring only verified, scanned code reaches production.
skills: [semgrep, checkov, grype, cosign, kyverno]
category: Security & DevSecOps
tags: [supply-chain, kubernetes, security, ci-cd, signing, scanning]
---

# Secure the Kubernetes Supply Chain from Code to Cluster

Leo is security lead at a 60-person fintech company running 20 microservices on Kubernetes. After a competitor suffers a supply chain attack — a compromised npm package exfiltrating customer data — the board mandates a full supply chain security review. Leo finds the current state alarming: no code scanning, no image scanning, no signatures, no admission control. Any developer can push any image to any cluster. A single compromised dependency could reach production unchecked.

Leo designs a five-layer defense: Semgrep scans code for vulnerabilities at PR time, Checkov validates infrastructure configurations, Grype scans container images for known CVEs, Cosign signs verified images, and Kyverno enforces that only signed, scanned images can run in the cluster.

## Step 1: Code Scanning with Semgrep

The first gate: catch vulnerabilities in the code itself before it's merged.

```yaml
# .github/workflows/security-gate.yml — Security pipeline
name: Security Gate
on: [pull_request]

jobs:
  code-scan:
    name: Semgrep Code Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Semgrep Scan
        uses: semgrep/semgrep-action@v1
        with:
          config: >-
            p/security-audit
            p/owasp-top-ten
            p/typescript
            .semgrep/
        env:
          SEMGREP_APP_TOKEN: ${{ secrets.SEMGREP_APP_TOKEN }}
```

The team writes custom Semgrep rules for their specific patterns — hardcoded credentials, missing auth middleware, unsafe database queries:

```yaml
# .semgrep/fintech-rules.yml — Domain-specific security rules
rules:
  - id: unencrypted-pii-logging
    message: >
      PII field logged without encryption. Customer data must never
      appear in logs in plaintext. Use maskPII() before logging.
    severity: ERROR
    languages: [typescript]
    patterns:
      - pattern: |
          logger.$METHOD({..., $FIELD: $VALUE, ...})
      - metavariable-regex:
          metavariable: $FIELD
          regex: (ssn|social_security|tax_id|account_number|routing_number)
    metadata:
      cwe: ["CWE-532"]
      confidence: HIGH

  - id: missing-rate-limit
    message: >
      Public API endpoint without rate limiting. All public endpoints
      must use rateLimiter middleware to prevent abuse.
    severity: WARNING
    languages: [typescript]
    pattern: |
      router.post("/api/public/$ENDPOINT", async (req, res) => { ... })
    pattern-not: |
      router.post("/api/public/$ENDPOINT", rateLimiter, async (req, res) => { ... })
```

## Step 2: Infrastructure Scanning with Checkov

Every Terraform change and Kubernetes manifest goes through Checkov before merge.

```yaml
  iac-scan:
    name: Checkov IaC Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Scan Terraform
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: terraform/
          framework: terraform
          output_format: sarif
          output_file_path: checkov-tf.sarif
          soft_fail: false
          skip_check: CKV_AWS_18      # S3 logging handled by org-level CloudTrail

      - name: Scan Kubernetes Manifests
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: k8s/
          framework: kubernetes
          output_format: sarif
          output_file_path: checkov-k8s.sarif
          soft_fail: false

      - name: Scan Dockerfiles
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: .
          framework: dockerfile
          output_format: sarif
          output_file_path: checkov-docker.sarif

      - name: Upload Results to GitHub Security
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: .
```

Checkov catches misconfigurations that would otherwise reach production silently — RDS instances without encryption, security groups open to the world, containers running as root, missing health check probes.

## Step 3: Build, Scan, and Sign Images

After code review passes, the build pipeline creates the image, scans it for CVEs with Grype, and signs it with Cosign.

```yaml
  build-scan-sign:
    name: Build, Scan, and Sign
    needs: [code-scan, iac-scan]
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write                   # For keyless Cosign signing
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Build and Push Image
        id: build
        uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # --- Vulnerability Scanning ---
      - name: Install Grype
        run: curl -sSfL https://raw.githubusercontent.com/anchore/grype/main/install.sh | sh -s -- -b /usr/local/bin

      - name: Scan for Vulnerabilities
        run: |
          grype ghcr.io/${{ github.repository }}:${{ github.sha }} \
            --fail-on high \
            -o sarif > grype.sarif
        # Pipeline fails here if high/critical CVEs are found

      - name: Upload Grype Results
        if: always()
        uses: github/codeql-action/upload-sarif@v3
        with:
          sarif_file: grype.sarif

      # --- SBOM Generation ---
      - name: Generate SBOM
        uses: anchore/sbom-action@v0
        with:
          image: ghcr.io/${{ github.repository }}:${{ github.sha }}
          output-file: sbom.spdx.json

      # --- Image Signing ---
      - name: Install Cosign
        uses: sigstore/cosign-installer@v3

      - name: Sign Image (Keyless)
        run: cosign sign --yes ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Attach SBOM Attestation
        run: |
          cosign attest --yes \
            --predicate sbom.spdx.json \
            --type spdxjson \
            ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Attach Vulnerability Scan Attestation
        run: |
          grype ghcr.io/${{ github.repository }}:${{ github.sha }} -o json > vuln-report.json
          cosign attest --yes \
            --predicate vuln-report.json \
            --type vuln \
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

At this point, the image has been scanned for code vulnerabilities (Semgrep), infrastructure misconfigurations (Checkov), and known CVEs (Grype). It's signed with a cryptographic signature tied to the CI identity (Cosign), and it carries an SBOM and vulnerability report as attestations.

## Step 4: Admission Control with Kyverno

The final gate: Kyverno in the Kubernetes cluster enforces that only signed, scanned images are allowed to run.

```yaml
# k8s/kyverno-policies/verify-supply-chain.yaml
# This policy enforces the entire supply chain in one admission check.

apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-supply-chain
  annotations:
    policies.kyverno.io/title: Verify Supply Chain
    policies.kyverno.io/description: >
      Ensures all container images are signed with Cosign via
      GitHub Actions and have an attached vulnerability scan attestation.
spec:
  validationFailureAction: Enforce
  webhookTimeoutSeconds: 30
  rules:
    # Rule 1: Verify image signature
    - name: verify-cosign-signature
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - imageReferences:
            - "ghcr.io/myfintech/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/myfintech/*"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor:
                      url: "https://rekor.sigstore.dev"

    # Rule 2: Verify SBOM attestation exists
    - name: verify-sbom-attestation
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - imageReferences:
            - "ghcr.io/myfintech/*"
          attestations:
            - type: https://spdx.dev/Document
              attestors:
                - entries:
                    - keyless:
                        subject: "https://github.com/myfintech/*"
                        issuer: "https://token.actions.githubusercontent.com"

---
# Additional hardening policies
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: pod-security-hardening
spec:
  validationFailureAction: Enforce
  rules:
    - name: disallow-privileged
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Privileged containers are forbidden."
        pattern:
          spec:
            containers:
              - securityContext:
                  privileged: "!true"

    - name: require-nonroot
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Containers must run as non-root."
        pattern:
          spec:
            securityContext:
              runAsNonRoot: true

    - name: drop-all-capabilities
      match:
        any:
          - resources:
              kinds: ["Pod"]
      validate:
        message: "Containers must drop ALL capabilities."
        pattern:
          spec:
            containers:
              - securityContext:
                  capabilities:
                    drop: ["ALL"]

---
# Auto-inject security defaults via mutation
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: inject-security-defaults
spec:
  rules:
    - name: add-seccomp-profile
      match:
        any:
          - resources:
              kinds: ["Pod"]
      mutate:
        patchStrategicMerge:
          spec:
            securityContext:
              +(seccompProfile):
                type: RuntimeDefault
```

## Step 5: Verify the Pipeline End-to-End

```bash
# Attempt to deploy an unsigned image — Kyverno blocks it
$ kubectl run test --image=nginx:latest
Error: admission webhook "validate.kyverno.svc" denied the request:
  resource Pod/default/test was blocked due to the following policies:
  verify-supply-chain:
    verify-cosign-signature: 'image verification failed for nginx:latest:
      no matching signatures found'

# Deploy a properly signed image — succeeds
$ kubectl run api --image=ghcr.io/myfintech/api-gateway:abc123
pod/api created

# Check policy reports
$ kubectl get policyreport -A
NAMESPACE   NAME                  PASS   FAIL   WARN
default     pol-verify-supply     12     0      0
payments    pol-verify-supply     8      0      0
```

## Results

Three months after implementing the five-layer defense, Leo presents the results to the board.

Semgrep catches an average of 4 security issues per week in pull requests — SQL injection attempts, hardcoded credentials, PII leaking into logs. Two of these would have been critical in production: an unparameterized database query in the transaction service and a logging statement that would have written full credit card numbers to CloudWatch.

Checkov blocks 2-3 infrastructure misconfigurations per month. The most significant: a Terraform change that would have opened port 22 to the internet on the database server's security group. The developer had copied a configuration example from Stack Overflow without modifying the CIDR block.

Grype has flagged 47 container images with high-severity CVEs since deployment. The team established a 48-hour SLA for remediating critical CVEs and a 7-day SLA for high. Base image updates account for 80% of the fixes — switching from `node:18` to `node:18-slim` eliminated 120 CVEs in one change.

Kyverno blocked 23 deployment attempts with unsigned or unscanned images. Most were developers trying to deploy directly from their local machines (bypassing CI/CD). Three were from a staging environment where someone had pushed an image manually. The cluster has maintained 100% policy compliance since enforcement was enabled.

The entire pipeline adds 3 minutes to the CI/CD cycle (Semgrep: 45s, Checkov: 30s, build+push: 60s, Grype: 30s, Cosign: 15s). The team considers this acceptable — the security confidence is worth far more than 3 minutes of build time. And since the scanning runs in parallel with tests, the actual wall-clock impact is closer to 90 seconds.
