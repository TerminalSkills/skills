---
title: "Build GraphRAG with Neo4j and Vector Search"
description: "Combine knowledge graphs with vector embeddings to answer multi-hop reasoning questions that standard RAG can't handle."
skills: [anthropic-sdk, neo4j]
difficulty: advanced
time_estimate: "7 hours"
tags: [graphrag, neo4j, knowledge-graph, rag, anthropic, entities, reasoning]
---

# Build GraphRAG with Neo4j and Vector Search

> **Persona:** You're building a knowledge system for an enterprise with millions of documents. Users ask questions like "Which companies acquired by Google also competed with Microsoft before 2020?" Standard RAG returns blobs of text. You need structured reasoning.

GraphRAG stores entities and relationships explicitly, letting you traverse chains of connections that pure vector search can't follow. Vector search finds the passages that look like the question; the graph follows the links the passages only imply.

## Standard RAG vs GraphRAG

| Question | Standard RAG | GraphRAG |
|---|---|---|
| "What did Company X announce?" | Works: one passage answers it | Works |
| "Who did Company X acquire, and what products do they make?" | Partial: needs two passages that may not rank together | Follows the ACQUIRED edge, then the product edge |
| "Find all companies connected to X through partnerships or acquisitions" | Misses hops that no single passage states | Traversal up to N hops |

## Architecture

```
Documents
    | Claude extracts entities and relationships (structured output)
    v
Neo4j: (:Entity) graph + (:Document) nodes with an embedding vector index
    | question -> entity names -> Cypher traversal   (graph facts)
    | question -> embedding   -> vector index query   (passages)
    v
Claude answers from both
```

Anthropic does not offer its own embedding model, so the example embeds locally with `all-MiniLM-L6-v2` (384 dimensions, no API key; the model downloads from Hugging Face on first run). Any embedding provider works if you change `vector.dimensions` to match.

## Setup

Neo4j is bound to 127.0.0.1 and the password comes from the environment (at least 8 characters):

```bash
export NEO4J_PASSWORD='choose-a-long-password'
export ANTHROPIC_API_KEY='...'   # from the Anthropic Console
docker run -d --name graphrag-neo4j \
  -p 127.0.0.1:7474:7474 -p 127.0.0.1:7687:7687 \
  -e NEO4J_AUTH=neo4j/$NEO4J_PASSWORD \
  -v graphrag-data:/data \
  neo4j:2026.10

npm init -y && npm pkg set type=module
npm install @anthropic-ai/sdk neo4j-driver @huggingface/transformers
npm install -D typescript tsx @types/node
```

The browser UI is at http://127.0.0.1:7474. The Cypher below needs no APOC plugin.

## Step 1: Extract Entities and Relationships

Structured outputs (`output_config.format`) make Claude return JSON that matches a schema, so there is no `JSON.parse` on free text that may be wrapped in a code fence. The relationship type is an enum, which also matters in Step 2.

```typescript
// src/extract.ts — turn text into entities and relationships with Claude
import Anthropic from '@anthropic-ai/sdk';

export const client = new Anthropic(); // reads ANTHROPIC_API_KEY

export const REL_TYPES = ['ACQUIRED', 'MERGED_WITH', 'COMPETED_WITH', 'PARTNERED_WITH', 'INVESTED_IN'] as const;
const ENTITY_TYPES = ['Company', 'Person', 'Product', 'Technology'] as const;

export interface Extraction {
  entities: { name: string; type: (typeof ENTITY_TYPES)[number]; description: string }[];
  relationships: { from: string; to: string; type: (typeof REL_TYPES)[number]; since: string }[];
}

// JSON Schema helpers: structured outputs want every property required, no extras
const str = { type: 'string' };
const enumOf = (values: readonly string[]) => ({ type: 'string', enum: [...values] });
export const obj = (properties: Record<string, object>) =>
  ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });

export async function askJson<T>(model: string, prompt: string, schema: object): Promise<T> {
  const response = await client.messages.create({
    model,
    max_tokens: 4096, // adaptive thinking tokens count against this
    messages: [{ role: 'user', content: prompt }],
    output_config: { format: { type: 'json_schema', schema: schema as Record<string, unknown> } },
  });
  const block = response.content.find((b) => b.type === 'text');
  return JSON.parse(block?.type === 'text' ? block.text : '{}') as T;
}

export const extractGraph = (text: string) =>
  askJson<Extraction>(
    'claude-sonnet-5-5',
    `Extract the entities and the relationships between them from this text. Use only facts the text states. Use an empty string for an unknown year.\n\nTEXT:\n${text}`,
    obj({
      entities: { type: 'array', items: obj({ name: str, type: enumOf(ENTITY_TYPES), description: str }) },
      relationships: { type: 'array', items: obj({ from: str, to: str, type: enumOf(REL_TYPES), since: str }) },
    }),
  );
```

