---
title: Build Automated Database Backup with Point-in-Time Recovery
slug: build-automated-database-backup-with-point-in-time-recovery
description: Build an automated PostgreSQL backup system with continuous WAL archiving, scheduled base backups, point-in-time recovery, and Slack alerts — protecting against data loss without managed database pricing.
skills:
  - typescript
  - postgresql
  - docker-helper
  - github-actions
category: devops
tags:
  - database
  - backup
  - disaster-recovery
  - postgresql
  - wal-archiving
---

# Build Automated Database Backup with Point-in-Time Recovery

## The Problem

Nadia runs infrastructure at a 30-person fintech startup. They self-host PostgreSQL to meet data residency requirements (EU customers, data must stay in Frankfurt). Their backup strategy is a nightly `pg_dump` cron job. When a junior engineer ran a `DELETE` without a `WHERE` clause at 3:47 PM, the latest dump was from midnight: 15 hours of transactions lost, three days of reconciliation with payment processors, and $28K in customer credits. They need point-in-time recovery (PITR), which restores to any second rather than to the last dump.

PITR is two things working together: a **base backup** (a physical copy of the cluster) and a **continuous archive of WAL segments** (every change since). Restoring means unpacking the base backup and replaying archived WAL up to a chosen timestamp. Everything below ran against `postgres:18` in Docker.

## Step 1: Run PostgreSQL with Archiving in Compose

Archiving needs a place the server can write each finished WAL segment. In production that should be a different machine or object storage; here it is a separate volume, so the mechanics can be tried safely on a laptop. The `docker-helper` conventions apply: a pinned image tag, a healthcheck, secrets from `.env`, and the port bound to loopback only.

```yaml
# compose.yaml
services:
  db:
    image: postgres:18
    command:
      - postgres
      - -c
      - archive_mode=on
      - -c
      - archive_timeout=60   # force a segment switch at least every minute
      - -c
      - archive_command=test ! -f /archive/%f && cp %p /archive/%f
    environment:
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?set it in .env}
    ports:
      - "127.0.0.1:5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql   # PG 18 images keep PGDATA in /var/lib/postgresql/18/docker
      - archive:/archive
      - backups:/backups
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      retries: 10

volumes:
  pgdata:
  archive:
  backups:
```

```console
$ docker compose up -d --wait
$ docker compose exec -u root db chown postgres /archive /backups
```

Without the `chown`, the named volumes are owned by root and `archive_command` fails on every segment (visible as `failed_count` in `pg_stat_archiver`). `archive_mode` takes effect only after a restart, which is why it is set on the command line from the first start. `wal_level` already defaults to `replica`, which is all archiving needs. The `test ! -f` guard is the pattern from the PostgreSQL docs: never overwrite an archived segment, and return non-zero so the server retries. For object storage, put an equivalent script in `archive_command` (it must exit non-zero on any failure), or use a tool built for this such as pgBackRest or WAL-G.

## Step 2: Take Base Backups

`pg_basebackup` copies the running cluster without stopping it. Tar format with `-X stream` writes the WAL generated during the backup into its own `pg_wal.tar.gz`, so each backup is self-consistent:

```console
$ docker compose exec -u postgres db pg_basebackup -U postgres \
    -D /backups/base-$(date +%Y%m%dT%H%M%S) -Ft -z -X stream -c fast
$ docker compose exec db ls /backups/base-20261106T222300
backup_manifest  base.tar.gz  pg_wal.tar.gz
```

Writing a tar backup to stdout (`-D -`) cannot be combined with `-X stream`, so write to a directory and then copy or encrypt the directory. Schedule it from cron or a systemd timer on the host (nightly is typical).

## Step 3: Recover to a Point in Time

First, simulate the accident. Note the time just before the bad statement (UTC, so there is no ambiguity), then run it:

```console
$ docker compose exec db psql -U postgres -Atc \
    "select to_char(now() at time zone 'utc','YYYY-MM-DD HH24:MI:SS')||'+00'"
2026-11-06 22:23:58+00
$ docker compose exec db psql -U postgres -c "delete from orders"
DELETE 1050
$ docker compose exec db psql -U postgres -c "select pg_switch_wal()"   # force the last segment into the archive
```

