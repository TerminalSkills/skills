---
title: "Build a Developer Experience Dashboard with DORA Metrics"
description: "Track deployment frequency, lead time, MTTR, and change failure rate from GitHub and CI/CD APIs. Visualize PR cycle time, build trends, and alert on regressions via Slack."
skills: [github-actions, prisma]
difficulty: advanced
time_estimate: "12 hours"
tags: [dora-metrics, devex, developer-productivity, github, ci-cd, analytics, engineering-management]
---

# Build a Developer Experience Dashboard with DORA Metrics

Most engineering teams have no idea how fast they ship or how often they break things. DORA metrics — developed by Google's DevOps Research and Assessment team — are the industry standard for measuring delivery performance. Build the dashboard yourself in a week.

## Persona

**Rachel** is an engineering manager at a 40-person startup. Her team of 12 developers ships "all the time" but nobody knows the actual deployment frequency, lead times are "vibes," and post-mortems are happening too often. She needs data.

---

## The Four DORA Metrics

| Metric | Elite | High | Medium | Low |
|--------|-------|------|--------|-----|
| Deployment Frequency | Multiple/day | Daily | Weekly | Monthly |
| Lead Time for Changes | < 1 hour | < 1 day | < 1 week | > 1 month |
| MTTR | < 1 hour | < 1 day | < 1 day | > 1 day |
| Change Failure Rate | < 5% | < 10% | < 15% | > 15% |

---

## Step 1: Data Model with Prisma

```prisma
// schema.prisma
model Deployment {
  id          String   @id @default(cuid())
  repo        String
  environment String   // "production" | "staging"
  sha         String
  deployedAt  DateTime
  deployedBy  String
  status      String   // "success" | "failure" | "rollback"
  leadTimeMs  Int?     // ms from first commit to deploy

  @@index([repo, environment, deployedAt])
}

model PullRequest {
  id            String   @id @default(cuid())
  repo          String
  prNumber      Int
  title         String
  author        String
  firstCommitAt DateTime
  createdAt     DateTime
  reviewedAt    DateTime?
  mergedAt      DateTime?
  cycleTimeMs   Int?     // first commit → merge

  @@index([repo, mergedAt])
  @@unique([repo, prNumber])
}

model Incident {
  id           String    @id @default(cuid())
  repo         String
  title        String
  openedAt     DateTime
  resolvedAt   DateTime?
  severity     String    // "P1" | "P2" | "P3"
  linkedPrId   String?
  mttrMs       Int?      // time to resolution

  @@index([repo, openedAt])
}

model BuildRun {
  id         String   @id @default(cuid())
  repo       String
  branch     String
  workflow   String
  runId      String   @unique
  startedAt  DateTime
  finishedAt DateTime?
  status     String   // "success" | "failure" | "cancelled"
  durationMs Int?

  @@index([repo, branch, startedAt])
}
```

---

## Step 2: GitHub Actions Webhook Collector

