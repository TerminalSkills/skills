---
title: Automate SOC 2 Compliance for a Growing Startup
slug: automate-soc2-compliance-for-startup
description: A 25-person SaaS startup automates the evidence for a SOC 2 Type II report using code scanning in CI, infrastructure-as-code checks, managed secrets, scripted access reviews and incident metrics, so audit questions have automatic, timestamped answers.
skills: [semgrep, checkov, infisical, otel-js]
category: devops
tags: [compliance, soc2, security, automation, audit, infrastructure, devsecops]
---

# Automate SOC 2 Compliance for a Growing Startup

Mei is the CTO of a 25-person SaaS startup that just landed its first enterprise prospect. The procurement team requires a SOC 2 Type II report. Mei has no compliance team, so she makes the technical controls produce their own evidence: every control runs as code, every run leaves a timestamped artifact, and the audit questions about engineering practice have an automated answer.

## What automation can and cannot do

SOC 2 is an attestation report written by an independent CPA firm, not a certification you can buy. A Type I report describes whether controls are designed properly at one date. A Type II report covers an observation period (commonly 3 to 12 months, agreed with the auditor) and shows the controls operated the whole time. That is why evidence has to be continuous.

Scripts cover the technical controls: secure development, change management, access reviews, secrets, monitoring. They do not replace the written policies, risk assessment, vendor reviews, onboarding and offboarding records, security training or the auditor's own testing. Mei starts by agreeing with the auditor which criteria are in scope (Security is always included) and which evidence format they accept. The control IDs and thresholds below are a starting point, not a mapping the auditor has signed off.

## Control 1: Secure code, static analysis on every pull request

The open-source Semgrep CLI runs in CI. It fails the build on error-level findings in code changed by the pull request, and the SARIF file is kept as evidence and shown in GitHub code scanning. (`returntocorp/semgrep-action` is the old, retired way to do this.)

```yaml
# .github/workflows/security-scan.yml
name: Security Scan
on: pull_request
permissions:
  contents: read
  security-events: write       # upload SARIF to code scanning
jobs:
  semgrep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0       # --baseline-commit needs the base branch
      - run: pip install semgrep
      - name: Semgrep (fails on new ERROR findings)
        run: >-
          semgrep scan --config p/security-audit --config p/secrets --config p/owasp-top-ten --config p/typescript
          --metrics=off --severity=ERROR --error
          --sarif --output=semgrep.sarif
          --baseline-commit=origin/${{ github.base_ref }}
      - uses: github/codeql-action/upload-sarif@v4
        if: always()
        with:
          sarif_file: semgrep.sarif
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: semgrep-${{ github.sha }}
          path: semgrep.sarif
          retention-days: 90
```

Registry rulesets are fetched with `--config p/...`; `--metrics=off` keeps usage data private. Every pull request now has a scan result attached, and the branch protection rule "require status checks" makes the scan unskippable, which is the evidence for the change-management control. GitHub deletes artifacts after 90 days by default (the limit can be raised up to 400 days on private repositories), so a monthly job copies them to the audit storage described under Control 2.

## Control 2: Infrastructure security, IaC scanning

Checkov evaluates Terraform (and Dockerfiles or Kubernetes manifests) against built-in policies before anything is applied. It exits 1 when a check fails, which blocks the pull request.

```yaml
  checkov:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - name: Checkov IaC scan
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: ./infrastructure
          framework: terraform,dockerfile,kubernetes
          output_format: cli,sarif
          output_file_path: console,results.sarif
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: checkov-${{ github.sha }}
          path: results.sarif
          retention-days: 90
```

On day one an existing codebase fails many checks. Mei starts from a baseline (the same job with `soft_fail: true`), fixes the findings on the access, encryption and logging policies first, then removes `soft_fail`. A check she decides not to meet gets an inline `#checkov:skip=CKV_AWS_18:reason` comment, so the exception and its justification live in the repository and in the review history. The auditor reads those comments as documented risk acceptance.

