---
name: apache-arrow
description: Expert guidance for Apache Arrow, the cross-language columnar memory format for analytics workloads. Helps developers use Arrow for high-performance data interchange between systems, zero-copy reads, and efficient columnar processing in Python (PyArrow) and JavaScript (Arrow JS).
license: Apache-2.0
compatibility: Python 3.11+ with pyarrow 26 (checked 26.0.0), or Node.js with apache-arrow 21 (checked 21.2.0)
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/apache/arrow
  tags:
  - data-format
  - columnar
  - interop
  - python
  - javascript
---

# Apache Arrow — Columnar Data Format

## Overview

Apache Arrow, the cross-language columnar memory format for analytics workloads. Helps developers use Arrow for high-performance data interchange between systems, zero-copy reads, and efficient columnar processing in Python (PyArrow) and JavaScript (Arrow JS).

## Instructions

### PyArrow — Python Interface

```python
# src/data/arrow_ops.py — High-performance data operations with PyArrow
import pyarrow as pa
import pyarrow.parquet as pq
import pyarrow.compute as pc
import pyarrow.csv as pcsv

# Create Arrow tables from Python data
table = pa.table({
    "user_id": pa.array([1, 2, 3, 4, 5], type=pa.int64()),
    "name": pa.array(["Alice", "Bob", "Charlie", "Diana", "Eve"]),
    "revenue": pa.array([150.0, 320.5, 89.0, 1200.0, 45.5], type=pa.float64()),
    "signup_date": pa.array([
        "2026-01-15", "2026-01-20", "2026-02-01", "2026-02-10", "2026-03-01"
    ]).cast(pa.date32()),
    "is_active": pa.array([True, True, False, True, False]),
})

# Vectorized compute (no Python loops)
high_value = pc.filter(table, pc.greater(table["revenue"], 100))
total_revenue = pc.sum(table["revenue"]).as_py()    # 1805.0
avg_revenue = pc.mean(table["revenue"]).as_py()     # 361.0
order = pc.sort_indices(table, sort_keys=[("revenue", "descending")])
sorted_table = table.take(order)                     # sort_indices only returns positions

# Read/write Parquet files (the standard format for Arrow data)
pq.write_table(table, "users.parquet", compression="zstd")
loaded = pq.read_table("users.parquet")

# Read with column selection and row filtering (pushdown to file)
subset = pq.read_table(
    "users.parquet",
    columns=["user_id", "revenue"],          # Only read these columns
    filters=[("revenue", ">", 100)],         # Predicate pushdown
)

# Read CSV with explicit column types
csv_table = pcsv.read_csv("data.csv", convert_options=pcsv.ConvertOptions(
    column_types={"amount": pa.float64(), "count": pa.int32()},
))

# Streaming reads for large files (process in batches)
parquet_file = pq.ParquetFile("large_dataset.parquet")
for batch in parquet_file.iter_batches(batch_size=10_000):
    filtered = pc.filter(batch, pc.greater(batch["amount"], 0))
    process_batch(filtered)
```

### Zero-Copy Interop

```python
# Arrow enables zero-copy conversion between libraries
import pyarrow as pa
import pandas as pd
import polars as pl

# Arrow → Pandas (zero-copy only for some numeric columns without nulls; strings are copied)
arrow_table = pa.table({"x": [1, 2, 3], "y": [4.0, 5.0, 6.0]})
pandas_df = arrow_table.to_pandas()           # Near-instant for compatible types

# Pandas → Arrow
arrow_from_pandas = pa.Table.from_pandas(pandas_df)

# Arrow → Polars (zero-copy)
polars_df = pl.from_arrow(arrow_table)

# Polars → Arrow (zero-copy)
arrow_from_polars = polars_df.to_arrow()

# Also exchanged with R (reticulate), DuckDB and Spark (PySpark)
```

```python
import duckdb

# DuckDB reads a pyarrow Table that is a variable in scope by its name
top = duckdb.sql("SELECT sum(y) AS total FROM arrow_table").fetchall()   # [(15.0,)]
result = duckdb.sql("SELECT * FROM arrow_table WHERE x > 1").arrow()     # pyarrow RecordBatchReader (DuckDB 2.0)
table_back = result.read_all()                                           # materialise as a Table
```

### Partitioned Datasets

```python
# Work with partitioned datasets on disk or cloud storage
import pyarrow.dataset as ds

# Read a partitioned Parquet dataset (Hive-style partitioning).
# s3:// paths use Arrow's built-in S3 filesystem and need AWS credentials in the environment.
# data/
#   year=2025/month=01/part-0.parquet
#   year=2025/month=02/part-0.parquet
#   year=2026/month=01/part-0.parquet

dataset = ds.dataset(
    "s3://my-bucket/events/",
    format="parquet",
    partitioning=ds.partitioning(
        pa.schema([
            ("year", pa.int32()),
            ("month", pa.int32()),
        ]),
        flavor="hive",
    ),
)

# Scan with partition pruning (only reads relevant files)
scanner = dataset.scanner(
    columns=["event_type", "user_id", "timestamp"],
    filter=(ds.field("year") == 2026) & (ds.field("month") >= 1),
)
table = scanner.to_table()

# Write a partitioned dataset (the table needs year and month columns)
ds.write_dataset(
    table,
    "output/events/",
    format="parquet",
    partitioning=ds.partitioning(
        pa.schema([("year", pa.int32()), ("month", pa.int32())]),
        flavor="hive",
    ),
    existing_data_behavior="overwrite_or_ignore",
)
```

