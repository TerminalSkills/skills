---
name: trieve
description: >-
  Trieve is open-source search infrastructure that combines full-text, semantic and hybrid search with a RAG endpoint, recommendations and search analytics behind one REST API. Use this skill when a user asks to add Trieve search, ingest chunks into a Trieve dataset, build hybrid search or autocomplete, generate RAG answers from retrieved chunks, or read search analytics. The hosted service appears to be gone (trieve.ai no longer resolves and api.trieve.ai does not answer), so the code takes the base URL from an environment variable and targets a self-hosted deployment.
license: Apache-2.0
compatibility: Node 18+ (global fetch) or any HTTP client; a Trieve API key and dataset ID
metadata:
  author: terminal-skills
  version: 1.1.0
  category: data-ai
  repository: https://github.com/devflowinc/trieve
  tags:
  - search
  - ai-search
  - rag
  - vector-search
  - hybrid-search
---

# Trieve — AI Search Infrastructure

## Overview

Trieve stores content as **chunks** inside a **dataset** and indexes each chunk for typo-tolerant full-text (SPLADE), dense-vector semantic and hybrid search. It adds grouping, recommendations, a RAG route and analytics. Everything below is the REST API as defined in the project's OpenAPI document (`clients/ts-sdk/openapi.json` in https://github.com/devflowinc/trieve, version 0.13.0).

Status when checked (2026-10-24): the hosted service is not usable. The domain `trieve.ai` no longer resolves, and `docs.trieve.ai`, `dashboard.trieve.ai` and `api.trieve.ai` accept no HTTPS requests. The repository's last commit was in January 2026 and the npm package `trieve-ts-sdk` is at 0.0.124 (September 2025). The only route that can work is self-hosting: set `TRIEVE_API_URL` to your own deployment (the repository README points to Docker Compose and Kubernetes guides) and create the dataset and API key there.

## Instructions

### Authentication and headers

Every request needs the API key in the `Authorization` header (the raw key, no `Bearer ` prefix) and the dataset in `TR-Dataset` (a dataset UUID or its tracking ID). Writing chunks needs an admin or owner key.