## Step 2: Build the Knowledge Graph in Neo4j

Entities are merged on a lower-cased `key`, so "Google" in two documents is one node. A relationship type cannot be a query parameter, so it is put into the query text, and only after it has been checked against the allow-list (the model's output is untrusted input). Each `Document` also links to the entities it mentions.

```typescript
// src/graph.ts — schema and ingestion
import neo4j, { Driver } from 'neo4j-driver';
import { extractGraph, Extraction, REL_TYPES } from './extract.js';
import { embed } from './embed.js';

export const driver: Driver = neo4j.driver(
  process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
  neo4j.auth.basic(process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASSWORD!),
);

export async function setupSchema() {
  await driver.executeQuery('CREATE CONSTRAINT entity_key IF NOT EXISTS FOR (e:Entity) REQUIRE e.key IS UNIQUE');
  await driver.executeQuery('CREATE CONSTRAINT document_id IF NOT EXISTS FOR (d:Document) REQUIRE d.id IS UNIQUE');
  await driver.executeQuery(`
    CREATE VECTOR INDEX document_embeddings IF NOT EXISTS
    FOR (d:Document) ON (d.embedding)
    OPTIONS { indexConfig: { \`vector.dimensions\`: 384, \`vector.similarity_function\`: 'cosine' } }`);
}

export async function writeGraph(docId: string, text: string, embedding: number[], g: Extraction) {
  const session = driver.session();
  try {
    await session.executeWrite(async (tx) => {
      await tx.run(
        `MERGE (d:Document {id: $docId})
         SET d.text = $text
         WITH d
         CALL db.create.setNodeVectorProperty(d, 'embedding', $embedding)`,
        { docId, text, embedding },
      );
      for (const e of g.entities) {
        // key = lower-cased name, so "Google" and "google" are one node
        await tx.run(
          `MERGE (n:Entity {key: toLower($name)})
           SET n.name = $name, n.type = $type, n.description = $description
           WITH n MATCH (d:Document {id: $docId}) MERGE (d)-[:MENTIONS]->(n)`,
          { ...e, docId },
        );
      }
      for (const r of g.relationships) {
        // Relationship types cannot be query parameters, so allow-list them
        // before putting one into the query text (the model's output is untrusted).
        if (!(REL_TYPES as readonly string[]).includes(r.type)) continue;
        await tx.run(
          `MATCH (a:Entity {key: toLower($from)}), (b:Entity {key: toLower($to)})
           MERGE (a)-[rel:${r.type}]->(b)
           SET rel.since = $since, rel.docId = $docId`,
          { ...r, docId },
        );
      }
    });
  } finally {
    await session.close();
  }
}

export async function ingestDocument(docId: string, text: string) {
  const [g, embedding] = await Promise.all([extractGraph(text), embed(text)]);
  await writeGraph(docId, text, embedding, g);
}
```

```typescript
// src/embed.ts — local sentence embeddings (384 dimensions), no API key needed
import { pipeline } from '@huggingface/transformers';

const extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

export async function embed(text: string): Promise<number[]> {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array);
}
```

## Step 3: Hybrid Query: Graph + Vector

```typescript
// src/query.ts — hybrid retrieval: graph traversal + vector search, then Claude answers
import { driver } from './graph.js';
import { askJson, client, obj, REL_TYPES } from './extract.js';
import { embed } from './embed.js';

const HOPS = 3; // interpolated into the query text below, so keep it a constant

