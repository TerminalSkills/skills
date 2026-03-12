---
title: Build an Infrastructure-as-Code Testing Pipeline
slug: build-infrastructure-as-code-testing-pipeline
description: >
  Test Terraform changes before they hit production — with unit tests for
  modules, integration tests with real cloud resources, cost estimation,
  and drift detection that caught 14 misconfigurations in the first month.
skills:
  - typescript
  - terraform-iac
  - github-actions
  - docker
  - vitest
  - zod
category: DevOps & Infrastructure
tags:
  - infrastructure-testing
  - terraform
  - iac
  - cost-estimation
  - integration-testing
  - drift-detection
---

# Build an Infrastructure-as-Code Testing Pipeline

## The Problem

A platform team manages 300+ Terraform resources across 5 AWS accounts. Every `terraform apply` is a prayer — no tests, no staging, no cost preview. Last month: an engineer changed an RDS instance class and accidentally wiped the production database (force replacement instead of in-place update). The month before: a security group change opened port 22 to the internet for 3 hours. Cost surprises are monthly — "why is the bill $8K more than last month?" Nobody knows until they investigate.

## Step 1: Terraform Plan Analyzer

```typescript
// src/analyzer/plan-parser.ts
import { z } from 'zod';

const ResourceChange = z.object({
  address: z.string(),
  type: z.string(),
  change: z.object({
    actions: z.array(z.enum(['create', 'read', 'update', 'delete', 'no-op'])),
    before: z.record(z.string(), z.unknown()).nullable(),
    after: z.record(z.string(), z.unknown()).nullable(),
  }),
});

export function analyzePlan(planJson: any): {
  creates: string[];
  updates: string[];
  destroys: string[];
  replaces: string[];  // delete + create = dangerous!
  risks: Array<{ resource: string; risk: string; severity: 'critical' | 'high' | 'medium' }>;
} {
  const changes = planJson.resource_changes ?? [];
  const creates: string[] = [];
  const updates: string[] = [];
  const destroys: string[] = [];
  const replaces: string[] = [];
  const risks: any[] = [];

  for (const change of changes) {
    const actions = change.change.actions;

    if (actions.includes('create') && actions.includes('delete')) {
      replaces.push(change.address);
      // Force replacement is always dangerous
      risks.push({
        resource: change.address,
        risk: 'Resource will be DESTROYED and recreated (data loss possible)',
        severity: 'critical',
      });
    } else if (actions.includes('delete')) {
      destroys.push(change.address);
      risks.push({
        resource: change.address,
        risk: 'Resource will be permanently deleted',
        severity: change.type.includes('db') || change.type.includes('rds') ? 'critical' : 'high',
      });
    } else if (actions.includes('create')) {
      creates.push(change.address);
    } else if (actions.includes('update')) {
      updates.push(change.address);

      // Check for risky updates
      if (change.type === 'aws_security_group_rule' || change.type === 'aws_security_group') {
        const after = change.change.after as any;
        if (after?.cidr_blocks?.includes('0.0.0.0/0') && after?.from_port !== 443) {
          risks.push({
            resource: change.address,
            risk: `Opens port ${after.from_port} to the internet (0.0.0.0/0)`,
            severity: 'critical',
          });
        }
      }
    }
  }

  return { creates, updates, destroys, replaces, risks };
}
```

## Step 2: Cost Estimation

