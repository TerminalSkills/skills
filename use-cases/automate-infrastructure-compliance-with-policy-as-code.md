---
title: Automate Infrastructure Compliance with Policy-as-Code
slug: automate-infrastructure-compliance-with-policy-as-code
description: >
  Replace manual compliance checklists with automated policy enforcement
  in CI/CD — catching misconfigurations before they reach production and
  cutting audit prep from 3 weeks to 2 days.
skills:
  - typescript
  - terraform-iac
  - docker
  - github-actions
  - postgresql
  - zod
category: DevOps & Infrastructure
tags:
  - policy-as-code
  - compliance
  - opa
  - terraform
  - security
  - audit
---

# Automate Infrastructure Compliance with Policy-as-Code

## The Problem

Kenji is a platform engineer at a fintech company with 200+ Terraform resources across 3 AWS accounts. Every quarter, auditors spend 3 weeks reviewing infrastructure configs for SOC 2 and PCI-DSS compliance. Last quarter, auditors found 14 violations — S3 buckets without encryption, security groups with 0.0.0.0/0, and RDS instances without backup enabled. Each violation cost $5K-$15K to remediate urgently, and the audit itself cost $40K in billable hours. Worse, three violations had been in production for months — manual reviews simply can't keep up with 50+ Terraform changes per week.

Kenji needs:
- **Pre-deploy policy checks** — block non-compliant infrastructure in CI before it reaches AWS
- **Continuous drift detection** — find resources that were modified outside Terraform
- **Policy library** covering SOC 2, PCI-DSS, and CIS AWS benchmarks
- **Exception workflow** — approved exceptions with expiration dates, not permanent bypasses
- **Audit evidence** — auto-generated compliance reports for auditors
- **Developer-friendly feedback** — clear error messages telling engineers exactly what to fix

## Step 1: Define Policies as Structured Rules

Express compliance requirements as data, not just documentation. Each policy maps to a specific control from SOC 2, PCI-DSS, or CIS.

```typescript
// src/policies/types.ts
// Policy definition schema — maps compliance controls to Terraform checks

import { z } from 'zod';

export const PolicySeverity = z.enum(['critical', 'high', 'medium', 'low']);

export const Policy = z.object({
  id: z.string().regex(/^POL-\d{4}$/),          // e.g., POL-0001
  title: z.string(),
  description: z.string(),
  severity: PolicySeverity,
  controls: z.array(z.string()),                  // e.g., ['SOC2-CC6.1', 'PCI-DSS-2.2']
  resourceTypes: z.array(z.string()),             // Terraform resource types
  check: z.function()
    .args(z.any())                                // Terraform resource config
    .returns(z.object({
      compliant: z.boolean(),
      message: z.string(),
      remediation: z.string(),
    })),
  enabled: z.boolean().default(true),
});

export type Policy = z.infer<typeof Policy>;
export type PolicyResult = {
  policyId: string;
  resourceAddress: string;
  resourceType: string;
  compliant: boolean;
  severity: string;
  message: string;
  remediation: string;
  controls: string[];
};
```

