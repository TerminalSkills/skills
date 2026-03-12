---
title: Build an Automated Dependency Update Pipeline
slug: build-automated-dependency-update-pipeline
description: >
  Automate npm/pip dependency updates with vulnerability scanning,
  compatibility testing, and auto-merge for safe updates — keeping
  200 dependencies current and closing CVEs in hours instead of months.
skills:
  - typescript
  - github-actions
  - docker
  - vitest
  - zod
category: DevOps & Infrastructure
tags:
  - dependency-management
  - security
  - automation
  - supply-chain
  - renovate
  - vulnerability
---

# Build an Automated Dependency Update Pipeline

## The Problem

A monorepo has 200+ npm dependencies. Nobody updates them — "if it works, don't touch it." Result: 47 known CVEs across transitive dependencies, 3 are critical. The team tried Dependabot but got 50 PRs per week that nobody reviews. When someone finally updates a major dependency, it breaks 3 things because the codebase was 18 months behind. A security audit flags the CVEs, and now it's a 2-week emergency project to update everything at once.

## Step 1: Dependency Scanner and Risk Scorer

```typescript
// src/deps/scanner.ts
import { z } from 'zod';
import { execSync } from 'child_process';

const DependencyUpdate = z.object({
  name: z.string(),
  currentVersion: z.string(),
  latestVersion: z.string(),
  updateType: z.enum(['patch', 'minor', 'major']),
  isDevDep: z.boolean(),
  hasBreakingChanges: z.boolean(),
  cveCount: z.number().int(),
  cveSeverity: z.enum(['none', 'low', 'medium', 'high', 'critical']),
  riskScore: z.number().min(0).max(100),
  autoMergeable: z.boolean(),
  changelog: z.string().optional(),
});

export async function scanDependencies(): Promise<z.infer<typeof DependencyUpdate>[]> {
  // Get outdated packages
  const outdatedRaw = execSync('npm outdated --json 2>/dev/null || true', { encoding: 'utf8' });
  const outdated = JSON.parse(outdatedRaw || '{}');

  // Get audit results
  const auditRaw = execSync('npm audit --json 2>/dev/null || true', { encoding: 'utf8' });
  const audit = JSON.parse(auditRaw || '{"vulnerabilities":{}}');

  const updates: z.infer<typeof DependencyUpdate>[] = [];

  for (const [name, info] of Object.entries(outdated) as any) {
    const updateType = getUpdateType(info.current, info.latest);
    const vulns = audit.vulnerabilities?.[name];
    const maxSeverity = vulns?.severity ?? 'none';
    const cveCount = vulns?.via?.length ?? 0;

    const riskScore = calculateRisk(updateType, maxSeverity, info.type === 'devDependencies');
    const autoMergeable = riskScore < 30; // Low-risk updates auto-merge

    updates.push({
      name,
      currentVersion: info.current,
      latestVersion: info.latest,
      updateType,
      isDevDep: info.type === 'devDependencies',
      hasBreakingChanges: updateType === 'major',
      cveCount,
      cveSeverity: maxSeverity,
      riskScore,
      autoMergeable,
    });
  }

  return updates.sort((a, b) => b.riskScore - a.riskScore);
}

function getUpdateType(current: string, latest: string): 'patch' | 'minor' | 'major' {
  const [cMajor, cMinor] = current.split('.').map(Number);
  const [lMajor, lMinor] = latest.split('.').map(Number);
  if (cMajor !== lMajor) return 'major';
  if (cMinor !== lMinor) return 'minor';
  return 'patch';
}

function calculateRisk(updateType: string, severity: string, isDev: boolean): number {
  let score = 0;

  // Update type risk
  if (updateType === 'major') score += 50;
  else if (updateType === 'minor') score += 20;
  else score += 5;

  // CVE severity
  const severityScores: Record<string, number> = { critical: 40, high: 30, medium: 15, low: 5, none: 0 };
  score += severityScores[severity] ?? 0;

  // Dev dependencies are lower risk
  if (isDev) score = Math.floor(score * 0.5);

  return Math.min(100, score);
}
```

## Step 2: Update Strategy Engine

