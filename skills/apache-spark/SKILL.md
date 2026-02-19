---
name: apache-spark
description: >-
  Process large-scale data with Apache Spark. Use when a user asks to process
  big data, run distributed computations, build ETL pipelines, perform data
  analysis at scale, or use PySpark for data engineering.
license: Apache-2.0
compatibility: 'Python (PySpark), Scala, Java, R'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: data-engineering
  tags:
    - spark
    - pyspark
    - big-data
    - etl
    - distributed
---

# Apache Spark

## Overview

Apache Spark is the standard for distributed data processing. It handles batch processing, streaming, SQL, machine learning, and graph processing. PySpark provides a Python API. Runs on standalone clusters, YARN, Kubernetes, or managed services (Databricks, EMR, Dataproc).

## Instructions

### Step 1: PySpark Setup

```bash
pip install pyspark
```

### Step 2: DataFrame Operations

```python
# etl/process.py — PySpark data processing
from pyspark.sql import SparkSession
from pyspark.sql import functions as F

spark = SparkSession.builder \
    .appName("DataPipeline") \
    .config("spark.sql.adaptive.enabled", "true") \
    .getOrCreate()

# Read data
df = spark.read.parquet("s3://bucket/raw/events/")

# Transform
processed = (df
    .filter(F.col("event_type").isin(["purchase", "signup"]))
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

# Write results
processed.write \
    .mode("overwrite") \
    .partitionBy("date") \
    .parquet("s3://bucket/processed/daily_metrics/")
```

### Step 3: SQL Interface

```python
# Register as SQL table
df.createOrReplaceTempView("events")

result = spark.sql("""
    SELECT
        date_trunc('month', timestamp) as month,
        COUNT(DISTINCT user_id) as monthly_active_users,
        SUM(CASE WHEN event_type = 'purchase' THEN amount ELSE 0 END) as revenue
    FROM events
    WHERE timestamp >= '2025-01-01'
    GROUP BY 1
    ORDER BY 1
""")
result.show()
```

### Step 4: Structured Streaming

```python
# Real-time processing from Kafka
stream = spark.readStream \
    .format("kafka") \
    .option("kafka.bootstrap.servers", "kafka:9092") \
    .option("subscribe", "events") \
    .load()

parsed = stream.select(
    F.from_json(F.col("value").cast("string"), schema).alias("data")
).select("data.*")

query = parsed \
    .groupBy(F.window("timestamp", "5 minutes"), "event_type") \
    .count() \
    .writeStream \
    .outputMode("update") \
    .format("console") \
    .start()
```

## Guidelines

- Use DataFrames (not RDDs) for most work — they're optimized by Catalyst query optimizer.
- Partitioning is critical for performance — partition by date or high-cardinality columns.
- For managed Spark, consider Databricks (easiest), AWS EMR, or GCP Dataproc.
- PySpark syntax mirrors Pandas but executes distributed — think in columns, not rows.
