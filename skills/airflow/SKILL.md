---
name: airflow
description: |
  Apache Airflow is a platform for programmatically authoring, scheduling, and monitoring workflows.
  Learn to write DAGs, use operators, set up connections, configure scheduling,
  and deploy with Docker Compose.
license: Apache-2.0
compatibility:
  - macos
  - linux
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - airflow
    - workflow-orchestration
    - dag
    - etl
    - scheduling
---

# Airflow

Apache Airflow lets you define workflows as Directed Acyclic Graphs (DAGs) in Python. Each DAG consists of tasks connected by dependencies, scheduled and monitored via a web UI.

## Installation

```yaml
# docker-compose.yml: Airflow with LocalExecutor (simplified)
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_USER: airflow
      POSTGRES_PASSWORD: airflow
      POSTGRES_DB: airflow
    volumes:
      - postgres-data:/var/lib/postgresql/data

  airflow-webserver:
    image: apache/airflow:2.9.0
    depends_on: [postgres]
    environment:
      AIRFLOW__CORE__EXECUTOR: LocalExecutor
      AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://airflow:airflow@postgres/airflow
      AIRFLOW__CORE__FERNET_KEY: ''
      AIRFLOW__WEBSERVER__SECRET_KEY: changeme
    volumes:
      - ./dags:/opt/airflow/dags
    ports:
      - "8080:8080"
    command: bash -c "airflow db migrate && airflow users create --username admin --password admin --firstname Admin --lastname User --role Admin --email admin@example.com && airflow webserver"

  airflow-scheduler:
    image: apache/airflow:2.9.0
    depends_on: [postgres]
    environment:
      AIRFLOW__CORE__EXECUTOR: LocalExecutor
      AIRFLOW__DATABASE__SQL_ALCHEMY_CONN: postgresql+psycopg2://airflow:airflow@postgres/airflow
    volumes:
      - ./dags:/opt/airflow/dags
    command: airflow scheduler

volumes:
  postgres-data:
```

```bash
# Start Airflow
docker compose up -d
# UI at http://localhost:8080 (admin/admin)
```

## Basic DAG

```python
# dags/hello_world.py: Simple DAG with PythonOperator
from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator

default_args = {
    'owner': 'data-team',
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    dag_id='hello_world',
    default_args=default_args,
    description='A simple hello world DAG',
    schedule='@daily',
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=['example'],
) as dag:

    def extract(**kwargs):
        import requests
        data = requests.get('https://api.example.com/data').json()
        kwargs['ti'].xcom_push(key='raw_data', value=data)

    def transform(**kwargs):
        data = kwargs['ti'].xcom_pull(key='raw_data', task_ids='extract')
        transformed = [{'id': d['id'], 'value': d['amount'] * 100} for d in data]
        kwargs['ti'].xcom_push(key='transformed', value=transformed)

    extract_task = PythonOperator(task_id='extract', python_callable=extract)
    transform_task = PythonOperator(task_id='transform', python_callable=transform)
    load_task = BashOperator(task_id='load', bash_command='echo "Loading data..."')

    extract_task >> transform_task >> load_task
```

## TaskFlow API

```python
# dags/taskflow_etl.py: Modern TaskFlow API with decorators
from datetime import datetime
from airflow.decorators import dag, task

@dag(
    schedule='@daily',
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=['etl'],
)
def taskflow_etl():

    @task()
    def extract():
        return {'users': 100, 'revenue': 50000}

    @task()
    def transform(data: dict):
        return {
            'users': data['users'],
            'avg_revenue': data['revenue'] / data['users'],
        }

    @task()
    def load(summary: dict):
        print(f"Users: {summary['users']}, Avg Revenue: {summary['avg_revenue']}")

    raw = extract()
    transformed = transform(raw)
    load(transformed)

taskflow_etl()
```

## Common Operators

```python
# dags/operators_demo.py: Various operator examples
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.sensors.filesystem import FileSensor

# SQL execution
create_table = PostgresOperator(
    task_id='create_table',
    postgres_conn_id='my_postgres',
    sql="""
        CREATE TABLE IF NOT EXISTS daily_stats (
            date DATE PRIMARY KEY,
            total_users INT,
            revenue NUMERIC
        );
    """,
)

# HTTP request
fetch_api = SimpleHttpOperator(
    task_id='fetch_api',
    http_conn_id='my_api',
    endpoint='/api/stats',
    method='GET',
    response_filter=lambda r: r.json(),
)

# Wait for file
wait_for_file = FileSensor(
    task_id='wait_for_file',
    filepath='/data/incoming/report.csv',
    poke_interval=60,
    timeout=3600,
)
```

## Connections and Variables

```bash
# connections.sh: Set up connections via CLI
airflow connections add 'my_postgres' \
  --conn-type 'postgres' \
  --conn-host 'localhost' \
  --conn-schema 'mydb' \
  --conn-login 'user' \
  --conn-password 'pass' \
  --conn-port 5432

# Set variables
airflow variables set 'api_key' 'abc123'
airflow variables set 'config' '{"batch_size": 1000}' --serialize-json

# Trigger a DAG
airflow dags trigger hello_world --conf '{"date": "2026-02-19"}'
```
