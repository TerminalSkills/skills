---
name: trieve
category: Search & Data
tags: [search, ai-search, rag, vector-search, hybrid-search, api]
version: 1.0.0
author: terminal-skills
---

# Trieve — AI Search Infrastructure

You are an expert in Trieve, the all-in-one search infrastructure that combines full-text, semantic, and hybrid search with built-in RAG capabilities. You help developers implement production search with chunking, re-ranking, recommendations, and analytics without managing vector databases or embedding models.

## Core Capabilities

### Dataset and Chunk Management

Create a dataset and ingest content as chunks:

```typescript
// src/search/ingest.ts — Ingest documents into Trieve
const TRIEVE_API_URL = "https://api.trieve.ai";
const TRIEVE_API_KEY = process.env.TRIEVE_API_KEY!;
const DATASET_ID = process.env.TRIEVE_DATASET_ID!;

async function trieveFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${TRIEVE_API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIEVE_API_KEY}`,
      "TR-Dataset": DATASET_ID,
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`Trieve error: ${await res.text()}`);
  return res.json();
}

// Create a chunk (the fundamental unit of searchable content)
async function ingestChunk(params: {
  content: string;
  link?: string;
  tag_set?: string[];
  metadata?: Record<string, any>;
  group_tracking_id?: string;     // Group related chunks (e.g., same document)
}) {
  return trieveFetch("/api/chunk", {
    method: "POST",
    body: JSON.stringify({
      chunk_html: params.content,           // HTML or plain text content
      link: params.link,                     // Source URL
      tag_set: params.tag_set,              // Tags for filtering
      metadata: params.metadata,
      group_tracking_ids: params.group_tracking_id
        ? [params.group_tracking_id]
        : undefined,
      upsert_by_tracking_id: true,          // Update if exists, insert if not
    }),
  });
}

// Bulk ingest for large datasets
async function bulkIngest(documents: any[]) {
  const chunks = documents.flatMap((doc) => {
    // Split long documents into smaller chunks
    const paragraphs = doc.content.split("\n\n").filter(Boolean);
    return paragraphs.map((paragraph: string, index: number) => ({
      chunk_html: paragraph,
      tracking_id: `${doc.id}-chunk-${index}`,
      link: doc.url,
      tag_set: doc.tags,
      metadata: {
        title: doc.title,
        author: doc.author,
        section_index: index,
      },
      group_tracking_ids: [doc.id],    // All chunks from same doc in one group
    }));
  });

  // Send in batches of 120 (API limit)
  for (let i = 0; i < chunks.length; i += 120) {
    const batch = chunks.slice(i, i + 120);
    await trieveFetch("/api/chunks", {
      method: "POST",
      body: JSON.stringify(batch),
    });
    console.log(`Ingested ${Math.min(i + 120, chunks.length)}/${chunks.length} chunks`);
  }
}
```

### Search

Perform full-text, semantic, or hybrid search:

```typescript
// src/search/query.ts — Search with different strategies
// Hybrid search — combines keyword matching with semantic similarity
async function hybridSearch(query: string, options?: {
  filters?: Record<string, any>;
  page?: number;
  pageSize?: number;
  scoreThreshold?: number;
}) {
  return trieveFetch("/api/chunk/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      search_type: "hybrid",              // "fulltext" | "semantic" | "hybrid"
      page: options?.page ?? 1,
      page_size: options?.pageSize ?? 10,
      score_threshold: options?.scoreThreshold ?? 0.3,
      get_total_pages: true,
      highlight_results: true,             // Return highlighted snippets
      highlight_max_length: 200,
      highlight_max_num: 3,
      use_weights: true,                   // Balance keyword vs semantic scores
      filters: options?.filters ? {
        must: Object.entries(options.filters).map(([field, value]) => ({
          field: `metadata.${field}`,
          match_any: Array.isArray(value) ? value : [value],
        })),
      } : undefined,
    }),
  });
}

// Autocomplete / typeahead search
async function autocomplete(query: string) {
  return trieveFetch("/api/chunk/autocomplete", {
    method: "POST",
    body: JSON.stringify({
      query,
      search_type: "fulltext",            // Keyword-based for speed
      page_size: 5,
      highlight_results: true,
      highlight_max_length: 100,
    }),
  });
}

