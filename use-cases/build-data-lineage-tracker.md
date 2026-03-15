---
title: Build a Data Lineage Tracker
slug: build-data-lineage-tracker
description: Build a data lineage tracker that maps data flow from source to destination, tracks transformations, detects breaking changes, and generates impact analysis for data governance.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - data-lineage
  - data-governance
  - data-catalog
  - metadata
  - compliance
---

# Build a Data Lineage Tracker

## The Problem

Kira leads data engineering at a 30-person company with 200 data tables, 50 ETL pipelines, and 30 dashboards. When a source table schema changes, nobody knows which dashboards will break until users report errors. A column rename in the CRM broke 8 reports across 3 departments — took 2 days to find and fix all affected pipelines. Compliance team asks "where does customer email flow?" — answering takes a week of manual tracing. They need automated lineage: track every data flow, visualize dependencies, detect breaking changes before they propagate, and answer compliance questions instantly.

## Step 1: Build the Lineage Engine

```typescript
// src/lineage/tracker.ts — Data lineage tracking with impact analysis and change detection
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface DataAsset {
  id: string;
  type: "table" | "view" | "pipeline" | "dashboard" | "api" | "file";
  name: string;
  schema?: string;
  database?: string;
  owner: string;
  columns: ColumnDef[];
  tags: string[];
  description: string;
  updatedAt: string;
}

interface ColumnDef {
  name: string;
  type: string;
  description: string;
  isPII: boolean;
  classification: "public" | "internal" | "confidential" | "restricted";
}

interface LineageEdge {
  id: string;
  sourceAssetId: string;
  sourceColumn?: string;
  targetAssetId: string;
  targetColumn?: string;
  transformationType: "direct" | "aggregation" | "filter" | "join" | "calculation" | "rename";
  transformation?: string;   // SQL or description of transformation
  pipelineId?: string;
  confidence: number;        // 0-1, how certain we are about this lineage
  createdAt: string;
}

// Register a data asset
export async function registerAsset(asset: Omit<DataAsset, "id" | "updatedAt">): Promise<DataAsset> {
  const id = `da-${randomBytes(6).toString("hex")}`;
  const full: DataAsset = { ...asset, id, updatedAt: new Date().toISOString() };

  await pool.query(
    `INSERT INTO data_assets (id, type, name, schema_name, database_name, owner, columns, tags, description, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (type, name, COALESCE(schema_name, ''), COALESCE(database_name, ''))
     DO UPDATE SET columns = $7, tags = $8, description = $9, updated_at = NOW()`,
    [id, asset.type, asset.name, asset.schema, asset.database,
     asset.owner, JSON.stringify(asset.columns), JSON.stringify(asset.tags), asset.description]
  );

  await redis.del(`lineage:asset:${asset.name}`);
  return full;
}

// Add lineage edge (data flow from source to target)
export async function addLineage(params: {
  sourceAsset: string;       // asset name
  sourceColumn?: string;
  targetAsset: string;
  targetColumn?: string;
  transformationType: LineageEdge["transformationType"];
  transformation?: string;
  pipelineId?: string;
}): Promise<LineageEdge> {
  const sourceId = await resolveAssetId(params.sourceAsset);
  const targetId = await resolveAssetId(params.targetAsset);
  const id = `le-${randomBytes(6).toString("hex")}`;

  const edge: LineageEdge = {
    id, sourceAssetId: sourceId, sourceColumn: params.sourceColumn,
    targetAssetId: targetId, targetColumn: params.targetColumn,
    transformationType: params.transformationType,
    transformation: params.transformation,
    pipelineId: params.pipelineId,
    confidence: 1.0,
    createdAt: new Date().toISOString(),
  };

  await pool.query(
    `INSERT INTO lineage_edges (id, source_asset_id, source_column, target_asset_id, target_column, transformation_type, transformation, pipeline_id, confidence, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
    [id, sourceId, params.sourceColumn, targetId, params.targetColumn,
     params.transformationType, params.transformation, params.pipelineId, 1.0]
  );

  // Invalidate lineage cache
  await redis.del(`lineage:downstream:${sourceId}`);
  await redis.del(`lineage:upstream:${targetId}`);

  return edge;
}

// Get downstream impact (what breaks if this asset changes)
export async function getDownstreamImpact(assetName: string, column?: string): Promise<{
  affectedAssets: Array<DataAsset & { depth: number; path: string[] }>;
  affectedDashboards: string[];
  affectedPipelines: string[];
}> {
  const assetId = await resolveAssetId(assetName);
  const visited = new Set<string>();
  const affected: Array<DataAsset & { depth: number; path: string[] }> = [];

  async function traverse(currentId: string, depth: number, path: string[]): Promise<void> {
    if (visited.has(currentId) || depth > 10) return;
    visited.add(currentId);

    let sql = "SELECT * FROM lineage_edges WHERE source_asset_id = $1";
    const params: any[] = [currentId];
    if (column && depth === 0) {
      sql += " AND (source_column = $2 OR source_column IS NULL)";
      params.push(column);
    }

    const { rows: edges } = await pool.query(sql, params);

    for (const edge of edges) {
      const { rows: [asset] } = await pool.query(
        "SELECT * FROM data_assets WHERE id = $1", [edge.target_asset_id]
      );
      if (asset) {
        const assetPath = [...path, asset.name];
        affected.push({ ...asset, columns: JSON.parse(asset.columns), tags: JSON.parse(asset.tags), depth, path: assetPath });
        await traverse(edge.target_asset_id, depth + 1, assetPath);
      }
    }
  }

  await traverse(assetId, 1, [assetName]);

  return {
    affectedAssets: affected,
    affectedDashboards: affected.filter((a) => a.type === "dashboard").map((a) => a.name),
    affectedPipelines: affected.filter((a) => a.type === "pipeline").map((a) => a.name),
  };
}

