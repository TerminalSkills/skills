---
title: Automate Infrastructure Compliance with Policy-as-Code
slug: automate-infrastructure-compliance-with-policy-as-code
description: >
  Replace manual compliance checklists with automated policy enforcement
  in CI/CD. Catch misconfigurations in the Terraform plan before they reach
  production and keep audit evidence generated, not assembled by hand.
skills:
  - typescript
  - terraform-iac
  - docker-helper
  - github-actions
  - postgresql
  - zod
category: devops
tags:
  - policy-as-code
  - compliance
  - terraform
  - security
  - audit
---

# Automate Infrastructure Compliance with Policy-as-Code

## The Problem

Kenji is a platform engineer at a fintech company with 200+ Terraform resources across 3 AWS accounts. Every quarter auditors spend weeks reviewing configs for SOC 2 and PCI DSS. Last quarter they found 14 violations: weak encryption, security groups open to `0.0.0.0/0`, RDS instances without backups. Three had been in production for months, because manual review cannot keep up with 50+ Terraform changes a week. Kenji needs pre-deploy checks that block non-compliant changes in CI, drift detection for resources changed outside Terraform, policies that name the controls they support, exceptions that expire, audit evidence generated from stored results, and messages that tell engineers what to fix.

## Step 1: Define Policies as Typed Rules

The scanner reads `terraform show -json`. zod validates the slice of it you rely on and the exceptions file; each policy is a small function over a resource's planned values.

```typescript
// src/policies/types.ts
import { z } from 'zod';

const Change = z.object({ address: z.string(), type: z.string(),
  change: z.object({ actions: z.array(z.string()), after: z.record(z.string(), z.any()).nullable() }) });
export type Change = z.infer<typeof Change>;
export const Plan = z.object({ resource_changes: z.array(Change).default([]),
  resource_drift: z.array(Change).default([]) });   // drift: what changed outside Terraform
// .policy-exceptions.json: policy, resource, reason and a mandatory expiry date
export const Exceptions = z.array(z.object({ policy: z.string().regex(/^POL-\d{4}$/),
  resource: z.string(), reason: z.string().min(10), expires: z.iso.date() }));
export type Exception = z.infer<typeof Exceptions>[number];
export type Verdict = { ok: true } | { ok: false; message: string; fix: string };
export interface Policy {
  id: string; title: string; severity: 'critical' | 'high' | 'medium' | 'low';
  controls: string[];                    // illustrative IDs (SOC2-CC6.1); your compliance team owns the mapping to controls
  resourceTypes: string[];
  check: (values: Record<string, any>, type: string) => Verdict;
}
export interface PolicyResult {
  policyId: string; resourceAddress: string; severity: Policy['severity'];
  controls: string[]; ok: boolean; message: string; fix: string;
}
```

Plan JSON follows the AWS provider schema (v4+): nested blocks are arrays, and S3 default encryption lives in its own resource, not on the bucket. Security group rules come in three shapes.

```typescript
// src/policies/aws-policies.ts
import type { Policy, Verdict } from './types.js';

const ok: Verdict = { ok: true };
const fail = (message: string, fix: string): Verdict => ({ ok: false, message, fix });
// aws_security_group (ingress blocks), aws_security_group_rule and aws_vpc_security_group_ingress_rule
function openIngress(v: Record<string, any>) {
  return (v.ingress ?? [v]).filter((r: any) => {
    if (r.type === 'egress') return false;
    const cidrs = [...(r.cidr_blocks ?? []), ...(r.ipv6_cidr_blocks ?? []), r.cidr_ipv4, r.cidr_ipv6];
    const open = cidrs.some((c) => c === '0.0.0.0/0' || c === '::/0');
    return open && !(r.from_port === 443 && r.to_port === 443);   // protocol -1 has no ports: always flagged
  });
}
export const policies: Policy[] = [
  { id: 'POL-0001', title: 'S3 default encryption must use KMS', severity: 'critical',
    controls: ['SOC2-CC6.1', 'PCI-DSS-3.5.1'],
    resourceTypes: ['aws_s3_bucket_server_side_encryption_configuration'],   // checks buckets that have this resource; S3 applies SSE-S3 anyway
    check: (v) => {
      const algo = v.rule?.[0]?.apply_server_side_encryption_by_default?.[0]?.sse_algorithm;
      return algo === 'aws:kms' || algo === 'aws:kms:dsse' ? ok
        : fail(`Bucket default encryption is ${algo ?? 'unset'}, not KMS`, 'Set sse_algorithm = "aws:kms" and kms_master_key_id');
    } },
  { id: 'POL-0002', title: 'No unrestricted ingress except 443', severity: 'critical',
    controls: ['SOC2-CC6.6', 'PCI-DSS-1.3.1'],
    resourceTypes: ['aws_security_group', 'aws_security_group_rule', 'aws_vpc_security_group_ingress_rule'],
    check: (v) => {
      const bad = openIngress(v)[0];
      return bad ? fail(`0.0.0.0/0 or ::/0 open on ports ${bad.from_port ?? 'all'}-${bad.to_port ?? 'all'}`,
        'Restrict the CIDR to known ranges, or expose only port 443') : ok;
    } },
  { id: 'POL-0003', title: 'RDS keeps 7+ days of backups', severity: 'high', controls: ['SOC2-A1.2'],
    resourceTypes: ['aws_db_instance', 'aws_rds_cluster'],
    check: (v) => (v.backup_retention_period ?? 0) >= 7 ? ok : fail(`Backup retention is ${v.backup_retention_period ?? 'unset or unknown'} days (minimum 7)`, 'Set backup_retention_period = 7 or higher') },
];
```

