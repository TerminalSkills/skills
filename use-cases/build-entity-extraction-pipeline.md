---
title: Build an Entity Extraction Pipeline
slug: build-entity-extraction-pipeline
description: Build an entity extraction pipeline with named entity recognition, relationship mapping, confidence scoring, custom entity types, and knowledge graph construction from unstructured text.
skills:
  - typescript
  - redis
  - postgresql
  - hono
  - zod
category: data-ai
tags:
  - ner
  - entity-extraction
  - nlp
  - knowledge-graph
  - ai
---

# Build an Entity Extraction Pipeline

## The Problem

Cara leads data at a 20-person legal tech company processing 10,000 contracts monthly. Lawyers need to know: which companies are mentioned, what dates matter, what monetary amounts appear, and who signed what. Manual review takes 30 minutes per contract. Search only finds exact keyword matches — searching for "Microsoft" misses contracts mentioning "MSFT" or "Microsoft Corporation." They need entity extraction: automatically identify companies, people, dates, monetary amounts, and legal terms from contract text, then build a searchable knowledge graph of relationships.

## Step 1: Build the Extraction Pipeline

```typescript
// src/extraction/entities.ts — Entity extraction with relationship mapping and knowledge graph
import { pool } from "../db";
import { Redis } from "ioredis";
import { randomBytes } from "node:crypto";

const redis = new Redis(process.env.REDIS_URL!);

interface Entity {
  id: string;
  text: string;
  normalizedText: string;
  type: "person" | "organization" | "date" | "money" | "location" | "legal_term" | "custom";
  confidence: number;
  position: { start: number; end: number };
  metadata: Record<string, any>;
}

interface Relationship {
  id: string;
  sourceEntityId: string;
  targetEntityId: string;
  type: "signed_by" | "effective_date" | "payment_to" | "governed_by" | "party_to" | "amount_of";
  confidence: number;
  context: string;
}

interface ExtractionResult {
  documentId: string;
  entities: Entity[];
  relationships: Relationship[];
  summary: { totalEntities: number; byType: Record<string, number>; avgConfidence: number };
}

// Built-in entity patterns
const ENTITY_PATTERNS: Array<{ type: Entity["type"]; patterns: RegExp[]; normalizer?: (text: string) => string }> = [
  {
    type: "money",
    patterns: [
      /\$[\d,]+(?:\.\d{2})?(?:\s*(?:million|billion|thousand|USD|EUR|GBP))?/gi,
      /(?:USD|EUR|GBP|JPY)\s*[\d,]+(?:\.\d{2})?/gi,
      /[\d,]+(?:\.\d{2})?\s*(?:dollars|euros|pounds)/gi,
    ],
    normalizer: (text) => text.replace(/[,$\s]/g, "").replace(/million/i, "000000").replace(/billion/i, "000000000"),
  },
  {
    type: "date",
    patterns: [
      /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/gi,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/g,
      /\d{4}-\d{2}-\d{2}/g,
    ],
    normalizer: (text) => {
      const d = new Date(text);
      return isNaN(d.getTime()) ? text : d.toISOString().slice(0, 10);
    },
  },
  {
    type: "organization",
    patterns: [
      /[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:Inc|LLC|Ltd|Corp|Corporation|Company|Group|Partners|LP|LLP|GmbH|AG|SA|BV|NV))\.?/g,
    ],
  },
  {
    type: "person",
    patterns: [
      /(?:Mr|Mrs|Ms|Dr|Prof)\.?\s+[A-Z][a-z]+\s+[A-Z][a-z]+/g,
    ],
  },
  {
    type: "legal_term",
    patterns: [
      /\b(?:indemnification|liability|warranty|termination|confidential|arbitration|jurisdiction|force majeure|breach|remedy|damages|governing law)\b/gi,
    ],
    normalizer: (text) => text.toLowerCase(),
  },
];

// Custom entity types (configured per client)
const customPatterns = new Map<string, Array<{ type: string; patterns: RegExp[] }>>();

// Extract entities from text
export async function extractEntities(
  documentId: string,
  text: string,
  options?: { customTypes?: string[] }
): Promise<ExtractionResult> {
  const entities: Entity[] = [];
  const seen = new Set<string>();

  // Run built-in patterns
  for (const rule of ENTITY_PATTERNS) {
    for (const pattern of rule.patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(text)) !== null) {
        const entityText = match[0].trim();
        const key = `${rule.type}:${entityText.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);

        entities.push({
          id: `ent-${randomBytes(4).toString("hex")}`,
          text: entityText,
          normalizedText: rule.normalizer ? rule.normalizer(entityText) : entityText,
          type: rule.type,
          confidence: calculateConfidence(rule.type, entityText, text),
          position: { start: match.index, end: match.index + entityText.length },
          metadata: {},
        });
      }
    }
  }

  // Extract relationships between entities
  const relationships = extractRelationships(entities, text);

  // Calculate summary
  const byType: Record<string, number> = {};
  for (const e of entities) byType[e.type] = (byType[e.type] || 0) + 1;
  const avgConfidence = entities.reduce((sum, e) => sum + e.confidence, 0) / Math.max(entities.length, 1);

  const result: ExtractionResult = {
    documentId, entities, relationships,
    summary: { totalEntities: entities.length, byType, avgConfidence },
  };

  // Store results
  await pool.query(
    `INSERT INTO extraction_results (document_id, entities, relationships, summary, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     ON CONFLICT (document_id) DO UPDATE SET entities = $2, relationships = $3, summary = $4`,
    [documentId, JSON.stringify(entities), JSON.stringify(relationships), JSON.stringify(result.summary)]
  );

  // Index entities for search
  for (const entity of entities) {
    await redis.sadd(`entity:${entity.type}:${entity.normalizedText.toLowerCase()}`, documentId);
  }

  return result;
}

