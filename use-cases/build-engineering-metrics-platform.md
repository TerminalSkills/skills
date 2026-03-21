---
title: "Build an Engineering Metrics Platform"
description: "Measure team health and delivery with DORA metrics, cycle time, PR analytics, and incident tracking — with weekly Slack digests for leadership."
skills: [github-actions, prisma, resend]
difficulty: advanced
time_estimate: "16 hours"
tags: [engineering, metrics, dora, devops, github, analytics, slack, prisma, resend]
---

# Build an Engineering Metrics Platform

## The Problem

"How's the team doing?" gets answered with vibes instead of data. Engineering managers need objective metrics for performance reviews, planning, and identifying bottlenecks — but pulling this from GitHub manually is tedious and inconsistent.

## What You'll Build

- **DORA metrics**: deployment frequency, lead time, MTTR, change failure rate
- **Cycle time breakdown**: coding → review → merge → deploy
- **PR analytics**: review latency, first-time pass rate, comments per PR
- **Incident tracking**: MTTR trends, frequency by service
- **Weekly digest**: automated Slack message + email report every Monday

## Persona

**Chris, VP of Engineering** — manages 4 teams, 22 engineers. Needs data for quarterly review and wants to spot which team is struggling before it becomes a crisis. Currently uses gut instinct.

---

## Architecture

```
GitHub API + Webhooks → Ingestion Service → Prisma/Postgres
                                                    │
                                          Metrics Compute Engine
                                                    │
                                ┌──────────────────┼──────────────────┐
                                │                  │                  │
                           Dashboard           Slack digest       Email report
                          (Next.js)            (weekly cron)     (Resend)
```

---

## Step 1: Database Schema

```prisma
// schema.prisma
model PullRequest {
  id            String    @id @default(cuid())
  githubId      Int       @unique
  repo          String
  author        String
  title         String
  state         String    // open | merged | closed
  firstCommitAt DateTime?
  openedAt      DateTime
  firstReviewAt DateTime?
  mergedAt      DateTime?
  deployedAt    DateTime?
  changeFailure Boolean   @default(false)
  reviewCount   Int       @default(0)
  commentCount  Int       @default(0)
  createdAt     DateTime  @default(now())
}

model Deployment {
  id          String   @id @default(cuid())
  repo        String
  environment String
  status      String   // success | failure
  sha         String
  deployedAt  DateTime
  duration    Int?     // seconds
  prId        String?
}

model Incident {
  id          String    @id @default(cuid())
  service     String
  severity    String    // sev1 | sev2 | sev3
  openedAt    DateTime
  resolvedAt  DateTime?
  cause       String?
}
```

---

## Step 2: GitHub Webhook Ingestion

```typescript
// app/api/webhooks/github/route.ts
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

function verifySignature(payload: string, signature: string) {
  const hmac = crypto.createHmac("sha256", process.env.GITHUB_WEBHOOK_SECRET!);
  const digest = "sha256=" + hmac.update(payload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("x-hub-signature-256") ?? "";
  if (!verifySignature(body, sig)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event");
  const payload = JSON.parse(body);

  if (event === "pull_request") {
    const pr = payload.pull_request;
    await prisma.pullRequest.upsert({
      where: { githubId: pr.id },
      update: {
        state: pr.state,
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
        reviewCount: pr.requested_reviewers?.length ?? 0,
      },
      create: {
        githubId: pr.id,
        repo: payload.repository.full_name,
        author: pr.user.login,
        title: pr.title,
        state: pr.state,
        openedAt: new Date(pr.created_at),
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      },
    });
  }

  if (event === "deployment_status") {
    const dep = payload.deployment_status;
    await prisma.deployment.create({
      data: {
        repo: payload.repository.full_name,
        environment: payload.deployment.environment,
        status: dep.state,
        sha: payload.deployment.sha,
        deployedAt: new Date(dep.created_at),
      },
    });
  }

  return NextResponse.json({ ok: true });
}
```

---

## Step 3: DORA Metrics Compute

