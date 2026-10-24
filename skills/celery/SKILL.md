---
name: celery
description: >-
  Celery is a Python distributed task queue: web code puts jobs on a broker
  (Redis or RabbitMQ) and separate worker processes run them, with retries,
  schedules, rate limits and result storage. Use when a user asks to process
  tasks asynchronously, schedule periodic jobs, run background workers, build
  task queues in Python, or offload heavy processing from web requests in
  Django, Flask or FastAPI.
license: Apache-2.0
compatibility: 'Python 3.9+, Redis or RabbitMQ broker; works with Django, Flask, FastAPI'
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/celery/celery
  tags:
    - celery
    - python
    - tasks
    - queue
    - background
---

# Celery

## Overview

Celery (5.6.3 checked, requires Python 3.9+) offloads slow work such as emails, reports and image processing from web requests to worker processes. A **broker** carries messages, an optional **result backend** stores return values, and `celery beat` fires periodic tasks. Retries, rate limits, chains and groups are built in.

## Instructions

### Step 1: Install and configure

```bash
pip install "celery[redis]"
```

The quotes matter in zsh. For RabbitMQ, plain `pip install celery` with an `amqp://` broker URL is enough.

```python
# shop_tasks.py
from celery import Celery
from celery.schedules import crontab

app = Celery(
    "shop",
    broker="redis://localhost:6379/0",
    backend="redis://localhost:6379/1",
)

app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    task_acks_late=True,                      # ack after the task finishes
    worker_prefetch_multiplier=1,             # fair dispatch for long tasks
    broker_connection_retry_on_startup=True,  # keep trying if Redis starts late
    result_expires=3600,                      # drop stored results after 1 hour
)
```

### Step 2: Define tasks

```python
@app.task(
    bind=True,
    autoretry_for=(ConnectionError,),
    retry_backoff=True,        # delay grows 1s, 2s, 4s, ...; jitter picks a random value up to that
    retry_backoff_max=600,
    retry_jitter=True,
    max_retries=3,
)
def send_receipt(self, order_id: int):
    order = load_order(order_id)           # pass IDs, not objects
    smtp_send(order.email, render_receipt(order))


@app.task(rate_limit="10/m")               # per worker, not cluster-wide
def make_thumbnail(src: str, dst: str):
    ...
```

Arguments and return values must be JSON-serializable. Pass primary keys and reload the row inside the task.

### Step 3: Call tasks

```python
from celery import chain, group

send_receipt.delay(1001)                              # fire and forget
send_receipt.apply_async(args=[1001], countdown=60)   # run in 60 seconds

res = build_report.delay(7)
res.status        # PENDING, RETRY, SUCCESS, FAILURE (STARTED only with task_track_started)
res.get(timeout=30)

chain(fetch.s(5), total.s())()                        # fetch(5) result feeds total()
group(double.s(i) for i in range(3))()                # run in parallel
```

Never call `.get()` inside another task (it can deadlock a worker pool); use `chain` or a callback.

### Step 4: Periodic tasks and workers

```python
app.conf.beat_schedule = {
    "nightly-report": {
        "task": "shop_tasks.build_report",
        "schedule": crontab(hour=2, minute=30),
        "args": (7,),
    },
    "heartbeat": {"task": "shop_tasks.ping", "schedule": 30.0},
}
```

```bash
celery -A shop_tasks worker --loglevel=INFO --concurrency=4
celery -A shop_tasks beat --loglevel=INFO       # run exactly one beat process
celery -A shop_tasks inspect active             # what workers are running now
```

Add `-B` to the worker only in development. For Django, put `app.config_from_object("django.conf:settings", namespace="CELERY")` and `app.autodiscover_tasks()` in `proj/celery.py` and import it in `proj/__init__.py`.

## Examples

### Example 1: emails that survive an SMTP outage

Request: "Send the order receipt in the background and retry if the mail server is down."

Define `send_receipt` as in Step 2, call `send_receipt.delay(order.id)` from the checkout view, start a worker with `celery -A shop_tasks worker -l INFO`. In a run with a function that fails twice with `ConnectionError`, the task retried automatically and finished with `SUCCESS` after 2 retries.

### Example 2: a nightly report plus a parallel image batch

Request: "Build a sales report every night at 02:30 UTC and thumbnail 200 uploads at once."

Add the `nightly-report` entry from Step 4 and start `celery -A shop_tasks beat -l INFO` next to the worker. For the uploads, run `group(make_thumbnail.s(p, p + ".thumb.jpg") for p in paths)()`; the returned `GroupResult` has `.ready()` and `.get()`, and the worker processes them across its `--concurrency` slots.

## Guidelines

- `task_acks_late=True` means a task may run twice after a worker crash, so make tasks idempotent. On Redis, a task not acknowledged within `broker_transport_options={"visibility_timeout": ...}` (default 1 hour) is redelivered to another worker; set it above your longest task or ETA.
- Redis is simplest; RabbitMQ is the sturdier broker for production durability.
- Skip the result backend, or set `ignore_result=True` per task, when you never read results; stored results otherwise accumulate.
- Run a single `beat` process; two will fire every schedule twice.
- Monitor with Flower: `pip install flower`, then `celery -A shop_tasks flower --basic-auth=ops:change-me`. It listens on port 5555 on all interfaces by default, so add `--address=127.0.0.1` or put it behind a proxy.
- Never accept `pickle` as a serializer for data from untrusted sources; keep `accept_content=["json"]`.
- For lightweight needs in async-only apps, a framework's built-in background tasks may be enough; use Celery when you need retries, schedules and separate workers.
