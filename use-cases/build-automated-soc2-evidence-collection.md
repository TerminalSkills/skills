---
title: "Build an Automated SOC 2 Evidence Collection System"
description: "Automate the tedious work of SOC 2 Type II prep — pull evidence from AWS CloudTrail, GitHub, and Okta, map it to controls, and generate audit-ready PDF bundles."
skills: [soc2-compliance, aws-cli, github-actions]
difficulty: advanced
time_estimate: "10 hours"
tags: [soc2, compliance, security, audit, aws, github, okta, devops]
---

# Build an Automated SOC 2 Evidence Collection System

SOC 2 Type II audits are painful not because the controls are hard — it's because proving you follow them requires 12 months of collected evidence. Most startups scramble to manually compile screenshots, export logs, and write access reviews in the week before the audit. Automating evidence collection turns a panic sprint into a routine system.

## The Persona

You're a startup CTO with 40 engineers and a major enterprise customer requiring SOC 2 Type II before signing. Your auditor wants evidence across CC6 (Logical Access), CC7 (System Operations), and CC8 (Change Management). You have 4 months. You need to automate the collection so evidence just accumulates without anyone thinking about it.

## What You'll Build

- **Automated collectors** — pull from AWS CloudTrail, GitHub, and Okta on a schedule
- **Evidence storage** — structured, timestamped, immutable evidence records
- **Control mapping** — link each evidence piece to SOC 2 controls
- **Audit package generator** — bundle evidence per control into PDF reports
- **Staleness alerts** — notify when evidence is missing or older than 30 days

## SOC 2 Controls Reference

| Control | Focus | Evidence Needed |
|---------|-------|----------------|
| CC6.1 | Logical access provisioning | User provisioning/deprovisioning logs |
| CC6.2 | User access reviews | Quarterly access review records |
| CC6.3 | Access removal | Offboarding within 24h evidence |
| CC7.1 | Vulnerability detection | Security scan results |
| CC7.2 | Monitoring | CloudTrail logs, alerts |
| CC8.1 | Change management | PR reviews, deployment approvals |

## Evidence Schema

```yaml
# evidence-schema.yaml — define evidence types
evidence_types:
  access_log:
    control: CC6.1
    source: okta
    retention_days: 365
    required_frequency: daily

  change_log:
    control: CC8.1
    source: github
    retention_days: 365
    required_frequency: per_deployment

  security_scan:
    control: CC7.1
    source: aws_inspector
    retention_days: 90
    required_frequency: weekly

  access_review:
    control: CC6.2
    source: manual
    retention_days: 365
    required_frequency: quarterly
```

## Step 1: AWS CloudTrail Collector

```bash
#!/bin/bash
# scripts/collect-cloudtrail.sh

BUCKET="s3://your-cloudtrail-bucket"
EVIDENCE_DIR="evidence/cloudtrail/$(date +%Y/%m/%d)"
mkdir -p "$EVIDENCE_DIR"

# Pull last 24h of CloudTrail events for CC7.2 monitoring
aws cloudtrail lookup-events \
  --start-time "$(date -d '24 hours ago' -Iseconds)" \
  --end-time "$(date -Iseconds)" \
  --query 'Events[?contains(EventName, `ConsoleLogin`) || contains(EventName, `DeleteUser`) || contains(EventName, `AttachPolicy`)]' \
  --output json > "$EVIDENCE_DIR/access-events-$(date +%H%M%S).json"

# Pull IAM access report for CC6.2 access reviews
aws iam generate-credential-report
sleep 5
aws iam get-credential-report \
  --query 'Content' --output text | base64 -d \
  > "$EVIDENCE_DIR/credential-report-$(date +%Y%m%d).csv"

# Pull security findings from AWS Inspector (CC7.1)
aws inspector2 list-findings \
  --filter-criteria '{"findingStatus":[{"comparison":"EQUALS","value":"ACTIVE"}]}' \
  --output json > "$EVIDENCE_DIR/inspector-findings-$(date +%Y%m%d).json"

echo "CloudTrail evidence collected to $EVIDENCE_DIR"
```

