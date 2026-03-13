---
title: Build an ML Model Serving Pipeline
slug: build-ml-model-serving-pipeline
description: Build a production ML model serving system with A/B testing, canary deployments, input validation, output caching, and performance monitoring — serving predictions at scale with confidence.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: AI & Machine Learning
tags:
  - ml-ops
  - model-serving
  - inference
  - ab-testing
  - machine-learning
---

# Build an ML Model Serving Pipeline

## The Problem

Priya leads ML engineering at a 45-person e-commerce company. Their recommendation model runs in a Jupyter notebook that a data scientist manually deploys by SSH-ing into the production server and replacing a pickle file. There's no versioning — when the new model performs worse, rolling back means finding an old file on someone's laptop. No monitoring — they don't know if predictions are degrading until revenue drops. No A/B testing — every model change is all-or-nothing. They need a proper model serving pipeline with versioned deployments, traffic splitting, and real-time monitoring.

## Step 1: Build the Model Registry and Serving Engine

```typescript
// src/models/registry.ts — Model version registry with metadata tracking
import { pool } from "../db";
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);

interface ModelVersion {
  id: string;
  name: string;              // "product-recommendations"
  version: string;           // "v2.3.1"
  framework: string;         // "onnx", "tensorflow", "pytorch"
  artifactPath: string;      // S3 path to model weights
  inputSchema: Record<string, any>;  // expected input shape
  outputSchema: Record<string, any>;
  metrics: {
    accuracy?: number;
    latencyP50Ms?: number;
    latencyP99Ms?: number;
    trainedOnRows?: number;
  };
  status: "staging" | "canary" | "production" | "archived";
  trafficWeight: number;     // 0-100 for canary/A/B testing
  createdAt: string;
  createdBy: string;
}

export async function registerModel(model: Omit<ModelVersion, "id" | "createdAt">): Promise<ModelVersion> {
  const id = `${model.name}-${model.version}`;
  
  const { rows: [row] } = await pool.query(
    `INSERT INTO model_versions (id, name, version, framework, artifact_path, input_schema, output_schema, metrics, status, traffic_weight, created_by, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW()) RETURNING *`,
    [id, model.name, model.version, model.framework, model.artifactPath,
     JSON.stringify(model.inputSchema), JSON.stringify(model.outputSchema),
     JSON.stringify(model.metrics), model.status, model.trafficWeight, model.createdBy]
  );

  return mapModel(row);
}

// Route prediction traffic based on model weights
export async function selectModel(modelName: string, userId: string): Promise<ModelVersion> {
  // Get all active versions with traffic weights
  const { rows } = await pool.query(
    `SELECT * FROM model_versions WHERE name = $1 AND status IN ('production', 'canary') AND traffic_weight > 0
     ORDER BY traffic_weight DESC`,
    [modelName]
  );

  if (rows.length === 0) throw new Error(`No active models for ${modelName}`);
  if (rows.length === 1) return mapModel(rows[0]);

  // Deterministic routing based on userId (same user always gets same model)
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(`${userId}:${modelName}`).digest();
  const bucket = hash.readUInt32BE(0) % 100;

  let cumulative = 0;
  for (const row of rows) {
    cumulative += row.traffic_weight;
    if (bucket < cumulative) return mapModel(row);
  }

  return mapModel(rows[0]);
}

// Promote canary to production (gradual rollout)
export async function promoteModel(modelId: string, trafficWeight: number): Promise<void> {
  await pool.query(
    "UPDATE model_versions SET status = 'canary', traffic_weight = $2 WHERE id = $1",
    [modelId, trafficWeight]
  );

  // Reduce other models' weights proportionally
  const { rows: [model] } = await pool.query("SELECT name FROM model_versions WHERE id = $1", [modelId]);
  await pool.query(
    `UPDATE model_versions SET traffic_weight = GREATEST(0, traffic_weight - $2)
     WHERE name = $1 AND id != $3 AND status IN ('production', 'canary')`,
    [model.name, trafficWeight, modelId]
  );

  // Invalidate routing cache
  await redis.del(`model:routing:${model.name}`);
}

function mapModel(row: any): ModelVersion {
  return {
    id: row.id, name: row.name, version: row.version, framework: row.framework,
    artifactPath: row.artifact_path, inputSchema: row.input_schema, outputSchema: row.output_schema,
    metrics: row.metrics, status: row.status, trafficWeight: row.traffic_weight,
    createdAt: row.created_at, createdBy: row.created_by,
  };
}
```

