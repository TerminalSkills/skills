---
name: apache-spark
description: >-
  Apache Spark is a distributed engine for batch, SQL and streaming data
  processing, used from Python through PySpark. Use when a user asks to process
  big data, run distributed computations, build ETL pipelines, analyse data at
  scale, read Parquet from S3, or stream from Kafka with PySpark.
license: Apache-2.0
compatibility: 'Python 3.10+ (PySpark 4.x), Java 17/21/25, Scala 2.13, R'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/apache/spark
  tags:
    - spark
    - pyspark
    - big-data
    - etl
    - distributed
---

# Apache Spark

## Overview

Apache Spark is a distributed data processing engine for batch jobs, SQL, structured streaming, machine learning (MLlib) and graph work. PySpark is the Python API. It runs locally for development, on a standalone cluster, YARN or Kubernetes, and on managed services (Databricks, EMR, Dataproc). This skill targets Spark 4.x (4.2.0 released July 2026), which needs Java 17, 21 or 25 and Scala 2.13 for JVM code; PySpark 4.2 needs Python 3.10+.

## Instructions

### Step 1: Install and run locally

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install pyspark            # bundles Spark itself; a JDK (17/21/25) must be on PATH
java -version                  # confirm the JDK first
pyspark --master "local[4]"    # interactive shell with 4 threads
spark-submit --master "local[4]" etl/process.py   # run a script
```

On a cluster use `spark-submit --master yarn` or `--master k8s://https://k8s-api.acme.internal:6443`; pass dependencies with `--packages group:artifact:version`.

### Step 2: DataFrame operations

```python
# etl/process.py — PySpark data processing
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = SparkSession.builder.appName("DailyMetrics").getOrCreate()
# Adaptive query execution is on by default since Spark 3.2; no flag needed.

df = spark.read.parquet("s3a://acme-data-lake/raw/events/")

processed = (df
    .filter(F.col("event_type").isin("purchase", "signup"))
    .withColumn("date", F.to_date("timestamp"))
    .withColumn("revenue", F.col("amount") * F.col("quantity"))
    .groupBy("date", "event_type")
    .agg(
        F.count("*").alias("event_count"),
        F.sum("revenue").alias("total_revenue"),
        F.countDistinct("user_id").alias("unique_users"),
    )
    .orderBy("date")
)

(processed.write
    .mode("overwrite")
    .partitionBy("date")
    .parquet("s3a://acme-data-lake/processed/daily_metrics/"))
```

Outside EMR/Databricks, S3 is read through the `s3a://` scheme, which needs the `hadoop-aws` JAR matching your Hadoop version (for example `--packages org.apache.hadoop:hadoop-aws:<your Hadoop version>`) and credentials from the standard AWS provider chain. Plain `s3://` only works on EMR.

### Step 3: SQL interface

```python
df.createOrReplaceTempView("events")

result = spark.sql("""
    SELECT date_trunc('month', timestamp) AS month,
           COUNT(DISTINCT user_id) AS monthly_active_users,
           SUM(CASE WHEN event_type = 'purchase' THEN amount ELSE 0 END) AS revenue
    FROM events
    WHERE timestamp >= '2025-01-01'
    GROUP BY 1
    ORDER BY 1
""")
result.show()
```

Spark 4 runs SQL in ANSI mode by default (`spark.sql.ansi.enabled=true`): an invalid cast or integer overflow raises an error instead of returning NULL. Use `try_cast`, `try_divide`, `try_to_date` and similar functions for dirty data, or set the flag to `false` only when migrating old jobs.

### Step 4: Structured Streaming from Kafka

The Kafka source is not bundled with PySpark. Add it at submit time, with the Scala 2.13 artifact matching your Spark version:

```bash
spark-submit --packages org.apache.spark:spark-sql-kafka-0-10_2.13:4.2.0 stream/events.py
```

```python
# stream/events.py
from pyspark.sql import SparkSession, functions as F
from pyspark.sql.types import StructType, StructField, StringType, DoubleType, TimestampType

spark = SparkSession.builder.appName("EventStream").getOrCreate()

schema = StructType([
    StructField("user_id", StringType()),
    StructField("event_type", StringType()),
    StructField("amount", DoubleType()),
    StructField("timestamp", TimestampType()),
])

stream = (spark.readStream.format("kafka")
    .option("kafka.bootstrap.servers", "kafka-1.internal:9092")
    .option("subscribe", "events")
    .option("startingOffsets", "earliest")   # default is "latest"; applies only to a new query
    .load())

parsed = (stream
    .select(F.from_json(F.col("value").cast("string"), schema).alias("data"))
    .select("data.*"))

query = (parsed
    .withWatermark("timestamp", "10 minutes")
    .groupBy(F.window("timestamp", "5 minutes"), "event_type")
    .count()
    .writeStream
    .outputMode("update")
    .format("console")
    .option("checkpointLocation", "/var/lib/spark/checkpoints/events")
    .start())
query.awaitTermination()
```

## Examples

### Example 1: "Turn raw purchase logs into a daily revenue table"

```bash
spark-submit --master "local[4]" etl/process.py
```

Result: `processed/daily_metrics/` contains one `date=YYYY-MM-DD/` folder per day with Parquet files holding `event_type`, `event_count`, `total_revenue` and `unique_users`. Check with `spark.read.parquet(...).show(5)`.

### Example 2: "Count signups per 5-minute window from the events topic"

```bash
spark-submit --packages org.apache.spark:spark-sql-kafka-0-10_2.13:4.2.0 stream/events.py
```

Result: the console prints a batch table each trigger, with columns `window`, `event_type` and `count`. Restarting the job with the same `checkpointLocation` resumes from the saved offsets rather than `startingOffsets`.

## Guidelines

- Prefer DataFrames and Spark SQL over RDDs: the Catalyst optimizer and Tungsten engine only help those.
- Partition output by a low-cardinality column such as date; avoid `partitionBy` on high-cardinality columns, which creates millions of tiny files.
- `spark.sql.shuffle.partitions` defaults to 200; adaptive execution coalesces small shuffle partitions automatically, so tune only after looking at the Spark UI (port 4040).
- Never call `.collect()` or `.toPandas()` on a large DataFrame; it pulls everything to the driver.
- Always set `checkpointLocation` on streaming queries that must survive restarts; the console sink is for debugging only.
- Python UDFs are slow; prefer built-in `pyspark.sql.functions` or Arrow-based pandas UDFs.
- Do not use Spark for data that fits in memory on one machine; Polars or DuckDB are simpler and faster there.
