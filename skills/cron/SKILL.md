---
name: cron
description: >-
  Schedule recurring tasks with cron on Linux/macOS. Use when a user asks to
  run scripts on a schedule, set up automated backups, schedule data processing,
  or configure periodic tasks on a server.
license: Apache-2.0
compatibility: 'Linux, macOS'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: devops
  tags:
    - cron
    - scheduling
    - automation
    - linux
    - tasks
---

# cron

## Overview

cron is the standard Unix task scheduler. Define schedules with cron expressions (minute, hour, day, month, weekday) to run scripts automatically. Used for backups, log rotation, data sync, health checks, and any recurring task.

## Instructions

### Step 1: Crontab Basics

```bash
# Edit your crontab
crontab -e

# Format: minute hour day month weekday command
# ┌─── minute (0-59)
# │ ┌─── hour (0-23)
# │ │ ┌─── day of month (1-31)
# │ │ │ ┌─── month (1-12)
# │ │ │ │ ┌─── day of week (0-7, 0=Sun)
# │ │ │ │ │
# * * * * * command
```

### Step 2: Common Schedules

```bash
# Every day at 3 AM
0 3 * * * /opt/scripts/backup.sh

# Every hour
0 * * * * /opt/scripts/health-check.sh

# Every 15 minutes
*/15 * * * * /opt/scripts/sync-data.sh

# Monday to Friday at 9 AM
0 9 * * 1-5 /opt/scripts/daily-report.sh

# First day of every month at midnight
0 0 1 * * /opt/scripts/monthly-cleanup.sh

# Every Sunday at 2 AM
0 2 * * 0 /opt/scripts/weekly-maintenance.sh
```

Shortcuts (Vixie cron and cronie; not every cron supports them): `@reboot` runs once at startup, `@daily` equals `0 0 * * *`, `@hourly` equals `0 * * * *`, `@weekly` equals `0 0 * * 0`. Do not use `@reboot` for anything that needs the network to be up without a retry.

### Step 3: Best Practices

```bash
# Always redirect output to a log file
0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1

# Use full paths (cron has minimal PATH)
0 * * * * /usr/bin/node /opt/app/scripts/job.js

# Set environment variables (MAILTO="" disables cron mail)
MAILTO=alerts@northwind-labs.io
PATH=/usr/local/bin:/usr/bin:/bin
SHELL=/bin/bash

0 3 * * * /opt/scripts/backup.sh
```

Prevent overlapping runs when a job can take longer than its interval. `flock -n` exits at once if the previous run still holds the lock:

```bash
*/5 * * * * flock -n /run/lock/sync-data.lock /opt/scripts/sync-data.sh >> /var/log/sync-data.log 2>&1
```

### Step 4: System Cron (root tasks)

```bash
# /etc/cron.d/app-maintenance — System-level cron file
SHELL=/bin/bash
PATH=/usr/local/bin:/usr/bin:/bin

# Database backup as postgres user
0 3 * * * postgres pg_dump myapp > /backups/myapp-$(date +\%Y\%m\%d).sql

# Log rotation
0 0 * * * root /usr/sbin/logrotate /etc/logrotate.conf
```

## Examples

### Nightly database dump with a log file

```prompt
Back up the Postgres database "orders" every night at 02:30 to /var/backups/orders, keep the output in a log, and make sure two backups running at once cannot happen.
```

```bash
crontab -e
# add this line
30 2 * * * flock -n /run/lock/orders-backup.lock pg_dump -Fc -f /var/backups/orders/orders-$(date +\%Y\%m\%d).dump orders 2>> /var/log/orders-backup.log
```

Result: `crontab -l` shows the line. The next morning `/var/backups/orders/` holds one `orders-YYYYMMDD.dump` file, and `/var/log/orders-backup.log` is empty when the dump succeeds, because only errors go to the log. Note that `%` must be escaped as `\%` in the crontab. The output file is opened by `pg_dump -f` rather than by a shell `>` redirect, so a second run that fails to get the lock cannot truncate the dump of the first.

### Health check every 10 minutes with alerting

```prompt
Check https://shop.northwind-labs.io/healthz every 10 minutes and log failures with a timestamp.
```

```bash
*/10 * * * * curl -fsS --max-time 10 https://shop.northwind-labs.io/healthz > /dev/null || echo "$(date -Is) healthz FAILED" >> /var/log/healthz.log
```

Result: the log stays empty while the site answers. When the endpoint returns an HTTP error or times out, `curl -f` exits non-zero and a line such as `2026-10-20T03:10:00+00:00 healthz FAILED` is appended.

## Guidelines

- Always use full paths in cron — the PATH is minimal.
- Redirect output to log files or `/dev/null` — unhandled output gets emailed.
- Use `crontab -l` to list, `crontab -e` to edit, `crontab -r` to remove all (careful!).
- For a modern alternative, use systemd timers: they log to the journal (`journalctl -u <unit>`), and `Persistent=true` runs a missed job after the machine comes back up.
- Jobs run in the system timezone. The cron man page states that per-user timezones are not supported, so check the server clock with `timedatectl` before setting times.
- Check that jobs actually ran: on Debian and Ubuntu, `journalctl -u cron` or `grep CRON /var/log/syslog`.
- `flock`, `/run/lock` and `/etc/cron.d` are Linux specifics; on macOS use `crontab -e` only and a different locking approach (for example a `mkdir` lock directory).
- Test commands manually before putting them in cron.