## Step 2: Scanner and CLI

Read `after` from `resource_changes`: it covers every module level and includes unchanged resources. Expired exceptions silently stop applying.

```typescript
// src/scanner/plan-scanner.ts
import type { Change, Exception, Policy, PolicyResult } from '../policies/types.js';

export function scan(changes: Change[], policies: Policy[], exceptions: Exception[], now = new Date()): PolicyResult[] {
  const results: PolicyResult[] = [];
  for (const rc of changes) {
    const values = rc.change.after;
    if (!values) continue;                                    // being destroyed
    for (const p of policies.filter((p) => p.resourceTypes.includes(rc.type))) {
      const verdict = p.check(values, rc.type);
      const exception = exceptions.find((e) => e.policy === p.id && e.resource === rc.address
        && new Date(`${e.expires}T23:59:59Z`) >= now);
      results.push({
        policyId: p.id, resourceAddress: rc.address, severity: p.severity, controls: p.controls,
        ok: verdict.ok || !!exception,
        message: verdict.ok ? 'Compliant' : exception ? `Exception until ${exception.expires}: ${exception.reason}` : verdict.message,
        fix: verdict.ok ? '' : verdict.fix,
      });
    }
  }
  return results;
}

export function toMarkdown(results: PolicyResult[]): string {
  const bad = results.filter((r) => !r.ok);
  let md = `<!-- policy-scan -->\n## Policy Scan Results\n\n${results.length - bad.length} passed, ${bad.length} violations\n\n`;
  for (const sev of ['critical', 'high', 'medium', 'low'])
    for (const r of bad.filter((r) => r.severity === sev))
      md += `- **${sev.toUpperCase()} ${r.policyId}** \`${r.resourceAddress}\`: ${r.message}. Controls: ${r.controls.join(', ')}. Fix: ${r.fix}\n`;
  return md;
}
```

```typescript
// src/cli.ts: node dist/cli.js <plan.json> [exceptions.json]; JSON on stdout, exit 1 on critical/high
import { readFileSync, existsSync } from 'node:fs';
import { policies } from './policies/aws-policies.js';
import { Exceptions, Plan } from './policies/types.js';
import { scan, toMarkdown } from './scanner/plan-scanner.js';

const [planPath, exceptionsPath] = process.argv.slice(2);
const plan = Plan.parse(JSON.parse(readFileSync(planPath, 'utf8')));
const exceptions = exceptionsPath && existsSync(exceptionsPath)
  ? Exceptions.parse(JSON.parse(readFileSync(exceptionsPath, 'utf8'))) : [];

const results = scan(process.env.SCAN === 'drift' ? plan.resource_drift : plan.resource_changes, policies, exceptions);
const blocking = results.filter((r) => !r.ok && (r.severity === 'critical' || r.severity === 'high')).length;
process.stdout.write(JSON.stringify({ results, markdown: toMarkdown(results), blocking }));
process.exit(blocking ? 1 : 0);
```

The scanner only parses a file, so it runs in a multi-stage container as the non-root `node` user, with no network and a read-only filesystem.

```dockerfile
# policy/Dockerfile (build context: policy/, which holds package.json, package-lock.json, tsconfig.json, src/)
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npx tsc && npm prune --omit=dev
FROM node:24-alpine
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./
USER node
ENTRYPOINT ["node", "dist/cli.js"]
```

## Step 3: Block Pull Requests in CI

The job plans through short-lived OIDC credentials (no stored AWS keys), scans in the container, and fails on critical or high findings. Plan JSON can contain secrets such as database passwords, so never upload it as an artifact.

```yaml
# .github/workflows/terraform-compliance.yml
name: Infrastructure Compliance
on:
  pull_request:
    paths: ['terraform/**', 'policy/**', '.policy-exceptions.json']
permissions:
  contents: read
  id-token: write          # OIDC to AWS
  pull-requests: write     # results comment