```typescript
// src/policies/aws-policies.ts
// Concrete policy implementations for AWS resources

import type { Policy } from './types';

export const policies: Policy[] = [
  {
    id: 'POL-0001',
    title: 'S3 buckets must have server-side encryption enabled',
    description: 'All S3 buckets must use AES-256 or KMS encryption at rest',
    severity: 'critical',
    controls: ['SOC2-CC6.1', 'PCI-DSS-3.4', 'CIS-2.1.1'],
    resourceTypes: ['aws_s3_bucket'],
    enabled: true,
    check: (resource: any) => {
      const encryption = resource.server_side_encryption_configuration;
      if (!encryption?.rule?.apply_server_side_encryption_by_default) {
        return {
          compliant: false,
          message: 'S3 bucket has no server-side encryption configured',
          remediation: `Add server_side_encryption_configuration block with sse_algorithm = "aws:kms"`,
        };
      }
      return { compliant: true, message: 'Encryption enabled', remediation: '' };
    },
  },

  {
    id: 'POL-0002',
    title: 'Security groups must not allow unrestricted ingress',
    description: 'No security group should allow 0.0.0.0/0 on any port except 443',
    severity: 'critical',
    controls: ['SOC2-CC6.6', 'PCI-DSS-1.3', 'CIS-5.2'],
    resourceTypes: ['aws_security_group', 'aws_security_group_rule'],
    enabled: true,
    check: (resource: any) => {
      const rules = resource.ingress ?? [];
      for (const rule of rules) {
        const cidrs = [...(rule.cidr_blocks ?? []), ...(rule.ipv6_cidr_blocks ?? [])];
        const isOpen = cidrs.some((c: string) => c === '0.0.0.0/0' || c === '::/0');
        const isHttps = rule.from_port === 443 && rule.to_port === 443;
        if (isOpen && !isHttps) {
          return {
            compliant: false,
            message: `Unrestricted ingress on port ${rule.from_port}-${rule.to_port}`,
            remediation: 'Restrict cidr_blocks to specific IPs or use 443 only for public access',
          };
        }
      }
      return { compliant: true, message: 'No unrestricted ingress', remediation: '' };
    },
  },

  {
    id: 'POL-0003',
    title: 'RDS instances must have automated backups enabled',
    description: 'All RDS instances must have backup_retention_period >= 7 days',
    severity: 'high',
    controls: ['SOC2-A1.2', 'PCI-DSS-12.10'],
    resourceTypes: ['aws_db_instance'],
    enabled: true,
    check: (resource: any) => {
      const retention = resource.backup_retention_period ?? 0;
      if (retention < 7) {
        return {
          compliant: false,
          message: `Backup retention is ${retention} days (minimum: 7)`,
          remediation: 'Set backup_retention_period = 7 or higher',
        };
      }
      return { compliant: true, message: `${retention}-day retention`, remediation: '' };
    },
  },

  {
    id: 'POL-0004',
    title: 'CloudTrail must be enabled in all regions',
    description: 'AWS CloudTrail must log API calls across all regions for audit trail',
    severity: 'critical',
    controls: ['SOC2-CC7.2', 'PCI-DSS-10.1', 'CIS-3.1'],
    resourceTypes: ['aws_cloudtrail'],
    enabled: true,
    check: (resource: any) => {
      if (!resource.is_multi_region_trail) {
        return {
          compliant: false,
          message: 'CloudTrail is not configured for all regions',
          remediation: 'Set is_multi_region_trail = true',
        };
      }
      if (!resource.enable_log_file_validation) {
        return {
          compliant: false,
          message: 'Log file validation is disabled — logs could be tampered',
          remediation: 'Set enable_log_file_validation = true',
        };
      }
      return { compliant: true, message: 'Multi-region with validation', remediation: '' };
    },
  },

  {
    id: 'POL-0005',
    title: 'EBS volumes must be encrypted',
    description: 'All EBS volumes must use KMS encryption',
    severity: 'high',
    controls: ['SOC2-CC6.1', 'PCI-DSS-3.4'],
    resourceTypes: ['aws_ebs_volume', 'aws_instance'],
    enabled: true,
    check: (resource: any) => {
      // For aws_instance, check root_block_device
      if (resource.root_block_device) {
        const encrypted = resource.root_block_device.some?.((d: any) => d.encrypted);
        if (!encrypted) {
          return {
            compliant: false,
            message: 'Root EBS volume is not encrypted',
            remediation: 'Set root_block_device { encrypted = true }',
          };
        }
      }
      // For aws_ebs_volume
      if (resource.encrypted === false || resource.encrypted === undefined) {
        return {
          compliant: false,
          message: 'EBS volume is not encrypted',
          remediation: 'Set encrypted = true and optionally specify kms_key_id',
        };
      }
      return { compliant: true, message: 'Encrypted', remediation: '' };
    },
  },
];
```

## Step 2: Terraform Plan Scanner

Parse `terraform plan` output and evaluate every resource against the policy library.

