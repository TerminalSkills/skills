---
title: Build an Automated Compliance Evidence Collector
slug: build-automated-compliance-evidence-collector
description: >
  Automate SOC 2 and ISO 27001 evidence collection from AWS, GitHub,
  and HR systems — reducing audit prep from 6 weeks to 3 days and
  generating continuous compliance dashboards for investors.
skills:
  - typescript
  - postgresql
  - redis
  - hono
  - zod
  - github-actions
category: development
tags:
  - compliance
  - soc2
  - iso-27001
  - audit
  - evidence-collection
  - governance
---

# Build an Automated Compliance Evidence Collector

## The Problem

A 50-person SaaS startup needs SOC 2 Type II for enterprise sales. Their auditor requests 150+ pieces of evidence: access reviews, encryption configs, backup logs, code review records, employee training completions. The engineering team manually screenshots AWS consoles, exports GitHub PR histories, and compiles spreadsheets. Audit prep takes 6 weeks of part-time work from 4 engineers. Last year, they failed 3 controls because evidence was stale — screenshots were from 6 months ago, not current state.

## Step 1: Evidence Requirement Registry

```typescript
// src/compliance/registry.ts
import { z } from 'zod';

export const EvidenceRequirement = z.object({
  id: z.string(),
  framework: z.enum(['soc2', 'iso27001', 'hipaa', 'gdpr']),
  control: z.string(),          // e.g., "CC6.1" for SOC 2
  controlName: z.string(),
  description: z.string(),
  evidenceType: z.enum(['config_snapshot', 'access_review', 'log_export', 'policy_doc', 'training_record', 'metric']),
  source: z.enum(['aws', 'github', 'okta', 'hr_system', 'manual']),
  collector: z.string(),        // function name
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'on_demand']),
  retentionDays: z.number().int(),
});

export const requirements: z.infer<typeof EvidenceRequirement>[] = [
  {
    id: 'soc2-cc6.1-encryption',
    framework: 'soc2',
    control: 'CC6.1',
    controlName: 'Logical and Physical Access Controls',
    description: 'Evidence that data at rest is encrypted',
    evidenceType: 'config_snapshot',
    source: 'aws',
    collector: 'collect-aws-encryption',
    frequency: 'weekly',
    retentionDays: 400,
  },
  {
    id: 'soc2-cc6.1-access-review',
    framework: 'soc2',
    control: 'CC6.1',
    controlName: 'Logical and Physical Access Controls',
    description: 'Quarterly access review showing appropriate permissions',
    evidenceType: 'access_review',
    source: 'aws',
    collector: 'collect-iam-access-review',
    frequency: 'quarterly',
    retentionDays: 400,
  },
  {
    id: 'soc2-cc8.1-code-review',
    framework: 'soc2',
    control: 'CC8.1',
    controlName: 'Change Management',
    description: 'Evidence that all production changes are peer-reviewed',
    evidenceType: 'log_export',
    source: 'github',
    collector: 'collect-pr-reviews',
    frequency: 'weekly',
    retentionDays: 400,
  },
  {
    id: 'soc2-cc7.2-monitoring',
    framework: 'soc2',
    control: 'CC7.2',
    controlName: 'System Monitoring',
    description: 'Evidence of security monitoring and alerting',
    evidenceType: 'config_snapshot',
    source: 'aws',
    collector: 'collect-cloudwatch-alarms',
    frequency: 'monthly',
    retentionDays: 400,
  },
  {
    id: 'soc2-cc1.4-training',
    framework: 'soc2',
    control: 'CC1.4',
    controlName: 'Security Awareness Training',
    description: 'Evidence that all employees completed security training',
    evidenceType: 'training_record',
    source: 'hr_system',
    collector: 'collect-training-records',
    frequency: 'quarterly',
    retentionDays: 400,
  },
];
```

## Step 2: Evidence Collectors

