---
name: soc2-compliance
description: >-
  Achieve SOC 2 Type II compliance for SaaS — Trust Service Criteria, evidence collection,
  and controls implementation. Use when preparing for a SOC 2 audit, meeting B2B SaaS security
  requirements, or onboarding enterprise customers who require a SOC 2 report.
license: Apache-2.0
compatibility: "Language-agnostic. Code examples in Python and Node.js."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["soc2", "compliance", "saas", "audit", "trust-services"]
  use-cases:
    - "Implement SOC 2 controls for a B2B SaaS product"
    - "Prepare evidence for a SOC 2 Type II audit"
    - "Set up automated compliance monitoring with Vanta or Drata"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# SOC 2 Compliance

## Overview

SOC 2 (System and Organization Controls 2) is an attestation framework from the AICPA for service organizations. An independent licensed CPA firm examines your controls against the Trust Services Criteria (the 2017 criteria with the revised points of focus issued in 2022) and issues a report. There is no SOC 2 "certificate" and no government registry: the deliverable is the auditor's report. A **Type I** report says controls were suitably designed at a point in time; a **Type II** report says they also operated effectively over an observation period. The AICPA sets no fixed minimum for that period; auditors commonly accept 3 months for a first report, 6 to 12 months is typical, and 12 months is the norm for renewals. Enterprise buyers often ask for a Type II report before signing.

## Instructions

1. Scope: list the systems, people, vendors and data that deliver your service, and choose the criteria (Security always; add Availability, Confidentiality, Processing Integrity or Privacy only if customers need them).
2. Run a gap assessment against the Common Criteria below, using a readiness tool or an auditor's readiness review.
3. Write and approve the policies, then implement the missing controls (MFA, encryption, logging, change control, access reviews, vendor reviews).
4. Collect evidence continuously from the first day of the observation period, not at audit time.
5. Pick an independent CPA firm early and agree the scope, period and evidence format; compliance platforms are not auditors.
6. Fix findings, review the draft report and management assertion, and repeat annually.

## Trust Service Criteria (TSC)

| Criteria | Abbrev | Required? | Description |
|----------|--------|-----------|-------------|
| Security | CC | ✅ Always | Protection against unauthorized access |
| Availability | A | Optional | System available for operation and use |
| Confidentiality | C | Optional | Information designated as confidential is protected |
| Processing Integrity | PI | Optional | Processing is complete, valid, accurate, timely |
| Privacy | P | Optional | Personal information collected, used, retained, disclosed properly |

Most SaaS companies start with **Security + Availability**. Add Confidentiality if handling sensitive data; add Privacy if handling personal data covered by GDPR/CCPA.

## Common Controls Framework (CC)

### CC1 — Control Environment
- Written security policies reviewed annually
- Code of conduct acknowledged by all staff
- Org chart with clear security accountability

### CC2 — Communication and Information
- Security policies communicated to all personnel
- Vendor risk assessments documented
- Security awareness training records

### CC3 — Risk Assessment
```markdown
Risk Register entry:
- Risk ID: RISK-001
- Title: Unauthorized database access
- Likelihood: Medium
- Impact: High
- Inherent Risk: High
- Controls: MFA, network segmentation, IAM least-privilege
- Residual Risk: Low
- Owner: CTO
- Review Date: 2026-12-15
```

### CC4 — Monitoring Activities
- Vulnerability scanning on a schedule you define in policy (weekly or monthly is common)
- Periodic access reviews (quarterly is common)
- Alerts from monitoring or intrusion detection reviewed and ticketed
SOC 2 prescribes no frequencies; auditors test that you do what your own policies say.

### CC5 — Control Activities
- Change management process with peer review
- Incident response plan tested at least annually
- Penetration testing annually (customers usually expect it, although the criteria do not name it)

### CC6 — Logical and Physical Access Controls

**MFA enforcement (Node.js example):**

```javascript
// Enforce MFA for all admin users
const requireMFA = async (req, res, next) => {
  const user = req.user;
  if (user.role === 'admin' && !user.mfaVerified) {
    return res.status(403).json({
      error: 'MFA required for admin access',
      code: 'MFA_REQUIRED'
    });
  }
  next();
};

// Log all authentication events for CC6 evidence
const logAuthEvent = async (req, userId, event, success) => {
  await db.auditLog.create({
    userId,
    event,        // 'login' | 'logout' | 'mfa_verify' | 'password_reset'
    success,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
};
```

**Access review automation:**

```python
import boto3
from datetime import datetime, timezone

def generate_access_review_report():
    """Generate quarterly access review evidence for CC6."""
    iam = boto3.client('iam')
    report = []
    
    users = [u for page in iam.get_paginator('list_users').paginate() for u in page['Users']]
    for user in users:
        login_profile = None
        try:
            login_profile = iam.get_login_profile(UserName=user['UserName'])
        except iam.exceptions.NoSuchEntityException:
            pass
        
        groups = iam.list_groups_for_user(UserName=user['UserName'])
        policies = iam.list_attached_user_policies(UserName=user['UserName'])
        
        report.append({
            "user": user['UserName'],
            "created": user['CreateDate'].isoformat(),
            "password_last_used": user['PasswordLastUsed'].isoformat() if 'PasswordLastUsed' in user else None,
            "groups": [g['GroupName'] for g in groups['Groups']],
            "policies": [p['PolicyName'] for p in policies['AttachedPolicies']],
            "has_console_access": login_profile is not None,
            "review_date": datetime.now(timezone.utc).isoformat(),
            "reviewed_by": "security-team"
        })
    
    return report
```