Recovery never touches the damaged server. Build a new data directory from the base backup in a fresh volume, add `recovery.signal` and the recovery settings, then start a second server on it. `recovery_target_time` takes the timestamp you noted; without a time zone PostgreSQL uses the server's own, so always include the `+00` offset.

```console
$ docker volume create restore
$ docker run --rm --user root -v restore:/restore -v <project>_backups:/backups:ro postgres:18 sh -c '
    D=/restore/18/docker; mkdir -p $D/pg_wal
    tar -xzf /backups/base-20261106T222300/base.tar.gz    -C $D
    tar -xzf /backups/base-20261106T222300/pg_wal.tar.gz  -C $D/pg_wal
    touch $D/recovery.signal
    printf "%s\n" \
      "restore_command = '"'"'cp /archive/%f %p'"'"'" \
      "recovery_target_time = '"'"'2026-11-06 22:23:58+00'"'"'" \
      "recovery_target_action = '"'"'promote'"'"'" >> $D/postgresql.auto.conf
    chown -R postgres:postgres /restore; chmod 700 $D'
$ docker run -d --name recovered -v restore:/var/lib/postgresql \
    -v <project>_archive:/archive:ro -e POSTGRES_PASSWORD="$POSTGRES_PASSWORD" postgres:18
```

(`<project>_` is the Compose project name; `docker volume ls` shows the exact names.) The server log shows the replay stopping where you asked:

```console
$ docker logs recovered 2>&1 | grep -E "recovery stopping|archive recovery complete"
LOG:  recovery stopping before commit of transaction 756, time 2026-11-06 22:24:00.929638+00
LOG:  archive recovery complete
$ docker exec recovered psql -U postgres -Atc "select count(*) from orders"
1050
```

The `cp: cannot stat ... .history` lines are normal: PostgreSQL probes for timeline history files that do not exist. After checking the data, dump the missing rows from the recovered server (`pg_dump -t orders`) and load them into production, or promote the recovered server and repoint the application. `recovery_target_action = 'promote'` makes it read-write at the target; the default `pause` leaves it read-only so you can inspect and move the target.

## Step 4: Monitor the Archive

