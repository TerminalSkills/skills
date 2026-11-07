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
  - docker-helper
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

A team runs migrations on a 200GB PostgreSQL database. They pass on the dev database (500 rows) and still cause production incidents: a migration that took 2 seconds in dev held an `ACCESS EXCLUSIVE` lock for 45 minutes in production, a plain `CREATE INDEX` blocked every write to a hot table, and a renamed column broke three services that still used the old name. The team is afraid of migrations, so they batch them monthly, which makes each one riskier.

The fix has two halves. A **static check** reads the SQL and flags statements that are dangerous on a big table. A **dynamic check** applies the migration to a disposable PostgreSQL in Docker, filled with enough rows for lock and rewrite costs to show, while a writer keeps updating rows and records how long it was blocked. Everything below was run against `postgres:18` and Node 24.

## Step 1: A Disposable PostgreSQL

The `docker-helper` rules apply: pinned image tag, loopback-only port, a healthcheck so scripts wait for readiness, and a password from the environment. `tmpfs` keeps the data in memory, so the container is clean on every start.

```yaml
# compose.test.yaml
services:
  pg:
    image: postgres:18
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set it in .env}
    ports: ["127.0.0.1:55432:5432"]
    tmpfs: [/var/lib/postgresql]
    healthcheck: { test: ["CMD-SHELL", "pg_isready -U postgres"], interval: 2s, retries: 15 }
```

```console
$ docker compose -f compose.test.yaml up -d --wait
$ export DATABASE_URL=postgres://postgres:$POSTGRES_PASSWORD@127.0.0.1:55432/postgres
```

