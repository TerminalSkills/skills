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
  version: 1.0.0
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

### Step 3: Best Practices

```bash
# Always redirect output to a log file
0 3 * * * /opt/scripts/backup.sh >> /var/log/backup.log 2>&1

# Use full paths (cron has minimal PATH)
0 * * * * /usr/bin/node /opt/app/scripts/job.js

# Set environment variables
MAILTO=admin@example.com
PATH=/usr/local/bin:/usr/bin:/bin
SHELL=/bin/bash

0 3 * * * /opt/scripts/backup.sh
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

## Guidelines

- Always use full paths in cron — the PATH is minimal.
- Redirect output to log files or `/dev/null` — unhandled output gets emailed.
- Use `crontab -l` to list, `crontab -e` to edit, `crontab -r` to remove all (careful!).
- For modern alternative with dependency tracking, use systemd timers.
- Test commands manually before putting them in cron.