```typescript
// src/scanner/plan-scanner.ts
// Scans terraform plan JSON output against policy library

import type { Policy, PolicyResult } from '../policies/types';

interface TerraformPlan {
  planned_values: {
    root_module: {
      resources: Array<{
        address: string;
        type: string;
        values: Record<string, unknown>;
      }>;
      child_modules?: Array<{
        resources: Array<{
          address: string;
          type: string;
          values: Record<string, unknown>;
        }>;
      }>;
    };
  };
}

export function scanPlan(
  plan: TerraformPlan,
  policies: Policy[],
  exceptions: Map<string, { expiresAt: Date; reason: string }>
): PolicyResult[] {
  const results: PolicyResult[] = [];

  // Flatten all resources from root and child modules
  const resources = [
    ...plan.planned_values.root_module.resources,
    ...(plan.planned_values.root_module.child_modules ?? [])
      .flatMap((m) => m.resources),
  ];

  for (const resource of resources) {
    for (const policy of policies) {
      if (!policy.enabled) continue;
      if (!policy.resourceTypes.includes(resource.type)) continue;

      // Check for active exception
      const exKey = `${policy.id}:${resource.address}`;
      const exception = exceptions.get(exKey);
      if (exception && exception.expiresAt > new Date()) {
        results.push({
          policyId: policy.id,
          resourceAddress: resource.address,
          resourceType: resource.type,
          compliant: true,  // exception active
          severity: policy.severity,
          message: `Exception: ${exception.reason} (expires ${exception.expiresAt.toISOString()})`,
          remediation: '',
          controls: policy.controls,
        });
        continue;
      }

      const check = policy.check(resource.values);
      results.push({
        policyId: policy.id,
        resourceAddress: resource.address,
        resourceType: resource.type,
        compliant: check.compliant,
        severity: policy.severity,
        message: check.message,
        remediation: check.remediation,
        controls: policy.controls,
      });
    }
  }

  return results;
}

export function formatResults(results: PolicyResult[]): string {
  const violations = results.filter((r) => !r.compliant);
  const passed = results.filter((r) => r.compliant);

  let output = `## Policy Scan Results\n\n`;
  output += `✅ ${passed.length} passed | ❌ ${violations.length} violations\n\n`;

  if (violations.length === 0) {
    output += 'All resources comply with policy requirements.\n';
    return output;
  }

  // Group by severity
  for (const severity of ['critical', 'high', 'medium', 'low']) {
    const sev = violations.filter((v) => v.severity === severity);
    if (sev.length === 0) continue;

    output += `### ${severity.toUpperCase()} (${sev.length})\n\n`;
    for (const v of sev) {
      output += `- **${v.policyId}**: ${v.message}\n`;
      output += `  Resource: \`${v.resourceAddress}\`\n`;
      output += `  Controls: ${v.controls.join(', ')}\n`;
      output += `  Fix: ${v.remediation}\n\n`;
    }
  }

  return output;
}
```

## Step 3: CI/CD Integration with GitHub Actions

Block non-compliant Terraform applies in CI. Critical violations fail the pipeline; medium/low are warnings.

```yaml
# .github/workflows/terraform-compliance.yml
# Runs policy checks on every Terraform PR

name: Infrastructure Compliance
on:
  pull_request:
    paths: ['terraform/**']

jobs:
  policy-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: 1.7.0

      - name: Terraform Init
        working-directory: terraform/
        run: terraform init -backend=false

      - name: Terraform Plan (JSON output)
        working-directory: terraform/
        run: |
          terraform plan -out=plan.bin -no-color
          terraform show -json plan.bin > plan.json

      - name: Run Policy Scanner
        id: scan
        run: |
          node dist/cli.js scan \
            --plan terraform/plan.json \
            --policies src/policies/aws-policies.ts \
            --exceptions .policy-exceptions.json \
            --output results.json \
            --format github

      - name: Post Results to PR
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const results = JSON.parse(fs.readFileSync('results.json', 'utf8'));
            const body = results.markdown;
            
            // Find existing comment to update
            const { data: comments } = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });
            const existing = comments.find(c => 
              c.body.includes('## Policy Scan Results')
            );
            
            if (existing) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: existing.id,
                body,
              });
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: context.issue.number,
                body,
              });
            }

      - name: Fail on Critical/High Violations
        if: steps.scan.outputs.critical_count > 0 || steps.scan.outputs.high_count > 0
        run: |
          echo "❌ Found ${{ steps.scan.outputs.critical_count }} critical and ${{ steps.scan.outputs.high_count }} high violations"
          exit 1
```

## Step 4: Drift Detection Cron

Detect resources that were changed outside Terraform — manual AWS console changes, emergency fixes, etc.

```typescript
// src/drift/detector.ts
// Compares Terraform state against live AWS resources

