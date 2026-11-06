---
title: Build a Real-Time Analytics Pipeline
slug: build-real-time-analytics-pipeline
description: >-
  Build an end-to-end real-time analytics pipeline using Kafka for event
  ingestion, Apache Spark for stream processing, and ClickHouse for
  sub-second analytical queries. Serve live dashboards with fresh data.
skills:
  - kafka
  - apache-spark
  - clickhouse
  - grafana
category: data-ai
tags:
  - real-time
  - analytics
  - pipeline
  - streaming
  - events
---

# Build a Real-Time Analytics Pipeline

Nadia runs analytics for a ride-sharing startup processing 50,000 events per minute — ride requests, driver locations, fare calculations, and completion events. Their current pipeline runs hourly batch jobs, meaning the ops team sees data that's always 1-2 hours stale. When a city has a surge event or driver supply drops, they find out too late. She builds a real-time pipeline: events flow through Kafka, get processed by Spark Structured Streaming, land in ClickHouse, and appear on Grafana dashboards within seconds.

## Step 1: Event Schema and Kafka Topics

The first decision is topic design. Rather than one giant topic, Nadia splits events by domain — this allows independent scaling and different retention policies.

```python
# infra/kafka_setup.py — Create Kafka topics with appropriate partitioning
from confluent_kafka.admin import AdminClient, NewTopic

admin = AdminClient({'bootstrap.servers': 'kafka:9092'})

topics = [
    NewTopic(
        'ride-events',
        num_partitions=12,           # 12 partitions for parallel processing
        replication_factor=3,         # 3 replicas (needs at least 3 brokers)
        config={
            'retention.ms': str(7 * 24 * 60 * 60 * 1000),   # 7 days retention
            'compression.type': 'lz4',                        # fast compression
        }
    ),
    NewTopic(
        'driver-locations',
        num_partitions=24,           # higher throughput — GPS updates every 5s
        replication_factor=3,
        config={
            'retention.ms': str(24 * 60 * 60 * 1000),        # 1 day (ephemeral)
            'cleanup.policy': 'compact,delete',
        }
    ),
    NewTopic(
        'analytics-aggregated',
        num_partitions=6,
        replication_factor=3,
    ),
]

# create_topics returns one future per topic; wait for each so failures are visible
for name, future in admin.create_topics(topics).items():
    future.result()   # raises KafkaException if the topic could not be created
    print(f"created {name}")
```

Each ride event carries a `ride_id` as the Kafka key — this ensures all events for the same ride land on the same partition, maintaining order. Driver locations use `driver_id` as the key for the same reason.

## Step 2: Event Producer

```python
# services/event_producer.py — Produce ride events to Kafka
from confluent_kafka import Producer
import json
from datetime import datetime, timezone

producer = Producer({
    'bootstrap.servers': 'kafka:9092',
    'linger.ms': 50,                      # batch messages for 50ms (throughput vs latency)
    'batch.num.messages': 1000,
    'compression.type': 'lz4',
})

def emit_ride_event(event_type: str, ride_id: str, data: dict):
    """Publish a ride lifecycle event.

    Args:
        event_type: One of requested, accepted, started, completed, cancelled
        ride_id: Unique ride identifier (used as partition key)
        data: Event payload with ride details
    """
    event = {
        'event_type': event_type,
        'ride_id': ride_id,
        # naive UTC string: ClickHouse parses it with its default settings
        'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%S.%f'),
        **data,
    }

    producer.produce(
        topic='ride-events',
        key=ride_id,                       # same ride → same partition → ordered
        value=json.dumps(event),
        callback=lambda err, msg: print(f"Error: {err}") if err else None,
    )
    producer.poll(0)                       # trigger delivery callbacks

# Example usage from the ride service
emit_ride_event('requested', 'ride-abc-123', {
    'user_id': 'user-456',
    'pickup': {'lat': 48.1486, 'lng': 17.1077},
    'dropoff': {'lat': 48.1586, 'lng': 17.1177},
    'estimated_fare': 8.50,
    'city': 'bratislava',
})
producer.flush()                           # block until queued messages are delivered
```

## Step 3: Spark Streaming Processing

Spark Structured Streaming reads from Kafka, computes rolling aggregations per city, and writes them back to Kafka for downstream services. (ClickHouse, in the next step, reads the raw `ride-events` topic directly for the dashboards.) The Kafka source is not bundled with PySpark, so the job is submitted with the connector package that matches the Spark version:

```console
$ spark-submit --packages org.apache.spark:spark-sql-kafka-0-10_2.13:4.3.0 jobs/ride_analytics.py
```

