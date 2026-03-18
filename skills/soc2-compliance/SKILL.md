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
  version: "1.0.0"
  category: compliance
  tags: ["soc2", "compliance", "saas", "audit", "security", "b2b"]
  use-cases:
    - "Implement SOC 2 controls for a B2B SaaS product"
    - "Prepare evidence for a SOC 2 Type II audit"
    - "Set up automated compliance monitoring with Vanta or Drata"
  agents: [claude-code, openai-codex, gemini-cli, cursor]
---

# SOC 2 Compliance

## Overview

SOC 2 (System and Organization Controls 2) is an auditing standard developed by the AICPA for service organizations. A SOC 2 Type II report covers a period of 6-12 months, demonstrating controls are operating effectively — not just designed. Enterprise buyers almost universally require SOC 2 before signing contracts.

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
- Review Date: 2025-01-15
```

### CC4 — Monitoring Activities
- Automated vulnerability scanning (weekly minimum)
- Quarterly access reviews
- Intrusion detection alerts reviewed daily

### CC5 — Control Activities
- Change management process with peer review
- Incident response plan tested annually
- Penetration testing annually

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
const logAuthEvent = async (userId, event, success, ipAddress) => {
  await db.auditLog.create({
    userId,
    event,        // 'login' | 'logout' | 'mfa_verify' | 'password_reset'
    success,
    ipAddress,
    userAgent: req.headers['user-agent'],
    timestamp: new Date().toISOString()
  });
};
```

**Access review automation:**

```python
import boto3
from datetime import datetime, timedelta

def generate_access_review_report():
    """Generate quarterly access review evidence for CC6."""
    iam = boto3.client('iam')
    report = []
    
    users = iam.list_users()['Users']
    for user in users:
        # Check last activity
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
            "groups": [g['GroupName'] for g in groups['Groups']],
            "policies": [p['PolicyName'] for p in policies['AttachedPolicies']],
            "has_console_access": login_profile is not None,
            "review_date": datetime.utcnow().isoformat(),
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
#   "deploy_id": "deploy-2024-0115-001",
#   "author": "alice@company.com",
#   "reviewer": "bob@company.com",
#   "approved_at": "2024-01-15T14:30:00Z",
#   "deployed_at": "2024-01-15T14:45:00Z",
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

### Vanta (recommended for startups)

```bash
# Vanta connects to your cloud accounts and auto-collects evidence
# Integrations: AWS, GCP, Azure, GitHub, Okta, Google Workspace, Slack

# After connecting, Vanta auto-monitors:
# - MFA enforcement (CC6.1)
# - Encryption at rest (CC6.7)
# - Vulnerability scanning (CC7.1)
# - Background checks (CC1.1)
# - Access reviews (CC6.2)
```

### Drata / Secureframe

Both offer similar automation: continuous control monitoring + auditor portal for evidence sharing. Drata is strong on integrations; Secureframe has a good self-service audit experience.

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

**Effective Date:** 2024-01-01
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
| Evidence collection period (Type II) | 6-12 months | Run controls, collect evidence |
| Auditor fieldwork | 4-8 weeks | Auditor reviews evidence |
| Report issuance | 2-4 weeks | Final report, management response |

**Total Type II timeline: ~12-18 months from start to report.**

## Compliance Checklist

- [ ] Scope defined (which systems handle customer data)
- [ ] Auditor selected (AICPA-licensed CPA firm)
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