// Get upstream lineage (where does this data come from)
export async function getUpstreamLineage(assetName: string, column?: string): Promise<{
  sources: Array<DataAsset & { depth: number }>;
  transformations: LineageEdge[];
}> {
  const assetId = await resolveAssetId(assetName);
  const visited = new Set<string>();
  const sources: Array<DataAsset & { depth: number }> = [];
  const transformations: LineageEdge[] = [];

  async function traverse(currentId: string, depth: number): Promise<void> {
    if (visited.has(currentId) || depth > 10) return;
    visited.add(currentId);

    const { rows: edges } = await pool.query(
      "SELECT * FROM lineage_edges WHERE target_asset_id = $1", [currentId]
    );

    for (const edge of edges) {
      transformations.push(edge);
      const { rows: [asset] } = await pool.query(
        "SELECT * FROM data_assets WHERE id = $1", [edge.source_asset_id]
      );
      if (asset) {
        sources.push({ ...asset, columns: JSON.parse(asset.columns), tags: JSON.parse(asset.tags), depth });
        await traverse(edge.source_asset_id, depth + 1);
      }
    }
  }

  await traverse(assetId, 1);
  return { sources, transformations };
}

// Detect breaking changes
export async function detectBreakingChanges(assetName: string, newColumns: ColumnDef[]): Promise<{
  removedColumns: string[];
  renamedColumns: Array<{ old: string; new: string }>;
  typeChanges: Array<{ column: string; oldType: string; newType: string }>;
  downstreamImpact: Awaited<ReturnType<typeof getDownstreamImpact>>;
}> {
  const { rows: [asset] } = await pool.query(
    "SELECT columns FROM data_assets WHERE name = $1", [assetName]
  );
  if (!asset) throw new Error("Asset not found");

  const oldColumns: ColumnDef[] = JSON.parse(asset.columns);
  const oldNames = new Set(oldColumns.map((c) => c.name));
  const newNames = new Set(newColumns.map((c) => c.name));

  const removedColumns = [...oldNames].filter((n) => !newNames.has(n));
  const typeChanges = newColumns
    .filter((nc) => oldColumns.find((oc) => oc.name === nc.name && oc.type !== nc.type))
    .map((nc) => ({ column: nc.name, oldType: oldColumns.find((oc) => oc.name === nc.name)!.type, newType: nc.type }));

  // Get impact for all removed/changed columns
  let impact = { affectedAssets: [] as any[], affectedDashboards: [] as string[], affectedPipelines: [] as string[] };
  for (const col of removedColumns) {
    const colImpact = await getDownstreamImpact(assetName, col);
    impact.affectedAssets.push(...colImpact.affectedAssets);
    impact.affectedDashboards.push(...colImpact.affectedDashboards);
    impact.affectedPipelines.push(...colImpact.affectedPipelines);
  }

  return { removedColumns, renamedColumns: [], typeChanges, downstreamImpact: impact };
}

// PII flow tracking (for compliance)
export async function tracePIIFlow(columnClassification: "confidential" | "restricted"): Promise<Array<{
  asset: string; column: string; flowsTo: Array<{ asset: string; column: string; transformation: string }>;
}>> {
  const { rows } = await pool.query(
    `SELECT da.name as asset_name, c->>'name' as column_name
     FROM data_assets da, jsonb_array_elements(da.columns::jsonb) c
     WHERE c->>'classification' = $1`,
    [columnClassification]
  );

  const results = [];
  for (const row of rows) {
    const impact = await getDownstreamImpact(row.asset_name, row.column_name);
    results.push({
      asset: row.asset_name,
      column: row.column_name,
      flowsTo: impact.affectedAssets.map((a) => ({
        asset: a.name, column: row.column_name, transformation: "direct",
      })),
    });
  }
  return results;
}

async function resolveAssetId(name: string): Promise<string> {
  const cached = await redis.get(`lineage:asset:${name}`);
  if (cached) return cached;
  const { rows: [row] } = await pool.query("SELECT id FROM data_assets WHERE name = $1", [name]);
  if (!row) throw new Error(`Asset '${name}' not found`);
  await redis.setex(`lineage:asset:${name}`, 3600, row.id);
  return row.id;
}
```

## Results

- **Breaking change detection** — before CRM schema change, run impact analysis: "removing `email` column affects 8 reports, 3 pipelines, 2 dashboards"; fix before deploying
- **Compliance in minutes** — "where does customer email flow?" → upstream + downstream lineage shows every table, pipeline, and dashboard touching that column; 1 week → 5 minutes
- **PII tracking** — all `restricted` columns traced through entire data pipeline; GDPR audit shows every system that stores or processes personal data
- **Dependency visualization** — graph shows CRM → ETL pipeline → data warehouse → analytics dashboard → executive report; one broken link identified in seconds
- **Schema change confidence** — column rename in source table: impact analysis shows 0 downstream dependencies → safe to change; saves hours of manual checking
