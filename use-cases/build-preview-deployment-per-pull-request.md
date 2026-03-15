---
title: Build Preview Deployments Per Pull Request
slug: build-preview-deployment-per-pull-request
description: Build an automated preview deployment system that spins up an isolated environment for every pull request — with unique URLs, seeded databases, automatic cleanup, and Slack notifications.
skills:
  - typescript
  - zod
  - postgresql
category: devops
tags:
  - preview-deployments
  - ci-cd
  - github-actions
  - automation
  - developer-experience
---

# Build Preview Deployments Per Pull Request

## The Problem

Alex leads frontend at a 35-person company. Designers review PRs by reading code diffs — they can't see what the change actually looks like. Product managers wait for staging merges to test features. QA tests on a shared staging environment where 5 developers' changes collide. "It works on my machine" is a daily phrase. They need isolated preview environments for every PR: push code → get a unique URL → share with designers, PM, and QA — all with realistic data, and automatic cleanup when the PR is merged.

## Step 1: Build the Preview Orchestrator

```typescript
// src/previews/orchestrator.ts — Manage preview environments per PR
import { execSync } from "node:child_process";
import { pool } from "../db";

interface PreviewEnvironment {
  id: string;
  prNumber: number;
  repo: string;
  branch: string;
  url: string;
  databaseUrl: string;
  status: "deploying" | "ready" | "failed" | "destroyed";
  createdAt: string;
  expiresAt: string;
}

const DOMAIN = "previews.example.com";
const DOCKER_REGISTRY = "registry.example.com";
const MAX_PREVIEWS = 20;  // limit concurrent previews

// Create a preview environment for a PR
export async function createPreview(
  prNumber: number,
  repo: string,
  branch: string,
  commitSha: string
): Promise<PreviewEnvironment> {
  const id = `preview-${prNumber}`;
  const subdomain = `pr-${prNumber}`;
  const url = `https://${subdomain}.${DOMAIN}`;

  // Check limits
  const { rows: [{ count }] } = await pool.query(
    "SELECT COUNT(*) as count FROM preview_environments WHERE status IN ('deploying', 'ready')"
  );
  if (parseInt(count) >= MAX_PREVIEWS) {
    // Destroy oldest preview
    const { rows: [oldest] } = await pool.query(
      "SELECT id FROM preview_environments WHERE status = 'ready' ORDER BY created_at ASC LIMIT 1"
    );
    if (oldest) await destroyPreview(oldest.id);
  }

  // Record environment
  await pool.query(
    `INSERT INTO preview_environments (id, pr_number, repo, branch, url, status, created_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'deploying', NOW(), NOW() + INTERVAL '7 days')
     ON CONFLICT (id) DO UPDATE SET branch = $4, status = 'deploying', updated_at = NOW()`,
    [id, prNumber, repo, branch, url]
  );

  try {
    // 1. Build Docker image
    const imageTag = `${DOCKER_REGISTRY}/${repo}:pr-${prNumber}-${commitSha.slice(0, 7)}`;
    execSync(`docker build -t ${imageTag} .`, { cwd: `/builds/${repo}`, stdio: "pipe" });
    execSync(`docker push ${imageTag}`, { stdio: "pipe" });

    // 2. Create isolated database
    const dbName = `preview_pr_${prNumber}`;
    execSync(`createdb ${dbName}`, { stdio: "pipe" });

    // Apply migrations
    const databaseUrl = `postgresql://previews:${process.env.PREVIEW_DB_PASSWORD}@localhost:5432/${dbName}`;
    execSync(`DATABASE_URL="${databaseUrl}" npx drizzle-kit push`, {
      cwd: `/builds/${repo}`,
      stdio: "pipe",
    });

    // Seed with sample data
    execSync(`DATABASE_URL="${databaseUrl}" node scripts/seed-preview.js`, {
      cwd: `/builds/${repo}`,
      stdio: "pipe",
    });

    // 3. Deploy container
    execSync(`docker run -d \
      --name ${id} \
      --network preview-net \
      -e DATABASE_URL="${databaseUrl}" \
      -e NODE_ENV=preview \
      -e BASE_URL="${url}" \
      -l "traefik.enable=true" \
      -l "traefik.http.routers.${id}.rule=Host(\\\`${subdomain}.${DOMAIN}\\\`)" \
      -l "traefik.http.routers.${id}.tls=true" \
      ${imageTag}`, { stdio: "pipe" });

    // 4. Wait for health check
    await waitForHealth(url);

    await pool.query(
      "UPDATE preview_environments SET status = 'ready', database_url = $2 WHERE id = $1",
      [id, databaseUrl]
    );

    return {
      id, prNumber, repo, branch, url,
      databaseUrl, status: "ready",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
    };
  } catch (err: any) {
    await pool.query(
      "UPDATE preview_environments SET status = 'failed', error = $2 WHERE id = $1",
      [id, err.message]
    );
    throw err;
  }
}

