---
title: Build an Infrastructure-as-Code Testing Pipeline
slug: build-infrastructure-as-code-testing-pipeline
description: >
  Test Terraform changes before they hit production: native module tests
  with mocked providers, a plan analyzer that blocks forced replacements and
  open ports, cost estimates on every pull request, and scheduled drift checks.
skills:
  - typescript
  - terraform-iac
  - github-actions
  - docker-helper
  - vitest
  - zod
category: devops
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

A platform team manages 300+ Terraform resources across 5 AWS accounts. Every `terraform apply` is a prayer: no tests, no staging, no cost preview. Last month an engineer changed an RDS setting that forces replacement, and the plan that would have wiped the production database was never read closely. The month before, a security group change opened port 22 to the internet for 3 hours. Cost surprises arrive monthly, and nobody knows why until they investigate.

The pipeline has four layers, cheapest first: module tests, a plan analyzer, a cost diff and a scheduled drift check.

## Step 1: Module tests with `terraform test`

Terraform's built-in test framework (1.6+) runs `.tftest.hcl` files; `mock_provider` (1.7+) fakes the provider, so the test needs no credentials and creates nothing. Put the tests next to the module:

```hcl
# modules/bastion/tests/bastion.tftest.hcl
mock_provider "aws" {}

variables {
  vpc_id = "vpc-0123456789abcdef0"
}

run "ssh_limited_to_office" {
  command = plan
  variables {
    admin_cidr = "203.0.113.0/24"
  }
  assert {
    condition     = aws_vpc_security_group_ingress_rule.ssh.cidr_ipv4 == "203.0.113.0/24"
    error_message = "SSH rule must use the admin CIDR"
  }
}

run "rejects_open_ssh" {
  command = plan
  variables {
    admin_cidr = "0.0.0.0/0"
  }
  expect_failures = [var.admin_cidr]   # the variable's validation block must reject it
}
```

The module declares `validation { condition = !contains(["0.0.0.0/0", "::/0"], var.admin_cidr) ... }` on `admin_cidr`. In CI it is `terraform init -backend=false && terraform test`, which ends with `Success! 2 passed, 0 failed.`

Runs with `command = apply` create real resources: that is the integration layer, for a sandbox account only.

## Step 2: Plan analyzer

`terraform show -json plan.bin` gives a machine-readable plan. The analyzer parses it with zod (a format change fails loudly instead of reporting "no risks") and flags both incidents. It covers every shape of open ingress in the AWS provider: `aws_vpc_security_group_ingress_rule`, legacy `aws_security_group_rule`, and inline `ingress` blocks.

```typescript
// src/plan.ts
import { z } from 'zod';

const Action = z.enum(['create', 'read', 'update', 'delete', 'no-op', 'forget']);

const ResourceChange = z.object({
  address: z.string(),
  type: z.string(),
  change: z.object({ actions: z.array(Action), after: z.record(z.string(), z.unknown()).nullable().optional() }),
});

// `resource_changes` is absent when the plan changes nothing
export const Plan = z.object({ resource_changes: z.array(ResourceChange).default([]) });
type Change = z.infer<typeof ResourceChange>;

interface Risk { resource: string; risk: string; severity: 'critical' | 'high' }
interface Analysis { creates: string[]; updates: string[]; destroys: string[]; replaces: string[]; risks: Risk[] }

const PUBLIC = new Set(['0.0.0.0/0', '::/0']);
const SAFE_PORTS = new Set([80, 443]);

function openIngress(c: Change): number[] {
  const a = c.change.after;
  if (!a) return [];
  const exposed = (cidrs: unknown, from: unknown): number[] =>
    Array.isArray(cidrs) && cidrs.some((x) => PUBLIC.has(String(x))) && typeof from === 'number' ? [from] : [];

  if (c.type === 'aws_vpc_security_group_ingress_rule') {
    return [...exposed([a.cidr_ipv4], a.from_port), ...exposed([a.cidr_ipv6], a.from_port)];
  }
  if (c.type === 'aws_security_group_rule' && a.type === 'ingress') {
    return [...exposed(a.cidr_blocks, a.from_port), ...exposed(a.ipv6_cidr_blocks, a.from_port)];
  }
  if (c.type === 'aws_security_group' && Array.isArray(a.ingress)) {
    return a.ingress.flatMap((r: any) => [...exposed(r.cidr_blocks, r.from_port), ...exposed(r.ipv6_cidr_blocks, r.from_port)]);
  }
  return [];
}

export function analyzePlan(planJson: unknown): Analysis {
  const { resource_changes } = Plan.parse(planJson);
  const out: Analysis = { creates: [], updates: [], destroys: [], replaces: [], risks: [] };

  for (const c of resource_changes) {
    const actions = c.change.actions;
    if (actions.includes('create') && actions.includes('delete')) {
      out.replaces.push(c.address);
      out.risks.push({ resource: c.address, severity: 'critical', risk: 'Will be destroyed and recreated (data loss possible)' });
    } else if (actions.includes('delete')) {
      out.destroys.push(c.address);
      out.risks.push({
        resource: c.address,
        risk: 'Will be permanently deleted',
        severity: /(_db_|_rds_|_dynamodb_|_s3_bucket$)/.test(c.type) ? 'critical' : 'high',
      });
    } else if (actions.includes('create')) out.creates.push(c.address);
    else if (actions.includes('update')) out.updates.push(c.address);

    if (actions.includes('create') || actions.includes('update')) {
      for (const port of openIngress(c)) {
        if (!SAFE_PORTS.has(port)) {
          out.risks.push({ resource: c.address, severity: 'critical', risk: `Opens port ${port} to the internet` });
        }
      }
    }
  }
  return out;
}
```

