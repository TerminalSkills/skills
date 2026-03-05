---
name: cosign
description: Expert guidance for Cosign, the Sigstore tool for signing, verifying, and attaching metadata to container images and other OCI artifacts. Helps developers implement supply chain security by signing images in CI/CD, verifying signatures before deployment, and attaching SBOMs and vulnerability scan results as attestations.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
  - container-signing
  - supply-chain
  - sigstore
  - verification
  - sbom
---

# Cosign — Container Image Signing and Verification


## Overview

You are an expert in Cosign, the Sigstore tool for signing, verifying, and attaching metadata to container images and other OCI artifacts. You help developers implement supply chain security by signing images in CI/CD, verifying signatures before deployment, and attaching SBOMs and vulnerability scan results as attestations.

## Instructions

### Sign and Verify Images

```bash
# Install
brew install cosign

# Generate a keypair
cosign generate-key-pair
# Creates cosign.key (private) and cosign.pub (public)

# Sign an image after building
docker build -t myregistry.com/myapp:v1.2.3 .
docker push myregistry.com/myapp:v1.2.3
cosign sign --key cosign.key myregistry.com/myapp:v1.2.3

# Verify before deploying
cosign verify --key cosign.pub myregistry.com/myapp:v1.2.3

# Keyless signing with Sigstore (no key management!)
# Uses OIDC identity (GitHub Actions, Google, etc.)
cosign sign myregistry.com/myapp:v1.2.3
# Opens browser for OIDC login, signs with ephemeral key,
# records signature in Rekor transparency log

# Keyless verification
cosign verify \
  --certificate-identity=user@example.com \
  --certificate-oidc-issuer=https://accounts.google.com \
  myregistry.com/myapp:v1.2.3
```

### CI/CD Integration

```yaml
# .github/workflows/build.yml — Sign images in CI
jobs:
  build-and-sign:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write                   # Required for keyless signing
      packages: write
    steps:
      - uses: actions/checkout@v4

      - name: Build and push
        run: |
          docker build -t ghcr.io/${{ github.repository }}:${{ github.sha }} .
          docker push ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Install Cosign
        uses: sigstore/cosign-installer@v3

      - name: Sign image (keyless)
        run: |
          cosign sign \
            --yes \
            ghcr.io/${{ github.repository }}:${{ github.sha }}
        env:
          COSIGN_EXPERIMENTAL: 1

      - name: Attach SBOM
        run: |
          # Generate SBOM with syft
          syft ghcr.io/${{ github.repository }}:${{ github.sha }} -o spdx-json > sbom.spdx.json

          # Attach SBOM as an attestation
          cosign attest \
            --yes \
            --predicate sbom.spdx.json \
            --type spdxjson \
            ghcr.io/${{ github.repository }}:${{ github.sha }}

      - name: Attach vulnerability scan
        run: |
          # Scan with grype
          grype ghcr.io/${{ github.repository }}:${{ github.sha }} -o json > vuln-scan.json

          # Attach scan results
          cosign attest \
            --yes \
            --predicate vuln-scan.json \
            --type vuln \
            ghcr.io/${{ github.repository }}:${{ github.sha }}
```

### Verify in Kubernetes (Kyverno Policy)

```yaml
# Kubernetes policy: only deploy signed images
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signatures
spec:
  validationFailureAction: Enforce
  background: false
  rules:
    - name: verify-cosign-signature
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - imageReferences:
            - "ghcr.io/myorg/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/myorg/*"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor:
                      url: "https://rekor.sigstore.dev"
```

### Attestations

```bash
# Attest build provenance (SLSA)
cosign attest \
  --yes \
  --predicate provenance.json \
  --type slsaprovenance \
  myregistry.com/myapp:v1.2.3

# Verify attestation
cosign verify-attestation \
  --type spdxjson \
  --certificate-identity-regexp=".*@myorg.com" \
  --certificate-oidc-issuer=https://accounts.google.com \
  myregistry.com/myapp:v1.2.3

# Download and inspect attached SBOM
cosign download attestation myregistry.com/myapp:v1.2.3 | jq -r '.payload' | base64 -d | jq .
```

## Installation

```bash
brew install cosign
# Or: go install github.com/sigstore/cosign/v2/cmd/cosign@latest
# Or: Download from https://github.com/sigstore/cosign/releases
```


## Examples

### Example 1

**User request:** "Help me set up Cosign"

The agent follows the instructions above to configure Cosign with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Cosign configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Keyless signing in CI** — Use Sigstore's keyless signing in GitHub Actions; no key management, signatures tied to OIDC identity
2. **Sign every image** — Sign in CI/CD, verify before deployment; no unsigned image should reach production
3. **Attach SBOMs** — Generate and attach SBOM with every build; required for compliance (Executive Order 14028) and vulnerability tracking
4. **Verify in admission control** — Use Kyverno or OPA to enforce signature verification at the Kubernetes admission level
5. **Rekor transparency log** — Keyless signatures are recorded in Rekor; provides an immutable audit trail of who signed what and when
6. **Attestations for provenance** — Attach SLSA provenance attestations; prove where and how the image was built
7. **Pin by digest** — Reference images by SHA256 digest, not tag; tags can be overwritten, digests are immutable
8. **Vulnerability scan attestations** — Attach scan results as attestations; verify no critical CVEs before deployment
