---
title: "Build GraphRAG with Neo4j and Vector Search"
description: "Combine knowledge graphs with vector embeddings to answer multi-hop reasoning questions that standard RAG can't handle."
skills: [anthropic-sdk, langchain]
difficulty: advanced
time_estimate: "7 hours"
tags: [graphrag, neo4j, knowledge-graph, rag, langchain, anthropic, entities, reasoning]
---

# Build GraphRAG with Neo4j and Vector Search

> **Persona:** You're building a knowledge system for an enterprise with millions of documents. Users ask questions like "Which companies acquired by Google also competed with Microsoft before 2020?" Standard RAG returns blobs of text. You need structured reasoning.

GraphRAG stores entities and relationships explicitly, letting you traverse chains of connections that pure vector search can't follow. The payoff: dramatically better answers on complex, multi-hop questions.

## Standard RAG vs GraphRAG

| Question | Standard RAG | GraphRAG |
|---|---|---|
| "What did Company X announce?" | ✅ Works | ✅ Works |
| "Who did Company X acquire, and what products do they make?" | ⚠️ Partial | ✅ Full |
| "Find all companies connected to X through partnerships or acquisitions" | ❌ Misses hops | ✅ Traversal |

## Architecture

```
Documents
    ↓ LLM entity/relationship extraction
Neo4j Graph ←→ Vector Index (node embeddings)
    ↓ Hybrid: Cypher traversal + similarity
Claude synthesizes final answer
```

## Setup

```bash
npm install @anthropic-ai/sdk neo4j-driver @langchain/community langchain
docker run -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/password \
  neo4j:latest
```

## Step 1: Extract Entities and Relationships

```typescript
// extract/entities.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface Entity {
  name: string;
  type: 'Company' | 'Person' | 'Product' | 'Technology' | 'Event';
  description: string;
}

interface Relationship {
  from: string;
  to: string;
  type: string; // ACQUIRED, COMPETED_WITH, PARTNERED_WITH, CREATED, etc.
  since?: string;
  metadata?: Record<string, string>;
}

export async function extractGraph(text: string): Promise<{ entities: Entity[]; relationships: Relationship[] }> {
  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `Extract entities and relationships from this text as JSON.

TEXT: ${text}

Return JSON with this structure:
{
  "entities": [{"name": "Google", "type": "Company", "description": "Search giant"}],
  "relationships": [{"from": "Google", "to": "YouTube", "type": "ACQUIRED", "since": "2006"}]
}

Use relationship types: ACQUIRED, MERGED_WITH, COMPETED_WITH, PARTNERED_WITH, CREATED, EMPLOYS, INVESTED_IN.`
    }]
  });

  const json = response.content[0].type === 'text' ? response.content[0].text : '{}';
  return JSON.parse(json);
}
```

## Step 2: Build the Knowledge Graph in Neo4j

```typescript
// graph/neo4j.ts
import neo4j, { Driver, Session } from 'neo4j-driver';

export class KnowledgeGraph {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI!,
      neo4j.auth.basic(process.env.NEO4J_USER!, process.env.NEO4J_PASSWORD!)
    );
  }

  async ingestDocument(docId: string, text: string, embedding: number[]) {
    const { entities, relationships } = await extractGraph(text);
    const session = this.driver.session();

    try {
      await session.executeWrite(async (tx) => {
        // Create/merge entities
        for (const entity of entities) {
          await tx.run(`
            MERGE (e:${entity.type} {name: $name})
            ON CREATE SET e.description = $description, e.createdAt = datetime()
            ON MATCH SET e.description = $description
          `, { name: entity.name, description: entity.description });
        }

        // Create relationships
        for (const rel of relationships) {
          await tx.run(`
            MATCH (a {name: $from}), (b {name: $to})
            MERGE (a)-[r:${rel.type}]->(b)
            ON CREATE SET r.since = $since, r.docId = $docId
          `, { from: rel.from, to: rel.to, since: rel.since || null, docId });
        }

        // Store document node with embedding
        await tx.run(`
          MERGE (d:Document {id: $docId})
          SET d.text = $text, d.embedding = $embedding
        `, { docId, text, embedding });
      });
    } finally {
      await session.close();
    }
  }
}
```

## Step 3: Hybrid Query — Graph + Vector