import { execSync } from 'child_process';
import { scanPlan } from '../scanner/plan-scanner';
import { policies } from '../policies/aws-policies';

export async function detectDrift(
  workingDir: string
): Promise<{ drifted: number; violations: number; report: string }> {
  // Run terraform plan to detect drift
  execSync('terraform plan -detailed-exitcode -out=drift.bin 2>&1 || true', {
    cwd: workingDir,
  });

  const planJson = execSync('terraform show -json drift.bin', {
    cwd: workingDir,
  }).toString();

  const plan = JSON.parse(planJson);

  // Count drifted resources (plan has changes)
  const changes = plan.resource_changes?.filter(
    (c: any) => c.change.actions.some((a: string) => a !== 'no-op')
  ) ?? [];

  // Scan current state against policies
  const results = scanPlan(plan, policies, new Map());
  const violations = results.filter((r) => !r.compliant);

  let report = `# Drift Detection Report\n\n`;
  report += `**Date**: ${new Date().toISOString()}\n`;
  report += `**Drifted resources**: ${changes.length}\n`;
  report += `**Policy violations**: ${violations.length}\n\n`;

  if (changes.length > 0) {
    report += `## Drifted Resources\n\n`;
    for (const change of changes) {
      report += `- \`${change.address}\`: ${change.change.actions.join(', ')}\n`;
    }
    report += '\n';
  }

  return {
    drifted: changes.length,
    violations: violations.length,
    report,
  };
}
```

## Step 5: Compliance Report Generator

Auto-generate audit evidence that maps policies to compliance controls.

```typescript
// src/reports/compliance-report.ts
// Generates audit-ready compliance report with evidence

import { Pool } from 'pg';
import type { PolicyResult } from '../policies/types';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

export async function generateComplianceReport(
  framework: 'soc2' | 'pci-dss' | 'cis',
  dateRange: { from: Date; to: Date }
): Promise<string> {
  // Get all scan results for the period
  const results = await db.query(`
    SELECT * FROM policy_scan_results
    WHERE scanned_at BETWEEN $1 AND $2
    ORDER BY scanned_at DESC
  `, [dateRange.from, dateRange.to]);

  // Group by control
  const controlMap = new Map<string, PolicyResult[]>();
  for (const result of results.rows) {
    for (const control of result.controls) {
      if (!controlMap.has(control)) controlMap.set(control, []);
      controlMap.get(control)!.push(result);
    }
  }

  let report = `# ${framework.toUpperCase()} Compliance Report\n\n`;
  report += `**Period**: ${dateRange.from.toISOString().split('T')[0]} to ${dateRange.to.toISOString().split('T')[0]}\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Total scans**: ${results.rows.length}\n\n`;

  const prefix = framework === 'soc2' ? 'SOC2' :
                 framework === 'pci-dss' ? 'PCI-DSS' : 'CIS';

  // Filter to relevant controls
  const relevant = [...controlMap.entries()]
    .filter(([k]) => k.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [control, checks] of relevant) {
    const allCompliant = checks.every((c) => c.compliant);
    const status = allCompliant ? '✅ PASS' : '❌ FAIL';

    report += `## ${control} — ${status}\n\n`;
    report += `Checked ${checks.length} times during period.\n`;

    if (!allCompliant) {
      const violations = checks.filter((c) => !c.compliant);
      report += `\n**Violations** (${violations.length}):\n`;
      for (const v of violations.slice(0, 5)) {
        report += `- ${v.resourceAddress}: ${v.message}\n`;
      }
    }

    report += '\n';
  }

  return report;
}
```

## Results

After 6 months of policy-as-code enforcement:

- **Audit prep time** dropped from 3 weeks to 2 days — reports auto-generated with full evidence
- **Zero critical violations** reaching production — all caught in CI
- **Compliance violations** went from 14/quarter to 0 — policies prevent creation of non-compliant resources
- **$40K/year saved** in external audit billable hours (auditors review reports, not infrastructure)
- **Developer feedback loop**: 90% of violations fixed in the same PR, within 30 minutes of opening
- **Exception process** formalized — 12 exceptions granted with expiration dates, 0 permanent bypasses
- **Drift detection** catches 3-5 manual changes per week, auto-creates remediation PRs
- **New policy deployment**: adding a new compliance rule takes 15 minutes, not a documentation update cycle