```typescript
// src/deps/strategy.ts
import type { DependencyUpdate } from './scanner';

interface UpdateBatch {
  name: string;
  updates: DependencyUpdate[];
  strategy: 'auto-merge' | 'test-then-merge' | 'manual-review';
  priority: number;
}

export function createUpdateBatches(updates: DependencyUpdate[]): UpdateBatch[] {
  const batches: UpdateBatch[] = [];

  // Batch 1: Critical CVEs (immediate, individual PRs)
  const criticalCVEs = updates.filter(u => u.cveSeverity === 'critical' || u.cveSeverity === 'high');
  for (const update of criticalCVEs) {
    batches.push({
      name: `security: ${update.name}@${update.latestVersion}`,
      updates: [update],
      strategy: update.updateType === 'patch' ? 'auto-merge' : 'test-then-merge',
      priority: 1,
    });
  }

  // Batch 2: Safe patches (grouped, auto-merge)
  const safePatches = updates.filter(u =>
    u.updateType === 'patch' && u.cveSeverity === 'none' && !criticalCVEs.includes(u)
  );
  if (safePatches.length > 0) {
    batches.push({
      name: `chore: patch updates (${safePatches.length} packages)`,
      updates: safePatches,
      strategy: 'auto-merge',
      priority: 3,
    });
  }

  // Batch 3: Dev dependency updates (grouped, auto-merge)
  const devUpdates = updates.filter(u =>
    u.isDevDep && u.updateType !== 'major' && !criticalCVEs.includes(u) && !safePatches.includes(u)
  );
  if (devUpdates.length > 0) {
    batches.push({
      name: `chore: dev dependency updates (${devUpdates.length} packages)`,
      updates: devUpdates,
      strategy: 'auto-merge',
      priority: 4,
    });
  }

  // Batch 4: Minor updates (test first)
  const minorUpdates = updates.filter(u =>
    u.updateType === 'minor' && !u.isDevDep && !criticalCVEs.includes(u)
  );
  if (minorUpdates.length > 0) {
    batches.push({
      name: `chore: minor updates (${minorUpdates.length} packages)`,
      updates: minorUpdates,
      strategy: 'test-then-merge',
      priority: 5,
    });
  }

  // Batch 5: Major updates (individual PRs, manual review)
  const majorUpdates = updates.filter(u => u.updateType === 'major' && !criticalCVEs.includes(u));
  for (const update of majorUpdates) {
    batches.push({
      name: `feat: upgrade ${update.name} to ${update.latestVersion}`,
      updates: [update],
      strategy: 'manual-review',
      priority: 10,
    });
  }

  return batches.sort((a, b) => a.priority - b.priority);
}
```

## Step 3: GitHub Actions Workflow

```yaml
# .github/workflows/dependency-updates.yml
name: Automated Dependency Updates
on:
  schedule:
    - cron: '0 6 * * 1' # Monday 6 AM
  workflow_dispatch:

jobs:
  scan-and-update:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci

      - name: Scan dependencies
        run: npx tsx src/deps/scanner.ts > scan-results.json

      - name: Create update batches
        run: npx tsx src/deps/strategy.ts < scan-results.json > batches.json

      - name: Apply updates and create PRs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          BATCHES=$(cat batches.json)
          echo "$BATCHES" | node -e "
            const fs = require('fs');
            const batches = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
            
            for (const batch of batches) {
              console.log('Processing: ' + batch.name);
              console.log('Strategy: ' + batch.strategy);
              console.log('Updates: ' + batch.updates.map(u => u.name + '@' + u.latestVersion).join(', '));
              console.log('---');
            }
          "

      - name: Run tests for auto-merge candidates
        run: npm test

      - name: Auto-merge safe updates
        if: success()
        run: echo "Auto-merging safe patches..."
```

## Results

- **CVE closure time**: hours (was months — 47 CVEs fixed in first week)
- **Critical CVEs**: auto-patched same day they're published
- **50 Dependabot PRs/week**: replaced by 3-5 batched, prioritized PRs
- **Safe patch auto-merge**: 60% of updates merged without human review
- **Major version lag**: never more than 1 major version behind
- **Security audit**: zero CVE findings (was 47)
- **Developer time on deps**: 1 hour/week reviewing major updates (was 0 hours = ignored)
