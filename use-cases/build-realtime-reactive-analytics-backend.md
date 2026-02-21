---
title: "Build a Real-Time Reactive Analytics Backend"
slug: build-realtime-reactive-analytics-backend
description: "Combine a reactive database with an event ingestion pipeline to power live dashboards that update the instant data changes."
skills:
  - convex
  - realtime-analytics
  - mongodb
category: data-ai
tags:
  - real-time
  - analytics
  - convex
  - clickhouse
  - mongodb
---

# Build a Real-Time Reactive Analytics Backend

## The Problem

A SaaS company with 8,000 active users needs a dashboard that shows live metrics: active sessions, feature usage, conversion funnels, and error rates -- all updating in real time without page refreshes. Their current setup polls a PostgreSQL database every 30 seconds, which causes stale data, wasted queries, and a dashboard that feels sluggish. When a deployment causes an error spike, the team does not see it for 30 seconds to 2 minutes, and by then hundreds of users have already been affected. They need sub-second data freshness for operational metrics and efficient historical aggregation for trend analysis.

## The Solution

Using the **convex**, **realtime-analytics**, and **mongodb** skills, the workflow builds a three-tier data architecture: Convex handles the reactive frontend state so dashboards update instantly when data changes, ClickHouse ingests and aggregates high-volume event streams for analytical queries, and MongoDB stores the flexible document data that powers user-facing features and configuration.

## Step-by-Step Walkthrough

### 1. Design the event schema and ingestion pipeline

Set up a ClickHouse-based event pipeline that can ingest thousands of events per second with sub-second query latency for aggregations.

> Build a real-time analytics event ingestion service. Design the event schema for page_view, feature_used, error_occurred, and conversion_step events. Use ClickHouse with a MergeTree engine partitioned by day. Create a Node.js ingestion endpoint that batches events (flush every 500ms or 100 events) and writes to ClickHouse. Include materialized views for 1-minute and 1-hour rollups.

The materialized views pre-aggregate data so dashboard queries read from compact rollup tables instead of scanning millions of raw events. A "feature usage last 24 hours" query hits the 1-minute rollup table (1,440 rows) rather than the raw events table (potentially millions of rows).

### 2. Set up MongoDB for user and configuration data

Configure MongoDB for the application data layer -- user profiles, dashboard configurations, alert rules, and team settings that need flexible schemas and fast reads.

> Set up a MongoDB schema for the analytics platform: users collection with embedded team membership and notification preferences, dashboards collection with flexible widget configurations stored as nested documents, and alert_rules collection with conditions and action webhooks. Create indexes on users.teamId, dashboards.ownerId, and alert_rules.isActive. Use MongoDB change streams to trigger alert evaluation when rules are updated.

MongoDB's flexible document model is ideal here because dashboard configurations vary widely -- one widget might track a simple counter while another defines a multi-step funnel with filters. Embedding these as nested documents avoids complex joins and keeps reads fast.

### 3. Build the reactive frontend layer with Convex

Create a Convex backend that subscribes to data changes and pushes updates to connected dashboard clients in real time, eliminating polling entirely.

> Build a Convex backend with these functions: a query that returns the current dashboard state for a user (widgets, layout, filters), a mutation to update widget configurations, and an action that fetches the latest aggregated metrics from ClickHouse every 5 seconds and writes them to a Convex table. Use Convex's reactive queries so any connected dashboard auto-updates when the metrics table changes.

Convex's reactive query model means every connected client automatically receives updates when data changes. No WebSocket management, no polling logic, no stale-data bugs. When the scheduled action writes fresh ClickHouse metrics to Convex, every user viewing that dashboard sees the update within 200ms.

### 4. Wire up alerting and historical analysis

Connect the three data stores so alerts fire on real-time data and historical trends are queryable for post-incident analysis.

> Create an alert evaluation pipeline: when ClickHouse materialized views detect a metric exceeding a threshold (like error rate above 5% in a 1-minute window), write the alert to Convex so it appears on dashboards instantly, and store the alert history in MongoDB with full context for post-incident review. Build a historical analysis query that joins ClickHouse aggregations with MongoDB user segments to answer questions like "which customer tier experienced the most errors last week."

The three-tier architecture plays to each database's strengths. ClickHouse handles the analytical heavy lifting, MongoDB stores the rich contextual data, and Convex bridges everything to the frontend with reactive updates.

## Real-World Example

A developer tools company serving 8,000 users replaced their polling-based dashboard with this three-tier architecture. The ClickHouse pipeline ingests 12,000 events per second during peak hours, with p99 query latency of 45ms on rollup tables. Convex reactive queries push updates to 400 concurrent dashboard sessions with a median latency of 180ms from event ingestion to screen update. The mean time to detect error spikes dropped from 90 seconds to under 3 seconds. MongoDB stores 2.3 million alert history documents with flexible schemas that evolved three times in the first quarter without any migrations. Infrastructure cost is $340 per month total -- less than the $520 they were spending on the PostgreSQL instance that could not keep up with the polling load.