### Arrow IPC (Inter-Process Communication)

```python
# Share data between processes without serialization overhead
import pyarrow as pa
import pyarrow.ipc as ipc

# Write Arrow IPC format (for streaming between processes)
table = pa.table({"id": [1, 2, 3], "value": [10.0, 20.0, 30.0]})

# File format (random access)
with pa.OSFile("data.arrow", "wb") as f:
    writer = ipc.new_file(f, table.schema)
    writer.write_table(table)
    writer.close()

# Stream format (append-only, lower overhead)
sink = pa.BufferOutputStream()
writer = ipc.new_stream(sink, table.schema)
writer.write_table(table)
writer.close()
buffer = sink.getvalue()    # bytes that can be sent over network/pipe

# Read back
reader = ipc.open_file("data.arrow")
loaded = reader.read_all()
```

### JavaScript (Arrow JS)

```typescript
// src/data/arrow-client.ts — Read Arrow data in the browser
import { tableFromIPC, tableToIPC, Table } from "apache-arrow";

// Fetch Arrow IPC data from an API
async function fetchArrowData(url: string) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();

  // Parse Arrow IPC (stream or file format); Arrow JS is plain JavaScript, no WASM
  const table = tableFromIPC(new Uint8Array(buffer));

  console.log(`Loaded ${table.numRows} rows, ${table.numCols} columns`);
  console.log("Schema:", table.schema.fields.map((f) => `${f.name}: ${f.type}`));

  // Access columns
  const ids = table.getChild("id")?.toArray();      // typed array, e.g. BigInt64Array for int64, Float64Array for float64

  // Iterate rows
  for (const row of table) {
    console.log(row.toJSON());  // { id: 1n, value: 10 } (int64 columns come back as BigInt)
  }

  return table;
}

// Send Arrow data to a server
async function sendArrowData(url: string, table: Table) {
  const buffer = tableToIPC(table);
  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/vnd.apache.arrow.stream" },
    body: buffer as BodyInit,           // tableToIPC returns a Uint8Array (stream format by default)
  });
}
```

## Installation

```bash
# Python
pip install pyarrow

# JavaScript
npm install apache-arrow

# Optional peers used in the interop examples
pip install pandas polars duckdb
```

## Examples

### Example 1: Query a large Parquet file without loading it all

**User request:**

```
events.parquet is 8 GB and my laptop runs out of memory with pandas. I only need revenue totals for 2026 per country.
```

The agent reads only the needed columns, pushes the filter into the Parquet reader and aggregates in Arrow:

```python
import pyarrow.parquet as pq
import pyarrow.compute as pc

table = pq.read_table(
    "events.parquet",
    columns=["country", "revenue", "year"],
    filters=[("year", "=", 2026)],
)
totals = table.group_by("country").aggregate([("revenue", "sum")])
print(totals.sort_by([("revenue_sum", "descending")]).slice(0, 5).to_pylist())
# [{'country': 'US', 'revenue_sum': 412903.5, ...}, ...]
```

Memory use is limited to three columns of one year, and the result is a small Arrow table.

### Example 2: Send a table from a Python API to the browser

**User request:**

```
My FastAPI endpoint returns 200k rows as JSON and the page freezes. Switch it to Arrow.
```

The agent serialises with the IPC stream format on the server and parses it with Arrow JS in the browser:

```python
import pyarrow as pa
from fastapi import Response

def to_arrow_response(table: pa.Table) -> Response:
    sink = pa.BufferOutputStream()
    with pa.ipc.new_stream(sink, table.schema) as writer:
        writer.write_table(table)
    return Response(sink.getvalue().to_pybytes(), media_type="application/vnd.apache.arrow.stream")
```

```typescript
import { tableFromIPC } from "apache-arrow";
const table = await tableFromIPC(fetch("/api/orders.arrow"));   // accepts a Response promise
console.log(table.numRows);   // 200000, typed arrays instead of 200k parsed objects
```

## Guidelines

1. **Parquet for storage, Arrow for compute** — Write Parquet to disk/S3; use Arrow in-memory for processing
2. **Column pruning** — Always specify `columns=` when reading Parquet; reading all columns wastes I/O and memory
3. **Predicate pushdown** — Use `filters=` in Parquet reads; the reader skips row groups that don't match
4. **Zero-copy when possible** — Use `to_pandas(self_destruct=True)` for large tables to free Arrow memory as it converts, but never touch the Arrow table afterwards (reuse crashes the interpreter)
5. **Batch processing for large files** — Use `iter_batches()` instead of reading entire files into memory
6. **IPC for microservices** — Arrow IPC is faster than JSON/CSV for data exchange between services
7. **Partitioned datasets for scale** — Partition by date/category; queries only scan relevant partitions
8. **DuckDB for Arrow queries** — DuckDB can query Arrow tables directly with zero copy: `duckdb.sql("SELECT ... FROM my_table")` finds a pyarrow Table variable named `my_table`