### CC7 — System Operations
- Infrastructure monitoring with alerts
- Log aggregation and anomaly detection
- Capacity planning reviews

### CC8 — Change Management

**Git-based change management:**

```bash
# All changes via PR (enforced in GitHub branch protection)
# - Required reviewers: 2
# - Required CI checks: tests, security scan, lint
# - No direct pushes to main

# Deployment approval record (for audit evidence)
cat deployment-log.json
# {
#   "deploy_id": "deploy-2026-1015-001",
#   "author": "alice@company.com",
#   "reviewer": "bob@company.com",
#   "approved_at": "2026-10-15T14:30:00Z",
#   "deployed_at": "2026-10-15T14:45:00Z",
#   "changes": "JIRA-123: Add MFA to admin panel",
#   "rollback_plan": "Revert commit abc123"
# }
```

### CC9 — Risk Mitigation
- Vendor management program
- Business continuity plan
- Cyber insurance

## Evidence Collection

SOC 2 auditors need **evidence** that controls operated continuously during the audit period.

| Control | Evidence Type | Frequency | Storage |
|---------|--------------|-----------|---------|
| MFA enabled | Screenshot + IAM export | Quarterly | Vanta/Drata |
| Access reviews | Signed review records | Quarterly | Google Drive |
| Vulnerability scans | Scan reports | Weekly | S3/Drive |
| Pen test | Report + remediation | Annual | Drive |
| Security training | Completion certificates | Annual | HRIS |
| Incident response test | Tabletop exercise notes | Annual | Drive |
| Encryption at rest | Config screenshot | Change-based | Drive |
| Backup tested | Restore test log | Quarterly | Drive |

## Automation Tools

### Vanta, Drata, Secureframe and similar platforms

These SaaS tools connect read-only to your cloud, identity provider, source control and HR systems, run automated tests mapped to the criteria (MFA enforcement, encryption at rest, scanning, offboarding, background checks), keep a policy library and give auditors a portal for evidence. Compare integrations, price and which audit firms they partner with; the choice does not change what the audit requires. The platform is not the auditor, and passing its dashboard is not a SOC 2 report.

## Key Policies to Write

Create these written policies (stored in a policy management system):

```markdown
Required Policies:
1. Information Security Policy
2. Access Control Policy  
3. Encryption Policy
4. Incident Response Plan
5. Business Continuity / Disaster Recovery Plan
6. Vulnerability Management Policy
7. Change Management Policy
8. Vendor Management Policy
9. Acceptable Use Policy
10. Data Classification Policy
```

**Encryption Policy example snippet:**

```markdown
## Encryption Policy

**Effective Date:** 2026-11-01
**Owner:** CTO
**Review Cycle:** Annual

### Requirements
- All data at rest classified as Confidential or Restricted MUST be encrypted 
  using AES-256 or equivalent.
- All data in transit MUST use TLS 1.2 or higher.
- Encryption keys MUST be stored separately from encrypted data, in an 
  approved key management system (AWS KMS, GCP KMS, or HashiCorp Vault).
- Keys MUST be rotated annually or upon suspected compromise.
```

## SOC 2 Timeline

| Phase | Duration | Activities |
|-------|----------|-----------|
| Readiness assessment | 4-6 weeks | Gap analysis, policy writing |
| Remediation | 2-4 months | Implement controls, fix gaps |
| Evidence collection period (Type II) | 3-12 months | Run controls, collect evidence |
| Auditor fieldwork | 4-8 weeks | Auditor reviews evidence |
| Report issuance | 2-4 weeks | Final report, management response |

**Typical timeline from start to a first Type II report: 6-15 months depending on the observation period you and the auditor agree. A Type I report can be issued sooner as a stopgap.**

## Compliance Checklist

- [ ] Scope defined (which systems handle customer data)
- [ ] Auditor selected (independent licensed CPA firm)
- [ ] Security policies written and approved
- [ ] MFA enforced for all users
- [ ] Encryption at rest and in transit enabled
- [ ] Vulnerability scanning automated
- [ ] Access review process established
- [ ] Change management process documented
- [ ] Incident response plan written and tested
- [ ] Vendor risk assessments completed
- [ ] Background checks for employees
- [ ] Security awareness training completed
- [ ] Evidence collection tool in place (Vanta/Drata/Secureframe)

## Examples

### Example 1: Gap assessment for a Series A SaaS

User: "We are an AWS and GitHub shop with 40 people and a customer asking for SOC 2 Type II. What do we do first?"

Scope the production AWS account, GitHub, the identity provider and the support tooling; choose Security plus Availability; list missing controls against CC1 to CC9 (typically: written policies, MFA on every account, branch protection with required review, quarterly access reviews, vendor reviews, a tested incident plan). Output a gap table with owner and due date per item and a recommended start date for the observation period.

### Example 2: Quarterly access review evidence

User: "Generate the IAM access review for CC6 this quarter."

Run `generate_access_review_report()` from this skill, write the JSON to the evidence folder with the date in the file name, have the system owner sign off, and file any removed accounts as tickets. Result: a dated export, a reviewer name and linked remediation tickets that an auditor can sample.

## Guidelines

- Do not claim you are "SOC 2 certified" or "compliant" before a CPA firm has issued a report; say "SOC 2 Type II report available under NDA".
- Evidence must be dated, attributable and retained for the whole period; a screenshot taken the week before the audit does not show continuous operation.
- Write policies you can actually follow: auditors test against your own documents, so an unrealistic policy creates exceptions.
- Keep scope small and accurate; every extra system and vendor adds testing.
- Controls here are a starting point. The auditor decides the final control set and testing; confirm specifics with them.
- This is guidance, not legal or audit advice.
