---
name: llamaindex-ts
description: >-
  You are an expert in LlamaIndex.TS, the TypeScript data framework for
  building RAG (Retrieval-Augmented Generation) applications. You help
  developers ingest, index, and query data from any source — documents, APIs,
  databases — and connect it to LLMs with vector indexes, knowledge graphs,
  structured extraction, agents, and multi-document synthesis.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: AI & Machine Learning
  tags:
    - rag
    - llm
    - indexing
    - retrieval
    - vector
    - typescript
    - ai
---

# LlamaIndex.TS — RAG Framework for TypeScript

You are an expert in LlamaIndex.TS, the TypeScript data framework for building RAG (Retrieval-Augmented Generation) applications. You help developers ingest, index, and query data from any source — documents, APIs, databases — and connect it to LLMs with vector indexes, knowledge graphs, structured extraction, agents, and multi-document synthesis.

## Core Capabilities

### Basic RAG Pipeline

```typescript
import { VectorStoreIndex, SimpleDirectoryReader, OpenAI, Settings } from "llamaindex";

// Configure
Settings.llm = new OpenAI({ model: "gpt-4o", temperature: 0.1 });

// Load documents
const documents = await new SimpleDirectoryReader().loadData("./docs");

// Create vector index (embeds + stores automatically)
const index = await VectorStoreIndex.fromDocuments(documents);

// Query
const queryEngine = index.asQueryEngine();
const response = await queryEngine.query("How do I configure authentication?");
console.log(response.toString());
console.log(response.sourceNodes);         // Source chunks with scores

// Chat (maintains conversation context)
const chatEngine = index.asChatEngine();
const chat1 = await chatEngine.chat("What are the main features?");
const chat2 = await chatEngine.chat("Tell me more about the first one");
```

### Advanced RAG

```typescript
import {
  VectorStoreIndex,
  SentenceSplitter,
  MetadataReplacementPostProcessor,
  SentenceWindowNodeParser,
  OpenAIEmbedding,
} from "llamaindex";

// Sentence window retrieval (better context)
const nodeParser = new SentenceWindowNodeParser({
  windowSize: 3,                           // Include 3 surrounding sentences
  windowMetadataKey: "window",
});

const nodes = nodeParser.getNodesFromDocuments(documents);

const index = await VectorStoreIndex.fromNodes(nodes, {
  embedModel: new OpenAIEmbedding({ model: "text-embedding-3-small" }),
});

const queryEngine = index.asQueryEngine({
  similarityTopK: 5,
  nodePostprocessors: [
    new MetadataReplacementPostProcessor({ targetMetadataKey: "window" }),
  ],
});

// Sub-question query engine (complex multi-part queries)
import { SubQuestionQueryEngine, QueryEngineTool } from "llamaindex";

const tools = [
  new QueryEngineTool({ queryEngine: docsQueryEngine, metadata: { name: "docs", description: "Product documentation" } }),
  new QueryEngineTool({ queryEngine: apiQueryEngine, metadata: { name: "api", description: "API reference" } }),
];

const subQuestionEngine = SubQuestionQueryEngine.fromDefaults({ queryEngineTools: tools });
const response = await subQuestionEngine.query(
  "Compare the authentication methods in the docs with the API endpoints available",
);
```

### Agent with Tools

```typescript
import { OpenAIAgent, FunctionTool } from "llamaindex";

const searchTool = FunctionTool.from(
  async ({ query }: { query: string }) => {
    const results = await queryEngine.query(query);
    return results.toString();
  },
  { name: "search_docs", description: "Search product documentation", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
);

const sqlTool = FunctionTool.from(
  async ({ query }: { query: string }) => {
    const result = await db.execute(query);
    return JSON.stringify(result);
  },
  { name: "query_database", description: "Run SQL on analytics DB", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
);

const agent = new OpenAIAgent({ tools: [searchTool, sqlTool] });
const response = await agent.chat("How many users signed up last week and what docs did they view?");
```

## Installation

```bash
npm install llamaindex
```

## Best Practices

1. **Sentence windows** — Use `SentenceWindowNodeParser` for better retrieval context; includes surrounding text
2. **Metadata filters** — Add metadata to documents; filter at query time for scoped retrieval
3. **Sub-questions** — Use `SubQuestionQueryEngine` for complex queries that span multiple data sources
4. **Embeddings** — Use `text-embedding-3-small` for cost-effective search; `3-large` for higher accuracy
5. **Chunking** — Tune `chunkSize` and `chunkOverlap` in splitter; smaller chunks = more precise retrieval
6. **Reranking** — Add a reranker post-processor to improve relevance after initial retrieval
7. **Agents** — Use `OpenAIAgent` with tools for dynamic retrieval; agent decides which tools to call
8. **Streaming** — Use `streamChat()` and `streamQuery()` for real-time responses in production UIs
