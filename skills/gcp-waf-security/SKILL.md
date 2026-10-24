---
name: gcp-waf-security
description: |
  Apply the Google Cloud Well-Architected Framework's Security pillar — security
  by design, zero trust with IAP and BeyondCorp, shift-left scanning in CI/CD,
  Binary Authorization, VPC Service Controls, Cloud Armor, Sensitive Data
  Protection, and Security Command Center. Use for security architecture
  reviews, hardening checklists, and compliance evaluations.
license: Apache-2.0
compatibility: 'gcloud-cli, Cloud Build, Binary Authorization, Security Command Center'
metadata:
  author: google-cloud
  version: 1.1.0
  category: devops
  tags:
    - gcp
    - security
    - zero-trust
    - well-architected
    - compliance
---

# GCP Well-Architected Framework — Security

## Overview

Security is layered: identity, network, data, supply chain, runtime, and ops. The Google Cloud Well-Architected Framework's Security pillar gives you the principles and the product map. This skill applies it to evaluate workloads and recommend concrete controls — not generic advice.

## Instructions

### Core Principles

| Principle | What it means |
|---|---|
| **Security by design** | Threat-model in the design phase, not after launch |
| **Zero trust** | Authenticate every request; trust nothing by network position |
| **Shift-left security** | Scan, sign, and verify in CI; not in production |
| **Preemptive cyber defense** | Threat intelligence, centralized logs, automated response; includes using AI securely (SAIF) and AI for security operations (Gemini in Security, Google SecOps) |
| **Compliance & privacy** | Assured Workloads, Org Policy, regional residency |

### Identity & Access (Zero Trust Foundation)

Org policies are set with `gcloud org-policies set-policy` and a policy file (the older `gcloud resource-manager org-policies` group still exists but is the legacy v1 API and uses a different file format).

```yaml
# no-default-network.yaml — boolean constraint, enforced across the organization
name: organizations/412398765012/policies/compute.skipDefaultNetworkCreation
spec:
  rules:
    - enforce: true
```

```yaml
# no-sa-keys.yaml — block creation of service account keys
name: organizations/412398765012/policies/iam.disableServiceAccountKeyCreation
spec:
  rules:
    - enforce: true
```

```yaml
# eu-only.yaml — only allow EU locations
name: organizations/412398765012/policies/gcp.resourceLocations
spec:
  rules:
    - values:
        allowedValues:
          - in:eu-locations
```

```bash
# 412398765012 is the numeric organization ID (gcloud organizations list)
gcloud org-policies set-policy no-default-network.yaml
gcloud org-policies set-policy no-sa-keys.yaml
gcloud org-policies set-policy eu-only.yaml
```

```bash
# Identity-Aware Proxy for internal apps (no VPN needed)
gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services --service=internal-app \
  --member="group:platform-eng@acme-retail.io" \
  --role="roles/iap.httpsResourceAccessor"
```

### Network Security

```bash
# Hierarchical firewall policies — applied at org/folder level; project rules cannot override a deny, though a rule with action `goto_next` defers to lower levels
gcloud compute firewall-policies create \
  --organization=412398765012 --short-name=org-baseline

# Deny SSH from the internet in every project under the organization
gcloud compute firewall-policies rules create 1000 \
  --firewall-policy=org-baseline --organization=412398765012 \
  --action=deny --direction=INGRESS \
  --layer4-configs=tcp:22 \
  --src-ip-ranges=0.0.0.0/0

# A policy only takes effect once associated with the org or a folder
gcloud compute firewall-policies associations create \
  --firewall-policy=org-baseline --organization=412398765012
```

```bash
# Cloud Armor — DDoS + WAF for HTTPS load balancers
gcloud compute security-policies create web-policy \
  --description="OWASP rules + rate limiting"

gcloud compute security-policies rules create 1000 \
  --security-policy=web-policy \
  --expression="evaluatePreconfiguredExpr('sqli-v33-stable')" \
  --action=deny-403

gcloud compute security-policies rules create 2000 \
  --security-policy=web-policy \
  --expression="true" \
  --action=rate-based-ban \
  --rate-limit-threshold-count=100 \
  --rate-limit-threshold-interval-sec=60 \
  --ban-duration-sec=600 \
  --conform-action=allow \
  --exceed-action=deny-429 \
  --enforce-on-key=ip

# Attach the policy to the backend service behind your load balancer
gcloud compute backend-services update storefront-backend --global \
  --security-policy=web-policy
```

