---
title: Replace Crontab Scripts with a Python Scheduler Using APScheduler
slug: replace-crontab-scripts-with-python-scheduler-apscheduler
description: Move a small Python team's scattered crontab entries into one supervised scheduler process that logs failures, survives restarts and runs under systemd.
skills:
  - apscheduler
  - systemd
category: automation
tags:
  - python
  - cron
  - scheduler
  - background-jobs
  - systemd
---

# Replace Crontab Scripts with a Python Scheduler Using APScheduler

## The Problem

Mira Kowalczyk is the only backend developer at a 12-person logistics start-up. Four Python scripts run from the crontab of a single VM: a nightly database dump, an hourly carrier-rates import, a Monday invoice digest and a Sunday cleanup of uploaded files. Each script sets up its own logging, its own environment variables and its own database connection. Nobody gets told when one fails: last month the rates import crashed for nine days because an API key changed, and dispatchers quoted stale prices. Cron also gives no way to ask "when does this run next?" or to pause one job during a deploy, and an import that takes longer than an hour starts a second copy on top of the first.

She does not need a distributed queue. One machine, one process, a handful of jobs, and a clear signal when something breaks.

## The Solution

Put the four functions into one Python package and run them from a single APScheduler process under systemd. APScheduler (3.x) supplies the cron-style and interval triggers, `max_instances=1` to stop overlapping runs, `coalesce` and a misfire grace time to handle restarts, and an event listener that reports failures. The agent uses the `apscheduler` skill for the scheduler code and the `systemd` skill for the service unit. The four jobs are fixed in code, so the default in-memory job store is enough and nothing extra needs to be persisted.

## Step-by-Step Walkthrough

### Step 1: Inventory the crontab and set up the package

Prompt: "Read `crontab -l` for the deploy user, list every Python script it runs with its schedule, and create a `ops_jobs` package with one function per script. Use a venv in `/opt/logistics/.venv`."

```bash
crontab -l
python3 -m venv /opt/logistics/.venv
/opt/logistics/.venv/bin/pip install apscheduler sqlalchemy
```

The agent moves each script body into a function in `ops_jobs/tasks.py` (`dump_database`, `import_carrier_rates`, `send_invoice_digest`, `cleanup_uploads`) and keeps the old scripts untouched until the new worker is verified.

### Step 2: Write the scheduler entry point

Prompt: "Write `ops_jobs/worker.py`: schedules matching the crontab, no overlapping runs, a run that is up to 10 minutes late still happens, and a failing job is logged with its traceback and posted to our Slack webhook from `$SLACK_WEBHOOK_URL`."

```python
import logging
import os
import urllib.request
import json

from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

from ops_jobs import tasks

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")

def alert(event):
    kind = "failed" if event.code == EVENT_JOB_ERROR else "was missed"
    text = f"scheduler: job {event.job_id} {kind}"
    req = urllib.request.Request(os.environ["SLACK_WEBHOOK_URL"],
                                 data=json.dumps({"text": text}).encode(),
                                 headers={"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=10)

sched = BlockingScheduler(
    timezone="Europe/Warsaw",
    job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 600},
)
sched.add_job(tasks.dump_database, CronTrigger.from_crontab("30 1 * * *"), id="dump-db")
sched.add_job(tasks.import_carrier_rates, "interval", hours=1, id="carrier-rates")
sched.add_job(tasks.send_invoice_digest, CronTrigger(day_of_week="mon", hour=7, minute=0), id="invoice-digest")
sched.add_job(tasks.cleanup_uploads, CronTrigger(day_of_week="sun", hour=4, minute=0), id="cleanup-uploads")
sched.add_listener(alert, EVENT_JOB_ERROR | EVENT_JOB_MISSED)

if __name__ == "__main__":
    sched.start()
```

### Step 3: Run it as a service

Prompt: "Create a systemd unit that runs the worker as the deploy user, restarts on failure and reads secrets from `/etc/logistics/ops.env`."

```ini
[Unit]
Description=Logistics ops scheduler
After=network-online.target

[Service]
User=deploy
WorkingDirectory=/opt/logistics
EnvironmentFile=/etc/logistics/ops.env
ExecStart=/opt/logistics/.venv/bin/python -m ops_jobs.worker
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ops-scheduler.service
journalctl -u ops-scheduler.service -n 20 --no-pager
```

The journal shows `Added job "dump_database" to job store "default"` for each of the four jobs, followed by `Scheduler started`.

### Step 4: Prove the failure path

Prompt: "Make the rates import fail on purpose, run it once through the scheduler's alert path, and confirm the Slack alert arrives. Then restore it."

```bash
cd /opt/logistics && CARRIER_RATES_URL=http://127.0.0.1:9/rates \
  /opt/logistics/.venv/bin/python - <<'PY'
from datetime import datetime
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.events import EVENT_JOB_ERROR
from ops_jobs.worker import alert
from ops_jobs import tasks

s = BlockingScheduler(timezone="Europe/Warsaw")
s.add_job(tasks.import_carrier_rates, "date", run_date=datetime.now(), id="rates-check")
s.add_listener(lambda e: (alert(e), s.shutdown(wait=False)), EVENT_JOB_ERROR)
s.start()
PY
```

This one-off process imports `alert` from the worker module (importing it only builds the worker's scheduler, it does not start it) and shuts itself down after the first error. Once the Slack message arrives, the agent removes the four lines with `crontab -e` so nothing runs twice.

## Real-World Example

On Thursday Mira ships the worker. The first night, `dump-db` runs at 01:30 and logs `executed successfully` in 41 seconds. On Friday the carrier API starts returning 401: at 09:00 the journal holds the traceback, and a Slack message `scheduler: job carrier-rates failed` arrives within the same second. She fixes the key, restarts the service, and the hourly import resumes. On Saturday the VM reboots at 04:10 for a kernel update; the Sunday cleanup is unaffected, and the Monday digest fires at 07:00 as scheduled. The nine-day silent failure cannot recur, and the four scripts' separate logging code is gone.

## Related Skills

- [apscheduler](/skills/apscheduler) — defines the triggers, overlap limits, misfire handling and failure listener.
- [systemd](/skills/systemd) — keeps the scheduler process running and restarts it after crashes and reboots.
