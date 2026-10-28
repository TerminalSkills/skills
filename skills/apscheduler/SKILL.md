---
name: apscheduler
description: >-
  APScheduler is a Python library that runs functions on a schedule inside your own process, using cron expressions, fixed intervals or one-off dates, and can keep its jobs in a database so they survive restarts. Use when a user wants to "run a Python function every night", "replace crontab scripts", "schedule background jobs in Flask or FastAPI", "persist scheduled jobs in SQLite", or "stop missed runs from piling up". Covers the 3.x API that pip installs today.
license: Apache-2.0
compatibility: "Python 3.8+, pip install apscheduler (3.11.x); SQLAlchemy only for the database job store"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: automation
  tags: "apscheduler, python, cron, scheduler, background-jobs"
  repository: https://github.com/agronholm/apscheduler
---

# APScheduler — schedule Python functions in-process

## Overview

APScheduler (Advanced Python Scheduler) lets an application schedule its own functions: "every 15 minutes", "weekdays at 08:30", "once at this timestamp". The scheduler runs inside your Python process, either in a background thread, blocking the main thread, or on an asyncio event loop. Jobs can live in memory or in a database through a job store.

Version note: `pip install apscheduler` installs the 3.x line (3.11.3 at the time of writing, Python 3.8+). The 4.x line is a pre-release with a different API (`Scheduler`, `AsyncScheduler`, `add_schedule`, data stores); pip skips it unless asked with `--pre`. Everything below is the 3.x API. If a snippet imports `apscheduler.schedulers.background` it is 3.x; do not mix it with 4.x names.

Four building blocks to know:

- Trigger: when to run (`date`, `interval`, `cron`, plus combining triggers).
- Job store: where jobs are kept (`MemoryJobStore` by default, `SQLAlchemyJobStore`, `MongoDBJobStore`, `RedisJobStore`).
- Executor: how jobs run (thread pool by default, process pool for CPU work, asyncio executor for coroutines).
- Scheduler: ties them together (`BackgroundScheduler`, `BlockingScheduler`, `AsyncIOScheduler`).

## Instructions

### Installation

```bash
python3 -m venv .venv
.venv/bin/pip install apscheduler sqlalchemy
```

`sqlalchemy` is needed only for `SQLAlchemyJobStore`. Check what you got with `.venv/bin/pip show apscheduler`.

### Choose the scheduler class

| Class | Use it when |
|---|---|
| `BlockingScheduler` | The scheduler is the whole program (a worker script run by systemd or a container). `start()` never returns. |
| `BackgroundScheduler` | The scheduler lives next to something else, such as a Flask app. `start()` returns at once. |
| `AsyncIOScheduler` | The app already runs an asyncio loop (FastAPI, aiohttp). |

### Cron, interval and one-off jobs

```python
from datetime import datetime, timedelta
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.triggers.cron import CronTrigger

def export_orders(region):
    print(f"exporting orders for {region}")

sched = BlockingScheduler(timezone="Europe/Berlin")

# Every weekday at 08:30
sched.add_job(export_orders, CronTrigger(day_of_week="mon-fri", hour=8, minute=30),
              args=["eu"], id="orders-eu", replace_existing=True)

# Same thing from a crontab string (five fields)
sched.add_job(export_orders, CronTrigger.from_crontab("0 2 * * *"),
              args=["us"], id="orders-us", replace_existing=True)

# Every 15 minutes, starting 10 seconds from now
sched.add_job(export_orders, "interval", minutes=15,
              start_date=datetime.now() + timedelta(seconds=10),
              args=["apac"], id="orders-apac", replace_existing=True)

# Once
sched.add_job(export_orders, "date", run_date=datetime(2026, 12, 31, 23, 0),
              args=["year-end"], id="orders-year-end", replace_existing=True)

sched.start()   # blocks; Ctrl+C raises KeyboardInterrupt, so wrap in try/except if you need cleanup
```

Always give a job an explicit `id` and `replace_existing=True`. Without the id, a persistent store gets a new random id on every start, and each restart duplicates every job.

### Keep jobs across restarts

```python
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

sched = BackgroundScheduler(
    jobstores={"default": SQLAlchemyJobStore(url="sqlite:///jobs.sqlite")},
    timezone="Europe/Berlin",
)
sched.add_job("billing.jobs:send_invoices", "cron", hour=6, id="invoices", replace_existing=True)
sched.start()
```

Rules for persistent jobs, because the job is pickled into the database:

- The function must be importable at module top level (or given as a `"package.module:function"` string). Lambdas, nested functions and bound methods of unpicklable objects are rejected.
- Arguments must be picklable: pass ids and plain values, not database connections.
- When the code changes (new args, new trigger), re-add with `replace_existing=True`. Stored jobs are not re-read from your source.

### Control misfires, overlap and workers

```python
from apscheduler.executors.pool import ThreadPoolExecutor, ProcessPoolExecutor

sched = BackgroundScheduler(
    executors={"default": ThreadPoolExecutor(10), "cpu": ProcessPoolExecutor(2)},
    job_defaults={
        "coalesce": True,            # several missed runs collapse into one
        "max_instances": 1,          # never run the same job concurrently
        "misfire_grace_time": 300,   # still run if started up to 5 min late
    },
)
sched.add_job(rebuild_report, "cron", hour=3, executor="cpu", id="report", replace_existing=True)
```

