---
name: flink
description: >-
  Process real-time data streams with Apache Flink. Use when a user asks to
  build real-time analytics, process event streams with low latency, implement
  complex event processing, or run stateful stream processing at scale.
license: Apache-2.0
compatibility: 'Java, Scala, Python (PyFlink)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-ai
  tags:
    - flink
    - streaming
    - real-time
    - analytics
    - events
---

# Apache Flink

## Overview

Flink is a distributed stream processing engine for real-time analytics. Unlike batch-first systems (Spark), Flink is stream-first — it processes events as they arrive with millisecond latency. Supports exactly-once semantics, stateful processing, and event time windowing.

## Instructions

### Step 1: PyFlink Setup

```bash
pip install apache-flink
```

### Step 2: Stream Processing

```python
# stream_job.py — Real-time event processing with PyFlink
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.kafka import FlinkKafkaConsumer, FlinkKafkaProducer
from pyflink.common.serialization import SimpleStringSchema
from pyflink.datastream.window import TumblingEventTimeWindows
from pyflink.common.time import Time
import json

env = StreamExecutionEnvironment.get_execution_environment()
env.set_parallelism(4)

# Read from Kafka
consumer = FlinkKafkaConsumer(
    topics='clickstream',
    deserialization_schema=SimpleStringSchema(),
    properties={
        'bootstrap.servers': 'kafka:9092',
        'group.id': 'flink-analytics',
    }
)

stream = env.add_source(consumer)

# Parse, filter, and aggregate
(stream
    .map(lambda x: json.loads(x))
    .filter(lambda e: e['event_type'] == 'page_view')
    .key_by(lambda e: e['page_url'])
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .reduce(lambda a, b: {
        'page_url': a['page_url'],
        'view_count': a.get('view_count', 1) + 1,
        'unique_users': list(set(a.get('unique_users', [a['user_id']]) + [b['user_id']])),
    })
    .map(lambda x: json.dumps(x))
    .add_sink(FlinkKafkaProducer(
        topic='page-analytics',
        serialization_schema=SimpleStringSchema(),
        producer_config={'bootstrap.servers': 'kafka:9092'},
    ))
)

env.execute('Clickstream Analytics')
```

### Step 3: Flink SQL

```python
# sql_job.py — Real-time analytics with Flink SQL
from pyflink.table import EnvironmentSettings, TableEnvironment

t_env = TableEnvironment.create(EnvironmentSettings.in_streaming_mode())

# Define Kafka source table
t_env.execute_sql("""
    CREATE TABLE orders (
        order_id STRING,
        user_id STRING,
        amount DECIMAL(10, 2),
        event_time TIMESTAMP(3),
        WATERMARK FOR event_time AS event_time - INTERVAL '5' SECOND
    ) WITH (
        'connector' = 'kafka',
        'topic' = 'orders',
        'properties.bootstrap.servers' = 'kafka:9092',
        'format' = 'json'
    )
""")

# Real-time aggregation with tumbling windows
t_env.execute_sql("""
    SELECT
        TUMBLE_START(event_time, INTERVAL '1' MINUTE) as window_start,
        COUNT(*) as order_count,
        SUM(amount) as total_revenue,
        COUNT(DISTINCT user_id) as unique_buyers
    FROM orders
    GROUP BY TUMBLE(event_time, INTERVAL '1' MINUTE)
""").print()
```

## Guidelines

- Flink is stream-first; Spark is batch-first with streaming added. Choose Flink for sub-second latency.
- Use event time (not processing time) for accurate windowed aggregations.
- Watermarks handle late-arriving events — configure based on your latency tolerance.
- Managed Flink: AWS Kinesis Data Analytics, Confluent Cloud, or Ververica Platform.