A backup nobody watches fails silently. The server itself records every `archive_command` result in `pg_stat_archiver`, so the monitor reads that view (the `typescript` skill's setup: `"type": "module"`, `pg`, and Node 24 or `tsx`). Checking `pg_last_xact_replay_timestamp()` on a primary would return NULL, because it only has a value on a standby.

```typescript
// src/backup-monitor.ts
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

export async function checkArchiver(maxLagSeconds = 600) {
  const { rows } = await pool.query(`
    SELECT last_archived_wal,
           EXTRACT(EPOCH FROM (now() - last_archived_time))::int AS since_archive,
           failed_count,
           EXTRACT(EPOCH FROM (now() - last_failed_time))::int   AS since_failure
    FROM pg_stat_archiver`);
  const r = rows[0];
  const issues: string[] = [];

  if (!r.last_archived_wal) issues.push("no WAL segment has ever been archived");
  else if (r.since_archive > maxLagSeconds)
    issues.push(`last archived segment is ${Math.round(r.since_archive / 60)} minutes old`);
  // A failure newer than the last success means archive_command is failing right now.
  if (r.since_failure !== null && r.since_failure < (r.since_archive ?? Infinity))
    issues.push("archive_command is failing; WAL is piling up in pg_wal");

  return { healthy: issues.length === 0, issues };
}

// Slack incoming webhooks accept a JSON body with a "text" field.
export async function alert(webhookUrl: string, issues: string[]) {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `Backup problem: ${issues.join("; ")}` }),
  });
  if (!res.ok) throw new Error(`Slack webhook returned ${res.status}`);
}

// Entry point, so `node src/backup-monitor.ts` actually runs the check.
const { healthy, issues } = await checkArchiver();
if (!healthy) {
  console.error(issues.join("\n"));
  if (process.env.SLACK_WEBHOOK_URL) await alert(process.env.SLACK_WEBHOOK_URL, issues);
  process.exitCode = 1;   // fails the workflow run
}
await pool.end();
```

Note that `archive_timeout` only forces a switch when there is new WAL, and an idle server archives nothing, so tune `maxLagSeconds` above the quiet-period behaviour of your own database. The same check run against the demo server above returned `healthy` with `last_archived_wal` at `000000010000000000000004`.

## Step 5: Prove It with a Scheduled Restore Drill

A restore that has never been tried is a hope. A scheduled workflow runs the monitor and, on a self-hosted runner that can reach the backup storage, repeats Step 3 into a throwaway container and checks a row count. The workflow calls `scripts/restore-drill.sh`, shown below the workflow:

```yaml
# .github/workflows/backup-drill.yml
name: Backup drill
on:
  schedule:
    - cron: "17 3 * * 1"   # Mondays 03:17 UTC
  workflow_dispatch:

jobs:
  drill:
    runs-on: [self-hosted, backups]
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 24 }
      - run: npm ci
      - name: Archive health
        run: node src/backup-monitor.ts
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
      - name: Restore latest base backup and compare
        run: ./scripts/restore-drill.sh
        env:
          DRILL_QUERY: select count(*) from orders
          DRILL_MIN_ROWS: "1000"   # a floor you expect, not an exact count: the primary keeps changing
```

The script, run from the Compose project directory (the runner needs Docker and access to the `backups` and `archive` volumes). It is Step 3 with no `recovery_target_time`, so it replays the whole archive, promotes, and fails if the query returns fewer rows than the floor or recovery never finishes:

```bash
#!/usr/bin/env bash
# scripts/restore-drill.sh
set -euo pipefail

PROJECT=${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}
BACKUPS=${PROJECT}_backups ARCHIVE=${PROJECT}_archive
RESTORE=drill-restore-$$ NAME=drill-$$
QUERY=${DRILL_QUERY:-select count(*) from orders}
MIN_ROWS=${DRILL_MIN_ROWS:-1}
trap 'docker rm -f "$NAME" >/dev/null 2>&1 || true; docker volume rm "$RESTORE" >/dev/null 2>&1 || true' EXIT

docker volume create "$RESTORE" >/dev/null
docker run --rm --user root -v "$RESTORE":/restore -v "$BACKUPS":/backups:ro postgres:18 sh -euc '
  B=$(ls -d /backups/base-* | sort | tail -n 1); echo "restoring $B"
  D=/restore/18/docker; mkdir -p $D/pg_wal
  tar -xzf $B/base.tar.gz   -C $D
  tar -xzf $B/pg_wal.tar.gz -C $D/pg_wal
  touch $D/recovery.signal
  printf "%s\n" "restore_command = '"'"'cp /archive/%f %p'"'"'" \
                "recovery_target_action = '"'"'promote'"'"'" >> $D/postgresql.auto.conf
  chown -R postgres:postgres /restore; chmod 700 $D'

docker run -d --name "$NAME" -v "$RESTORE":/var/lib/postgresql -v "$ARCHIVE":/archive:ro \
  -e POSTGRES_PASSWORD=drill postgres:18 >/dev/null

for _ in $(seq 60); do   # wait until recovery has finished and the server is read-write
  if [ "$(docker exec "$NAME" psql -U postgres -Atc 'select pg_is_in_recovery()' 2>/dev/null)" = f ]; then
    rows=$(docker exec "$NAME" psql -U postgres -Atc "$QUERY")
    echo "drill query returned $rows (minimum $MIN_ROWS)"
    [ "$rows" -ge "$MIN_ROWS" ] && exit 0
    echo "restore drill FAILED: too few rows" >&2; exit 1
  fi
  sleep 2
done
echo "restore drill FAILED: server did not finish recovery" >&2; exit 1
```

Run by hand against the demo project it printed `restoring /backups/base-...` and `drill query returned 1050 (minimum 1)`, and exited 1 with "too few rows" when the floor was set above the real count. The workflow needs `chmod +x scripts/restore-drill.sh` committed.

Scheduled workflows run on the default branch and may be delayed under load, so a missing drill result is itself an alert.

## Results

The numbers below are Nadia's team's own:

- Data-loss window went from 24 hours to the archive lag (`archive_timeout` is 5 minutes in their production config)
- A similar mistake six weeks later was recovered to 30 seconds before the bad query
- Monthly drills restore the full database into a scratch container and compare row counts
- Backup storage costs a small fraction of the managed-database quote they had received

## Related Skills

- [typescript](/skills/typescript) — the monitoring script
- [postgresql](/skills/postgresql) — WAL, `pg_basebackup`, recovery settings
- [docker-helper](/skills/docker-helper) — Compose file, volumes, throwaway recovery containers
- [github-actions](/skills/github-actions) — scheduled restore drill