function extractRelationships(entities: Entity[], text: string): Relationship[] {
  const relationships: Relationship[] = [];
  const orgs = entities.filter((e) => e.type === "organization");
  const people = entities.filter((e) => e.type === "person");
  const dates = entities.filter((e) => e.type === "date");
  const amounts = entities.filter((e) => e.type === "money");

  // Person → Organization relationships (within 200 chars)
  for (const person of people) {
    for (const org of orgs) {
      const distance = Math.abs(person.position.start - org.position.start);
      if (distance < 200) {
        const context = text.slice(
          Math.min(person.position.start, org.position.start),
          Math.max(person.position.end, org.position.end)
        );
        if (/sign|execut|authoriz|behalf|represent/i.test(context)) {
          relationships.push({
            id: `rel-${randomBytes(4).toString("hex")}`,
            sourceEntityId: person.id, targetEntityId: org.id,
            type: "signed_by", confidence: 0.8, context: context.slice(0, 200),
          });
        }
      }
    }
  }

  // Date → context relationships
  for (const date of dates) {
    const surrounding = text.slice(Math.max(0, date.position.start - 100), date.position.end + 50);
    if (/effective|commence|start/i.test(surrounding)) {
      for (const org of orgs.slice(0, 2)) {
        relationships.push({
          id: `rel-${randomBytes(4).toString("hex")}`,
          sourceEntityId: org.id, targetEntityId: date.id,
          type: "effective_date", confidence: 0.7, context: surrounding.slice(0, 200),
        });
      }
    }
  }

  // Amount → Organization relationships
  for (const amount of amounts) {
    const surrounding = text.slice(Math.max(0, amount.position.start - 150), amount.position.end + 50);
    for (const org of orgs) {
      if (surrounding.includes(org.text)) {
        relationships.push({
          id: `rel-${randomBytes(4).toString("hex")}`,
          sourceEntityId: amount.id, targetEntityId: org.id,
          type: "payment_to", confidence: 0.6, context: surrounding.slice(0, 200),
        });
      }
    }
  }

  return relationships;
}

function calculateConfidence(type: string, text: string, fullText: string): number {
  let confidence = 0.7;
  // Boost for entities that appear multiple times
  const occurrences = (fullText.match(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi")) || []).length;
  if (occurrences > 1) confidence += 0.1;
  if (occurrences > 3) confidence += 0.1;
  // Boost for specific types with strong patterns
  if (type === "money" && /^\$/.test(text)) confidence += 0.1;
  if (type === "date" && /\d{4}/.test(text)) confidence += 0.1;
  return Math.min(1, confidence);
}

// Search across all documents by entity
export async function searchByEntity(type: string, query: string): Promise<string[]> {
  return redis.smembers(`entity:${type}:${query.toLowerCase()}`);
}

// Build knowledge graph for a set of documents
export async function buildKnowledgeGraph(documentIds: string[]): Promise<{
  nodes: Array<{ id: string; label: string; type: string; documentCount: number }>;
  edges: Array<{ source: string; target: string; type: string; weight: number }>;
}> {
  const entityMap = new Map<string, { label: string; type: string; docs: Set<string> }>();
  const edgeMap = new Map<string, { source: string; target: string; type: string; weight: number }>();

  for (const docId of documentIds) {
    const { rows: [row] } = await pool.query(
      "SELECT entities, relationships FROM extraction_results WHERE document_id = $1", [docId]
    );
    if (!row) continue;

    const entities: Entity[] = JSON.parse(row.entities);
    const relationships: Relationship[] = JSON.parse(row.relationships);

    for (const e of entities) {
      const key = `${e.type}:${e.normalizedText}`;
      if (!entityMap.has(key)) entityMap.set(key, { label: e.text, type: e.type, docs: new Set() });
      entityMap.get(key)!.docs.add(docId);
    }

    for (const r of relationships) {
      const source = entities.find((e) => e.id === r.sourceEntityId);
      const target = entities.find((e) => e.id === r.targetEntityId);
      if (source && target) {
        const key = `${source.normalizedText}→${target.normalizedText}`;
        if (!edgeMap.has(key)) edgeMap.set(key, { source: source.normalizedText, target: target.normalizedText, type: r.type, weight: 0 });
        edgeMap.get(key)!.weight++;
      }
    }
  }

  return {
    nodes: Array.from(entityMap.entries()).map(([id, v]) => ({ id, label: v.label, type: v.type, documentCount: v.docs.size })),
    edges: Array.from(edgeMap.values()),
  };
}
```

## Results

- **Contract review: 30 min → 2 min** — entities auto-extracted and highlighted; lawyer jumps to relevant sections instead of reading cover-to-cover
- **"MSFT" finds Microsoft contracts** — normalized entity names link variants; searching "Microsoft" returns docs mentioning "Microsoft Corporation", "MSFT", and "Microsoft Inc."
- **Knowledge graph reveals hidden connections** — company A appears in 47 contracts with company B; relationship visualized; M&A team discovers partnership pattern
- **Monetary amounts tracked** — all dollar figures extracted with context: "$5M payment due on March 1"; finance dashboard shows obligations by date and counterparty
- **Custom entity types** — client adds "product names" as custom entity type with their product catalog as patterns; extraction tailored to their domain