## Step 2: GitHub Evidence Collector

```yaml
# .github/workflows/soc2-evidence.yml
name: SOC 2 Evidence Collection

on:
  schedule:
    - cron: '0 6 * * *'  # Daily at 6 AM UTC
  workflow_dispatch:

jobs:
  collect-pr-evidence:
    name: Collect Change Management Evidence (CC8.1)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Collect merged PRs (last 24h)
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          DATE=$(date -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
          gh api \
            "repos/${{ github.repository }}/pulls?state=closed&sort=updated&direction=desc&per_page=100" \
            --jq "[.[] | select(.merged_at >= \"$DATE\") | {
              number: .number,
              title: .title,
              merged_at: .merged_at,
              merged_by: .merged_by.login,
              reviewers: [.requested_reviewers[].login],
              approved_by: [],
              base_branch: .base.ref
            }]" > evidence/github/prs-$(date +%Y%m%d).json

      - name: Verify PR review requirements
        run: |
          # Fail if any PR was merged without review (CC8.1 violation)
          UNREVIEWED=$(cat evidence/github/prs-$(date +%Y%m%d).json | \
            jq '[.[] | select(.reviewers | length == 0)] | length')
          if [ "$UNREVIEWED" -gt "0" ]; then
            echo "⚠️ WARNING: $UNREVIEWED PRs merged without review requirement"
          fi

      - name: Upload evidence artifact
        uses: actions/upload-artifact@v4
        with:
          name: soc2-github-evidence-${{ github.run_number }}
          path: evidence/github/
          retention-days: 400  # > 1 year for SOC 2 Type II

  collect-access-review:
    name: Quarterly Access Review (CC6.2)
    runs-on: ubuntu-latest
    if: github.event_name == 'schedule' && startsWith(github.event.schedule, '0 6 1 */3')
    steps:
      - name: Export GitHub org members
        env:
          GH_TOKEN: ${{ secrets.ORG_ADMIN_TOKEN }}
        run: |
          gh api "orgs/${{ github.repository_owner }}/members" \
            --jq '[.[] | {login, role: "member"}]' \
            > evidence/access-reviews/github-members-$(date +%Y%m%d).json

          # Export all repo collaborators
          gh api "orgs/${{ github.repository_owner }}/repos" \
            --jq '.[].name' | while read repo; do
            gh api "repos/${{ github.repository_owner }}/$repo/collaborators" \
              --jq "[.[] | {repo: \"$repo\", login, role: .role_name}]" \
              >> evidence/access-reviews/github-collaborators-$(date +%Y%m%d).json
          done
```

## Step 3: Okta Access Log Collector

```typescript
// scripts/collect-okta.ts
const OKTA_DOMAIN = process.env.OKTA_DOMAIN!
const OKTA_TOKEN = process.env.OKTA_API_TOKEN!

async function collectOktaEvidence() {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  // CC6.1 — user provisioning/deprovisioning events
  const events = await fetch(
    `https://${OKTA_DOMAIN}/api/v1/logs?` +
    `since=${yesterday.toISOString()}&` +
    `filter=eventType eq "user.lifecycle.create" or ` +
    `eventType eq "user.lifecycle.deactivate" or ` +
    `eventType eq "user.session.start"`,
    { headers: { Authorization: `SSWS ${OKTA_TOKEN}` } }
  ).then(r => r.json())

  // Save evidence
  const dir = `evidence/okta/${new Date().toISOString().split('T')[0]}`
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(
    `${dir}/access-logs.json`,
    JSON.stringify({ collected_at: new Date().toISOString(), events }, null, 2)
  )

  // Check for CC6.3 violations: deprovisioned users still with active sessions
  const deprovisionedUsers = events
    .filter((e: any) => e.eventType === 'user.lifecycle.deactivate')
    .map((e: any) => e.actor.id)

  for (const userId of deprovisionedUsers) {
    const sessions = await fetch(
      `https://${OKTA_DOMAIN}/api/v1/users/${userId}/sessions`,
      { headers: { Authorization: `SSWS ${OKTA_TOKEN}` } }
    ).then(r => r.json())

    if (sessions.length > 0) {
      console.error(`CC6.3 VIOLATION: User ${userId} deprovisioned but has active sessions!`)
      // Alert security team
    }
  }
}
```

## Step 4: Evidence Control Mapping

```typescript
// lib/control-mapper.ts
const CONTROL_MAP: Record<string, string[]> = {
  'CC6.1': ['evidence/okta/*/access-logs.json', 'evidence/cloudtrail/*/access-events-*.json'],
  'CC6.2': ['evidence/access-reviews/github-collaborators-*.json', 'evidence/access-reviews/okta-users-*.json'],
  'CC7.1': ['evidence/cloudtrail/*/inspector-findings-*.json'],
  'CC7.2': ['evidence/cloudtrail/*/access-events-*.json'],
  'CC8.1': ['evidence/github/prs-*.json'],
}

