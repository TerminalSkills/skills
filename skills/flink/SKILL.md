---
name: flink
description: >-
  Process real-time data streams with Apache Flink. Use when a user asks to
  build real-time analytics, process event streams with low latency, implement
  complex event processing, or run stateful stream processing at scale.
license: Apache-2.0
compatibility: 'Java 11 or 17 runtime; Python 3.9–3.12 for PyFlink'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/apache/flink
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

This skill targets Flink 2.x. 2.3.0 is the current release, but the Kafka connector is published only for Flink 2.1 and 2.2, so the steps pin 2.2.1. Flink 2.0 removed the DataSet API, the Scala DataStream API, `SourceFunction`/`SinkFunction` and Java 8 support, so most pre-2.0 tutorials — including anything built on `FlinkKafkaConsumer` — no longer run.

## Instructions

### Step 1: PyFlink Setup

```bash
java -version                      # Java 11 or newer; 17 is the default for Flink 2.x
python3 -m venv .venv && source .venv/bin/activate  # Python 3.9–3.12
python -m pip install apache-flink==2.2.1   # newest Flink the Kafka connector supports
```

The pip package bundles a complete Flink distribution (CLI, cluster scripts, `conf/config.yaml`) but no connectors. Connectors are released separately; fetch the Kafka one from Maven Central and check it against the published checksum:

```bash
KAFKA_JAR=flink-sql-connector-kafka-5.0.0-2.2.jar
MAVEN=https://repo1.maven.org/maven2/org/apache/flink/flink-sql-connector-kafka/5.0.0-2.2
mkdir -p lib
curl -fsSL -o "lib/$KAFKA_JAR" "$MAVEN/$KAFKA_JAR"
echo "$(curl -fsSL "$MAVEN/$KAFKA_JAR.sha1")  lib/$KAFKA_JAR" | sha1sum -c -
```

The version is the connector release followed by the Flink minor it was built for: `5.0.0-2.2` is connector 5.0.0 for Flink 2.2.

### Step 2: Stream Processing

```python
# stream_job.py — page views per URL in 5-minute event-time windows, Kafka to Kafka
import json
from pathlib import Path

from pyflink.common import Duration, Types, WatermarkStrategy
from pyflink.common.serialization import SimpleStringSchema
from pyflink.common.time import Time
from pyflink.datastream import StreamExecutionEnvironment
from pyflink.datastream.connectors.base import DeliveryGuarantee
from pyflink.datastream.connectors.kafka import (
    KafkaOffsetsInitializer, KafkaRecordSerializationSchema, KafkaSink, KafkaSource,
)
from pyflink.datastream.window import TumblingEventTimeWindows

env = StreamExecutionEnvironment.get_execution_environment()
env.add_jars(Path("lib/flink-sql-connector-kafka-5.0.0-2.2.jar").resolve().as_uri())
env.set_parallelism(4)
env.enable_checkpointing(60_000)  # ms; state snapshots for recovery

source = (
    KafkaSource.builder()
    .set_bootstrap_servers("localhost:9092")
    .set_topics("clickstream")
    .set_group_id("flink-analytics")
    .set_starting_offsets(KafkaOffsetsInitializer.earliest())
    .set_value_only_deserializer(SimpleStringSchema())
    .build()
)
sink = (
    KafkaSink.builder()
    .set_bootstrap_servers("localhost:9092")
    .set_record_serializer(
        KafkaRecordSerializationSchema.builder()
        .set_topic("page-analytics")
        .set_value_serialization_schema(SimpleStringSchema())
        .build()
    )
    .set_delivery_guarantee(DeliveryGuarantee.AT_LEAST_ONCE)
    .build()
)

# The Kafka record timestamp is the event time; tolerate 5 s of out-of-order events
watermarks = (
    WatermarkStrategy.for_bounded_out_of_orderness(Duration.of_seconds(5))
    .with_idleness(Duration.of_seconds(30))  # an empty partition must not hold windows open
)

(
    env.from_source(source, watermarks, "clickstream")
    .map(json.loads)
    .filter(lambda e: e["event_type"] == "page_view")
    .map(lambda e: (e["page_url"], 1, [e["user_id"]]))
    .key_by(lambda t: t[0])
    .window(TumblingEventTimeWindows.of(Time.minutes(5)))
    .reduce(lambda a, b: (a[0], a[1] + b[1], list(set(a[2] + b[2]))))
    .map(
        lambda t: json.dumps({"page_url": t[0], "view_count": t[1], "unique_users": len(t[2])}),
        output_type=Types.STRING(),
    )
    .sink_to(sink)
)

env.execute("Clickstream Analytics")
```

### Step 3: Flink SQL

```python
# sql_job.py — per-minute order revenue with Flink SQL
from pathlib import Path

from pyflink.table import EnvironmentSettings, TableEnvironment

t_env = TableEnvironment.create(EnvironmentSettings.in_streaming_mode())
t_env.get_config().set(
    "pipeline.jars", Path("lib/flink-sql-connector-kafka-5.0.0-2.2.jar").resolve().as_uri()
)
# without this, source subtasks that own no Kafka partition hold every window open
t_env.get_config().set("table.exec.source.idle-timeout", "30 s")

# Kafka source table; event_time drives the watermark
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
        'properties.bootstrap.servers' = 'localhost:9092',
        'properties.group.id' = 'flink-orders',
        'scan.startup.mode' = 'earliest-offset',
        'format' = 'json'
    )
""")

# Tumbling windows through the TUMBLE table-valued function
t_env.execute_sql("""
    SELECT
        window_start,
        COUNT(*) AS order_count,
        SUM(amount) AS total_revenue,
        COUNT(DISTINCT user_id) AS unique_buyers
    FROM TABLE(TUMBLE(TABLE orders, DESCRIPTOR(event_time), INTERVAL '1' MINUTE))
    GROUP BY window_start, window_end
""").print()
```