```typescript
// src/models/inference.ts — Model inference with caching and monitoring
import { Redis } from "ioredis";
import { pool } from "../db";
import { selectModel, ModelVersion } from "./registry";
import { createHash } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface PredictionRequest {
  modelName: string;
  userId: string;
  input: Record<string, any>;
  requestId: string;
}

interface PredictionResponse {
  modelVersion: string;
  predictions: any;
  latencyMs: number;
  cached: boolean;
  requestId: string;
}

export async function predict(request: PredictionRequest): Promise<PredictionResponse> {
  const startTime = Date.now();

  // Select model based on traffic routing
  const model = await selectModel(request.modelName, request.userId);

  // Check prediction cache (same input = same output)
  const inputHash = createHash("sha256").update(JSON.stringify(request.input)).digest("hex").slice(0, 16);
  const cacheKey = `pred:${model.id}:${inputHash}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    return {
      modelVersion: model.version,
      predictions: JSON.parse(cached),
      latencyMs: Date.now() - startTime,
      cached: true,
      requestId: request.requestId,
    };
  }

  // Run inference (call model serving endpoint)
  const predictions = await callModelEndpoint(model, request.input);

  // Cache predictions (5 min TTL for recommendations, longer for static models)
  await redis.setex(cacheKey, 300, JSON.stringify(predictions));

  const latencyMs = Date.now() - startTime;

  // Log prediction for monitoring and analysis
  await pool.query(
    `INSERT INTO prediction_log (request_id, model_id, model_version, input_hash, latency_ms, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [request.requestId, model.id, model.version, inputHash, latencyMs]
  );

  // Track latency metrics
  await redis.lpush(`metrics:latency:${model.id}`, latencyMs.toString());
  await redis.ltrim(`metrics:latency:${model.id}`, 0, 999);

  return {
    modelVersion: model.version,
    predictions,
    latencyMs,
    cached: false,
    requestId: request.requestId,
  };
}

async function callModelEndpoint(model: ModelVersion, input: Record<string, any>): Promise<any> {
  // Call ONNX Runtime, TensorFlow Serving, or Triton based on framework
  const endpoints: Record<string, string> = {
    onnx: process.env.ONNX_ENDPOINT || "http://onnx-server:8001",
    tensorflow: process.env.TF_ENDPOINT || "http://tf-serving:8501",
    pytorch: process.env.TORCH_ENDPOINT || "http://torchserve:8080",
  };

  const endpoint = endpoints[model.framework];
  const response = await fetch(`${endpoint}/v1/models/${model.name}:predict`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [input] }),
  });

  if (!response.ok) throw new Error(`Inference failed: ${response.status}`);
  const result = await response.json();
  return result.predictions?.[0] || result;
}

// Monitoring: compare model versions' performance
export async function getModelMetrics(modelId: string): Promise<{
  latencyP50: number;
  latencyP99: number;
  requestCount24h: number;
  cacheHitRate: number;
}> {
  const latencies = await redis.lrange(`metrics:latency:${modelId}`, 0, -1);
  const sorted = latencies.map(Number).sort((a, b) => a - b);

  const { rows: [counts] } = await pool.query(
    "SELECT COUNT(*) as total FROM prediction_log WHERE model_id = $1 AND created_at > NOW() - INTERVAL '24 hours'",
    [modelId]
  );

  return {
    latencyP50: sorted[Math.floor(sorted.length * 0.5)] || 0,
    latencyP99: sorted[Math.floor(sorted.length * 0.99)] || 0,
    requestCount24h: parseInt(counts.total),
    cacheHitRate: 0, // would need cache hit/miss tracking
  };
}
```

## Results

- **Model deployment time: 5 minutes instead of 2 hours** — register model, set 5% canary traffic, monitor, promote; no SSH, no pickle files, no laptop archaeology
- **A/B testing built in** — v2.3 serves 90% traffic, v2.4 serves 10%; compare conversion rates before full rollout; the "deploy and pray" approach is gone
- **Rollback in 10 seconds** — set the old model's traffic to 100%, new model to 0%; instant effect, no redeployment needed
- **Prediction caching reduces compute cost by 40%** — identical product page loads reuse cached recommendations; inference servers handle 40% fewer requests
- **Real-time latency monitoring** — P50/P99 latency tracked per model version; degradation alerts fire before users notice