```typescript
// query/hybrid.ts
export class GraphRAGQuerier {
  constructor(private graph: KnowledgeGraph, private embedder: Embedder) {}

  async query(question: string): Promise<QueryResult> {
    const [vectorResults, graphContext] = await Promise.all([
      this.vectorSearch(question),
      this.graphTraversal(question),
    ]);

    return this.synthesize(question, vectorResults, graphContext);
  }

  private async vectorSearch(question: string) {
    const embedding = await this.embedder.embed(question);
    const session = this.graph.driver.session();

    // Neo4j vector index
    const result = await session.run(`
      CALL db.index.vector.queryNodes('document-embeddings', 5, $embedding)
      YIELD node, score
      RETURN node.text AS text, score
      ORDER BY score DESC
    `, { embedding });

    return result.records.map(r => ({ text: r.get('text'), score: r.get('score') }));
  }

  private async graphTraversal(question: string): Promise<string> {
    // Extract entities from question first
    const questionEntities = await this.extractMentionedEntities(question);
    if (questionEntities.length === 0) return '';

    const session = this.graph.driver.session();

    // Multi-hop traversal: find all connected entities up to 3 hops
    const result = await session.run(`
      MATCH (start)
      WHERE start.name IN $entityNames
      CALL apoc.path.subgraphAll(start, {
        maxLevel: 3,
        relationshipFilter: 'ACQUIRED|PARTNERED_WITH|COMPETED_WITH>'
      })
      YIELD nodes, relationships
      RETURN nodes, relationships
    `, { entityNames: questionEntities });

    // Format graph context as natural language
    return this.formatGraphAsText(result.records);
  }

  private async extractMentionedEntities(question: string): Promise<string[]> {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: `List company/person/product names mentioned in: "${question}"
Return JSON array of strings only.`
      }]
    });
    return JSON.parse(response.content[0].type === 'text' ? response.content[0].text : '[]');
  }

  private formatGraphAsText(records: any[]): string {
    const relationships: string[] = [];
    for (const record of records) {
      for (const rel of record.get('relationships')) {
        relationships.push(
          `${rel.start.properties.name} -[${rel.type}]-> ${rel.end.properties.name}`
        );
      }
    }
    return relationships.join('\n');
  }

  private async synthesize(question: string, docs: any[], graphContext: string) {
    const response = await client.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      system: 'Answer questions using both document excerpts and knowledge graph relationships. Be specific about relationship chains.',
      messages: [{
        role: 'user',
        content: `KNOWLEDGE GRAPH RELATIONSHIPS:
${graphContext}

DOCUMENT EXCERPTS:
${docs.map((d, i) => `[${i + 1}] ${d.text}`).join('\n\n')}

QUESTION: ${question}`
      }]
    });

    return {
      answer: response.content[0].type === 'text' ? response.content[0].text : '',
      graphContext,
      sourceDocs: docs,
    };
  }
}
```

## Multi-Hop Query Example

```typescript
const querier = new GraphRAGQuerier(graph, embedder);

// Multi-hop: traverse acquisition chains
const result = await querier.query(
  'What products do companies acquired by Google compete with in the enterprise market?'
);

// GraphRAG traverses: Google → ACQUIRED → YouTube/DeepMind/Looker
//                     Looker → COMPETED_WITH → Tableau/PowerBI
// Then fetches documents about those products
// Standard RAG would just return whatever chunks mention "Google enterprise"

console.log(result.answer);
```

## GraphRAG vs RAG Comparison

```typescript
async function compareApproaches(question: string) {
  const [graphAnswer, ragAnswer] = await Promise.all([
    graphRAG.query(question),
    standardRAG.query(question),
  ]);

  console.log('Question:', question);
  console.log('\n--- Standard RAG ---\n', ragAnswer);
  console.log('\n--- GraphRAG ---\n', graphAnswer.answer);
  console.log('Graph hops traversed:', graphAnswer.hopsTraversed);
}

await compareApproaches(
  'Which Microsoft acquisitions are connected to companies that Google also acquired?'
);
```

## What to Build Next

- **Temporal reasoning:** Add date ranges to relationships for time-based queries
- **Confidence scores:** Propagate entity extraction confidence through the graph
- **Graph visualization:** Render subgraphs as interactive force-directed diagrams
- **Incremental updates:** Re-extract entities when documents are updated