### Step 4: Submit to a Cluster

`python stream_job.py` runs the job in an embedded mini-cluster. To run it on a real cluster, use the scripts inside the pip package. First edit `conf/config.yaml` in the directory that `find_flink_home.py` prints (`$FLINK_HOME` below): under `rest:` uncomment `bind-address: localhost`, and under `taskmanager:` set `numberOfTaskSlots: 4` (the job above needs 4 slots; the default is 1).

```bash
export FLINK_HOME="$(find_flink_home.py)"        # installed with apache-flink
"$FLINK_HOME/bin/start-cluster.sh"               # JobManager + TaskManager, web UI on http://localhost:8081
"$FLINK_HOME/bin/flink" run --detached --python stream_job.py
"$FLINK_HOME/bin/flink" list                     # running jobs with their JobIDs
"$FLINK_HOME/bin/flink" cancel 3bf2577fb9074e3a83e4fa147adfaa51
"$FLINK_HOME/bin/stop-cluster.sh"
```

## Examples

### Example 1: Page views per URL every five minutes

User: "Our site sends click events to the Kafka topic `clickstream`. Count page views and unique visitors per URL every five minutes and write the result to `page-analytics`."

Save the Step 2 code as `stream_job.py` and run `python stream_job.py`. Input messages look like `{"event_type": "page_view", "page_url": "/pricing", "user_id": "u-1001"}`. One message per URL and window arrives on `page-analytics` once the watermark passes the window end:

```
{"page_url": "/pricing", "view_count": 5, "unique_users": 2}
{"page_url": "/docs/quickstart", "view_count": 2, "unique_users": 1}
{"page_url": "/blog/flink-2-3", "view_count": 2, "unique_users": 1}
```

The newest window stays open until an event later than its end (plus the 5 s tolerance) arrives.

### Example 2: Revenue per minute in SQL

User: "Show order count, revenue and distinct buyers per minute from the `orders` topic."

Save the Step 3 code as `sql_job.py` and run `python sql_job.py`. Each order is JSON such as `{"order_id": "ord-5021", "user_id": "u-1003", "amount": 72.49, "event_time": "2026-10-01 10:03:30.000"}`. The job prints a row as each window closes:

```
+----+-------------------------+----------------------+------------------------------------------+----------------------+
| op |            window_start |          order_count |                            total_revenue |        unique_buyers |
+----+-------------------------+----------------------+------------------------------------------+----------------------+
| +I | 2026-10-01 10:00:00.000 |                    6 |                                   157.44 |                    4 |
| +I | 2026-10-01 10:01:00.000 |                    6 |                                   247.44 |                    4 |
| +I | 2026-10-01 10:02:00.000 |                    6 |                                   337.44 |                    4 |
```

## Guidelines

- Flink is stream-first; Spark is batch-first with streaming added. Choose Flink for sub-second latency.
- Use event time (not processing time) for accurate windowed aggregations.
- Watermarks handle late-arriving events — configure based on your latency tolerance.
- Windows that never emit usually mean a stalled watermark: a Kafka source with more subtasks than partitions does not go idle on its own. Add `with_idleness(...)` (DataStream) or `table.exec.source.idle-timeout` (SQL), or lower the parallelism.
- `FlinkKafkaConsumer` and `FlinkKafkaProducer` are gone from the Kafka connector for Flink 2.x; PyFlink still exports the Python wrappers but they fail with "Could not found the Java class". Use `KafkaSource`/`KafkaSink` with `from_source` and `sink_to`.
- Match the connector to the Flink minor version. Connector 5.0.0 is published for Flink 2.1 and 2.2 only, which is why Step 1 pins 2.2.1; before moving to a newer Flink, check that https://flink.apache.org/downloads/ lists a connector release for it.
- In SQL prefer the window functions `TUMBLE`, `HOP`, `SESSION` and `CUMULATE` in the `FROM` clause; the older `GROUP BY TUMBLE(...)` / `TUMBLE_START` form is deprecated.
- The `json` format reads `TIMESTAMP` as `2026-10-01 10:03:30.000`. For `2026-10-01T10:03:30.000` add `'json.timestamp-format.standard' = 'ISO-8601'` to the table options.
- Kafka sinks need checkpointing for `AT_LEAST_ONCE` and `EXACTLY_ONCE`; exactly-once also needs `set_transactional_id_prefix(...)` and consumers that read committed data only.
- The web UI and REST API have no authentication and accept job submissions, which is code execution. With `rest.bind-address` left commented out, the cluster listens on all interfaces — bind it to `localhost` or keep it behind a private network.
- Flink is a cluster to operate (JobManager, TaskManagers, checkpoint storage). For small volumes or one-off batch work, a plain Kafka consumer or a batch engine is simpler.
- Managed Flink: Amazon Managed Service for Apache Flink (formerly Kinesis Data Analytics), Confluent Cloud, or Ververica Platform.
