---
name: airflow
description: |
  Apache Airflow is a platform for authoring, scheduling and monitoring workflows as Python DAGs.
  Use when the user wants to write a DAG, schedule an ETL or data pipeline, use the TaskFlow API,
  add connections and variables, run Airflow locally or with Docker Compose, or upgrade
  DAGs from Airflow 2 to Airflow 3.
license: Apache-2.0
compatibility: 'Linux, macOS, WSL2; Python 3.10-3.14; Airflow 3.x (Docker 20+ with Compose v2.14+ for containers)'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/apache/airflow
  category: data-ai
  tags:
    - airflow
    - workflow-orchestration
    - dag
    - etl
    - scheduling
---

# Airflow

## Overview

Apache Airflow lets you define workflows as Directed Acyclic Graphs (DAGs) in Python: tasks connected by dependencies, scheduled and monitored from a web UI. This skill targets Airflow 3.x (3.3.2 at the time of writing). Airflow 3 changed things that older tutorials get wrong:

- DAG authoring imports come from `airflow.sdk` (`DAG`, `dag`, `task`, `Variable`). The Airflow 2 paths (`from airflow import DAG`, `airflow.decorators`, `airflow.operators.python`) still import in 3.3.2 but are deprecated shims.
- Common operators live in the `standard` provider: `airflow.providers.standard.operators.python` / `.bash`.
- `PostgresOperator` and `SimpleHttpOperator` no longer exist (their imports fail); use `SQLExecuteQueryOperator` and `HttpOperator`.
- The webserver is now the `api-server` process, plus a separate `dag-processor`. `airflow users create` is no longer in core.
- `schedule` replaces `schedule_interval`/`timetable`, and `catchup` defaults to `False`.

## Instructions

### Install locally and run

Use a virtual environment and the official constraints file for your Airflow and Python versions:

```bash
export AIRFLOW_HOME=~/airflow
python3 -m venv ~/airflow_venv && source ~/airflow_venv/bin/activate
AIRFLOW_VERSION=3.3.2
PYTHON_VERSION="$(python -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
pip install "apache-airflow==${AIRFLOW_VERSION}" \
  --constraint "https://raw.githubusercontent.com/apache/airflow/constraints-${AIRFLOW_VERSION}/constraints-${PYTHON_VERSION}.txt"
airflow standalone   # database, user, api-server, scheduler, dag-processor, triggerer
```

The UI is at http://localhost:8080. The admin password is generated; read it from `$AIRFLOW_HOME/simple_auth_manager_passwords.json.generated`. Put DAG files in `$AIRFLOW_HOME/dags/`. `standalone` is for learning, not production.

### Install with Docker Compose

Fetch the compose file published for your exact version. It runs the CeleryExecutor with Postgres and Redis (api-server, scheduler, dag-processor, worker, triggerer) and is meant for exploration:

```bash
curl -LfO 'https://airflow.apache.org/docs/apache-airflow/3.3.2/docker-compose.yaml'
mkdir -p ./dags ./logs ./plugins ./config
echo "AIRFLOW_UID=$(id -u)" > .env
docker compose up airflow-init   # migrates the database, creates user airflow / password airflow
docker compose up -d
```

Open http://localhost:8080 and sign in as `airflow` / `airflow`; change that outside a local machine. Reset everything with `docker compose down --volumes --remove-orphans`. To pin a different image use `AIRFLOW_IMAGE_NAME` in `.env`.

### A classic DAG

```python
# dags/hello_world.py
from datetime import datetime, timedelta

from airflow.providers.standard.operators.bash import BashOperator
from airflow.providers.standard.operators.python import PythonOperator
from airflow.sdk import DAG

default_args = {"owner": "data-team", "retries": 2, "retry_delay": timedelta(minutes=5)}


def extract(ti):
    orders = [{"id": 1, "amount": 12.5}, {"id": 2, "amount": 7.25}]
    ti.xcom_push(key="raw_orders", value=orders)


def transform(ti):
    orders = ti.xcom_pull(task_ids="extract", key="raw_orders")
    ti.xcom_push(key="order_cents", value=[{"id": o["id"], "cents": round(o["amount"] * 100)} for o in orders])


with DAG(
    dag_id="hello_world",
    default_args=default_args,
    description="Extract, transform and load a few orders",
    schedule="@daily",
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=["example"],
) as dag:
    extract_task = PythonOperator(task_id="extract", python_callable=extract)
    transform_task = PythonOperator(task_id="transform", python_callable=transform)
    load_task = BashOperator(task_id="load", bash_command="echo 'Loading orders for {{ ds }}'")

    extract_task >> transform_task >> load_task
```

### TaskFlow API with dynamic task mapping

Return values travel between tasks as XComs automatically. `.expand()` creates one task instance per item at run time.