```typescript
// app/api/webhooks/github/route.ts
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function verifySignature(payload: string, signature: string): boolean {
  const hmac = crypto.createHmac('sha256', process.env.GITHUB_WEBHOOK_SECRET!);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function POST(req: Request) {
  const payload = await req.text();
  const signature = req.headers.get('x-hub-signature-256') ?? '';

  if (!verifySignature(payload, signature)) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = req.headers.get('x-github-event');
  const data = JSON.parse(payload);

  if (event === 'workflow_run') {
    await handleWorkflowRun(data);
  } else if (event === 'pull_request') {
    await handlePullRequest(data);
  } else if (event === 'deployment_status') {
    await handleDeployment(data);
  }

  return Response.json({ ok: true });
}

async function handleWorkflowRun(data: Record<string, unknown>) {
  const run = data.workflow_run as Record<string, unknown>;
  if (!['completed'].includes(run.status as string)) return;

  const durationMs = run.updated_at && run.run_started_at
    ? new Date(run.updated_at as string).getTime() - new Date(run.run_started_at as string).getTime()
    : null;

  await prisma.buildRun.upsert({
    where: { runId: String(run.id) },
    create: {
      repo: (data.repository as Record<string, unknown>).full_name as string,
      branch: run.head_branch as string,
      workflow: run.name as string,
      runId: String(run.id),
      startedAt: new Date(run.run_started_at as string),
      finishedAt: new Date(run.updated_at as string),
      status: run.conclusion as string,
      durationMs,
    },
    update: {
      finishedAt: new Date(run.updated_at as string),
      status: run.conclusion as string,
      durationMs,
    },
  });
}

async function handlePullRequest(data: Record<string, unknown>) {
  const pr = data.pull_request as Record<string, unknown>;
  const action = data.action as string;

  if (!['opened', 'closed', 'review_requested'].includes(action)) return;

  // Get first commit date via GitHub API to calculate real cycle time
  let firstCommitAt = new Date(pr.created_at as string);
  try {
    const commitsRes = await fetch(
      `https://api.github.com/repos/${(data.repository as Record<string, unknown>).full_name}/pulls/${pr.number}/commits?per_page=1`,
      { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } }
    );
    const commits = await commitsRes.json();
    if (commits[0]?.commit?.author?.date) {
      firstCommitAt = new Date(commits[0].commit.author.date);
    }
  } catch {}

  const mergedAt = pr.merged_at ? new Date(pr.merged_at as string) : null;
  const cycleTimeMs = mergedAt
    ? mergedAt.getTime() - firstCommitAt.getTime()
    : null;

  await prisma.pullRequest.upsert({
    where: {
      repo_prNumber: {
        repo: (data.repository as Record<string, unknown>).full_name as string,
        prNumber: pr.number as number,
      },
    },
    create: {
      repo: (data.repository as Record<string, unknown>).full_name as string,
      prNumber: pr.number as number,
      title: pr.title as string,
      author: (pr.user as Record<string, unknown>).login as string,
      firstCommitAt,
      createdAt: new Date(pr.created_at as string),
      mergedAt,
      cycleTimeMs,
    },
    update: { mergedAt, cycleTimeMs },
  });
}
```

---

## Step 3: Compute DORA Metrics

```typescript
// lib/dora.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getDoraMetrics(repo: string, days = 30) {
  const since = new Date(Date.now() - days * 86400_000);

  const [deployments, failedDeploys, incidents, prs] = await Promise.all([
    prisma.deployment.findMany({
      where: { repo, environment: 'production', deployedAt: { gte: since } },
    }),
    prisma.deployment.count({
      where: { repo, environment: 'production', deployedAt: { gte: since }, status: 'failure' },
    }),
    prisma.incident.findMany({
      where: { repo, openedAt: { gte: since }, resolvedAt: { not: null } },
    }),
    prisma.pullRequest.findMany({
      where: { repo, mergedAt: { gte: since }, cycleTimeMs: { not: null } },
    }),
  ]);

  const successfulDeploys = deployments.filter(d => d.status === 'success');

  // Deployment frequency (per day)
  const deployFrequency = successfulDeploys.length / days;

  // Lead time (median for merged PRs with lead time data)
  const leadTimes = deployments
    .filter(d => d.leadTimeMs)
    .map(d => d.leadTimeMs!)
    .sort((a, b) => a - b);
  const medianLeadTime = leadTimes[Math.floor(leadTimes.length / 2)] ?? null;

  // Change failure rate
  const cfr = deployments.length > 0
    ? (failedDeploys / deployments.length * 100).toFixed(1) + '%'
    : 'N/A';

  // MTTR
  const mttrValues = incidents
    .filter(i => i.mttrMs)
    .map(i => i.mttrMs!)
    .sort((a, b) => a - b);
  const medianMTTR = mttrValues[Math.floor(mttrValues.length / 2)] ?? null;

  // PR cycle time
  const cycleTimes = prs.map(p => p.cycleTimeMs!).sort((a, b) => a - b);
  const p50CycleTime = cycleTimes[Math.floor(cycleTimes.length / 2)] ?? null;
  const p95CycleTime = cycleTimes[Math.floor(cycleTimes.length * 0.95)] ?? null;

  return {
    deploymentFrequency: deployFrequency.toFixed(2) + '/day',
    medianLeadTimeHours: medianLeadTime ? (medianLeadTime / 3600_000).toFixed(1) : 'N/A',
    changeFailureRate: cfr,
    medianMTTRHours: medianMTTR ? (medianMTTR / 3600_000).toFixed(1) : 'N/A',
    prCycleTimeP50Hours: p50CycleTime ? (p50CycleTime / 3600_000).toFixed(1) : 'N/A',
    prCycleTimeP95Hours: p95CycleTime ? (p95CycleTime / 3600_000).toFixed(1) : 'N/A',
    totalDeploys: deployments.length,
    totalPRsMerged: prs.length,
  };
}
```

---

## Step 4: Alert on Regressions via Slack

```typescript
// lib/alerts.ts
async function checkRegressions(repo: string) {
  const [current, previous] = await Promise.all([
    getDoraMetrics(repo, 7),   // this week
    getDoraMetrics(repo, 14),  // same period last week (approx)
  ]);

  const alerts: string[] = [];

  // Alert if CFR increased by > 5 percentage points
  const currentCFR = parseFloat(current.changeFailureRate);
  const previousCFR = parseFloat(previous.changeFailureRate);
  if (currentCFR - previousCFR > 5) {
    alerts.push(`🔴 Change failure rate jumped: ${previous.changeFailureRate} → ${current.changeFailureRate}`);
  }

  // Alert if P95 PR cycle time increased > 20%
  const currentP95 = parseFloat(current.prCycleTimeP95Hours);
  const previousP95 = parseFloat(previous.prCycleTimeP95Hours);
  if (currentP95 / previousP95 > 1.2) {
    alerts.push(`🟡 PR cycle time (P95) regressed: ${previous.prCycleTimeP95Hours}h → ${current.prCycleTimeP95Hours}h`);
  }

  if (alerts.length > 0) {
    await fetch(process.env.SLACK_WEBHOOK_URL!, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `⚠️ DevEx regression detected for *${repo}*:\n${alerts.join('\n')}`,
      }),
    });
  }
}
```

---

## Step 5: GitHub Actions — Trigger Metrics Sync

```yaml
# .github/workflows/sync-metrics.yml
name: Sync DevEx Metrics

on:
  schedule:
    - cron: '0 9 * * 1'   # Every Monday 9 AM
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Compute and check regressions
        run: npx tsx scripts/check-regressions.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

---

## Results

Rachel ran the dashboard for 4 weeks. Her team's P95 PR cycle time dropped from 48h to 18h after they saw the data. Deployment frequency doubled. The change failure rate spike in week 2 traced back to one engineer skipping code review.

> "We thought we had a process problem. We had a visibility problem. Once the team could see their own metrics, they self-corrected." — Rachel