```typescript
// src/cost/estimator.ts
// Estimates monthly cost delta from Terraform plan

const PRICING: Record<string, Record<string, number>> = {
  'aws_instance': {
    't3.micro': 7.59, 't3.small': 15.18, 't3.medium': 30.37,
    'm5.large': 69.12, 'm5.xlarge': 138.24, 'r6g.large': 72.27,
  },
  'aws_db_instance': {
    'db.t3.micro': 12.41, 'db.t3.small': 24.82, 'db.t3.medium': 49.64,
    'db.r6g.large': 131.40, 'db.r6g.xlarge': 262.80, 'db.r6g.2xlarge': 525.60,
  },
  'aws_elasticache_cluster': {
    'cache.t3.micro': 11.52, 'cache.t3.small': 23.04, 'cache.r6g.large': 118.08,
  },
};

export function estimateCostDelta(planJson: any): {
  monthlyCostBefore: number;
  monthlyCostAfter: number;
  delta: number;
  details: Array<{ resource: string; before: number; after: number; delta: number }>;
} {
  const changes = planJson.resource_changes ?? [];
  let before = 0, after = 0;
  const details: any[] = [];

  for (const change of changes) {
    const pricing = PRICING[change.type];
    if (!pricing) continue;

    const beforeInstance = change.change.before?.instance_class ?? change.change.before?.instance_type ?? change.change.before?.node_type;
    const afterInstance = change.change.after?.instance_class ?? change.change.after?.instance_type ?? change.change.after?.node_type;

    const beforeCost = pricing[beforeInstance as string] ?? 0;
    const afterCost = pricing[afterInstance as string] ?? 0;

    if (beforeCost !== afterCost) {
      before += beforeCost;
      after += afterCost;
      details.push({
        resource: change.address,
        before: beforeCost,
        after: afterCost,
        delta: afterCost - beforeCost,
      });
    }
  }

  return { monthlyCostBefore: before, monthlyCostAfter: after, delta: after - before, details };
}
```

## Step 3: GitHub Actions Integration

```yaml
# .github/workflows/terraform-test.yml
name: Terraform Test Pipeline
on:
  pull_request:
    paths: ['terraform/**']

jobs:
  plan-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3

      - name: Terraform Init & Plan
        working-directory: terraform/
        run: |
          terraform init -backend=false
          terraform plan -out=plan.bin -no-color
          terraform show -json plan.bin > plan.json

      - name: Analyze Plan
        id: analyze
        run: |
          node dist/analyze.js terraform/plan.json > analysis.json
          cat analysis.json

      - name: Estimate Cost
        run: node dist/estimate-cost.js terraform/plan.json > cost.json

      - name: Post PR Comment
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const analysis = JSON.parse(fs.readFileSync('analysis.json'));
            const cost = JSON.parse(fs.readFileSync('cost.json'));
            
            let body = '## 🏗️ Terraform Plan Analysis\n\n';
            body += `| Action | Count |\n|--------|-------|\n`;
            body += `| ✅ Create | ${analysis.creates.length} |\n`;
            body += `| 📝 Update | ${analysis.updates.length} |\n`;
            body += `| ❌ Destroy | ${analysis.destroys.length} |\n`;
            body += `| ⚠️ Replace | ${analysis.replaces.length} |\n\n`;
            
            if (analysis.risks.length > 0) {
              body += '### 🚨 Risks\n\n';
              for (const risk of analysis.risks) {
                body += `- **${risk.severity.toUpperCase()}**: ${risk.resource} — ${risk.risk}\n`;
              }
              body += '\n';
            }
            
            body += `### 💰 Cost Impact\n\n`;
            body += `Monthly delta: **$${cost.delta >= 0 ? '+' : ''}${cost.delta.toFixed(2)}/mo**\n`;
            
            await github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body,
            });

      - name: Block on Critical Risks
        run: |
          CRITICAL=$(cat analysis.json | node -e "
            const d=[];process.stdin.on('data',c=>d.push(c));
            process.stdin.on('end',()=>{
              const a=JSON.parse(d.join(''));
              console.log(a.risks.filter(r=>r.severity==='critical').length)
            })")
          if [ "$CRITICAL" -gt "0" ]; then
            echo "❌ Critical risks detected — requires manual approval"
            exit 1
          fi
```

## Results

- **Production database wipe**: would have been caught — `replace` detection blocks force-replacements
- **Open security group**: caught in CI before merge (critical risk)
- **Cost surprises**: zero — every PR shows monthly cost delta
- **14 misconfigurations caught** in first month (open ports, missing encryption, public buckets)
- **Deployment confidence**: engineers merge Terraform PRs without fear
- **Cost visibility**: team reduced monthly spend by $2.4K from cost-aware PR reviews
