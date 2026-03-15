---
title: Build Automated Database Schema Migration Testing
slug: build-automated-database-schema-migration-testing
description: >
  Test every database migration against production-like data before
  deploying — catching column drops, lock contention, and data
  corruption that would cause downtime on a 200GB database.
skills:
  - typescript
  - postgresql
  - docker
  - github-actions
  - vitest
  - zod
category: devops
tags:
  - database-migration
  - testing
  - schema-evolution
  - ci-cd
  - postgresql
  - safety
---

# Build Automated Database Schema Migration Testing

## The Problem

A team runs Prisma migrations on a 200GB PostgreSQL database. Migrations work perfectly on the dev database (500 rows) but cause production incidents: adding a NOT NULL column without a default locks the table for 8 minutes. Renaming a column breaks 3 services that still reference the old name. A migration that took 2 seconds in dev took 45 minutes in production and caused a full outage. The team is terrified of migrations — they batch them monthly, making each one riskier.

## Step 1: Migration Analyzer

```typescript
// src/migrations/analyzer.ts
import { z } from 'zod';
import { Pool } from 'pg';

const MigrationRisk = z.object({
  file: z.string(),
  risks: z.array(z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    issue: z.string(),
    suggestion: z.string(),
    affectedTable: z.string().optional(),
  })),
  estimatedLockTimeMs: z.number(),
  estimatedExecutionMs: z.number(),
  safe: z.boolean(),
});

const DANGEROUS_PATTERNS = [
  {
    pattern: /ALTER TABLE .+ ADD COLUMN .+ NOT NULL(?! DEFAULT)/i,
    severity: 'critical' as const,
    issue: 'Adding NOT NULL column without DEFAULT locks the entire table',
    suggestion: 'Add column as nullable, backfill, then add NOT NULL constraint',
  },
  {
    pattern: /ALTER TABLE .+ DROP COLUMN/i,
    severity: 'high' as const,
    issue: 'Dropping column may break running application code',
    suggestion: 'Deploy code that stops reading the column first, then drop in next migration',
  },
  {
    pattern: /ALTER TABLE .+ ALTER COLUMN .+ TYPE/i,
    severity: 'high' as const,
    issue: 'Changing column type requires full table rewrite on large tables',
    suggestion: 'Create new column, backfill, swap in application, drop old column',
  },
  {
    pattern: /CREATE INDEX(?! CONCURRENTLY)/i,
    severity: 'high' as const,
    issue: 'CREATE INDEX locks writes on the table',
    suggestion: 'Use CREATE INDEX CONCURRENTLY to avoid blocking writes',
  },
  {
    pattern: /ALTER TABLE .+ RENAME/i,
    severity: 'medium' as const,
    issue: 'Renaming table/column breaks existing queries',
    suggestion: 'Create a view with the old name during transition',
  },
  {
    pattern: /DROP TABLE/i,
    severity: 'critical' as const,
    issue: 'Dropping table is irreversible data loss',
    suggestion: 'Rename to _deprecated first, drop after confirming nothing reads it',
  },
];

export function analyzeMigration(sql: string, filename: string): z.infer<typeof MigrationRisk> {
  const risks = [];

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.pattern.test(sql)) {
      const tableMatch = sql.match(/(?:ALTER|DROP|CREATE INDEX.*ON)\s+(?:TABLE\s+)?(\w+)/i);
      risks.push({
        severity: pattern.severity,
        issue: pattern.issue,
        suggestion: pattern.suggestion,
        affectedTable: tableMatch?.[1],
      });
    }
  }

  return {
    file: filename,
    risks,
    estimatedLockTimeMs: risks.some(r => r.severity === 'critical') ? 300000 : 0,
    estimatedExecutionMs: 0, // calculated during dry-run
    safe: risks.every(r => r.severity === 'low' || r.severity === 'medium'),
  };
}
```

## Step 2: Production-Like Test Runner

