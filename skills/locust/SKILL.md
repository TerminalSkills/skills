---
name: locust
description: >-
  Load-test web services with Locust, an open-source Python framework where
  user behavior is written as plain Python code and run from a real-time web UI
  or headless in CI. Use when the user mentions "locust", "locustfile", "Python
  load testing", "distributed load test", "locust web UI", or wants to simulate
  thousands of concurrent users against an API. For JavaScript-based load
  testing, see k6 or artillery.
license: Apache-2.0
compatibility: "Python 3.11+ (Locust 2.46). Linux, macOS, Windows."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/locustio/locust
  tags: "load-testing, python, distributed, performance"
---

# Locust

## Overview

Locust defines simulated users as Python classes in a `locustfile.py`. Each user runs weighted `@task` methods with a wait time between them. Run it with the web UI (default, http://localhost:8089) to start and watch a test, or with `--headless` in CI. It scales out with `--processes` on one machine or a master plus workers across machines. Checked against Locust 2.46.7 (October 2026), which needs Python 3.11 or newer.

## Instructions

### Install and run

```bash
python -m venv .venv && source .venv/bin/activate
pip install locust
locust --version
locust -f locustfile.py            # web UI on http://localhost:8089
```

### Basic locustfile

```python
# locustfile.py: users browse the catalog and add to cart
import os
from locust import HttpUser, task, between

class ShopUser(HttpUser):
    host = "https://staging.shop.internal"
    wait_time = between(1, 3)

    def on_start(self):
        # runs once per simulated user
        resp = self.client.post("/login", json={"username": os.environ["LOAD_USER"], "password": os.environ["LOAD_USER_PASSWORD"]})
        self.client.headers["Authorization"] = f"Bearer {resp.json()['token']}"

    @task(3)
    def browse_products(self):
        self.client.get("/products")

    @task(2)
    def view_product(self):
        # group URLs with ids under one stats row; mark custom failures
        with self.client.get("/products/1", name="/products/[id]", catch_response=True) as resp:
            if resp.status_code != 200:
                resp.failure(f"unexpected status {resp.status_code}")

    @task(1)
    def add_to_cart(self):
        self.client.post("/cart", json={"product_id": 1, "quantity": 1})
```

Read credentials from environment variables (`os.environ["LOAD_USER_PASSWORD"]`) rather than hard-coding them. `FastHttpUser` (gevent-based client, much higher requests per CPU core) is a drop-in choice when the load generator is the bottleneck, but its client has no `.headers` attribute: pass `headers=` per request instead.

### Headless runs and CI

```bash
locust -f locustfile.py --headless -u 50 -r 10 -t 2m \
  --csv results --html report.html --only-summary
```

`-u` is peak users, `-r` the spawn rate per second, `-t` the run time. `--autostart` starts the test immediately but keeps the web UI; `--autoquit 10` exits 10 seconds after the run. `--json` prints final stats as JSON. Settings can also live in a `locust.conf` file or `--config`.

Locust exits with code 1 when the run contains any failed request (`--exit-code-on-error <int>` sets that code, default 1; `0` disables it), so a plain headless run already fails the pipeline. To allow a tolerated error rate instead, pass `--exit-code-on-error 0` and set `environment.process_exit_code` in a `test_stop` listener (see Example 2).

### Custom load shapes

Put a `LoadTestShape` subclass in the locustfile (or a second file passed as `-f a.py,b.py`). When one exists, `-u`/`-r` are ignored. Returning `None` from `tick()` ends the test.

```python
from locust import LoadTestShape

class DailyTrafficShape(LoadTestShape):
    stages = [
        {"duration": 60, "users": 20, "spawn_rate": 5},
        {"duration": 180, "users": 200, "spawn_rate": 20},   # cumulative end times, in seconds
        {"duration": 240, "users": 0, "spawn_rate": 20},
    ]

    def tick(self):
        run_time = self.get_run_time()
        for stage in self.stages:
            if run_time < stage["duration"]:
                return (stage["users"], stage["spawn_rate"])
        return None
```

Here `duration` is the time since the start at which a stage ends, not its length.

### Distributed testing

```bash
# one machine, all cores: forks one worker per core
locust -f locustfile.py --processes -1

# several machines
locust -f locustfile.py --master --expect-workers 4        # coordinator, web UI
locust -f locustfile.py --worker --master-host 10.0.4.12   # on each worker
locust -f locustfile.py --master --headless -u 1000 -r 50 -t 5m --expect-workers 4   # headless
```

Workers need the locustfile and its dependencies locally (a worker started with `-f -` downloads the file from the master). Add `--enable-rebalancing` so users are redistributed when workers join late.

### Event hooks

Request listeners receive keyword arguments (`request_type`, `name`, `response_time`, `response_length`, `exception`, `context`, `response`, ...), so always accept `**kwargs`.

## Examples

### Example 1: Smoke test an API before a release

**Request:** "Hit our staging orders API with 20 users for a minute and give me an HTML report."

```bash
locust -f locustfile.py --headless -u 20 -r 5 -t 1m \
  --host https://staging.shop.internal --html orders-report.html --only-summary
```

Result: a table with one row per request name (`GET /products`, `POST /cart`, ...) showing request counts, failures, average and percentile response times, plus `orders-report.html` with charts.

### Example 2: Fail CI when the error rate is too high

**Request:** "Fail the pipeline if more than 1% of requests fail."

```python
# add to locustfile.py
from locust import events

@events.test_stop.add_listener
def check_error_rate(environment, **kwargs):
    if environment.stats.total.fail_ratio > 0.01:
        environment.process_exit_code = 1
```

```bash
locust -f locustfile.py --headless -u 50 -r 10 -t 2m --csv results --exit-code-on-error 0
echo $?    # 1 only when the error rate is above 1%
```

A GitHub Actions job runs the same command after `pip install locust` and uploads `results_*.csv` with `actions/upload-artifact`.

## Guidelines

- Name dynamic URLs (`name="/products/[id]"`) or the stats table gets one row per id.
- An exception in `on_start` or a task stops that simulated user silently while the run continues; read the log for tracebacks, not only the summary.
- Run the load generator on a different machine from the target, and watch generator CPU (keep it under about 90%); add workers or switch to `FastHttpUser` if it saturates.
- Test staging with test accounts, never production with real customer data, and get permission before load testing a service you do not own.
- Pass `--reset-stats` to drop the ramp-up period from the numbers.
- Response times in the stats are request latency only; locust cannot see server CPU, so monitor the target separately.