jobs:
  policy-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: hashicorp/setup-terraform@v4
        with: { terraform_version: 1.17.1, terraform_wrapper: false }
      - uses: aws-actions/configure-aws-credentials@v6
        with: { role-to-assume: "${{ vars.TF_PLAN_ROLE_ARN }}", aws-region: eu-west-1 }
      - working-directory: terraform
        run: |
          terraform init -input=false
          terraform plan -input=false -lock=false -out=plan.bin
          terraform show -json plan.bin > plan.json
      - id: scan
        run: |
          docker build -t policy-scanner policy/
          docker run --rm --network none --read-only --cap-drop ALL \
            -v "$PWD/terraform/plan.json:/in/plan.json:ro" \
            -v "$PWD/.policy-exceptions.json:/in/exceptions.json:ro" \
            policy-scanner /in/plan.json /in/exceptions.json > results.json
      - if: always() && steps.scan.outcome != 'skipped'
        uses: actions/github-script@v9
        with:
          script: |
            const body = JSON.parse(require('fs').readFileSync('results.json', 'utf8')).markdown;
            const base = { owner: context.repo.owner, repo: context.repo.repo };
            const all = await github.paginate(github.rest.issues.listComments, { ...base, issue_number: context.issue.number });
            const old = all.find((c) => c.body.includes('<!-- policy-scan -->'));
            if (old) await github.rest.issues.updateComment({ ...base, comment_id: old.id, body });
            else await github.rest.issues.createComment({ ...base, issue_number: context.issue.number, body });
```

`.policy-exceptions.json` is read from the PR checkout, so an author could approve their own exception. Commit it as `[]`, put it behind a `CODEOWNERS` rule for the security team, and require that review in branch protection.

## Step 4: Drift Detection on a Schedule

A refresh-only plan compares state with the live cloud and ignores code changes. The JSON lists differences under `resource_drift` (live values in `change.after`), so the same scanner checks what resources look like now. With `-detailed-exitcode`, exit 2 means drift and 1 means error.

```yaml
# .github/workflows/drift.yml
on:
  schedule: [{ cron: '0 5 * * *' }]
permissions: { contents: read, id-token: write }
jobs:
  drift:
    runs-on: ubuntu-latest
    steps:
      # checkout, setup-terraform and AWS credentials steps as in the PR workflow
      - working-directory: terraform
        run: |
          code=0
          terraform init -input=false
          terraform plan -refresh-only -detailed-exitcode -lock=false -input=false -out=drift.bin || code=$?
          if [ "$code" -eq 1 ]; then exit 1; fi
          terraform show -json drift.bin > plan.json
      - run: |
          docker build -t policy-scanner policy/
          docker run --rm --network none --read-only --cap-drop ALL -e SCAN=drift \
            -v "$PWD/terraform/plan.json:/in/plan.json:ro" policy-scanner /in/plan.json
```

## Step 5: Store Results and Generate Audit Reports

After each scan on `main`, insert the results into PostgreSQL; the report is one aggregate query per control.

```typescript
// src/reports/compliance-report.ts
import { Pool } from 'pg';
import type { PolicyResult } from '../policies/types.js';

const db = new Pool({ connectionString: process.env.DATABASE_URL });

/*  CREATE TABLE policy_scan_results (
      id bigserial PRIMARY KEY, scanned_at timestamptz NOT NULL DEFAULT now(), commit_sha text,
      policy_id text NOT NULL, resource_address text NOT NULL, ok boolean NOT NULL,
      message text NOT NULL, controls text[] NOT NULL);
    CREATE INDEX ON policy_scan_results (scanned_at);  */
export async function saveResults(results: PolicyResult[], commitSha: string) {
  for (const r of results) await db.query(
    `INSERT INTO policy_scan_results (commit_sha, policy_id, resource_address, ok, message, controls)
     VALUES ($1, $2, $3, $4, $5, $6)`, [commitSha, r.policyId, r.resourceAddress, r.ok, r.message, r.controls]);
}
export async function generateReport(prefix: 'SOC2' | 'PCI-DSS', from: Date, to: Date) {
  const { rows } = await db.query(
    `SELECT c AS control, count(*)::int AS checks, count(*) FILTER (WHERE NOT ok)::int AS failures,
            (array_agg(resource_address || ': ' || message) FILTER (WHERE NOT ok))[1:5] AS examples
       FROM policy_scan_results, unnest(controls) AS c
      WHERE scanned_at >= $1 AND scanned_at < $2 AND c LIKE $3
      GROUP BY c ORDER BY c`, [from, to, `${prefix}-%`]);
  return `# ${prefix} compliance report: ${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}\n\n` +
    rows.map((r) => `## ${r.control}: ${r.failures ? 'FAIL' : 'PASS'}\n\nChecked ${r.checks} times, ${r.failures} failures.\n` +
      (r.examples ?? []).map((e: string) => `- ${e}\n`).join('')).join('\n');
}
```

## Results

Kenji's team after six months (their own numbers, not a benchmark):
- Audit prep went from three weeks of screenshots to exporting the generated reports
- Critical violations were caught in the PR, and most were fixed there, since the comment names the fix
- Every exception has an expiry date and a `CODEOWNERS` review; a new policy is one entry in `aws-policies.ts`

## Related Skills

- [typescript](/skills/typescript), [zod](/skills/zod): the scanner and its validated input
- [terraform-iac](/skills/terraform-iac): plan JSON and refresh-only plans
- [docker-helper](/skills/docker-helper): the sandboxed scanner image
- [github-actions](/skills/github-actions): PR check and drift job
- [postgresql](/skills/postgresql): scan history and audit reports
