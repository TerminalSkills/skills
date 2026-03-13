---
name: neon-branching
description: >-
  You are an expert in Neon's database branching, the feature that creates
  instant copy-on-write branches of your Postgres database. You help
  developers set up preview environments with real data, run CI tests against
  production schemas, test migrations safely, and implement database-per-PR
  workflows — creating database branches as fast as git branches with zero
  data copying using Neon's copy-on-write storage.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Backend Development
  tags:
    - database
    - postgres
    - branching
    - preview
    - ci-cd
    - testing
    - serverless
---

# Neon Branching — Database Branching for Development

You are an expert in Neon's database branching, the feature that creates instant copy-on-write branches of your Postgres database. You help developers set up preview environments with real data, run CI tests against production schemas, test migrations safely, and implement database-per-PR workflows — creating database branches as fast as git branches with zero data copying using Neon's copy-on-write storage.

## Core Capabilities

### Branch Management

```bash
# Create branch from main (instant — copy-on-write, no data copy)
neonctl branches create --name preview/pr-42 --parent main

# Branch from specific point in time
neonctl branches create --name debug/incident-2026-03 \
  --parent main \
  --parent-timestamp "2026-03-10T14:30:00Z"

# Get connection string
neonctl connection-string preview/pr-42
# postgres://user:pass@ep-xyz.us-east-2.aws.neon.tech/mydb?sslmode=require

# List branches
neonctl branches list
# main            (default, 2.3 GB)
# preview/pr-42   (from main, 0 bytes overhead)
# staging         (from main, 12 MB diff)

# Delete when done
neonctl branches delete preview/pr-42
```

### CI/CD Integration

```yaml
# .github/workflows/preview.yml
name: Preview Environment
on: pull_request

jobs:
  preview:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Create Neon branch
        id: neon
        uses: neondatabase/create-branch-action@v5
        with:
          project_id: ${{ secrets.NEON_PROJECT_ID }}
          branch_name: preview/pr-${{ github.event.number }}
          api_key: ${{ secrets.NEON_API_KEY }}

      - name: Run migrations
        env:
          DATABASE_URL: ${{ steps.neon.outputs.db_url }}
        run: npx drizzle-kit push

      - name: Run tests
        env:
          DATABASE_URL: ${{ steps.neon.outputs.db_url }}
        run: npm test

      - name: Deploy preview
        env:
          DATABASE_URL: ${{ steps.neon.outputs.db_url }}
        run: vercel deploy --env DATABASE_URL=$DATABASE_URL

      - name: Comment PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
              body: `🚀 Preview deployed!\n- App: ${previewUrl}\n- DB Branch: preview/pr-${context.issue.number}`
            });
```

### API Usage

```typescript
import { createApiClient } from "@neondatabase/api-client";

const neon = createApiClient({ apiKey: process.env.NEON_API_KEY! });

// Create branch programmatically
async function createPreviewBranch(prNumber: number) {
  const { data: branch } = await neon.createProjectBranch(projectId, {
    branch: {
      name: `preview/pr-${prNumber}`,
      parent_id: mainBranchId,
    },
    endpoints: [{ type: "read_write" }],
  });

  // Get connection string
  const { data: connectionUri } = await neon.getConnectionUri({
    projectId,
    branchId: branch.branch.id,
    role_name: "neondb_owner",
  });

  return connectionUri.uri;
}

// Auto-cleanup: delete branches for merged/closed PRs
async function cleanupBranches() {
  const { data } = await neon.listProjectBranches(projectId);
  for (const branch of data.branches) {
    if (branch.name.startsWith("preview/pr-")) {
      const prNumber = branch.name.split("-").pop();
      const prState = await getPRState(prNumber);
      if (prState === "closed" || prState === "merged") {
        await neon.deleteProjectBranch(projectId, branch.id);
      }
    }
  }
}
```

## Installation

```bash
npm install -g neonctl
neonctl auth                               # Authenticate

# API client
npm install @neondatabase/api-client
```

## Best Practices

1. **Branch per PR** — Create database branch for each PR; test with real schema and data; delete on merge
2. **Instant creation** — Branches are copy-on-write; 2 TB database branches in <1 second, zero storage cost until writes
3. **Time travel** — Branch from a specific timestamp for debugging; inspect production state at incident time
4. **Migration testing** — Run migrations on branch before applying to main; catch errors safely
5. **CI integration** — Use GitHub Actions to auto-create/delete branches; fully automated preview environments
6. **Auto-cleanup** — Delete branches when PRs close; prevent branch sprawl and unnecessary compute costs
7. **Staging branch** — Keep a persistent staging branch; reset from main periodically
8. **Connection pooling** — Use Neon's built-in connection pooler for serverless (append `-pooler` to host)