```bash
# VPC Service Controls — perimeter around sensitive APIs (BigQuery, GCS, etc.)
gcloud access-context-manager perimeters create prod-perimeter \
  --title="Prod data perimeter" \
  --resources=projects/PROJECT_NUMBER \
  --restricted-services=bigquery.googleapis.com,storage.googleapis.com \
  --policy=POLICY_NUMBER
```

VPC Service Controls is the right answer when you need data-exfiltration protection — it prevents service accounts inside the perimeter from sending data to projects outside it, even with valid credentials.

### Shift-Left: Supply Chain Security

On-Demand Scanning needs the `ondemandscanning.googleapis.com` API. `images scan --remote` scans an image already in the registry, so push first; the scan command prints a scan resource name that `list-vulnerabilities` takes (not the image URL). Signing uses a Binary Authorization attestation (there is no `gcloud artifacts docker images sign`); the command is currently in the `beta` group.

```yaml
# cloudbuild.yaml — build, push, scan, then attest
substitutions:
  _IMAGE: us-central1-docker.pkg.dev/acme-prod/shop/storefront
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '-t', '${_IMAGE}:${SHORT_SHA}', '.']
  - name: gcr.io/cloud-builders/docker
    args: ['push', '${_IMAGE}:${SHORT_SHA}']

  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: bash
    args:
      - -c
      - |
        set -e
        DIGEST=$(gcloud artifacts docker images describe ${_IMAGE}:${SHORT_SHA} \
          --format='value(image_summary.digest)')
        SCAN=$(gcloud artifacts docker images scan ${_IMAGE}@$$DIGEST \
          --remote --location=us --format='value(response.scan)')
        CRITICAL=$(gcloud artifacts docker images list-vulnerabilities $$SCAN \
          --format='value(vulnerability.effectiveSeverity)' | grep -c CRITICAL || true)
        if [ "$$CRITICAL" -gt 0 ]; then echo "Critical vulnerabilities found"; exit 1; fi
        gcloud beta container binauthz attestations sign-and-create \
          --artifact-url=${_IMAGE}@$$DIGEST \
          --attestor=projects/acme-prod/attestors/build-attestor \
          --keyversion-project=acme-prod --keyversion-location=global \
          --keyversion-keyring=binauthz --keyversion-key=build-signer --keyversion=1
```

```yaml
# policy.yaml — only attested images deploy. Apply with:
#   gcloud container binauthz policy import policy.yaml
# The GKE cluster must also have Binary Authorization enforcement turned on.
globalPolicyEvaluationMode: ENABLE
defaultAdmissionRule:
  evaluationMode: REQUIRE_ATTESTATION
  enforcementMode: ENFORCED_BLOCK_AND_AUDIT_LOG
  requireAttestationsBy:
    - projects/acme-prod/attestors/build-attestor
    - projects/acme-prod/attestors/security-attestor
clusterAdmissionRules:
  us-central1.prod-cluster:
    evaluationMode: REQUIRE_ATTESTATION
    enforcementMode: ENFORCED_BLOCK_AND_AUDIT_LOG
    requireAttestationsBy:
      - projects/acme-prod/attestors/build-attestor
      - projects/acme-prod/attestors/security-attestor
```

### Data Protection

```bash
# Customer-managed encryption keys (CMEK) — you control the key in Cloud KMS.
# Cloud SQL needs its service agent granted roles/cloudkms.cryptoKeyEncrypterDecrypter on the key first.
gcloud kms keyrings create prod --location=us-central1
gcloud kms keys create db-key --keyring=prod --location=us-central1 --purpose=encryption

# Use CMEK on a Cloud SQL instance
gcloud sql instances create orders \
  --database-version=POSTGRES_17 \
  --edition=enterprise --tier=db-custom-2-7680 --region=us-central1 \
  --disk-encryption-key=projects/acme-prod/locations/us-central1/keyRings/prod/cryptoKeys/db-key
```