```python
# dags/taskflow_etl.py
from datetime import datetime

from airflow.sdk import dag, task


@dag(schedule="@daily", start_date=datetime(2026, 1, 1), catchup=False, tags=["etl"])
def taskflow_etl():
    @task
    def list_regions() -> list[str]:
        return ["emea", "apac", "amer"]

    @task
    def extract(region: str) -> dict:
        return {"region": region, "users": 100, "revenue": 50000}

    @task
    def summarize(rows: list[dict]) -> dict:
        users = sum(r["users"] for r in rows)
        return {"users": users, "avg_revenue": sum(r["revenue"] for r in rows) / users}

    @task
    def load(summary: dict):
        print(f"Users: {summary['users']}, avg revenue: {summary['avg_revenue']:.2f}")

    rows = extract.expand(region=list_regions())
    load(summarize(rows))


taskflow_etl()
```

### Provider operators and sensors

Providers are separate packages: `pip install apache-airflow-providers-postgres apache-airflow-providers-http` (with the same constraints file). `SQLExecuteQueryOperator` works with any DB-API connection.

```python
# dags/operators_demo.py
from datetime import datetime

from airflow.providers.common.sql.operators.sql import SQLExecuteQueryOperator
from airflow.providers.http.operators.http import HttpOperator
from airflow.providers.standard.sensors.filesystem import FileSensor
from airflow.sdk import DAG

with DAG(dag_id="operators_demo", schedule=None, start_date=datetime(2026, 1, 1), catchup=False) as dag:
    wait_for_report = FileSensor(
        task_id="wait_for_report", fs_conn_id="fs_default",
        filepath="incoming/report.csv", poke_interval=60, timeout=3600,
    )
    create_table = SQLExecuteQueryOperator(
        task_id="create_table", conn_id="warehouse_postgres",
        sql="CREATE TABLE IF NOT EXISTS daily_stats (day DATE PRIMARY KEY, total_users INT, revenue NUMERIC);",
    )
    fetch_stats = HttpOperator(
        task_id="fetch_stats", http_conn_id="stats_api", endpoint="/api/stats",
        method="GET", response_filter=lambda r: r.json(),
    )
    wait_for_report >> create_table >> fetch_stats
```

### Connections, variables, running

```bash
airflow connections add warehouse_postgres --conn-type postgres --conn-host db.internal \
  --conn-schema analytics --conn-login etl_user --conn-password "$WAREHOUSE_DB_PASSWORD" --conn-port 5432
airflow variables set report_config '{"batch_size": 1000}' --json
airflow dags list-import-errors                      # DAG files that failed to parse
airflow dags test hello_world 2026-10-01             # run a DAG once, in-process, without the scheduler
airflow dags trigger hello_world --conf '{"region": "emea"}'
```

Connections can also come from environment variables named `AIRFLOW_CONN_WAREHOUSE_POSTGRES` (URI form), and variables from `AIRFLOW_VAR_REPORT_CONFIG`. In the Docker setup run these commands with `docker compose run --rm airflow-cli airflow ...`.

## Examples

**"Run my pipeline every weekday at 06:00 UTC."** Set `schedule="0 6 * * 1-5"` on the DAG with `catchup=False`. After saving the file the dag-processor picks it up (typically within a minute); `airflow dags list-import-errors` prints nothing if it parsed, and the DAG appears paused in the UI until you unpause it.

**"My Airflow 2 DAG breaks with `No module named 'airflow.providers.postgres.operators'`."** `PostgresOperator` and `SimpleHttpOperator` were removed. Replace `PostgresOperator(postgres_conn_id="warehouse_postgres", ...)` with `SQLExecuteQueryOperator(conn_id="warehouse_postgres", ...)` and `SimpleHttpOperator` with `HttpOperator`. While there, switch `from airflow import DAG` to `from airflow.sdk import DAG` and `airflow.operators.python` to `airflow.providers.standard.operators.python`. Then run `airflow dags test hello_world 2026-10-01`; a clean run ends with every task in `success`.

## Guidelines

- Always install with the constraints file; without it provider and dependency versions can conflict.
- Keep DAG files cheap to import: the dag-processor parses them repeatedly. Do database calls, API calls and heavy imports inside tasks, not at module top level.
- XComs are stored in the metadata database; pass references (paths, ids, small summaries), not DataFrames or large payloads.
- Tasks run in separate processes (and on separate machines with Celery/Kubernetes): never rely on in-memory state or local files between tasks unless storage is shared.
- Tasks have no direct access to the metadata database in Airflow 3; use the Task SDK (`airflow.sdk`), connections, variables and XComs.
- Make tasks idempotent and use the data interval (`{{ ds }}`, `data_interval_start`) rather than `datetime.now()`.
- Do not put secrets in DAG code or variables; use connections, environment variables or a secrets backend.
- The example compose file ships default passwords and `LOAD_EXAMPLES: 'true'`; it is not a production deployment.
- Use `airflow dags test` for debugging, not for backfills; for backfills use `airflow backfill create --dag-id taskflow_etl --from-date 2026-10-01 --to-date 2026-10-07`.