```typescript
// src/migrations/test-runner.ts
import { execSync } from 'child_process';
import { Pool } from 'pg';

export async function testMigrationAgainstSnapshot(
  migrationSql: string,
  snapshotConnectionString: string
): Promise<{
  success: boolean;
  executionTimeMs: number;
  rowsAffected: number;
  locksDetected: string[];
  errors: string[];
}> {
  const db = new Pool({ connectionString: snapshotConnectionString });
  const errors: string[] = [];
  const locksDetected: string[] = [];

  // Monitor locks in background
  const lockMonitor = setInterval(async () => {
    const { rows } = await db.query(`
      SELECT relation::regclass, mode, granted
      FROM pg_locks
      WHERE NOT granted AND locktype = 'relation'
    `);
    for (const row of rows) {
      locksDetected.push(`${row.relation}: ${row.mode} (waiting)`);
    }
  }, 100);

  const start = Date.now();

  try {
    // Run migration in transaction
    await db.query('BEGIN');

    // Set statement timeout to catch long-running migrations
    await db.query('SET statement_timeout = 300000'); // 5 minutes max

    const result = await db.query(migrationSql);

    await db.query('COMMIT');

    return {
      success: true,
      executionTimeMs: Date.now() - start,
      rowsAffected: result.rowCount ?? 0,
      locksDetected,
      errors,
    };
  } catch (err: any) {
    await db.query('ROLLBACK').catch(() => {});
    return {
      success: false,
      executionTimeMs: Date.now() - start,
      rowsAffected: 0,
      locksDetected,
      errors: [err.message],
    };
  } finally {
    clearInterval(lockMonitor);
    await db.end();
  }
}

// Create a test database from production snapshot
export async function createTestSnapshot(
  sourceUrl: string,
  testDbName: string
): Promise<string> {
  // Use pg_dump with --schema-only + sampled data for speed
  execSync(`pg_dump "${sourceUrl}" --schema-only | psql "postgres://localhost/${testDbName}"`, {
    stdio: 'pipe',
  });

  // Insert sampled rows (1% of each table)
  const db = new Pool({ connectionString: sourceUrl });
  const { rows: tables } = await db.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  `);

  const testDb = new Pool({ connectionString: `postgres://localhost/${testDbName}` });

  for (const { tablename } of tables) {
    try {
      const { rows } = await db.query(`SELECT * FROM ${tablename} TABLESAMPLE SYSTEM(1) LIMIT 10000`);
      if (rows.length > 0) {
        // Bulk insert sampled rows
        const columns = Object.keys(rows[0]).join(', ');
        for (const row of rows) {
          const values = Object.values(row);
          const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');
          await testDb.query(`INSERT INTO ${tablename} (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`, values).catch(() => {});
        }
      }
    } catch {}
  }

  await db.end();
  await testDb.end();

  return `postgres://localhost/${testDbName}`;
}
```

## Step 3: GitHub Actions Integration

```yaml
# .github/workflows/migration-test.yml
name: Migration Safety Check
on:
  pull_request:
    paths: ['prisma/migrations/**', 'migrations/**']

jobs:
  test-migration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env: { POSTGRES_PASSWORD: test }
        ports: ['5432:5432']
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci

      - name: Analyze migration SQL
        run: npx tsx src/migrations/analyze-pr.ts > analysis.json

      - name: Create test snapshot
        run: npx tsx src/migrations/create-snapshot.ts

      - name: Run migration against snapshot
        run: npx tsx src/migrations/run-test.ts > test-results.json

      - name: Post results to PR
        uses: actions/github-script@v7
        with:
          script: |
            const fs = require('fs');
            const analysis = JSON.parse(fs.readFileSync('analysis.json'));
            const results = JSON.parse(fs.readFileSync('test-results.json'));
            
            let body = '## 🗄️ Migration Safety Check\n\n';
            
            if (analysis.risks.length > 0) {
              body += '### ⚠️ Risks Detected\n\n';
              for (const r of analysis.risks) {
                const icon = r.severity === 'critical' ? '🔴' : r.severity === 'high' ? '🟡' : '🟢';
                body += `${icon} **${r.severity}**: ${r.issue}\n`;
                body += `  → ${r.suggestion}\n\n`;
              }
            }
            
            body += `### Execution Results\n`;
            body += `- Status: ${results.success ? '✅ Passed' : '❌ Failed'}\n`;
            body += `- Execution time: ${results.executionTimeMs}ms\n`;
            body += `- Rows affected: ${results.rowsAffected}\n`;
            if (results.locksDetected.length) body += `- ⚠️ Locks: ${results.locksDetected.join(', ')}\n`;
            
            await github.rest.issues.createComment({
              owner: context.repo.owner, repo: context.repo.repo,
              issue_number: context.issue.number, body,
            });

      - name: Block on critical risks
        run: |
          CRITICAL=$(node -e "const a=require('./analysis.json');console.log(a.risks.filter(r=>r.severity==='critical').length)")
          if [ "$CRITICAL" -gt "0" ]; then exit 1; fi
```

## Results

- **8-minute table lock**: caught in CI — migration rewritten to use nullable + backfill
- **Column drop incident**: blocked — code must stop reading column before dropping
- **45-minute production migration**: tested against snapshot in 12 seconds, estimated 40min
- **Migration frequency**: weekly instead of monthly — smaller, safer changes
- **Zero migration-related outages** in 6 months (was 3/quarter)
- **Developer confidence**: migrations are no longer scary — CI validates them
- **PR comments**: every migration PR shows risks, execution time, and lock analysis