```bash
# Sensitive Data Protection (formerly Cloud DLP) has no gcloud group; call the REST API.
# Needs dlp.googleapis.com enabled and the dlp.jobsEditor role.
curl -s -X POST \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  -H "Content-Type: application/json" \
  -d @inspect-pii.json \
  "https://dlp.googleapis.com/v2/projects/acme-prod/locations/us-central1/dlpJobs"
```

```json
{
  "inspectJob": {
    "storageConfig": {
      "bigQueryOptions": {
        "tableReference": {
          "projectId": "acme-prod",
          "datasetId": "raw",
          "tableId": "events"
        }
      }
    },
    "inspectConfig": {
      "infoTypes": [
        {"name": "EMAIL_ADDRESS"}, {"name": "CREDIT_CARD_NUMBER"},
        {"name": "US_SOCIAL_SECURITY_NUMBER"}, {"name": "PHONE_NUMBER"}
      ],
      "minLikelihood": "LIKELY"
    },
    "actions": [
      { "saveFindings": { "outputConfig": { "table": {
        "projectId": "acme-prod", "datasetId": "dlp", "tableId": "findings"
      }}}}
    ]
  }
}
```

### Security Command Center & SecOps

```bash
# Activate the Premium or Enterprise tier for the organization in the console
# (Security Command Center > Settings); there is no gcloud command for tier activation.

# Subscribe a Pub/Sub topic to high-severity findings for automated response
gcloud scc notifications create high-severity-findings \
  --organization=412398765012 \
  --description="Critical and high findings" \
  --pubsub-topic=projects/acme-prod/topics/scc-findings \
  --filter='severity="HIGH" OR severity="CRITICAL"'
```

Wire the Pub/Sub topic to a Cloud Function that auto-remediates well-known issues (e.g., disable a public bucket, revoke an over-broad IAM grant) and pages on-call for the rest.

### Validation Checklist

- [ ] Threat model exists and is reviewed for major changes (security by design)
- [ ] Default networks disabled; service account key creation blocked at org level
- [ ] Apps front-ended by IAP; VPC Service Controls around sensitive data services
- [ ] Service-to-service auth via OIDC tokens; no shared secrets
- [ ] All infra in IaC; CI/CD scans and attests images; Binary Authorization enforces
- [ ] Dependency updates automated (Renovate / Dependabot)
- [ ] Security Command Center Premium/Enterprise enabled; audit logs centralized
- [ ] Automated response for known patterns (public buckets, over-broad IAM)
- [ ] AI pipelines protected against data poisoning; training data masked

## Examples

### Example 1 — Hardening review for a Cloud Run service

User has a customer-facing API on Cloud Run. Walk through: front it with a global HTTPS LB + Cloud Armor (OWASP rules + rate limit), require IAP for the admin endpoints, attach a least-privilege service account (no broad `Editor`), encrypt the Cloud SQL backend with CMEK, route audit logs to BigQuery, and enroll the project under a VPC Service Controls perimeter that blocks egress of customer data to external projects.

### Example 2 — Build a deploy-time policy that blocks unscanned images

User wants to enforce that only scanned-and-signed images deploy to GKE prod. Set up Artifact Analysis vulnerability scanning on the registry, add Cloud Build steps that scan + fail on critical, sign with a KMS key on success, and configure Binary Authorization with `REQUIRE_ATTESTATION` on the prod cluster. Test by attempting to deploy an unsigned image — should be blocked with an audit log entry.

## Guidelines

- **Default networks off** at org level — they're a liability, not a feature
- **Disable service account key creation** — use Workload Identity / impersonation
- **Restrict regions** via Org Policy if you have data-residency obligations
- **IAP everywhere** for internal apps; never expose admin UIs to the public internet
- **VPC Service Controls** when you genuinely have data-exfil concerns; expect a learning curve
- **Cloud Armor on every public-facing load balancer** — start new rules in `--preview` mode and read the logs before enforcing
- **Binary Authorization** is the only way to actually enforce "signed images only" at runtime
- **CMEK** when keys must be in your control; default Google-managed encryption is otherwise fine
- **Sensitive Data Protection** for PII discovery in BigQuery / GCS — automate, don't audit manually
- **Security Command Center Premium or Enterprise** adds threat detection and posture management beyond the Standard tier; check which tier your organization is on
- For AI workloads, follow Google's SAIF (Secure AI Framework)
