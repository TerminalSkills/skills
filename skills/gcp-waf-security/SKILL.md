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
  version: 1.0.0
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
| **Preemptive cyber defense** | Threat intelligence, centralized logs, automated response |
| **Use AI securely & responsibly** | Protect models, data, and use SAIF guidance |
| **Use AI for security** | Gemini in Security, Google SecOps for automation |
| **Compliance & privacy** | Assured Workloads, Org Policy, regional residency |

### Identity & Access (Zero Trust Foundation)

```bash
# Disable default networks at org level (Org Policy)
gcloud resource-manager org-policies enable-enforce \
  compute.skipDefaultNetworkCreation \
  --organization=ORG_ID

# Restrict service account key creation
gcloud resource-manager org-policies enable-enforce \
  iam.disableServiceAccountKeyCreation --organization=ORG_ID

# Restrict resources to approved regions
gcloud resource-manager org-policies set-policy policy.yaml --organization=ORG_ID
```

```yaml
# policy.yaml — only allow EU regions
constraint: constraints/gcp.resourceLocations
listPolicy:
  allowedValues:
    - in:eu-locations
```

```bash
# Identity-Aware Proxy for internal apps (no VPN needed)
gcloud iap web add-iam-policy-binding \
  --resource-type=backend-services --service=internal-app \
  --member="group:eng-team@example.com" \
  --role="roles/iap.httpsResourceAccessor"
```

### Network Security

```bash
# Hierarchical firewall policies — applied at folder/org, can't be overridden by projects
gcloud compute firewall-policies create global-deny-all \
  --organization=ORG_ID --short-name="org-baseline"

gcloud compute firewall-policies rules create 1000 \
  --firewall-policy=global-deny-all \
  --action=DENY --direction=EGRESS \
  --layer4-configs=tcp,udp \
  --dest-ip-ranges=0.0.0.0/0
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
  --enforce-on-key=IP
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

```yaml
# cloudbuild.yaml — scan, sign, then deploy
steps:
  - name: gcr.io/cloud-builders/docker
    args: ['build', '-t', '${_IMAGE}:${SHORT_SHA}', '.']

  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: gcloud
    args: ['artifacts', 'docker', 'images', 'scan', '${_IMAGE}:${SHORT_SHA}',
           '--remote', '--format=value(response.scan)']

  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: bash
    args:
      - -c
      - |
        VULNS=$(gcloud artifacts docker images list-vulnerabilities \
          ${_IMAGE}:${SHORT_SHA} --filter="severity=CRITICAL" --format="value(name)")
        if [ -n "$VULNS" ]; then
          echo "Critical vulnerabilities found"; exit 1
        fi

  - name: gcr.io/google.com/cloudsdktool/cloud-sdk
    entrypoint: gcloud
    args: ['artifacts', 'docker', 'images', 'sign', '${_IMAGE}:${SHORT_SHA}',
           '--key=projects/PROJECT/locations/global/keyRings/binauthz/cryptoKeys/build-signer/cryptoKeyVersions/1']

images: ['${_IMAGE}:${SHORT_SHA}']
```

```yaml
# Binary Authorization policy — only signed, scanned images deploy
defaultAdmissionRule:
  evaluationMode: REQUIRE_ATTESTATION
  enforcementMode: ENFORCED_BLOCK_AND_AUDIT_LOG
  requireAttestationsBy:
    - projects/PROJECT/attestors/build-attestor
    - projects/PROJECT/attestors/security-attestor
clusterAdmissionRules:
  us-central1.prod-cluster:
    evaluationMode: REQUIRE_ATTESTATION
    enforcementMode: ENFORCED_BLOCK_AND_AUDIT_LOG
    requireAttestationsBy:
      - projects/PROJECT/attestors/build-attestor
      - projects/PROJECT/attestors/security-attestor
```

### Data Protection

```bash
# Customer-managed encryption keys (CMEK) — you own the key, Google holds the cipher
gcloud kms keyrings create prod --location=us-central1
gcloud kms keys create db-key --keyring=prod --location=us-central1 --purpose=encryption

# Use CMEK on a Cloud SQL instance
gcloud sql instances create orders \
  --database-version=POSTGRES_15 \
  --tier=db-custom-2-7680 --region=us-central1 \
  --disk-encryption-key=projects/my-project/locations/us-central1/keyRings/prod/cryptoKeys/db-key
```

```bash
# Sensitive Data Protection — find and redact PII in BigQuery
gcloud dlp jobs create \
  --inspect-job-from-file=inspect-pii.json
```

```json
{
  "inspectJob": {
    "storageConfig": {
      "bigQueryOptions": {
        "tableReference": {
          "projectId": "my-project",
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
        "projectId": "my-project", "datasetId": "dlp", "tableId": "findings"
      }}}}
    ]
  }
}
```

### Security Command Center & SecOps

```bash
# Enable Security Command Center Premium / Enterprise (org-level)
gcloud scc settings update --organization=ORG_ID --service=security-command-center

# Subscribe a Pub/Sub topic to high-severity findings for automated response
gcloud scc notifications create high-severity-findings \
  --organization=ORG_ID \
  --description="Critical and high findings" \
  --pubsub-topic=projects/my-project/topics/scc-findings \
  --filter='severity="HIGH" OR severity="CRITICAL"'
```

Wire the Pub/Sub topic to a Cloud Function that auto-remediates well-known issues (e.g., disable a public bucket, revoke an over-broad IAM grant) and pages on-call for the rest.

### Validation Checklist

### Security by design
- [ ] Defense-in-depth at network, host, and application layers
- [ ] Threat model exists and is reviewed for major changes
- [ ] Risk assessment uses an industry framework (NIST CSF, CIS)

### Zero trust
- [ ] Default networks disabled at org level
- [ ] All apps front-ended by IAP or equivalent (no public admin endpoints)
- [ ] VPC Service Controls perimeters around sensitive data services
- [ ] Service-to-service auth via OIDC tokens; no shared secrets

### Shift-left
- [ ] All infra in IaC (Terraform); no console clicks for prod
- [ ] CI/CD includes vulnerability scan + signing
- [ ] Binary Authorization enforces signed-only deployment
- [ ] Dependency updates automated (Renovate / Dependabot)

### Preemptive defense
- [ ] Security Command Center Premium/Enterprise enabled at org
- [ ] All audit logs centralized to a SIEM or BigQuery
- [ ] Automated response for known patterns (public buckets, over-broad IAM)
- [ ] Red-team / pen-test exercises run regularly

### AI security
- [ ] AI training pipelines protected against data poisoning
- [ ] Differential privacy / data masking on training data where applicable
- [ ] Vertex Explainable AI used for governance
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
- **Cloud Armor on every public-facing load balancer** — preconfigured WAF rules cost nothing extra
- **Binary Authorization** is the only way to actually enforce "signed images only" at runtime
- **CMEK** when keys must be in your control; default Google-managed encryption is otherwise fine
- **Sensitive Data Protection** for PII discovery in BigQuery / GCS — automate, don't audit manually
- **Security Command Center Premium/Enterprise** is non-negotiable at scale; the free tier is too limited
- For AI workloads, follow Google's SAIF (Secure AI Framework) — it's the only published practical guidance