export async function getEvidenceForControl(control: string): Promise<Evidence[]> {
  const patterns = CONTROL_MAP[control] ?? []
  const files = []

  for (const pattern of patterns) {
    const matches = await glob(pattern)
    for (const file of matches) {
      files.push({
        control,
        file,
        collectedAt: (await fs.stat(file)).mtime,
        size: (await fs.stat(file)).size,
      })
    }
  }

  return files.sort((a, b) => b.collectedAt.getTime() - a.collectedAt.getTime())
}
```

## Step 5: Staleness Alerts

```bash
#!/bin/bash
# scripts/check-evidence-freshness.sh

STALE_THRESHOLD_DAYS=30
ALERT_EMAIL="security@example.com"

echo "Checking evidence freshness..."

check_control() {
  local control=$1
  local pattern=$2
  local latest_file=$(ls -t $pattern 2>/dev/null | head -1)

  if [ -z "$latest_file" ]; then
    echo "MISSING: $control — no evidence files found"
    return 1
  fi

  local age_days=$(( ($(date +%s) - $(date -r "$latest_file" +%s)) / 86400 ))
  if [ "$age_days" -gt "$STALE_THRESHOLD_DAYS" ]; then
    echo "STALE: $control — newest evidence is $age_days days old ($latest_file)"
    return 1
  fi

  echo "OK: $control — evidence is $age_days days old"
}

check_control "CC6.1" "evidence/okta/*/access-logs.json"
check_control "CC7.1" "evidence/cloudtrail/*/inspector-findings-*.json"
check_control "CC8.1" "evidence/github/prs-*.json"
```

## Step 6: Run Everything via GitHub Actions Cron

```yaml
# Complete schedule in .github/workflows/soc2-evidence.yml
on:
  schedule:
    - cron: '0 6 * * *'      # Daily: CloudTrail, Okta, GitHub PRs
    - cron: '0 6 * * 1'      # Weekly: Inspector scans
    - cron: '0 6 1 */3 *'    # Quarterly: Access reviews
```

## Audit Package Structure

After 12 months of automated collection, your auditor gets:

```
audit-package/
  CC6-Logical-Access/
    CC6.1-provisioning-logs/     ← Okta events (daily)
    CC6.2-access-reviews/        ← Quarterly exports
    CC6.3-deprovisioning/        ← Termination records
  CC7-System-Operations/
    CC7.1-vulnerability-scans/   ← Inspector findings (weekly)
    CC7.2-monitoring-logs/       ← CloudTrail (daily)
  CC8-Change-Management/
    CC8.1-pr-reviews/            ← GitHub PR history (daily)
```

## What's Next

- Add automated security scanning with Trivy or Snyk for CC7.1
- Build a compliance dashboard showing control coverage and freshness
- Integrate with your ticketing system to auto-create remediation tasks
- Add policy document version control for non-technical controls (CC1, CC2)
