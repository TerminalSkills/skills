---
name: prefect
description: >-
  Prefect is a Python workflow orchestration framework that turns functions
  into observable, retryable, schedulable data pipelines. Use when asked to
  "orchestrate a Python pipeline", "schedule a flow with cron", "add retries
  and caching to tasks", "deploy a Prefect flow", "run a worker" or "alert
  when a flow fails". Covers Prefect 3.x flows and tasks, cache policies,
  flow.serve, work pools with workers, the prefect deploy CLI, blocks,
  variables and failure hooks.
license: Apache-2.0
compatibility: "Python 3.11-3.15; prefect 3.x (tested with 3.9.0); Linux, macOS, Windows"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: data-ai
  tags: ["prefect", "workflow-orchestration", "python", "data-pipeline", "scheduling"]
  repository: https://github.com/PrefectHQ/prefect
---

# Prefect

## Overview

Prefect 3 turns Python functions into flows (`@flow`) made of tasks (`@task`), with retries, caching, logging, a UI and scheduled deployments. Two ways to run on a schedule: `flow.serve(...)` starts one long-running process that executes runs itself, and work pools plus workers (`prefect deploy` and `prefect worker start`) execute runs in managed infrastructure. Agents and `prefect.deployments.Deployment` from Prefect 2 are removed: importing `Deployment` raises an error.

## Instructions

### Install and run a server

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install prefect httpx            # needs Python 3.11 or newer
prefect version

prefect server start                 # UI and API at http://127.0.0.1:4200
# In another shell, point clients at it:
prefect config set PREFECT_API_URL=http://127.0.0.1:4200/api
```

Running a flow without any server also works: Prefect starts a temporary local server for the run. For Prefect Cloud use `prefect cloud login`.

### Flows and tasks

```python
# flows/orders_etl.py
from datetime import timedelta
import httpx
from prefect import flow, task, get_run_logger
from prefect.cache_policies import INPUTS
from prefect.tasks import exponential_backoff

@task(retries=3, retry_delay_seconds=exponential_backoff(backoff_factor=10),
      retry_jitter_factor=0.5, timeout_seconds=120)
def fetch_orders(day: str) -> list[dict]:
    r = httpx.get("https://api.northwind-shop.dev/orders", params={"date": day}, timeout=30)
    r.raise_for_status()
    return r.json()["results"]

@task(cache_policy=INPUTS, cache_expiration=timedelta(hours=1))
def to_cents(order: dict) -> dict:
    return {"id": order["id"], "cents": round(order["amount"] * 100)}

@task
def load(rows: list[dict]) -> int:
    get_run_logger().info("loading %d rows", len(rows))
    return len(rows)

@flow(name="orders-etl", log_prints=True)
def orders_etl(day: str = "2026-10-23") -> int:
    orders = fetch_orders(day)
    rows = [f.result() for f in to_cents.map(orders)]   # runs the tasks concurrently
    count = load(rows)
    print(f"loaded {count} rows")
    return count

if __name__ == "__main__":
    orders_etl()
```

Key points: `retry_delay_seconds` takes a number, a list (one delay per retry) or `exponential_backoff(...)`. Caching is configured with `cache_policy` (`INPUTS`, `TASK_SOURCE`, `DEFAULT`, from `prefect.cache_policies`); the old `task_input_hash` import is deprecated. `task.submit(...)` and `task.map(...)` return futures; call `.result()` or `wait(futures)` from `prefect.futures`. Tasks and flows may be `async def`; use `await` or `asyncio.gather` inside an async flow.

### Schedule with `flow.serve`

Simplest deployment: one Python process that stays running and executes scheduled and manual runs.

```python
# flows/daily_report.py
from prefect import flow

@flow(log_prints=True)
def daily_report(region: str = "emea"):
    print(f"report for {region}")

if __name__ == "__main__":
    daily_report.serve(name="daily-report", cron="0 8 * * *",
                       tags=["reporting"], parameters={"region": "emea"})
```

Run `python flows/daily_report.py` (keep it alive with systemd or a container), then trigger a run manually:

```bash
prefect deployment run "daily-report/daily-report" --param region=apac --watch
prefect deployment ls
```

`serve` also accepts `interval` (seconds or `timedelta`), `rrule`, `schedules`, `paused` and `limit` (concurrent runs).

### Work pools, workers and `prefect deploy`

Use this when runs must execute on separate infrastructure (Docker, Kubernetes, cloud).

```bash
prefect work-pool create etl-process --type process
prefect deploy flows/orders_etl.py:orders_etl --name etl-prod --pool etl-process --cron "*/30 * * * *"
prefect worker start --pool etl-process
prefect deployment run "orders-etl/etl-prod" --param day=2026-10-22
```

`prefect deploy` also accepts `--interval`, `--tag`, `--param` and `--job-variable`, and can save the deployment definition to `prefect.yaml` (`prefect init` creates one); without that file it deploys straight from the command-line options. There is no default pool called `default-agent-pool`: create a pool first. Workers need access to the flow's source code, so use a shared path, a Git source (`flow.from_source(...).deploy(...)` in Python) or a built image. Read logs with `prefect flow-run logs <id>` and list runs with `prefect flow-run ls`.

### Secrets, variables and failure alerts

```python
# flows/with_config.py
from prefect import flow
from prefect.blocks.system import Secret
from prefect.blocks.notifications import SlackWebhook
from prefect.variables import Variable

def alert_slack(flow, flow_run, state):
    SlackWebhook.load("ops-alerts").notify(f"Flow {flow.name} run {flow_run.name} ended {state.type.value}")

@flow(on_failure=[alert_slack])
def sync_stripe():
    api_key = Secret.load("stripe-api-key").get()
    batch_size = Variable.get("stripe_batch_size", default="500")
    ...
```

Create the blocks once, in the UI (Blocks page) or in Python (`Secret(value=os.environ["STRIPE_API_KEY"]).save("stripe-api-key")`). `on_failure` and `on_completion` are hook lists on flows and tasks; `on_crashed` and `on_cancellation` exist on flows only. Automations in the UI (trigger: flow run failed, action: send notification) work without code. Integration blocks such as SQLAlchemy live in separate packages (`pip install prefect-sqlalchemy`, then `prefect block register -m prefect_sqlalchemy`).

## Examples

### Example 1: "Run my ETL every 30 minutes and retry the API call"

Save `flows/orders_etl.py` from above, start `prefect server start`, then `python -c "from flows.orders_etl import orders_etl; orders_etl.serve(name='etl-prod', cron='*/30 * * * *')"` from the project root. The UI shows a scheduled run every half hour; a failed `fetch_orders` is retried up to three times with growing delays before the flow run is marked Failed.

### Example 2: "Page the team when the nightly job fails"

Create a `SlackWebhook` block named `ops-alerts` in the UI with the webhook URL, add the `on_failure=[alert_slack]` hook from the previous section, deploy with `prefect deploy ... --cron "0 2 * * *"`. When a run fails, the hook posts the flow and run name to Slack.

## Guidelines

- Pin the major version (`prefect>=3,<4`); Prefect 2 code using agents, `Deployment.build_from_flow` or `task_input_hash` as the main cache needs migration.
- Keep secrets in Secret blocks or environment variables, never in flow parameters, which appear in the UI.
- Bind the server to `127.0.0.1` (the default for local use) unless it sits behind authentication; the open-source server has no built-in login.
- Make tasks idempotent: a retry or a re-run repeats side effects such as inserts.
- Do not put large datasets through task return values; write to storage and pass paths.
- Workers pick up runs only for the pool they poll; a run stuck in Late or Pending usually means no worker is running for that pool.