// Destroy a preview environment
export async function destroyPreview(id: string): Promise<void> {
  const { rows: [env] } = await pool.query(
    "SELECT pr_number FROM preview_environments WHERE id = $1", [id]
  );

  if (!env) return;

  try {
    // Stop and remove container
    execSync(`docker rm -f ${id}`, { stdio: "pipe" });

    // Drop database
    execSync(`dropdb --if-exists preview_pr_${env.pr_number}`, { stdio: "pipe" });
  } catch { /* best effort cleanup */ }

  await pool.query("UPDATE preview_environments SET status = 'destroyed', destroyed_at = NOW() WHERE id = $1", [id]);
}

// Cleanup expired previews
export async function cleanupExpired(): Promise<number> {
  const { rows } = await pool.query(
    "SELECT id FROM preview_environments WHERE status = 'ready' AND expires_at < NOW()"
  );

  for (const { id } of rows) {
    await destroyPreview(id);
  }

  return rows.length;
}

async function waitForHealth(url: string, maxWaitMs: number = 60000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    try {
      const res = await fetch(`${url}/health`);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("Health check timeout");
}
```

## Step 2: GitHub Integration

```typescript
// src/previews/github.ts — GitHub webhook handler for PR events
import { Hono } from "hono";
import { createPreview, destroyPreview } from "./orchestrator";

const app = new Hono();

app.post("/webhook/preview", async (c) => {
  const event = c.req.header("X-GitHub-Event");
  const payload = await c.req.json();

  if (event === "pull_request") {
    const pr = payload.pull_request;
    const repo = payload.repository.name;

    if (["opened", "synchronize"].includes(payload.action)) {
      // Deploy preview
      const preview = await createPreview(pr.number, repo, pr.head.ref, pr.head.sha);

      // Comment on PR with preview URL
      await postGithubComment(repo, pr.number,
        `🚀 **Preview deployed!**\n\n` +
        `🔗 **URL:** ${preview.url}\n` +
        `📦 Branch: \`${pr.head.ref}\`\n` +
        `⏰ Expires: 7 days\n\n` +
        `_Updated on every push. Database seeded with sample data._`
      );

      // Notify Slack
      await notifySlack(`Preview for PR #${pr.number} is ready: ${preview.url}`);
    }

    if (["closed"].includes(payload.action)) {
      await destroyPreview(`preview-${pr.number}`);
      await postGithubComment(repo, pr.number, `🧹 Preview environment destroyed.`);
    }
  }

  return c.json({ ok: true });
});

async function postGithubComment(repo: string, prNumber: number, body: string) {
  await fetch(`https://api.github.com/repos/org/${repo}/issues/${prNumber}/comments`, {
    method: "POST",
    headers: {
      Authorization: `token ${process.env.GITHUB_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });
}

async function notifySlack(message: string) {
  await fetch(process.env.SLACK_WEBHOOK_URL!, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message }),
  });
}

export default app;
```

## Results

- **Designer reviews went from "reading diffs" to clicking a link** — every PR gets a unique URL with the actual running app; design feedback is concrete, not theoretical
- **QA environment conflicts eliminated** — each PR is completely isolated; no more "my tests broke because someone else pushed to staging"
- **PR review time dropped 40%** — reviewers see the feature running, not just code; obvious UX issues caught before merge
- **Automatic cleanup** — preview environments destroyed when the PR is merged/closed; expired environments cleaned up after 7 days; no resource waste
- **Seeded with realistic data** — preview databases have sample users, orders, and content; testers don't start with an empty app