`src/analyze.ts` is a three-line CLI around `analyzePlan` (read `process.argv[2]`, parse, print JSON). Unit-test it with vitest, using plan fragments instead of real plans:

```typescript
// tests/plan.test.ts
import { describe, it, expect } from 'vitest';
import { analyzePlan } from '../src/plan.js';

const rc = (address: string, type: string, actions: string[], after: object = {}) => ({
  address, type, change: { actions, after },
});

describe('analyzePlan', () => {
  it('flags a forced RDS replacement as critical', () => {
    const r = analyzePlan({ resource_changes: [rc('aws_db_instance.main', 'aws_db_instance', ['delete', 'create'])] });
    expect(r.replaces).toEqual(['aws_db_instance.main']);
    expect(r.risks[0].severity).toBe('critical');
  });

  it('flags SSH open to the world', () => {
    const r = analyzePlan({
      resource_changes: [rc('aws_vpc_security_group_ingress_rule.ssh', 'aws_vpc_security_group_ingress_rule', ['create'],
        { cidr_ipv4: '0.0.0.0/0', from_port: 22, to_port: 22, ip_protocol: 'tcp' })],
    });
    expect(r.risks[0]).toMatchObject({ severity: 'critical', risk: 'Opens port 22 to the internet' });
  });
});
```

## Step 3: Package the analyzer with Docker

Run the analyzer in a container so the runner needs no Node toolchain and the analyzer sees only the plan file. Plan JSON can contain secrets, so the container gets no network (`--network none`, below). `npm run build` is `tsc` with `outDir: dist` and `rootDir: src`; `npx vitest run` runs the tests above.


```dockerfile
FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./
USER node
ENTRYPOINT ["node", "dist/analyze.js"]
```

## Step 4: GitHub Actions workflow

The plan must run against the real backend and real read access, otherwise state is empty and every resource shows as `create`, which hides exactly the replacements you want to catch. Use OIDC and a read-only role (no static keys):

```yaml
# .github/workflows/terraform-test.yml
name: Terraform Test Pipeline
on:
  pull_request:
    paths: ['terraform/**', 'analyzer/**']

permissions:
  contents: read
  id-token: write   # OIDC to AWS

jobs:
  plan-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: hashicorp/setup-terraform@v4
        with:
          terraform_wrapper: false   # keep stdout clean for `terraform show -json`

      - name: Module tests (no cloud access)
        working-directory: terraform/modules/bastion
        run: terraform init -backend=false -input=false && terraform test

      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.TF_PLAN_ROLE_ARN }}   # read-only plan role
          aws-region: us-east-1

      - name: Plan
        working-directory: terraform/environments/production
        run: |
          terraform init -input=false
          terraform plan -input=false -lock=false -out=plan.bin
          terraform show -json plan.bin > plan.json

      - name: Analyze plan
        run: |
          docker build -t plan-analyzer analyzer/
          docker run --rm --network none \
            -v "$PWD/terraform/environments/production/plan.json:/in/plan.json:ro" \
            plan-analyzer /in/plan.json > analysis.json

      - name: Summary on the run page
        run: |
          jq -r '"Create \(.creates|length), update \(.updates|length), destroy \(.destroys|length), replace \(.replaces|length)\n",
                 (.risks[] | "- **\(.severity)**: `\(.resource)`: \(.risk)")' analysis.json >> "$GITHUB_STEP_SUMMARY"

      - name: Block on critical risks
        run: |
          jq -e '[.risks[] | select(.severity == "critical")] | length == 0' analysis.json \
            || { echo "Critical risks found: needs an owner review"; exit 1; }
```

Do not upload `plan.bin` or `plan.json` as artifacts: they hold resolved values, including secrets. Forks get no OIDC token, so run this on same-repository branches, and make the check required in branch protection.

## Step 5: Cost diff and drift detection

For cost, use Infracost instead of a hand-kept price table that goes stale. Its GitHub Action diffs the base branch against the PR and posts the monthly delta as a comment (it needs an `INFRACOST_API_KEY` secret):

```yaml
name: Terraform cost diff
on:
  pull_request:
    types: [opened, synchronize, closed, reopened]  # closed: marks the PR merged/closed in Infracost
    paths: ['terraform/**']

permissions:
  contents: read
  pull-requests: write

jobs:
  diff:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        if: github.event.action != 'closed'
        with: { path: head }
      - uses: actions/checkout@v7
        if: github.event.action != 'closed'
        with: { ref: "${{ github.event.pull_request.base.ref }}", path: base }
      - uses: infracost/actions/diff@v5
        with:
          api-key: ${{ secrets.INFRACOST_API_KEY }}
          base-path: base/terraform/environments/production
          head-path: head/terraform/environments/production
```

Drift is the same plan run on a schedule with no code change. `-detailed-exitcode` makes `plan` exit 2 when the real infrastructure differs from the configuration, so the job can open an issue or page someone:

`terraform plan -input=false -lock=false -detailed-exitcode` exits 0 for no changes, 1 for an error and 2 for drift. Put it in a workflow with `on: schedule` and the same OIDC role.

## Real-World Example

A pull request changes `kms_key_id` on the production RDS instance. The analyzer summary lists `aws_db_instance.main` as **CRITICAL: will be destroyed and recreated**, the check goes red, and the author moves the change into a maintenance window with a snapshot first. A week later a PR adds an SSH rule for `0.0.0.0/0`; the same job blocks it. Cost deltas show on every pull request, so "why is the bill higher" becomes a review comment.

## Related Skills

- [terraform-iac](../skills/terraform-iac/), [github-actions](../skills/github-actions/): module tests, OIDC, job summaries, drift
- [docker-helper](../skills/docker-helper/): the analyzer image; [typescript](../skills/typescript/), [zod](../skills/zod/), [vitest](../skills/vitest/): the analyzer and its tests