For long-term retention, a scheduled workflow assumes an AWS role through GitHub OIDC (`aws-actions/configure-aws-credentials@v6`, no stored keys) and copies the artifacts to an S3 bucket with versioning and object lock enabled, so the evidence cannot be edited after the fact.

## Control 3: Secrets management

No secrets in the repository or in `.env` files on servers. Infisical holds them per environment, and each service authenticates as a machine identity with read access to its own environment only.

```typescript
// lib/config.ts
import { InfisicalSDK } from "@infisical/sdk";

const client = new InfisicalSDK({ siteUrl: process.env.INFISICAL_SITE_URL });

export async function loadSecrets() {
  await client.auth().universalAuth.login({
    clientId: process.env.INFISICAL_CLIENT_ID!,
    clientSecret: process.env.INFISICAL_CLIENT_SECRET!,
  });
  const { secrets } = await client.secrets().listSecrets({
    environment: process.env.NODE_ENV === "production" ? "prod" : "dev",
    projectId: process.env.INFISICAL_PROJECT_ID!,
    secretPath: "/",
  });
  const byName = new Map(secrets.map((s) => [s.secretKey, s.secretValue]));
  const need = (name: string) => {
    const v = byName.get(name);
    if (!v) throw new Error(`secret ${name} is missing`);
    return v;
  };
  return { databaseUrl: need("DATABASE_URL"), jwtSecret: need("JWT_SECRET") };
}
```

`INFISICAL_SITE_URL` is only set for the EU cloud or a self-hosted instance. The client ID and secret are the one secret the service is deployed with, so Mei prefers OIDC or Kubernetes auth where the platform supports it and rotates the Universal Auth client secret on a schedule. Infisical keeps an audit log of secret access and changes and versions every secret. Secret rotation is configured in the dashboard per secret (for example a database user with a rotation interval in days); services must re-read the secret at least once per interval. Check which of these features your Infisical plan includes before promising them to the auditor, and export the audit log to the evidence bucket at the end of each month.

## Control 4: Access reviews

A quarterly spreadsheet becomes a weekly script. It compares GitHub organization members against the HR system's export and flags IAM users with `AdministratorAccess`. Matching is by GitHub login, because members' email addresses are often private and the API returns `null` for them.

```typescript
// scripts/access-audit.ts  (npm install @octokit/rest @aws-sdk/client-iam)
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { Octokit } from "@octokit/rest";
import { IAMClient, ListUsersCommand, ListAttachedUserPoliciesCommand } from "@aws-sdk/client-iam";

type Finding = { severity: "high" | "medium"; type: string; detail: string };

async function main() {
  const findings: Finding[] = [];
  // HR export: [{ "github": "mei-chen", "active": true }, ...] (kept outside the repo, read from a path)
  const people: { github: string; active: boolean }[] = JSON.parse(readFileSync(process.env.HR_EXPORT!, "utf8"));
  const activeLogins = new Set(people.filter((p) => p.active).map((p) => p.github.toLowerCase()));

  const octokit = new Octokit({ auth: process.env.AUDIT_GH_TOKEN });
  const members = await octokit.paginate(octokit.rest.orgs.listMembers, { org: process.env.AUDIT_ORG!, per_page: 100 });
  for (const m of members) {
    if (!activeLogins.has(m.login.toLowerCase())) {
      findings.push({ severity: "high", type: "orphaned-account", detail: `GitHub user ${m.login} is not an active employee` });
    }
  }

  const iam = new IAMClient({});
  let marker: string | undefined;
  do {
    const page = await iam.send(new ListUsersCommand({ Marker: marker }));
    for (const u of page.Users ?? []) {
      const attached = await iam.send(new ListAttachedUserPoliciesCommand({ UserName: u.UserName }));
      if (attached.AttachedPolicies?.some((p) => p.PolicyName === "AdministratorAccess")) {
        findings.push({ severity: "medium", type: "excessive-permission", detail: `IAM user ${u.UserName} has AdministratorAccess` });
      }
    }
    marker = page.IsTruncated ? page.Marker : undefined;
  } while (marker);

  const date = new Date().toISOString().slice(0, 10);
  mkdirSync("evidence", { recursive: true });
  writeFileSync(`evidence/access-review-${date}.json`, JSON.stringify({ date, findings }, null, 2));
  if (findings.some((f) => f.severity === "high")) process.exit(1); // a red scheduled run notifies the team
}
main();
```