```typescript
// src/compliance/collectors.ts
import { IAMClient, ListUsersCommand, ListAttachedUserPoliciesCommand, GetLoginProfileCommand } from '@aws-sdk/client-iam';
import { RDSClient, DescribeDBInstancesCommand } from '@aws-sdk/client-rds';
import { S3Client, GetBucketEncryptionCommand, ListBucketsCommand } from '@aws-sdk/client-s3';
import { Pool } from 'pg';

const iam = new IAMClient({});
const rds = new RDSClient({});
const s3 = new S3Client({});
const db = new Pool({ connectionString: process.env.DATABASE_URL });

interface Evidence {
  requirementId: string;
  collectedAt: string;
  data: Record<string, unknown>;
  status: 'pass' | 'fail' | 'warning';
  details: string;
}

export const collectors: Record<string, () => Promise<Evidence>> = {
  'collect-aws-encryption': async () => {
    // Check RDS encryption
    const rdsInstances = await rds.send(new DescribeDBInstancesCommand({}));
    const unencrypted = (rdsInstances.DBInstances ?? []).filter(db => !db.StorageEncrypted);

    // Check S3 bucket encryption
    const buckets = await s3.send(new ListBucketsCommand({}));
    const bucketResults = [];
    for (const bucket of buckets.Buckets ?? []) {
      try {
        await s3.send(new GetBucketEncryptionCommand({ Bucket: bucket.Name }));
        bucketResults.push({ bucket: bucket.Name, encrypted: true });
      } catch {
        bucketResults.push({ bucket: bucket.Name, encrypted: false });
      }
    }
    const unencryptedBuckets = bucketResults.filter(b => !b.encrypted);

    const passed = unencrypted.length === 0 && unencryptedBuckets.length === 0;

    return {
      requirementId: 'soc2-cc6.1-encryption',
      collectedAt: new Date().toISOString(),
      data: {
        rdsInstances: rdsInstances.DBInstances?.map(db => ({
          id: db.DBInstanceIdentifier, encrypted: db.StorageEncrypted, engine: db.Engine,
        })),
        s3Buckets: bucketResults,
      },
      status: passed ? 'pass' : 'fail',
      details: passed
        ? 'All RDS instances and S3 buckets are encrypted'
        : `${unencrypted.length} unencrypted RDS, ${unencryptedBuckets.length} unencrypted S3 buckets`,
    };
  },

  'collect-pr-reviews': async () => {
    const token = process.env.GITHUB_TOKEN;
    const org = process.env.GITHUB_ORG;

    // Fetch merged PRs from last period
    const res = await fetch(
      `https://api.github.com/search/issues?q=org:${org}+is:pr+is:merged+merged:>${thirtyDaysAgo()}`,
      { headers: { Authorization: `token ${token}` } }
    );
    const data = await res.json() as any;

    const prs = data.items ?? [];
    const unreviewed = prs.filter((pr: any) => pr.pull_request?.review_comments === 0);
    const reviewRate = prs.length > 0 ? (prs.length - unreviewed.length) / prs.length : 1;

    return {
      requirementId: 'soc2-cc8.1-code-review',
      collectedAt: new Date().toISOString(),
      data: {
        totalPRs: prs.length,
        reviewedPRs: prs.length - unreviewed.length,
        unreviewedPRs: unreviewed.map((pr: any) => ({ url: pr.html_url, title: pr.title })),
        reviewRate: `${(reviewRate * 100).toFixed(1)}%`,
      },
      status: reviewRate >= 0.95 ? 'pass' : reviewRate >= 0.85 ? 'warning' : 'fail',
      details: `${(reviewRate * 100).toFixed(1)}% of PRs reviewed (${prs.length} total)`,
    };
  },

  'collect-iam-access-review': async () => {
    const users = await iam.send(new ListUsersCommand({}));
    const accessDetails = [];

    for (const user of users.Users ?? []) {
      const policies = await iam.send(new ListAttachedUserPoliciesCommand({ UserName: user.UserName }));
      let hasConsoleAccess = false;
      try {
        await iam.send(new GetLoginProfileCommand({ UserName: user.UserName }));
        hasConsoleAccess = true;
      } catch {}

      accessDetails.push({
        userName: user.UserName,
        policies: policies.AttachedPolicies?.map(p => p.PolicyName),
        hasConsoleAccess,
        lastActivity: user.PasswordLastUsed?.toISOString() ?? 'never',
        mfaEnabled: false, // would check separately
      });
    }

    const staleUsers = accessDetails.filter(u =>
      u.lastActivity === 'never' || new Date(u.lastActivity) < new Date(Date.now() - 90 * 86400000)
    );

    return {
      requirementId: 'soc2-cc6.1-access-review',
      collectedAt: new Date().toISOString(),
      data: { users: accessDetails, staleUsers },
      status: staleUsers.length === 0 ? 'pass' : 'warning',
      details: `${accessDetails.length} users, ${staleUsers.length} stale (90+ days inactive)`,
    };
  },
};

function thirtyDaysAgo(): string {
  return new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
}
```

## Step 3: Compliance Dashboard

```typescript
// src/api/compliance.ts
import { Hono } from 'hono';
import { Pool } from 'pg';

const app = new Hono();
const db = new Pool({ connectionString: process.env.DATABASE_URL });

app.get('/v1/compliance/dashboard', async (c) => {
  const { rows: controls } = await db.query(`
    SELECT r.control, r.control_name, r.framework,
      e.status, e.collected_at, e.details
    FROM evidence e
    JOIN (SELECT requirement_id, MAX(collected_at) as latest
          FROM evidence GROUP BY requirement_id) latest
      ON e.requirement_id = latest.requirement_id AND e.collected_at = latest.latest
    JOIN requirements r ON e.requirement_id = r.id
    ORDER BY r.framework, r.control
  `);

  const summary = {
    total: controls.length,
    passing: controls.filter(c => c.status === 'pass').length,
    failing: controls.filter(c => c.status === 'fail').length,
    warnings: controls.filter(c => c.status === 'warning').length,
    complianceRate: controls.length > 0
      ? (controls.filter(c => c.status === 'pass').length / controls.length * 100).toFixed(1) + '%'
      : 'N/A',
  };

  return c.json({ summary, controls });
});

export default app;
```

## Results

- **Audit prep time**: 3 days (was 6 weeks)
- **Evidence freshness**: always current (was 6 months stale)
- **Failed controls**: zero (was 3 in previous audit)
- **Continuous compliance**: dashboard shows real-time status for investors
- **Engineer time**: 2 hours/quarter for audit support (was 160+ hours/year across 4 engineers)
- **Stale IAM users**: found 4 with 90+ day inactive accounts — security gap closed
- **Unreviewed PRs**: caught 3% bypass rate — branch protection tightened