```typescript
// lib/dora.ts
import { prisma } from "./prisma";
import { subDays, differenceInHours, differenceInMinutes } from "date-fns";

export async function computeDORA(repo: string, days = 30) {
  const since = subDays(new Date(), days);

  const deployments = await prisma.deployment.findMany({
    where: { repo, deployedAt: { gte: since } },
  });

  const prs = await prisma.pullRequest.findMany({
    where: { repo, mergedAt: { gte: since } },
  });

  const incidents = await prisma.incident.findMany({
    where: { openedAt: { gte: since }, resolvedAt: { not: null } },
  });

  // Deployment Frequency (per day)
  const successfulDeps = deployments.filter(d => d.status === "success");
  const deployFrequency = successfulDeps.length / days;

  // Lead Time for Changes (commit → deploy, hours)
  const leadTimes = prs
    .filter(pr => pr.firstCommitAt && pr.deployedAt)
    .map(pr => differenceInHours(pr.deployedAt!, pr.firstCommitAt!));
  const avgLeadTime = leadTimes.length
    ? leadTimes.reduce((s, n) => s + n, 0) / leadTimes.length
    : 0;

  // Change Failure Rate
  const failedDeps = deployments.filter(d => d.status === "failure");
  const changeFailureRate = deployments.length
    ? (failedDeps.length / deployments.length) * 100
    : 0;

  // Mean Time to Recovery (minutes)
  const mttrs = incidents
    .filter(i => i.resolvedAt)
    .map(i => differenceInMinutes(i.resolvedAt!, i.openedAt));
  const mttr = mttrs.length
    ? mttrs.reduce((s, n) => s + n, 0) / mttrs.length
    : 0;

  return {
    deployFrequency: deployFrequency.toFixed(2),
    avgLeadTimeHours: avgLeadTime.toFixed(1),
    changeFailureRate: changeFailureRate.toFixed(1) + "%",
    mttrMinutes: Math.round(mttr),
    eliteBenchmarks: {
      deployFrequency: "≥ 1/day",
      leadTime: "< 1 hour",
      changeFailureRate: "0-15%",
      mttr: "< 60 min",
    },
  };
}
```

---

## Step 4: Weekly Digest with Resend

```typescript
// cron/weekly-digest.ts — run every Monday 9am
import { Resend } from "resend";
import { computeDORA } from "@/lib/dora";
import { WebClient } from "@slack/web-api";

const resend = new Resend(process.env.RESEND_API_KEY);
const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

export async function sendWeeklyDigest() {
  const repos = ["org/api", "org/frontend", "org/infra"];
  const reports = await Promise.all(repos.map(r => computeDORA(r, 7)));

  // Slack
  await slack.chat.postMessage({
    channel: "#engineering-metrics",
    text: "📊 Weekly Engineering Metrics",
    blocks: reports.flatMap((r, i) => [
      { type: "header", text: { type: "plain_text", text: repos[i] } },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Deploy freq:* ${r.deployFrequency}/day` },
          { type: "mrkdwn", text: `*Lead time:* ${r.avgLeadTimeHours}h` },
          { type: "mrkdwn", text: `*Change fail:* ${r.changeFailureRate}` },
          { type: "mrkdwn", text: `*MTTR:* ${r.mttrMinutes}min` },
        ],
      },
    ]),
  });

  // Email
  await resend.emails.send({
    from: "metrics@yourcompany.com",
    to: ["vp-eng@yourcompany.com"],
    subject: "Weekly Engineering Metrics Digest",
    html: `<pre>${JSON.stringify(reports, null, 2)}</pre>`,
  });
}
```

---

## GitHub Actions: Deploy Event Trigger

```yaml
# .github/workflows/notify-metrics.yml
name: Notify Metrics Platform
on:
  deployment_status:
    states: [success, failure]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v7
        with:
          script: |
            await fetch(process.env.METRICS_WEBHOOK_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                repo: context.repo.repo,
                sha: context.sha,
                state: context.payload.deployment_status.state,
                environment: context.payload.deployment.environment,
              })
            });
        env:
          METRICS_WEBHOOK_URL: ${{ secrets.METRICS_WEBHOOK_URL }}
```

---

## What's Next

- AI-powered anomaly detection (flag unusual spikes in lead time)
- Per-team benchmarking and goal tracking
- Jira/Linear integration for issue cycle time
- Public status page for executive dashboards