// Group search — return results grouped by document
async function groupSearch(query: string) {
  return trieveFetch("/api/chunk_group/group_oriented_search", {
    method: "POST",
    body: JSON.stringify({
      query,
      search_type: "hybrid",
      page: 1,
      page_size: 10,
      group_size: 3,                      // Show top 3 chunks per group
    }),
  });
}
```

### RAG (Retrieval-Augmented Generation)

Use Trieve's built-in RAG to generate answers from your data:

```typescript
// src/search/rag.ts — Generate answers using retrieved context
async function ragQuery(question: string) {
  const response = await trieveFetch("/api/chunk/generate", {
    method: "POST",
    body: JSON.stringify({
      prev_messages: [
        { role: "user", content: question },
      ],
      // Search configuration for retrieval step
      chunk_filter: null,
      search_type: "hybrid",
      page_size: 5,                       // Retrieve top 5 chunks as context
      // LLM configuration for generation step
      llm_options: {
        completion_first: false,          // Search first, then generate
        system_prompt: "Answer the user's question based on the provided context. If the context doesn't contain the answer, say so. Cite sources.",
        temperature: 0.3,                 // Low temperature for factual answers
        max_tokens: 500,
      },
      highlight_results: true,
    }),
  });

  // Response includes both the generated answer and the source chunks
  return {
    answer: response.message,
    sources: response.chunks.map((c: any) => ({
      content: c.chunk.chunk_html,
      link: c.chunk.link,
      score: c.score,
    })),
  };
}

// Streaming RAG for real-time response display
async function streamRagQuery(question: string, onChunk: (text: string) => void) {
  const response = await fetch(`${TRIEVE_API_URL}/api/chunk/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TRIEVE_API_KEY}`,
      "TR-Dataset": DATASET_ID,
    },
    body: JSON.stringify({
      prev_messages: [{ role: "user", content: question }],
      search_type: "hybrid",
      page_size: 5,
      stream_response: true,
    }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    onChunk(text);
  }
}
```

### Recommendations

Get content recommendations based on chunk similarity:

```typescript
// src/search/recommend.ts — Content recommendations
async function getRecommendations(chunkId: string, limit = 5) {
  return trieveFetch("/api/chunk/recommend", {
    method: "POST",
    body: JSON.stringify({
      positive_chunk_ids: [chunkId],     // "More like this"
      negative_chunk_ids: [],             // "Less like this"
      limit,
      strategy: "average_vector",        // Average vectors of positive examples
    }),
  });
}

// Recommend based on user reading history
async function personalizedRecommendations(readChunkIds: string[], limit = 10) {
  return trieveFetch("/api/chunk/recommend", {
    method: "POST",
    body: JSON.stringify({
      positive_chunk_ids: readChunkIds.slice(-5),  // Last 5 read articles
      negative_chunk_ids: [],
      limit,
      strategy: "average_vector",
      filters: {
        must_not: readChunkIds.map((id) => ({     // Exclude already-read content
          field: "id",
          match_any: [id],
        })),
      },
    }),
  });
}
```

### Analytics

Track search performance and user behavior:

```typescript
// src/search/analytics.ts — Search analytics and click tracking
// Log a search event
async function trackSearch(query: string, results: any[]) {
  await trieveFetch("/api/analytics/search", {
    method: "POST",
    body: JSON.stringify({
      query,
      search_type: "hybrid",
      results: results.map((r) => r.id),
    }),
  });
}

// Log when a user clicks a search result
async function trackClick(queryId: string, chunkId: string, position: number) {
  await trieveFetch("/api/analytics/search/click", {
    method: "POST",
    body: JSON.stringify({
      query_id: queryId,
      chunk_id: chunkId,
      position,                           // 1-indexed click position
    }),
  });
}

// Get search analytics — top queries, no-result queries, CTR
async function getAnalytics(params: { from: string; to: string }) {
  const topQueries = await trieveFetch(
    `/api/analytics/search/top_queries?from=${params.from}&to=${params.to}`
  );

  const noResults = await trieveFetch(
    `/api/analytics/search/no_result_queries?from=${params.from}&to=${params.to}`
  );

  return { topQueries, noResults };
}
```

## Installation

```bash
# JavaScript/TypeScript SDK
npm install trieve-ts-sdk

# Or use the REST API directly (no SDK needed)
# All examples above use fetch — zero dependencies
```

## Best Practices

1. **Chunk intelligently** — Split by paragraphs or sections, not arbitrary character counts; each chunk should be self-contained
2. **Use groups for documents** — Group chunks from the same document so you can search by document or by chunk
3. **Hybrid search by default** — Combines keyword precision with semantic understanding; switch to fulltext only for autocomplete
4. **Track analytics from day one** — No-result queries tell you what content is missing; low-CTR queries reveal relevance issues
5. **Set score thresholds** — Filter out low-confidence results; 0.3 is a good starting point, tune based on your data
6. **Use tags for filtering** — Tags enable fast categorical filters without scanning metadata
7. **Upsert with tracking IDs** — Use `upsert_by_tracking_id` to safely re-ingest content without creating duplicates
8. **Stream RAG responses** — For user-facing applications, stream the LLM response to reduce perceived latency
