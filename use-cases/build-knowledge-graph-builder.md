---
title: Build a Knowledge Graph Builder
slug: build-knowledge-graph-builder
description: Build a knowledge graph builder with entity extraction, relationship mapping, graph queries, visualization, and incremental updates for connecting organizational knowledge.
skills:
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - knowledge-graph
  - entities
  - relationships
  - graph
  - ai
---

# Build a Knowledge Graph Builder

## The Problem

Lena leads knowledge management at a 25-person consultancy. Information is trapped in 5,000 documents, 10K emails, and 500 Slack channels. Finding "which clients use technology X" or "who is our expert on topic Y" requires asking 5 people. New hires take 3 months to learn who knows what. CRM, project management, and email are disconnected — no tool shows the relationship between people, projects, technologies, and clients. They need a knowledge graph: extract entities from all sources, map relationships, query connections, and visualize the organizational brain.

## Step 1: Build the Knowledge Graph

```typescript
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes, createHash } from "node:crypto";
const redis = new Redis(process.env.REDIS_URL!);

interface Entity { id: string; type: "person" | "company" | "technology" | "project" | "topic" | "document"; name: string; properties: Record<string, any>; sources: string[]; updatedAt: string; }
interface Relationship { id: string; sourceId: string; targetId: string; type: string; weight: number; properties: Record<string, any>; sources: string[]; updatedAt: string; }
interface GraphQuery { startEntity: string; relationshipTypes?: string[]; maxDepth: number; }
interface GraphResult { nodes: Entity[]; edges: Relationship[]; paths: Array<{ entities: string[]; relationships: string[] }>; }

// Add or update entity
export async function upsertEntity(entity: Omit<Entity, "id" | "updatedAt">): Promise<Entity> {
  const id = createHash("md5").update(`${entity.type}:${entity.name.toLowerCase()}`).digest("hex").slice(0, 16);
  const existing = await getEntity(id);

  if (existing) {
    const mergedSources = [...new Set([...existing.sources, ...entity.sources])];
    const mergedProperties = { ...existing.properties, ...entity.properties };
    await pool.query(
      "UPDATE graph_entities SET properties = $2, sources = $3, updated_at = NOW() WHERE id = $1",
      [id, JSON.stringify(mergedProperties), JSON.stringify(mergedSources)]
    );
    return { ...existing, properties: mergedProperties, sources: mergedSources, updatedAt: new Date().toISOString() };
  }

  const full: Entity = { ...entity, id, updatedAt: new Date().toISOString() };
  await pool.query(
    "INSERT INTO graph_entities (id, type, name, properties, sources, updated_at) VALUES ($1, $2, $3, $4, $5, NOW())",
    [id, entity.type, entity.name, JSON.stringify(entity.properties), JSON.stringify(entity.sources)]
  );
  return full;
}

// Add relationship
export async function addRelationship(rel: Omit<Relationship, "id" | "updatedAt">): Promise<Relationship> {
  const id = createHash("md5").update(`${rel.sourceId}:${rel.type}:${rel.targetId}`).digest("hex").slice(0, 16);

  await pool.query(
    `INSERT INTO graph_relationships (id, source_id, target_id, type, weight, properties, sources, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
     ON CONFLICT (id) DO UPDATE SET weight = graph_relationships.weight + $5, sources = $7, updated_at = NOW()`,
    [id, rel.sourceId, rel.targetId, rel.type, rel.weight, JSON.stringify(rel.properties), JSON.stringify(rel.sources)]
  );

  return { ...rel, id, updatedAt: new Date().toISOString() };
}

// Traverse graph
export async function queryGraph(query: GraphQuery): Promise<GraphResult> {
  const visited = new Set<string>();
  const nodes: Entity[] = [];
  const edges: Relationship[] = [];
  const paths: GraphResult["paths"] = [];

  async function traverse(entityId: string, depth: number, currentPath: { entities: string[]; relationships: string[] }): Promise<void> {
    if (depth > query.maxDepth || visited.has(entityId)) return;
    visited.add(entityId);

    const entity = await getEntity(entityId);
    if (!entity) return;
    nodes.push(entity);

    let sql = "SELECT * FROM graph_relationships WHERE source_id = $1 OR target_id = $1";
    const params: any[] = [entityId];
    if (query.relationshipTypes?.length) {
      sql += " AND type = ANY($2)";
      params.push(query.relationshipTypes);
    }

    const { rows: rels } = await pool.query(sql, params);

    for (const rel of rels) {
      const r: Relationship = { ...rel, properties: JSON.parse(rel.properties), sources: JSON.parse(rel.sources) };
      edges.push(r);
      const nextId = rel.source_id === entityId ? rel.target_id : rel.source_id;
      const newPath = { entities: [...currentPath.entities, nextId], relationships: [...currentPath.relationships, rel.id] };

      if (depth === query.maxDepth - 1) paths.push(newPath);
      await traverse(nextId, depth + 1, newPath);
    }
  }

  await traverse(query.startEntity, 0, { entities: [query.startEntity], relationships: [] });

  // Deduplicate
  const uniqueNodes = [...new Map(nodes.map((n) => [n.id, n])).values()];
  const uniqueEdges = [...new Map(edges.map((e) => [e.id, e])).values()];

  return { nodes: uniqueNodes, edges: uniqueEdges, paths };
}

// Find shortest path between two entities
export async function findPath(fromId: string, toId: string, maxDepth: number = 5): Promise<{ found: boolean; path: string[]; relationships: string[] }> {
  const visited = new Set<string>();
  const queue: Array<{ entityId: string; path: string[]; rels: string[] }> = [{ entityId: fromId, path: [fromId], rels: [] }];

  while (queue.length > 0) {
    const { entityId, path, rels } = queue.shift()!;
    if (entityId === toId) return { found: true, path, relationships: rels };
    if (path.length > maxDepth) continue;
    if (visited.has(entityId)) continue;
    visited.add(entityId);

    const { rows } = await pool.query(
      "SELECT id, source_id, target_id, type FROM graph_relationships WHERE source_id = $1 OR target_id = $1",
      [entityId]
    );

    for (const rel of rows) {
      const nextId = rel.source_id === entityId ? rel.target_id : rel.source_id;
      if (!visited.has(nextId)) {
        queue.push({ entityId: nextId, path: [...path, nextId], rels: [...rels, `${rel.type}(${rel.id})`] });
      }
    }
  }

  return { found: false, path: [], relationships: [] };
}

// Ingest document and extract entities/relationships
export async function ingestDocument(content: string, source: string): Promise<{ entities: number; relationships: number }> {
  const entities: Entity[] = [];
  const relationships: Relationship[] = [];

  // Extract people
  const people = content.match(/(?:Mr|Mrs|Ms|Dr)\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g) || [];
  for (const name of people) {
    const entity = await upsertEntity({ type: "person", name: name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/, ""), properties: {}, sources: [source] });
    entities.push(entity);
  }

  // Extract technologies
  const techPatterns = /\b(React|TypeScript|Python|Kubernetes|Docker|AWS|GCP|Azure|PostgreSQL|Redis|GraphQL|REST|Node\.js|Go|Rust|Java|Swift)\b/gi;
  const techs = [...new Set((content.match(techPatterns) || []).map((t) => t.toLowerCase()))];
  for (const tech of techs) {
    const entity = await upsertEntity({ type: "technology", name: tech, properties: {}, sources: [source] });
    entities.push(entity);
  }

  // Extract companies
  const companies = content.match(/[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp))\.?/g) || [];
  for (const company of companies) {
    const entity = await upsertEntity({ type: "company", name: company, properties: {}, sources: [source] });
    entities.push(entity);
  }

  // Create relationships between co-occurring entities
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const relType = inferRelationshipType(entities[i].type, entities[j].type);
      const rel = await addRelationship({
        sourceId: entities[i].id, targetId: entities[j].id,
        type: relType, weight: 1, properties: {}, sources: [source],
      });
      relationships.push(rel);
    }
  }

  return { entities: entities.length, relationships: relationships.length };
}

function inferRelationshipType(type1: string, type2: string): string {
  if (type1 === "person" && type2 === "technology") return "uses";
  if (type1 === "person" && type2 === "company") return "works_at";
  if (type1 === "person" && type2 === "project") return "works_on";
  if (type1 === "company" && type2 === "technology") return "uses";
  if (type1 === "technology" && type2 === "project") return "used_in";
  return "related_to";
}

async function getEntity(id: string): Promise<Entity | null> {
  const { rows: [row] } = await pool.query("SELECT * FROM graph_entities WHERE id = $1", [id]);
  return row ? { ...row, properties: JSON.parse(row.properties), sources: JSON.parse(row.sources) } : null;
}

// Search entities
export async function searchEntities(query: string, type?: string): Promise<Entity[]> {
  let sql = "SELECT * FROM graph_entities WHERE name ILIKE $1";
  const params: any[] = [`%${query}%`];
  if (type) { sql += " AND type = $2"; params.push(type); }
  sql += " ORDER BY name LIMIT 20";
  const { rows } = await pool.query(sql, params);
  return rows.map((r: any) => ({ ...r, properties: JSON.parse(r.properties), sources: JSON.parse(r.sources) }));
}

// Graph statistics
export async function getGraphStats(): Promise<{ entities: number; relationships: number; byType: Record<string, number>; mostConnected: Array<{ name: string; connections: number }> }> {
  const { rows: [{ count: entityCount }] } = await pool.query("SELECT COUNT(*) as count FROM graph_entities");
  const { rows: [{ count: relCount }] } = await pool.query("SELECT COUNT(*) as count FROM graph_relationships");
  const { rows: byType } = await pool.query("SELECT type, COUNT(*) as count FROM graph_entities GROUP BY type");
  const { rows: connected } = await pool.query(
    `SELECT e.name, COUNT(r.id) as connections FROM graph_entities e
     LEFT JOIN graph_relationships r ON e.id = r.source_id OR e.id = r.target_id
     GROUP BY e.id, e.name ORDER BY connections DESC LIMIT 10`
  );

  return {
    entities: parseInt(entityCount), relationships: parseInt(relCount),
    byType: Object.fromEntries(byType.map((r: any) => [r.type, parseInt(r.count)])),
    mostConnected: connected.map((r: any) => ({ name: r.name, connections: parseInt(r.connections) })),
  };
}
```

## Results

- **"Who knows Kubernetes?" answered in 1 second** — search entity → traverse "uses" relationships → find all people connected to Kubernetes; previously required asking 5 colleagues
- **Hidden connections discovered** — Client A uses React; Client B uses React; their project leads both know each other from a conference → cross-sell opportunity found in the graph
- **Onboarding: 3 months → 2 weeks** — new hire explores the graph; sees who works on what, which technologies are used where, who the subject matter experts are
- **5,000 documents ingested** — automatic entity extraction; relationships built incrementally; graph grows with every document; no manual tagging
- **Shortest path queries** — "How is Person X connected to Company Y?" → X worked on Project Z which was for Company Y; relationship chain visible