Project setup (the `typescript` skill's ESM setup): `npm i pg zod && npm i -D typescript vitest @types/pg @types/node`, with `"type": "module"` in `package.json`. Node 24 runs `.ts` files directly (`node src/run-test.ts`), so imports use the `.ts` extension; on older Node use `tsx`.

## Step 2: Static Analyzer

Each rule looks at one statement. Several rules from a naive version are wrong and cost the team trust, so these follow how PostgreSQL really behaves: `ADD COLUMN ... NOT NULL` without a default does not lock for minutes, it **fails** on a table with rows, and with a constant `DEFAULT` it is instant (PostgreSQL 11+); `SET NOT NULL` is the one that scans the table under an exclusive lock.

```typescript
// src/analyzer.ts
export type Severity = "critical" | "high" | "medium";
export interface Risk { severity: Severity; issue: string; suggestion: string; statement: string }

const has = (s: string, re: RegExp) => re.test(s);

const RULES: [Severity, (s: string) => boolean, string, string][] = [
  ["critical", (s) => has(s, /\bADD\s+COLUMN\b/i) && has(s, /\bNOT\s+NULL\b/i) && !has(s, /\bDEFAULT\b/i),
    "ADD COLUMN ... NOT NULL without a DEFAULT fails on a table that already has rows",
    "Add the column as nullable, backfill in batches, then enforce NOT NULL"],
  ["high", (s) => has(s, /\bSET\s+NOT\s+NULL\b/i),
    "SET NOT NULL scans the whole table under an ACCESS EXCLUSIVE lock",
    "ADD CONSTRAINT ... CHECK (col IS NOT NULL) NOT VALID, VALIDATE it, then SET NOT NULL (PG 12+ skips the scan)"],
  ["high", (s) => has(s, /\bALTER\s+TABLE\b/i) && has(s, /\bDROP\s+(COLUMN\b|(?!CONSTRAINT\b|DEFAULT\b|NOT\b|IDENTITY\b|EXPRESSION\b)\w)/i),
    "Dropping a column breaks running code that still uses it",
    "Ship code that stops using the column first, drop it in a later migration"],
  ["high", (s) => has(s, /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i),
    "Changing a column type usually rewrites the table under an ACCESS EXCLUSIVE lock",
    "Add a new column, backfill in batches, switch the application, drop the old column"],
  ["high", (s) => has(s, /\bCREATE\s+(UNIQUE\s+)?INDEX\b/i) && !has(s, /\bCONCURRENTLY\b/i),
    "CREATE INDEX blocks writes to the table for the whole build",
    "Use CREATE INDEX CONCURRENTLY (it cannot run inside a transaction block)"],
  ["medium", (s) => has(s, /\bALTER\s+TABLE\b/i) && has(s, /\bRENAME\b/i),
    "Renaming breaks every query that still uses the old name",
    "Expand and contract: add the new name, move readers, remove the old one"],
  ["critical", (s) => has(s, /\bDROP\s+TABLE\b/i),
    "DROP TABLE is irreversible data loss",
    "Rename to *_deprecated first; drop it after confirming nothing reads it"],
];

export function analyzeMigration(sql: string): Risk[] {
  const statements = sql
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
  return statements.flatMap((statement) =>
    RULES.filter(([, test]) => test(statement)).map(([severity, , issue, suggestion]) => ({
      severity, issue, suggestion, statement: statement.slice(0, 120),
    })),
  );
}

export const hasBlockingRisk = (risks: Risk[]) => risks.some((r) => r.severity === "critical");
```

`COLUMN` is optional in `ALTER TABLE ... DROP`, so the drop rule also matches `DROP note`, but skips `DROP CONSTRAINT`. Regex rules catch common mistakes, not all of them (a volatile default such as `DEFAULT random()` still rewrites the table and is not flagged); the dynamic run in Step 3 is the real evidence.

## Step 3: Run the Migration Under Load

The runner seeds an `orders` table with 2 million generated rows, starts a writer that updates random rows every few milliseconds, applies the migration, and reports the migration time and the slowest write. Polling `pg_locks` would miss short, repeated waits; a blocked writer is what an outage actually looks like.

```typescript
// src/run-test.ts: node src/run-test.ts migrations/0042_add_index.sql
import { readFile } from "node:fs/promises";
import { setTimeout as sleep } from "node:timers/promises";
import { Pool } from "pg";
import { analyzeMigration, hasBlockingRisk } from "./analyzer.ts";

const MAX_STALL_MS = Number(process.env.MAX_WRITE_STALL_MS ?? 1000);
const ROWS = Number(process.env.SEED_ROWS ?? 2_000_000);
const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 4 });

async function seed() {
  await db.query(`
    DROP TABLE IF EXISTS orders;
    CREATE TABLE orders (id bigserial PRIMARY KEY, email text NOT NULL, note text, total int NOT NULL);
    INSERT INTO orders (email, note, total)
      SELECT 'user' || g || '@example.com', 'n', g % 500 FROM generate_series(1, ${ROWS}) g;
    ANALYZE orders;`);
}

function startWriter() {
  let running = true;
  let worstMs = 0;
  const done = (async () => {
    while (running) {
      const t = performance.now();
      await db.query("UPDATE orders SET total = total + 1 WHERE id = $1", [1 + Math.floor(Math.random() * ROWS)]);
      worstMs = Math.max(worstMs, performance.now() - t);
      await sleep(5);
    }
  })();
  return { stop: async () => { running = false; await done; return Math.round(worstMs); } };
}

const file = process.argv[2];
const sql = await readFile(file, "utf8");
const risks = analyzeMigration(sql);

await seed();
const writer = startWriter();
await sleep(500);

const started = performance.now();
let error: string | null = null;
try {
    const stmts = process.env.RUN_OUTSIDE_TX ? sql.split(";").map((s) => s.trim()).filter(Boolean) : [sql];
  for (const s of stmts) await db.query(s);
} catch (e) {
  error = (e as Error).message;
}
const migrationMs = Math.round(performance.now() - started);
const worstWriteMs = await writer.stop();
await db.end();

const blocking = hasBlockingRisk(risks) || worstWriteMs > MAX_STALL_MS;
const result = { file, rows: ROWS, migrationMs, worstWriteMs, error, risks, blocking };
console.log(JSON.stringify(result, null, 2));
process.exit(error || blocking ? 1 : 0);
```

`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so give it its own migration file, containing only that statement (a multi-statement file runs as one implicit transaction and fails); `RUN_OUTSIDE_TX=1` sends the statements of a file one at a time, and your migration tool needs an equivalent switch. On the 2M-row table the plain and the concurrent index take about the same time to build, but only one stalls the writer:

```console
$ node src/run-test.ts migrations/0001_index.sql             # CREATE INDEX
  "migrationMs": 1622, "worstWriteMs": 1621, "blocking": true
$ RUN_OUTSIDE_TX=1 node src/run-test.ts migrations/0002_index_concurrently.sql
  "migrationMs": 1633, "worstWriteMs": 5,    "blocking": false
$ node src/run-test.ts migrations/0003_bad.sql               # ADD COLUMN status text NOT NULL
  "error": "column \"status\" of relation \"orders\" contains null values", "blocking": true
$ node src/run-test.ts migrations/0004_default.sql           # ... NOT NULL DEFAULT 'new'
  "migrationMs": 0, "worstWriteMs": 2, "blocking": false
```

Timings are from one laptop run; what transfers is the ratio. `generate_series` data shows lock and rewrite behaviour; for query plans restore an anonymised `pg_dump`. Scale `SEED_ROWS` to your table.

## Step 4: Test the Analyzer and Validate the Output

The analyzer is the part people will edit, so it gets unit tests (`npx vitest run`). The report script parses the runner's JSON with `zod`, so a crashed runner fails the job instead of posting a half-empty comment.

```typescript
// src/analyzer.test.ts
import { describe, expect, it } from "vitest";
import { analyzeMigration, hasBlockingRisk } from "./analyzer.ts";

describe("analyzeMigration", () => {
  it("flags NOT NULL without a default as critical", () => {
    const risks = analyzeMigration("ALTER TABLE orders ADD COLUMN status text NOT NULL;");
    expect(hasBlockingRisk(risks)).toBe(true);
  });

  it("flags a plain CREATE INDEX but not CONCURRENTLY", () => {
    expect(analyzeMigration("CREATE INDEX i ON orders (email);")).toHaveLength(1);
    expect(analyzeMigration("CREATE INDEX CONCURRENTLY i ON orders (email);")).toHaveLength(0);
  });

  it("flags DROP with or without COLUMN, not DROP CONSTRAINT", () => {
    for (const [sql, n] of [["DROP COLUMN note", 1], ["DROP note", 1], ["DROP CONSTRAINT pk", 0]] as const)
      expect(analyzeMigration(`ALTER TABLE orders ${sql};`)).toHaveLength(n);
  });
});
```

```typescript
// src/report.ts: validate the runner's JSON before turning it into a PR comment
import { readFileSync } from "node:fs";
import { z } from "zod";

const Result = z.object({
  file: z.string(), rows: z.number(), migrationMs: z.number(), worstWriteMs: z.number(),
  error: z.string().nullable(), blocking: z.boolean(),
  risks: z.array(z.object({ severity: z.enum(["critical", "high", "medium"]), issue: z.string(), suggestion: z.string() })),
});

const r = Result.parse(JSON.parse(readFileSync(process.argv[2], "utf8")));
console.log([
  `### \`${r.file}\`: ${r.blocking ? "blocked" : "passed"}`,
  `${r.rows.toLocaleString("en-US")} rows, migration ${r.migrationMs} ms, slowest concurrent write ${r.worstWriteMs} ms.`,
  ...(r.error ? [`Error: ${r.error}`] : []),
  ...r.risks.map((x) => `- **${x.severity}**: ${x.issue}. ${x.suggestion}`),
].join("\n"));
```

## Step 5: GitHub Actions

The workflow runs only on pull requests that add migration files, applies each new file to a fresh `postgres:18` service, comments the result, and fails the check if any file is blocking. The comment uses the `gh` CLI with the job's token, so no PR text is interpolated into a script.

```yaml
# .github/workflows/migration-test.yml
name: Migration safety check
on:
  pull_request:
    paths: ["migrations/**", "prisma/migrations/**"]

permissions: { contents: read, pull-requests: write }

jobs:
  test-migration:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:18
        env: { POSTGRES_PASSWORD: test }
        ports: ["5432:5432"]
        options: --health-cmd "pg_isready -U postgres" --health-interval 5s --health-retries 10
    env:
      DATABASE_URL: postgres://postgres:test@127.0.0.1:5432/postgres
    steps:
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - run: npm ci
      - run: npx vitest run

      - name: Test each new migration
        env:
          BASE_REF: ${{ github.base_ref }}
          GH_TOKEN: ${{ github.token }}
          PR: ${{ github.event.pull_request.number }}
        run: |
          status=0
          : > comment.md
          for f in $(git diff --name-only --diff-filter=A "origin/$BASE_REF...HEAD" -- 'migrations/*.sql' 'prisma/migrations/*/migration.sql'); do
            node src/run-test.ts "$f" > result.json || status=1
            node src/report.ts result.json >> comment.md
            echo >> comment.md
          done
          [ -s comment.md ] && gh pr comment "$PR" --body-file comment.md
          exit $status
```

Pull requests from forks get a read-only token, so the comment step works for same-repo pull requests only.

## Results

- A plain `CREATE INDEX` on the hot `orders` table was caught in CI and rewritten with `CONCURRENTLY`; a column drop was blocked until the code that read it shipped
- Migrations moved from monthly batches to weekly, so each change is small

## Related Skills

- [typescript](/skills/typescript) — analyzer, runner and report scripts
- [postgresql](/skills/postgresql) — lock levels, `CONCURRENTLY`, `SET NOT NULL` behaviour
- [docker-helper](/skills/docker-helper) — the disposable `postgres:18` container
- [github-actions](/skills/github-actions) — the pull-request workflow
- [vitest](/skills/vitest) — analyzer unit tests
- [zod](/skills/zod) — validating the runner's JSON output
