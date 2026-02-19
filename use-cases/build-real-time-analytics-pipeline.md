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
category: data-engineering
tags:
  - real-time
  - analytics
  - pipeline
  - streaming
  - events
---

# Build a Real-Time Analytics Pipeline

Nadia runs analytics for a ride-sharing startup processing 50,000 events per minute — ride requests, driver locations, fare calculations, and completion events. Their current pipeline runs hourly batch jobs, meaning the ops team sees data that's always 1-2 hours stale. When a city has a surge event or driver supply drops, they find out too late. She builds a real-time pipeline: events flow through Kafka, get processed by Spark Streaming, land in ClickHouse, and appear on Grafana dashboards within seconds.

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
        replication_factor=3,         # 3 replicas for fault tolerance
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

admin.create_topics(topics)
```

Each ride event carries a `ride_id` as the Kafka key — this ensures all events for the same ride land on the same partition, maintaining order. Driver locations use `driver_id` as the key for the same reason.

## Step 2: Event Producer

```python
# services/event_producer.py — Produce ride events to Kafka
from confluent_kafka import Producer
import json
from datetime import datetime

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
        'timestamp': datetime.utcnow().isoformat(),
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
```

## Step 3: Spark Streaming Processing

Spark Structured Streaming reads from Kafka, computes rolling aggregations, and writes results both to ClickHouse (for dashboards) and back to Kafka (for downstream services).

```python
# jobs/ride_analytics.py — Spark Structured Streaming job
from pyspark.sql import SparkSession
from pyspark.sql import functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType

spark = SparkSession.builder \
    .appName("RideAnalytics") \
    .config("spark.sql.adaptive.enabled", "true") \
    .config("spark.streaming.backpressure.enabled", "true") \
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
        F.countDistinct("user_id").alias("unique_riders"),
    )

# Write aggregated metrics to Kafka (for ClickHouse and downstream)
query = city_metrics \
    .select(F.to_json(F.struct("*")).alias("value")) \
    .writeStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka:9092") \
    .option("topic", "analytics-aggregated") \
    .option("checkpointLocation", "/tmp/checkpoints/ride-analytics") \
    .outputMode("update") \
    .start()

query.awaitTermination()
```

The watermark of 30 seconds means events arriving more than 30 seconds late are dropped — acceptable for operational dashboards where freshness matters more than completeness.

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
TTL timestamp + INTERVAL 90 DAY;

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

Nadia connects Grafana to ClickHouse with the official plugin and builds a live ops dashboard.

```sql
-- Grafana panel: Rides per minute (time series)
SELECT
    toStartOfMinute(timestamp) as time,
    city,
    count(*) as rides_per_minute
FROM ride_events
WHERE timestamp > now() - INTERVAL 1 HOUR
  AND event_type = 'requested'
GROUP BY time, city
ORDER BY time;
```

The dashboard auto-refreshes every 10 seconds, giving the ops team near-real-time visibility. They set alerts: if cancellation rate exceeds 30% in any city for 5+ minutes, PagerDuty triggers.

## Results

The pipeline processes 50,000 events/minute with end-to-end latency under 15 seconds (event occurs → visible on dashboard). During a concert that doubles ride demand in one city, the ops team sees the surge in real-time and increases driver incentives within minutes — something that would have taken 2+ hours with the old batch pipeline. The ClickHouse queries that power the dashboard return in 50-200ms even across billions of historical events. Cost: 3 Kafka brokers + 2 Spark workers + 2 ClickHouse nodes — roughly $800/month on cloud VMs, replacing a $2,400/month managed analytics platform that was always behind.