```yaml
# .github/workflows/access-review.yml
name: Access review
on:
  schedule: [{ cron: "0 6 * * 1" }]    # Mondays 06:00 UTC
permissions:
  id-token: write
  contents: read
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: aws-actions/configure-aws-credentials@v6
        with:
          role-to-assume: ${{ vars.AUDIT_ROLE_ARN }}     # read-only IAM role, trusted via OIDC
          aws-region: eu-west-1
      - run: npx tsx scripts/access-audit.ts
        env:
          AUDIT_ORG: ourcompany
          AUDIT_GH_TOKEN: ${{ secrets.AUDIT_GH_TOKEN }}   # fine-grained token, organization permission "Members: read" only (secret names cannot start with GITHUB_)
          HR_EXPORT: ./hr-export.json                      # an earlier step must write it from your HR system
      - uses: actions/upload-artifact@v7
        if: always()
        with:
          name: access-review-${{ github.run_id }}
          path: evidence/
```

A high finding exits non-zero, the scheduled run turns red and the team is notified by the usual workflow alerts. Fixing it (removing the orphaned account) and the date of the fix are recorded in the ticket that links to the run. Even with this script, the written offboarding checklist is what the auditor tests for terminated employees.

## Control 5: Monitoring and incident records

Services export metrics and traces over OTLP (set up as in the `otel-js` skill). Security alerts increment a counter, so dashboards and alert rules can show how many incidents occurred, and every alert also becomes a persistent incident record, because the auditor samples incidents and asks to see how each was handled.

```typescript
// lib/incidents.ts
import { metrics } from "@opentelemetry/api";

type Severity = "low" | "medium" | "high";
export interface SecurityAlert { id: string; severity: Severity; type: string; description: string }
export interface IncidentStore { create(i: { alertId: string; severity: Severity; type: string; description: string; status: "open"; detectedAt: Date }): Promise<{ id: string }> }

const incidentCounter = metrics.getMeter("compliance").createCounter("security_incidents", {
  description: "Security incidents detected",
});

export async function handleSecurityAlert(alert: SecurityAlert, store: IncidentStore) {
  incidentCounter.add(1, { severity: alert.severity, type: alert.type });
  return store.create({
    alertId: alert.id, severity: alert.severity, type: alert.type,
    description: alert.description, status: "open", detectedAt: new Date(),
  });
}
```

The `IncidentStore` is whatever the team already uses for tickets (an issue tracker, an incidents table). Each record must be updated with who acknowledged it, when it was resolved and what was changed, and an incident that touches customer data also follows the breach-notification steps in the written incident response policy.

## What the evidence folder looks like

After a few weeks of operation Mei's evidence bucket contains, per pull request, a Semgrep and a Checkov result tied to a commit; per week, an access review file; per month, a secrets audit-log export; and the incident records with timestamps. When the auditor asks how insecure code is stopped from reaching production, she shows the required status checks and a sample of recent runs instead of screenshots. The remaining effort is the human side: policies, training records and the auditor's walkthroughs. The timeline and cost depend on the auditor, the observation period and how many controls are already in place, so ask for quotes before promising a date to the prospect.

## Related Skills

- `semgrep`: static analysis rules, SARIF output and CI setup
- `checkov`: IaC policy scanning, baselines and inline skips
- `infisical`: secrets per environment, machine identities, audit log
- `otel-js`: OpenTelemetry traces and metrics for Node.js services
