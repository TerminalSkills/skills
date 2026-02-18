---
name: bitbucket
description: >-
  Manage repositories, pipelines, and code review with Bitbucket Cloud. Use when
  a user asks to set up Bitbucket repositories, configure Bitbucket Pipelines
  for CI/CD, manage pull requests, set up branch permissions, use Bitbucket REST
  API 2.0, create webhooks, manage deployment environments, set up code review
  workflows, integrate with Jira, configure merge checks, or automate repository
  operations. Covers repository management, CI/CD pipelines, code review,
  deployments, and Atlassian ecosystem integration.
license: Apache-2.0
compatibility: Node.js 18+ or any HTTP client (REST API 2.0)
metadata:
  author: terminal-skills
  version: 1.0.0
  category: devops
  tags:
    - bitbucket
    - atlassian
    - git
    - ci-cd
    - pipelines
---

# Bitbucket

## Overview

Automate and extend Bitbucket Cloud — Atlassian's Git platform with built-in CI/CD. This skill covers repository management, Bitbucket Pipelines configuration, pull request workflows, branch permissions, deployment environments, the REST API 2.0, webhooks, Jira integration, and merge checks.

## Instructions

### Step 1: Authentication

```typescript
// Bitbucket Cloud uses App Passwords (basic auth) or OAuth 2.0.
// Create an App Password at: https://bitbucket.org/account/settings/app-passwords/

const BB_BASE = "https://api.bitbucket.org/2.0";
const AUTH = Buffer.from(
  `${process.env.BB_USERNAME}:${process.env.BB_APP_PASSWORD}`
).toString("base64");

async function bb(method: string, path: string, body?: any) {
  const res = await fetch(`${BB_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${AUTH}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`BB ${method} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
```

### Step 2: Repositories

```typescript
// Create a repository
const repo = await bb("POST", `/repositories/my-workspace/my-new-repo`, {
  scm: "git",
  is_private: true,
  description: "Backend API service",
  project: { key: "ENG" },
  mainbranch: { name: "main" },
  fork_policy: "no_public_forks",
});

// List, get details, list branches
const repos = await bb("GET", `/repositories/my-workspace?q=project.key="ENG"&sort=-updated_on&pagelen=25`);
const repoInfo = await bb("GET", `/repositories/my-workspace/my-repo`);
const branches = await bb("GET", `/repositories/my-workspace/my-repo/refs/branches?sort=-target.date&pagelen=25`);

// Get file content / browse tree
const fileContent = await fetch(
  `${BB_BASE}/repositories/my-workspace/my-repo/src/main/README.md`,
  { headers: { Authorization: `Basic ${AUTH}` } }
).then(r => r.text());
```

### Step 3: Pull Requests

```typescript
// Create a pull request (Jira keys like ENG-142 in description auto-link)
const pr = await bb("POST", `/repositories/my-workspace/my-repo/pullrequests`, {
  title: "feat: add user authentication module",
  description: "Implements OAuth2 login.\n\nCloses ENG-142",
  source: { branch: { name: "feature/auth" } },
  destination: { branch: { name: "main" } },
  close_source_branch: true,
  reviewers: [{ account_id: "5f1234abc..." }],
});

// List, approve, request changes
const openPRs = await bb("GET", `/repositories/my-workspace/my-repo/pullrequests?state=OPEN&pagelen=50`);
await bb("POST", `/repositories/my-workspace/my-repo/pullrequests/${pr.id}/approve`);
await bb("POST", `/repositories/my-workspace/my-repo/pullrequests/${pr.id}/request-changes`);

// Comments (general and inline on a specific file/line)
await bb("POST", `/repositories/my-workspace/my-repo/pullrequests/${pr.id}/comments`, {
  content: { raw: "Looks good! One suggestion on the token expiry logic." },
});
await bb("POST", `/repositories/my-workspace/my-repo/pullrequests/${pr.id}/comments`, {
  content: { raw: "Use `crypto.timingSafeEqual` here to prevent timing attacks." },
  inline: { path: "src/auth/jwt.ts", to: 42 },
});

// Merge: "merge_commit" | "squash" | "fast_forward"
await bb("POST", `/repositories/my-workspace/my-repo/pullrequests/${pr.id}/merge`, {
  merge_strategy: "squash",
  message: "feat: add user authentication module (#142)",
  close_source_branch: true,
});
```

### Step 4: Branch Permissions & Merge Checks

```typescript
// Branch permissions require Premium plan. Pattern supports globs: release/*
// Require 2 approvals to merge to main
await bb("POST", `/repositories/my-workspace/my-repo/branch-restrictions`, {
  kind: "require_approvals_to_merge", pattern: "main", value: 2,
});

// Prevent direct pushes (force PRs)
await bb("POST", `/repositories/my-workspace/my-repo/branch-restrictions`, {
  kind: "push", pattern: "main", users: [], groups: [],
});

// Require passing builds and resolved tasks before merge
await bb("POST", `/repositories/my-workspace/my-repo/branch-restrictions`, {
  kind: "require_passing_builds_to_merge", pattern: "main", value: 1,
});
await bb("POST", `/repositories/my-workspace/my-repo/branch-restrictions`, {
  kind: "require_tasks_to_be_completed", pattern: "main",
});
```

### Step 5: Bitbucket Pipelines (CI/CD)

```yaml
# bitbucket-pipelines.yml — runs in Docker containers
image: node:20-slim

definitions:
  steps:
    - step: &test
        name: Test
        caches: [node]
        script: [npm ci, npm run lint, npm run test:coverage]
        artifacts: [coverage/**]
    - step: &build
        name: Build
        caches: [node]
        script: [npm ci, npm run build]
        artifacts: [dist/**]

pipelines:
  default:
    - step: *test
  branches:
    main:
      - step: *test
      - step: *build
      - step:
          name: Deploy to Production
          deployment: production
          trigger: manual
          script:
            - pipe: atlassian/aws-ecs-deploy:1.0.0
              variables:
                AWS_ACCESS_KEY_ID: $AWS_ACCESS_KEY_ID
                AWS_SECRET_ACCESS_KEY: $AWS_SECRET_ACCESS_KEY
                AWS_DEFAULT_REGION: "eu-west-1"
                CLUSTER_NAME: "prod-cluster"
                SERVICE_NAME: "api-service"
  pull-requests:
    '**':
      - step: *test
  custom:
    run-migrations:
      - step:
          name: Run Database Migrations
          script: [npm ci, npm run db:migrate]
```

```typescript
// Trigger a custom pipeline via API
const pipeline = await bb("POST", `/repositories/my-workspace/my-repo/pipelines/`, {
  target: {
    type: "pipeline_ref_target", ref_type: "branch", ref_name: "main",
    selector: { type: "custom", pattern: "run-migrations" },
  },
  variables: [{ key: "MIGRATION_TARGET", value: "v2.1.0", secured: false }],
});

// Check status: state.name = "PENDING" | "IN_PROGRESS" | "COMPLETED"
const status = await bb("GET", `/repositories/my-workspace/my-repo/pipelines/${pipeline.uuid}`);
const pipelines = await bb("GET", `/repositories/my-workspace/my-repo/pipelines/?sort=-created_on&pagelen=10`);
```

### Step 6: Deployment Environments & Variables

```typescript
// Create environment: type name = "Test" | "Staging" | "Production"
const environment = await bb("POST", `/repositories/my-workspace/my-repo/environments/`, {
  type: "deployment_environment",
  name: "Production",
  environment_type: { type: "deployment_environment_type", name: "Production" },
});

// Pipeline variables (secured=true encrypts, never shown in logs)
await bb("POST", `/repositories/my-workspace/my-repo/pipelines_config/variables/`, {
  key: "AWS_ACCESS_KEY_ID", value: "AKIA...", secured: true,
});

// Per-environment variables
await bb("POST", `/repositories/my-workspace/my-repo/deployments_config/environments/${environment.uuid}/variables`, {
  key: "API_URL", value: "https://api.production.example.com", secured: false,
});
```

### Step 7: Webhooks & Jira Integration

```typescript
// Register a webhook
const webhook = await bb("POST", `/repositories/my-workspace/my-repo/hooks`, {
  description: "CI/CD event handler",
  url: "https://your-app.com/webhook/bitbucket",
  active: true,
  events: ["repo:push", "pullrequest:created", "pullrequest:fulfilled"],
});

// Webhook handler — event type is in x-event-key header
app.post("/webhook/bitbucket", (req, res) => {
  res.sendStatus(200);
  const event = req.headers["x-event-key"];
  if (event === "repo:push") console.log(`Push to ${req.body.push.changes[0].new.name}`);
  if (event === "pullrequest:fulfilled") console.log(`PR merged: ${req.body.pullrequest.title}`);
});

// Jira integration: mention keys (ENG-142) in commits/branches/PRs for auto-linking.
// Smart commits: git commit -m "ENG-142 #time 2h #comment Fixed auth bug #done"
```

### Step 8: Code Search & Reports

```typescript
// Search code across workspace repositories
const searchResults = await bb("GET",
  `/workspaces/my-workspace/search/code?search_query=${encodeURIComponent('lang:typescript "jwt.verify"')}&pagelen=20`
);

// Commit history, diff, and branch comparison
const commits = await bb("GET", `/repositories/my-workspace/my-repo/commits?pagelen=30`);
const diff = await fetch(`${BB_BASE}/repositories/my-workspace/my-repo/diff/${commitHash}`,
  { headers: { Authorization: `Basic ${AUTH}` } }).then(r => r.text());
const compare = await bb("GET", `/repositories/my-workspace/my-repo/commits?include=main&exclude=release/2.0`);
```

## Examples

### Example 1: Set up a new repository with CI/CD and branch protection
**User prompt:** "Create a new private Bitbucket repository called 'payment-service' in the FINTECH workspace under the PAYMENTS project. Set up a CI pipeline that runs tests on every push, deploys to staging on develop, and requires manual approval for production deploys from main. Protect main with 2 required approvals."

The agent will:
1. Create the repository via `POST /repositories/fintech-workspace/payment-service` with `is_private: true` and `project: { key: "PAYMENTS" }`.
2. Generate a `bitbucket-pipelines.yml` with test, build, staging deploy, and manual production deploy steps using YAML anchors for reusable step definitions.
3. Add branch restrictions for `main`: require 2 approvals to merge, block direct pushes, and require passing builds.
4. Set up deployment environments for Staging and Production with appropriate environment variables.

### Example 2: Automate PR workflow with Jira integration
**User prompt:** "Write a script that creates a pull request from the current feature branch to main, adds two reviewers, and links it to the Jira ticket ENG-287. Then set up a webhook to notify our Slack channel when PRs are merged."

The agent will:
1. Detect the current branch name from git.
2. Create a PR via the API with the Jira key ENG-287 in the description for automatic Jira linking, setting `close_source_branch: true` and adding the two reviewer account IDs.
3. Register a webhook listening for `pullrequest:fulfilled` events pointing to the team's webhook endpoint.
4. Provide a webhook handler code snippet that parses the merged PR payload and posts a notification to Slack.

## Guidelines

- Use App Passwords for scripts and personal integrations; use OAuth 2.0 for shared applications that act on behalf of multiple users.
- Always set `close_source_branch: true` on pull requests to automatically clean up feature branches after merging.
- Branch permissions (requiring approvals, blocking direct pushes) require the Bitbucket Premium plan; check your workspace plan before configuring restrictions.
- Use `--download-archive` style tracking with pipeline variables marked `secured: true` for any secrets; secured variables are encrypted and never exposed in build logs.
- Reference Jira issue keys (e.g., ENG-142) in commit messages, branch names, and PR descriptions to get automatic bidirectional linking between Bitbucket and Jira.