async function mentionedEntities(question: string): Promise<string[]> {
  const { names } = await askJson<{ names: string[] }>(
    'claude-haiku-5-5',
    `List the company, person, product and technology names mentioned in: "${question}"`,
    obj({ names: { type: 'array', items: { type: 'string' } } }),
  );
  return names.map((n) => n.toLowerCase());
}

async function graphFacts(question: string): Promise<string[]> {
  const keys = await mentionedEntities(question);
  if (keys.length === 0) return [];
  const { records } = await driver.executeQuery(
    `MATCH (s:Entity) WHERE s.key IN $keys
     MATCH p = (s)-[:${REL_TYPES.join('|')}*1..${HOPS}]-(:Entity)
     UNWIND relationships(p) AS r
     RETURN DISTINCT startNode(r).name AS source, type(r) AS rel, endNode(r).name AS target, r.since AS since
     LIMIT 100`,
    { keys },
  );
  return records.map((r) => `${r.get('source')} -[${r.get('rel')}${r.get('since') ? ' ' + r.get('since') : ''}]-> ${r.get('target')}`);
}

export async function similarDocuments(question: string): Promise<string[]> {
  const { records } = await driver.executeQuery(
    `CALL db.index.vector.queryNodes('document_embeddings', 5, $embedding)
     YIELD node, score
     RETURN node.text AS text`,
    { embedding: await embed(question) },
  );
  return records.map((r) => r.get('text') as string);
}

export async function answer(question: string) {
  const [facts, docs] = await Promise.all([graphFacts(question), similarDocuments(question)]);
  const response = await client.messages.create({
    model: 'claude-sonnet-5-5',
    max_tokens: 4096,
    system: 'Answer using the graph facts and the document excerpts. Name the relationship chain you used. If they do not contain the answer, say so.',
    messages: [{
      role: 'user',
      content: `GRAPH FACTS:\n${facts.join('\n')}\n\nDOCUMENT EXCERPTS:\n${docs.map((d, i) => `[${i + 1}] ${d}`).join('\n\n')}\n\nQUESTION: ${question}`,
    }],
  });
  const block = response.content.find((b) => b.type === 'text');
  return { answer: block && block.type === 'text' ? block.text : '', facts, docs };
}
```

The traversal is undirected on purpose (`-[...*1..3]-`) so "who acquired X" and "whom did X acquire" both work. On a dense graph a 3-hop expansion can return a very large set, which is why the query has a `LIMIT`; lower `HOPS` or filter by relationship type if it still grows too big.

## Try It

```typescript
// demo.ts — run with: npx tsx demo.ts
import { setupSchema, ingestDocument, driver } from './src/graph.js';
import { answer } from './src/query.js';

await setupSchema();
await ingestDocument('d1', 'Google acquired YouTube in 2006 and Looker in 2019.');
await ingestDocument('d2', 'Looker competes with Tableau in business intelligence.');

const result = await answer('Which competitors does the business intelligence company Google acquired have?');
console.log(result.facts);   // graph facts the answer is built on
console.log(result.answer);
await driver.close();
```

The graph facts for this question include the two-hop chain that no single passage states:

```console
Google -[ACQUIRED 2019]-> Looker
Looker -[COMPETED_WITH]-> Tableau
```

To see what the graph adds, compare against plain vector search: call only the exported `similarDocuments` and ask the same question. When the two passages both rank in the top 5, plain RAG can answer too; the graph keeps working when the chain is spread over passages that do not rank together.

## What to Build Next

- **Temporal reasoning:** the `since` property is already stored; filter on it in the Cypher for "before 2020" questions
- **Entity resolution:** merge "Alphabet" and "Google" with an alias list or a second Claude pass
- **Incremental updates:** delete a document's `MENTIONS` edges and relationships (they carry `docId`) before re-ingesting it
- **Evaluation:** keep a set of multi-hop questions with known answers and compare graph+vector against vector only

## Related Skills

- [anthropic-sdk](../skills/anthropic-sdk/) -- Messages API and structured outputs for extraction and answering
- [neo4j](../skills/neo4j/) -- Cypher, indexes, constraints and the Node.js driver