```python
# jobs/ride_analytics.py — Spark Structured Streaming job
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType

spark = SparkSession.builder \
    .appName("RideAnalytics") \
    .config("spark.sql.session.timeZone", "UTC") \
    .getOrCreate()

schema = StructType([
    StructField("event_type", StringType()),
    StructField("ride_id", StringType()),
    StructField("timestamp", StringType()),
    StructField("city", StringType()),
    StructField("estimated_fare", DoubleType()),
    StructField("user_id", StringType()),
])

# Read from Kafka
raw_stream = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka:9092") \
    .option("subscribe", "ride-events") \
    .option("startingOffsets", "latest") \
    .load()

# Parse JSON events
events = raw_stream \
    .select(F.from_json(F.col("value").cast("string"), schema).alias("event")) \
    .select("event.*") \
    .withColumn("event_time", F.to_timestamp("timestamp"))

# 5-minute rolling aggregations per city
city_metrics = events \
    .withWatermark("event_time", "30 seconds") \
    .groupBy(
        F.window("event_time", "5 minutes", "1 minute"),    # 5-min window, sliding every 1 min
        "city"
    ) \
    .agg(
        F.count("*").alias("total_events"),
        F.count(F.when(F.col("event_type") == "requested", 1)).alias("requests"),
        F.count(F.when(F.col("event_type") == "completed", 1)).alias("completions"),
        F.count(F.when(F.col("event_type") == "cancelled", 1)).alias("cancellations"),
        F.avg("estimated_fare").alias("avg_fare"),
        F.approx_count_distinct("user_id").alias("unique_riders"),   # exact distinct counts are not supported in streaming
    )

# Write aggregated metrics to Kafka (for ClickHouse and downstream)
query = city_metrics \
    .select(F.to_json(F.struct("*")).alias("value")) \
    .writeStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka:9092") \
    .option("topic", "analytics-aggregated") \
    .option("checkpointLocation", "/var/lib/spark/checkpoints/ride-analytics") \
    .outputMode("update") \
    .start()

query.awaitTermination()
```

The watermark of 30 seconds means events arriving more than 30 seconds behind the newest event time seen are dropped from the aggregates — acceptable for operational dashboards where freshness matters more than completeness. Structured Streaming has no backpressure setting to tune: the old `spark.streaming.backpressure.enabled` flag belongs to the legacy DStream API and does nothing here. Throughput is bounded with source options such as `maxOffsetsPerTrigger`, and adaptive query execution does not apply to streaming queries, so the job sets neither. Restarting with the same `checkpointLocation` resumes from the saved offsets; keep it on durable storage, not `/tmp`.

## Step 4: ClickHouse for Analytical Queries

ClickHouse ingests from Kafka directly and stores data in a columnar format optimized for aggregation queries.

```sql
-- ClickHouse: Kafka engine table (reads from Kafka topic)
CREATE TABLE ride_events_queue (
    event_type String,
    ride_id String,
    timestamp DateTime64(3),
    city LowCardinality(String),
    estimated_fare Float64,
    user_id String
) ENGINE = Kafka
SETTINGS
    kafka_broker_list = 'kafka:9092',
    kafka_topic_list = 'ride-events',
    kafka_group_name = 'clickhouse-ingest',
    kafka_format = 'JSONEachRow';

-- Destination table (MergeTree for fast analytics)
CREATE TABLE ride_events (
    event_type LowCardinality(String),
    ride_id String,
    timestamp DateTime64(3),
    city LowCardinality(String),
    estimated_fare Float64,
    user_id String
) ENGINE = MergeTree()
PARTITION BY toYYYYMMDD(timestamp)
ORDER BY (city, timestamp)
TTL toDateTime(timestamp) + INTERVAL 90 DAY;

-- Materialized view: auto-insert from Kafka to MergeTree
CREATE MATERIALIZED VIEW ride_events_mv TO ride_events AS
SELECT * FROM ride_events_queue;
```

Now analytical queries run in milliseconds:

```sql
-- City performance in the last hour
SELECT
    city,
    countIf(event_type = 'requested') as requests,
    countIf(event_type = 'completed') as completions,
    countIf(event_type = 'cancelled') as cancellations,
    round(completions / greatest(requests, 1) * 100, 1) as completion_rate,
    round(avg(estimated_fare), 2) as avg_fare
FROM ride_events
WHERE timestamp > now() - INTERVAL 1 HOUR
GROUP BY city
ORDER BY requests DESC;
```

## Step 5: Grafana Dashboard

Nadia connects Grafana to ClickHouse with the official `grafana-clickhouse-datasource` plugin and builds a live ops dashboard. The plugin's macros tie each panel to the dashboard time range and bucket size:

```sql
-- Grafana panel: ride requests per interval (time series)
SELECT
    $__timeInterval(timestamp) AS time,
    city,
    count(*) AS ride_requests
FROM ride_events
WHERE $__timeFilter_ms(timestamp)
  AND event_type = 'requested'
GROUP BY time, city
ORDER BY time;
```

The dashboard auto-refreshes every 10 seconds, giving the ops team near-real-time visibility. Grafana alert rules on the same queries notify the on-call channel when, for example, the cancellation rate in a city stays above 30% for five minutes.

## Results

In Nadia's rollout an event is visible on the dashboard within seconds of happening, instead of one to two hours later. During a concert that doubles ride demand in one city, the ops team sees the surge as it builds and raises driver incentives within minutes. The ClickHouse queries behind the dashboard stay fast because they scan only the columns and partitions they need. Her team's own numbers: three Kafka brokers, two Spark workers and two ClickHouse nodes, replacing a managed analytics platform that was always behind. Your latency and cost depend on your hardware, topic sizing and trigger interval, so measure before you promise a number.

## Related Skills

- [kafka](/skills/kafka): topics, keys and producers for the event stream
- [apache-spark](/skills/apache-spark): the Structured Streaming job that computes rolling per-city metrics
- [clickhouse](/skills/clickhouse): Kafka-engine ingestion and fast analytical queries
- [grafana](/skills/grafana): the live ops dashboard and alerts on top of ClickHouse
