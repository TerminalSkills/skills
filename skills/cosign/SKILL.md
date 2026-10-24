---
name: cosign
description: >-
  Sign, verify and attest container images and other OCI artifacts with Cosign,
  the Sigstore tool. Use when a user asks to sign an image in CI, verify a
  signature before deploying, do keyless signing with GitHub OIDC, attach an
  SBOM or provenance attestation, or enforce signed images in Kubernetes with
  Kyverno.
license: Apache-2.0
compatibility: Cosign 3.x CLI, an OCI registry, Docker or another image builder
metadata:
  author: terminal-skills
  version: 1.1.0
  category: devops
  repository: https://github.com/sigstore/cosign
  tags:
    - container-signing
    - supply-chain
    - sigstore
    - verification
    - sbom
---

# Cosign — Container Image Signing and Verification

## Overview

Cosign signs OCI images and stores the signature in the registry next to them. In Cosign 3.x (3.1.4 when checked) signatures and attestations use the Sigstore bundle format and are stored as OCI referrers, and the default signing config sends keyless signatures to the public Rekor transparency log. Two modes exist: a key pair you manage, or keyless signing with a short-lived certificate bound to an OIDC identity (GitHub Actions, Google).

## Instructions

### Install

```bash
brew install cosign
```

On Linux download the binary and check it against the published checksums before use:

```bash
V=v3.1.4
curl -sLO https://github.com/sigstore/cosign/releases/download/$V/cosign-linux-amd64
curl -sLO https://github.com/sigstore/cosign/releases/download/$V/cosign_checksums.txt
grep ' cosign-linux-amd64$' cosign_checksums.txt | sha256sum -c -
install -m 0755 cosign-linux-amd64 ~/.local/bin/cosign
```

### Sign and verify with a key pair

```bash
cosign generate-key-pair            # asks for a password; writes cosign.key and cosign.pub
docker push ghcr.io/dataplane-io/orders-api:v1.2.3
DIGEST=sha256:c64c687cbea9300178b30c95835354e34c4e4febc4badfe27102879de0483b5e   # the digest `docker push` prints
cosign sign --key cosign.key --yes ghcr.io/dataplane-io/orders-api@$DIGEST
cosign verify --key cosign.pub ghcr.io/dataplane-io/orders-api@$DIGEST
```

Sign the digest, not the tag: a tag can move, a digest cannot. A key-based `cosign sign` also uploads an entry to the public Rekor log by default, which reveals the image name. Store `cosign.key` only in a secret manager and pass its password through `COSIGN_PASSWORD`. For tests against a private registry, `--use-signing-config=false --tlog-upload=false` signs without Rekor (cosign 3.1.4 prints deprecation warnings for both flags but still honors them), and `cosign verify --insecure-ignore-tlog` checks it; never use these for production images.

### Keyless signing and verification

```bash
cosign sign --yes ghcr.io/dataplane-io/orders-api@$DIGEST      # opens a browser for OIDC login on a workstation
cosign verify \
  --certificate-identity=maria.lopez@dataplane.io \
  --certificate-oidc-issuer=https://accounts.google.com \
  ghcr.io/dataplane-io/orders-api@$DIGEST
```

`cosign verify` for keyless images always needs an identity (`--certificate-identity` or `--certificate-identity-regexp`) and an issuer (`--certificate-oidc-issuer` or the regexp form). The `COSIGN_EXPERIMENTAL=1` variable seen in old guides does nothing any more; drop it.

### CI: sign in GitHub Actions

```yaml
# .github/workflows/build.yml
on:
  push:
    branches: [main]
jobs:
  build-and-sign:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      id-token: write                   # lets the job get an OIDC token for keyless signing
    steps:
      - uses: actions/checkout@v4
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - id: build
        uses: docker/build-push-action@v6
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
      - uses: sigstore/cosign-installer@v4
      - name: Sign by digest (keyless)
        run: cosign sign --yes ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}
```

Verify what this workflow produced by pinning the workflow identity:

```bash
cosign verify \
  --certificate-identity=https://github.com/dataplane-io/orders-api/.github/workflows/build.yml@refs/heads/main \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/dataplane-io/orders-api@sha256:c64c687cbea9300178b30c95835354e34c4e4febc4badfe27102879de0483b5e
```

### Attestations (SBOM, provenance)

`--type` accepts `slsaprovenance`, `slsaprovenance02`, `slsaprovenance1`, `link`, `spdx`, `spdxjson`, `cyclonedx`, `vuln`, `openvex`, `custom`, or a URI.

```bash
syft ghcr.io/dataplane-io/orders-api@$DIGEST -o spdx-json > sbom.spdx.json
cosign attest --yes --predicate sbom.spdx.json --type spdxjson ghcr.io/dataplane-io/orders-api@$DIGEST

cosign verify-attestation --type spdxjson \
  --certificate-identity-regexp='^https://github.com/dataplane-io/orders-api/' \
  --certificate-oidc-issuer=https://token.actions.githubusercontent.com \
  ghcr.io/dataplane-io/orders-api@$DIGEST | jq -r .payload | base64 -d | jq .predicateType
```

In a workflow, install syft first with `uses: anchore/sbom-action/download-syft@v0`. `cosign tree <image>` lists the signatures and attestations attached to an image.

### Verify in Kubernetes (Kyverno)

```yaml
apiVersion: kyverno.io/v1
kind: ClusterPolicy
metadata:
  name: verify-image-signatures
spec:
  background: false
  rules:
    - name: verify-cosign-signature
      match:
        any:
          - resources:
              kinds: ["Pod"]
      verifyImages:
        - failureAction: Enforce
          imageReferences:
            - "ghcr.io/dataplane-io/*"
          attestors:
            - entries:
                - keyless:
                    subject: "https://github.com/dataplane-io/orders-api/.github/workflows/build.yml@refs/heads/main"
                    issuer: "https://token.actions.githubusercontent.com"
                    rekor:
                      url: "https://rekor.sigstore.dev"
```

Start with `failureAction: Audit` to see what would be blocked, then switch to `Enforce`.

## Examples

### Example 1: Sign every image built in CI
**User request:** "Our orders-api image is built in GitHub Actions and pushed to ghcr.io. Sign it so we can prove it came from our pipeline."

The agent adds `id-token: write` to the job, installs Cosign with `sigstore/cosign-installer@v4`, and signs `ghcr.io/dataplane-io/orders-api@${{ steps.build.outputs.digest }}` as in the CI section. It then runs the `cosign verify` command with the workflow identity and reports the verified signature with its certificate identity.

### Example 2: Block unsigned images in the cluster
**User request:** "Nothing unsigned from our registry should be able to run in production."

The agent installs the Kyverno policy above in `Audit` mode, lists the violations with `kubectl get policyreport -A`, fixes the pipelines that push unsigned images, and then changes `failureAction` to `Enforce`.

## Guidelines

1. Prefer keyless signing in CI; the signature is tied to the workflow identity and there is no key to leak.
2. Always sign and verify by digest. Verify with an exact identity and issuer, never a wildcard that any GitHub repository could match.
3. Keyless signatures are recorded in the public Rekor log, which makes who signed what and when auditable, and also publicly visible. Private artifacts need a private Sigstore deployment or a key pair without Rekor.
4. Attach an SBOM and provenance with `cosign attest`; check them with `cosign verify-attestation` before deployment.
5. Enforce verification at admission (Kyverno or Sigstore policy-controller), not only in CI.
6. `cosign attach` and `cosign download sbom` are deprecated (attach is removed in v4.0); use attestations.