The process pool starts child processes that import your main module again. Put the scheduler setup under `if __name__ == "__main__":` and import `rebuild_report` from a regular module; with top-level setup code the pool breaks and the job fails with `Error submitting job ... to executor "cpu"`.

A run that is later than `misfire_grace_time` is skipped and reported as a missed event. The default grace time is 1 second, so after a restart or a busy moment, jobs are often silently skipped until you raise it.

### Inspect and change jobs at runtime

```python
sched.get_jobs()                       # list of Job objects
job = sched.get_job("orders-eu")
print(job.next_run_time)

sched.pause_job("orders-eu")
sched.resume_job("orders-eu")
sched.reschedule_job("orders-eu", trigger="cron", hour=9)
sched.modify_job("orders-eu", args=["eu-west"])
sched.remove_job("orders-eu")
sched.pause()                          # pause everything; sched.resume() to continue
sched.shutdown(wait=True)              # wait for running jobs
```

Calling `add_job(..., next_run_time=datetime.now())` runs a job immediately and then continues on its trigger.

### Be told when a job fails

```python
import logging
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_MISSED

logging.basicConfig(level=logging.INFO)   # the "apscheduler" logger shows executions and tracebacks

def on_problem(event):
    if event.code == EVENT_JOB_ERROR:
        print(f"job {event.job_id} failed: {event.exception!r}")
    else:
        print(f"job {event.job_id} missed its run at {event.scheduled_run_time}")

sched.add_listener(on_problem, EVENT_JOB_ERROR | EVENT_JOB_MISSED)
```

A failing job does not stop the scheduler and is not retried; it runs again at its next trigger time. Add retry logic inside the function if you need it.

### Async apps

```python
import asyncio
from apscheduler.schedulers.asyncio import AsyncIOScheduler

async def poll_feed():
    ...

async def main():
    sched = AsyncIOScheduler()
    sched.add_job(poll_feed, "interval", minutes=1, id="feed", replace_existing=True)
    sched.start()                 # needs a running loop, so call it inside a coroutine
    await asyncio.Event().wait()  # keep the loop alive

asyncio.run(main())
```

Coroutine functions run directly on the loop; plain functions go to the thread pool.

## Examples

### Example 1: Replace three crontab lines with one Python worker

Request: "Our crontab runs backup_db.py nightly, sync_crm.py hourly and a weekly cleanup. Put them in one Python process that logs failures."

`worker.py`:

```python
import logging
from apscheduler.schedulers.blocking import BlockingScheduler
from apscheduler.events import EVENT_JOB_ERROR

import tasks   # tasks.backup_db, tasks.sync_crm, tasks.cleanup_uploads

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
sched = BlockingScheduler(
    timezone="UTC",
    job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 600},
)
sched.add_job(tasks.backup_db, "cron", hour=1, minute=30, id="backup-db")
sched.add_job(tasks.sync_crm, "interval", hours=1, id="sync-crm")
sched.add_job(tasks.cleanup_uploads, "cron", day_of_week="sun", hour=4, id="cleanup")
sched.add_listener(lambda e: logging.error("job %s failed: %r", e.job_id, e.exception), EVENT_JOB_ERROR)
sched.start()
```

Run it with `.venv/bin/python worker.py` under systemd (`Restart=always`). The log shows `Added job "backup_db" to job store "default"` and later `Job "sync_crm (trigger: interval[1:00:00], next run at: ...)" executed successfully`. A crash inside `sync_crm` logs the traceback and the error line, while the other two jobs keep their schedule.

### Example 2: Persist user-defined reminders in SQLite

Request: "Users create reminders in my Flask app; they must survive a restart."

```python
from datetime import datetime
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore

sched = BackgroundScheduler(jobstores={"default": SQLAlchemyJobStore(url="sqlite:///reminders.sqlite")})
sched.start()

def add_reminder(reminder_id: int, user_id: int, when: datetime):
    sched.add_job("reminders:send", "date", run_date=when,
                  args=[user_id, reminder_id], id=f"reminder-{reminder_id}",
                  replace_existing=True, misfire_grace_time=3600)
```

`reminders.send(user_id, reminder_id)` is a top-level function in `reminders.py`. After a restart, `sched.get_jobs()` still lists the pending reminders; one that came due while the app was down fires on start if it is within the one-hour grace time, otherwise it is dropped as missed. To cancel: `sched.remove_job(f"reminder-{reminder_id}")`.

## Guidelines

- One scheduler per process. If a web server runs 4 workers (gunicorn, uvicorn `--workers 4`), each worker would start its own scheduler and every job fires 4 times. Run the scheduler in a separate worker process or a single dedicated container.
- Several processes sharing one database job store is not safe coordination in 3.x. For multiple scheduler instances with exactly-one execution, use a real queue (Celery, RQ, ARQ) or an external lock.
- Give every job a stable `id`, set `replace_existing=True`, and set `max_instances`, `coalesce` and `misfire_grace_time` deliberately.
- Naive datetimes are interpreted in the scheduler timezone. Set `timezone=` explicitly; pass the IANA name (`"Europe/Berlin"`). A cron job keeps its wall-clock time across daylight-saving changes of that zone (02:30 stays 02:30).
- Do not run long CPU work in the default thread pool of a web app; use the `ProcessPoolExecutor` or a task queue.
- Do not use APScheduler for work that must survive the machine dying with retries and delivery guarantees. It is a scheduler, not a queue.
- Keep secrets out of job arguments: they are stored in the job store in plain pickled form.