```typescript
// src/search/client.ts
const TRIEVE_API_URL = process.env.TRIEVE_API_URL!; // your self-hosted server, no trailing slash
const TRIEVE_API_KEY = process.env.TRIEVE_API_KEY!;
const DATASET_ID = process.env.TRIEVE_DATASET_ID!;

export async function trieveFetch(path: string, body?: unknown, method = "POST") {
  const res = await fetch(`${TRIEVE_API_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: TRIEVE_API_KEY,
      "TR-Dataset": DATASET_ID,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Trieve ${res.status}: ${await res.text()}`);
  const type = res.headers.get("content-type") ?? "";
  return type.includes("json") ? res.json() : res.text();
}
```

### Ingest chunks

`POST /api/chunk` takes one chunk object or an array of up to 120. A chunk whose `tracking_id` already exists makes the request fail unless you set `upsert_by_tracking_id: true`. `group_tracking_ids` puts chunks into groups; the groups must already exist (create them with `POST /api/chunk_group`), so the example below leaves them out.

```typescript
// src/search/ingest.ts
import { trieveFetch } from "./client";

type Doc = { id: string; url: string; title: string; tags: string[]; content: string };

export async function ingest(docs: Doc[]) {
  const chunks = docs.flatMap((doc) =>
    doc.content.split("\n\n").filter(Boolean).map((paragraph, i) => ({
      chunk_html: paragraph,                 // plain text or HTML
      tracking_id: `${doc.id}-${i}`,
      link: doc.url,
      tag_set: doc.tags,
      metadata: { title: doc.title, section: i },
      upsert_by_tracking_id: true,
    })),
  );
  for (let i = 0; i < chunks.length; i += 120) {
    await trieveFetch("/api/chunk", chunks.slice(i, i + 120));
  }
}
```

### Search

`POST /api/chunk/search` requires `query` and `search_type` (`fulltext`, `semantic`, `hybrid` or `bm25`). Highlighting is configured through `highlight_options`, not top-level fields. Filters use `must`, `must_not` and `should`; reach into your own metadata with the `metadata.` prefix. The response has `id` (the query ID for analytics), `chunks` (each with `chunk`, `score`, `highlights`) and `total_pages`.

```typescript
// src/search/query.ts
import { trieveFetch } from "./client";

export async function search(query: string, category?: string) {
  return trieveFetch("/api/chunk/search", {
    query,
    search_type: "hybrid",
    page: 1,
    page_size: 10,
    get_total_pages: true,
    highlight_options: { highlight_results: true, highlight_max_length: 200, highlight_max_num: 3 },
    filters: category
      ? { must: [{ field: "metadata.category", match_any: [category] }] }
      : undefined,
  });
}

// Typeahead: prefix-matching autocomplete
export const autocomplete = (query: string) =>
  trieveFetch("/api/chunk/autocomplete", { query, search_type: "fulltext", page_size: 5 });

// One result per document, up to 3 chunks each
export const searchGroups = (query: string) =>
  trieveFetch("/api/chunk_group/group_oriented_search", {
    query, search_type: "hybrid", page_size: 10, group_size: 3,
  });
```

Useful tuning knobs on all three routes: `score_threshold`, `sort_options.recency_bias` (about 1.0 is gentle, above 3.0 strong), `scoring_options.fulltext_boost` / `semantic_boost`, `typo_options.correct_typos`, and `slim_chunks: true` to skip heavy fields.

### RAG over chosen chunks

`POST /api/chunk/generate` does not search. It needs `chunk_ids` (the chunks to use as context, taken from a search result) and `prev_messages` (the conversation, the last item being the question). Optional: `prompt` (instruction for the model), `model`, `temperature`, `max_tokens`, `stream_response`. The response is plain text, and the `TR-QueryID` header carries the ID for analytics. For server-side chat memory use the `/api/topic` and `/api/message` routes instead.

```typescript
// src/search/rag.ts
import { search } from "./query";
import { trieveFetch } from "./client";

export async function answer(question: string) {
  const found = await search(question);
  const top = found.chunks.slice(0, 5);
  const text = await trieveFetch("/api/chunk/generate", {
    prev_messages: [{ role: "user", content: question }],
    chunk_ids: top.map((c: any) => c.chunk.id),
    prompt: "Answer only from the numbered documents and cite them. Say so if they do not contain the answer.",
    temperature: 0.3,
    max_tokens: 500,
  });
  return { answer: text, sources: top.map((c: any) => c.chunk.link) };
}
```

### Recommendations

`POST /api/chunk/recommend` takes `positive_chunk_ids` or `positive_tracking_ids`, optional negatives, `limit`, `strategy` (`average_vector` or `best_score`), `recommend_type` (`semantic`, `fulltext`, `bm25`) and the same `filters` object as search.

```typescript
export const moreLike = (readIds: string[]) =>
  trieveFetch("/api/chunk/recommend", {
    positive_chunk_ids: readIds.slice(-5),
    limit: 5,
    strategy: "best_score",
    filters: { must_not: [{ field: "tracking_id", match_any: readIds }] },
  });
```

### Analytics

Reading analytics needs an admin key. `POST /api/analytics/search` takes a `type`: `head_queries`, `no_result_queries`, `low_confidence_queries`, `search_usage_graph`, `latency_graph`, `search_metrics` and others listed in the OpenAPI document. Clicks are reported with `PUT /api/analytics/ctr`, using the query ID from the search response (`id`) or the `TR-QueryID` header.

```typescript
export const noResults = () => trieveFetch("/api/analytics/search", { type: "no_result_queries", page: 1 });

export const trackClick = (queryId: string, chunkId: string, position: number) =>
  trieveFetch("/api/analytics/ctr", {
    request_id: queryId, ctr_type: "search", clicked_chunk_id: chunkId, position,
  }, "PUT");
```

## Examples

### Example 1: Index a docs folder and search it

**User request:** "Index every markdown file in `docs/` into Trieve and add a search box endpoint to my Express app."

The agent reads `TRIEVE_API_URL`, `TRIEVE_API_KEY` and `TRIEVE_DATASET_ID` from the environment, splits each file by heading or blank line into chunks with `tracking_id` `<file>-<n>` and `upsert_by_tracking_id: true`, posts them in batches of 120, then exposes `GET /search?q=` calling `search()` with `hybrid`. A query such as `rotate api key` returns `chunks[].chunk.link` plus `highlights` snippets.

### Example 2: Find what users cannot find

**User request:** "Which searches return nothing? I want a weekly list."

The agent calls `POST /api/analytics/search` with `{"type": "no_result_queries"}`, prints query text and counts sorted by count, and suggests which topics lack content. It confirms the key is an admin key first, since a read-only key is rejected.

## Guidelines

1. Send the key as-is in `Authorization`; `Bearer` prefixes are a common cause of 401s.
2. Split content by section or paragraph so each chunk stands alone; a whole page in one chunk blurs both search modes.
3. Set `upsert_by_tracking_id: true` for re-indexing, or the second run fails on duplicate tracking IDs.
4. Use `hybrid` by default; `fulltext` suits autocomplete and exact codes.
5. `/api/chunk/generate` never retrieves: always pass the `chunk_ids` yourself.
6. Check the field list in the OpenAPI document before using a parameter; Trieve renames request fields between versions, and the SDK on npm lags the API.
7. Keep the admin API key on the server; for browser search create a read-only key.
8. Because upkeep of the project has slowed, prefer a self-hosted deployment you control, or consider Qdrant, Typesense or Meilisearch when you need a maintained engine.
