---
title: "Build a RAG System with Accurate Source Citations"
slug: build-rag-with-citations
description: "Build a retrieval-augmented generation pipeline over PDFs that answers with exact, verifiable citations: pgvector and full-text retrieval, Cohere reranking and Claude's native citations."
skills: [langchain, cohere-api, anthropic-sdk, pageindex]
category: data-ai
difficulty: advanced
time_estimate: "5 hours"
tags: [rag, citations, langchain, cohere, anthropic, vector-search, legal-tech, pdf]
---

# Build a RAG System with Accurate Source Citations

## The Problem

A legal tech developer is building a contract research tool. Lawyers need to know exactly where an answer came from: not just the document, but the page and the clause. Standard RAG answers questions; a model that is asked to write `[1]` markers in free text can attach them to the wrong passage or invent a quotation, and a wrong citation in a legal answer is worse than no answer.

## The Solution

Split the job so that no step has to be trusted blindly:

- `langchain` loads the PDFs page by page and splits them into chunks that remember their page.
- `cohere-api` embeds the chunks and reranks the candidates.
- `anthropic-sdk` generates the answer with the Claude **Citations** feature: each retrieved chunk is passed as a document with `citations: { enabled: true }`, and the API returns the supporting passage (`cited_text`) and its character range for every claim. These pointers come from the API, not from the model's free text, and `cited_text` does not count toward output tokens.
- A final check compares each returned range with the chunk text you stored.

```text
PDFs -> split by page -> Cohere embed -> Postgres (pgvector + full-text index)
Question -> vector + full-text search, fused by rank -> Cohere rerank -> top 5 chunks
Claude (documents with citations enabled) -> answer + cited passages -> range check
```

## Step-by-Step Walkthrough

### Step 1: Set up

Run Postgres with the pgvector extension locally (for example the `pgvector/pgvector:pg17` image, published on 127.0.0.1 only) and set `DATABASE_URL`, `COHERE_API_KEY` and `ANTHROPIC_API_KEY` in your environment. Then:

```bash
npm install @anthropic-ai/sdk cohere-ai pg @langchain/textsplitters @langchain/community @langchain/core@latest pdf-parse
npm install -D typescript tsx @types/node @types/pg
```

`@langchain/core@latest` is needed: a bare `@langchain/core` makes npm stop with an ERESOLVE peer conflict against `@langchain/community`. The code was type-checked with `@anthropic-ai/sdk` 1.3.0, `cohere-ai` 8.3.0, `@langchain/community` 1.1.29 and `pdf-parse` 2.4.5 as ES modules (`"type": "module"`). `PDFLoader` accepts pdf-parse v1 or v2.

### Step 2: Ingest PDFs with page numbers

```typescript
// src/ingest.ts
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { CohereClientV2 } from "cohere-ai";
import pg from "pg";

const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });
export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function setup() {
  await pool.query("CREATE EXTENSION IF NOT EXISTS vector");
  await pool.query(`CREATE TABLE IF NOT EXISTS chunks (
    id bigserial PRIMARY KEY, doc_name text NOT NULL, page int, content text NOT NULL,
    embedding vector(1024) NOT NULL,
    tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED)`);
  await pool.query("CREATE INDEX IF NOT EXISTS chunks_tsv ON chunks USING gin (tsv)");
  await pool.query("CREATE INDEX IF NOT EXISTS chunks_emb ON chunks USING hnsw (embedding vector_cosine_ops)");
}

export async function embed(texts: string[], inputType: "search_document" | "search_query") {
  const res = await cohere.embed({
    model: "embed-english-v3.0", texts, inputType, embeddingTypes: ["float"],
  });
  return res.embeddings.float!;
}

export async function ingestPdf(path: string, docName: string) {
  const pages = await new PDFLoader(path, { splitPages: true }).load();
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 100 });
  const chunks = await splitter.splitDocuments(pages);   // each keeps metadata.loc.pageNumber
  for (let i = 0; i < chunks.length; i += 96) {          // Cohere embed takes at most 96 texts per call
    const batch = chunks.slice(i, i + 96);
    const vectors = await embed(batch.map((c) => c.pageContent), "search_document");
    for (const [j, c] of batch.entries()) {
      await pool.query(
        "INSERT INTO chunks (doc_name, page, content, embedding) VALUES ($1, $2, $3, $4::vector)",
        [docName, c.metadata.loc?.pageNumber ?? null, c.pageContent, JSON.stringify(vectors[j])]);
    }
  }
}
```

Cohere's `embed-english-v3.0` returns 1024-dimension vectors, which is why the column is `vector(1024)`. The generated `tsv` column and the GIN index give you keyword search without a second system.

### Step 3: Retrieve with vector and keyword search, then rerank

```typescript
// src/retrieve.ts
import { CohereClientV2 } from "cohere-ai";
import { embed, pool } from "./ingest.js";

const cohere = new CohereClientV2({ token: process.env.COHERE_API_KEY });
export interface Chunk { id: string; docName: string; page: number | null; content: string }

export async function retrieve(query: string, k = 20, topN = 5): Promise<Chunk[]> {
  const [qv] = await embed([query], "search_query");
  // Reciprocal rank fusion of vector search and Postgres full-text search (ts_rank, not true BM25)
  const { rows } = await pool.query(
    `WITH v AS (
       SELECT id, row_number() OVER (ORDER BY embedding <=> $1::vector) AS r
       FROM chunks ORDER BY embedding <=> $1::vector LIMIT $3),
     t AS (
       SELECT id, row_number() OVER (ORDER BY ts_rank_cd(tsv, q) DESC) AS r
       FROM chunks, websearch_to_tsquery('english', $2) q WHERE tsv @@ q
       ORDER BY ts_rank_cd(tsv, q) DESC LIMIT $3)
     SELECT c.id, c.doc_name AS "docName", c.page, c.content
     FROM chunks c LEFT JOIN v ON v.id = c.id LEFT JOIN t ON t.id = c.id
     WHERE v.id IS NOT NULL OR t.id IS NOT NULL
     ORDER BY coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + t.r), 0) DESC LIMIT $3`,
    [JSON.stringify(qv), query, k]);
  const reranked = await cohere.rerank({
    model: "rerank-v3.5", query, documents: rows.map((r) => r.content), topN,
  });
  return reranked.results.map((r) => rows[r.index] as Chunk);
}
```

Contract language is full of exact terms ("force majeure", "Section 12.3") that embeddings blur, so the keyword side matters. Postgres `ts_rank_cd` is not BM25; it is a good-enough lexical ranker for this size, and reciprocal rank fusion (the `1 / (60 + rank)` terms) combines the two lists without having to calibrate their scores. Cohere's `rerank-v3.5` then orders the fused candidates by relevance to the question.

### Step 4: Generate with native citations

```typescript
// src/cite.ts
import Anthropic from "@anthropic-ai/sdk";
import type { Chunk } from "./retrieve.js";

const client = new Anthropic();   // reads ANTHROPIC_API_KEY

export interface Citation { n: number; chunk: Chunk; citedText: string; verified: boolean }

export async function answer(question: string, chunks: Chunk[]) {
  const response = await client.messages.create({
    model: "claude-opus-5-5",
    max_tokens: 1024,
    system: "Answer only from the provided documents. If they do not cover the question, say so.",
    messages: [{
      role: "user",
      content: [
        ...chunks.map((c) => ({
          type: "document" as const,
          source: { type: "text" as const, media_type: "text/plain" as const, data: c.content },
          title: `${c.docName}, p. ${c.page ?? "?"}`,
          citations: { enabled: true },
        })),
        { type: "text" as const, text: question },
      ],
    }],
  });

  const citations: Citation[] = [];
  let text = "";
  for (const block of response.content) {
    if (block.type !== "text") continue;
    text += block.text;
    for (const c of block.citations ?? []) {
      if (c.type !== "char_location") continue;
      const chunk = chunks[c.document_index];
      let n = citations.findIndex((x) => x.chunk === chunk && x.citedText === c.cited_text) + 1;
      if (!n) {
        // The API returns the quoted span; check it really is inside our stored chunk.
        const verified = chunk.content.slice(c.start_char_index, c.end_char_index) === c.cited_text;
        citations.push({ n: citations.length + 1, chunk, citedText: c.cited_text, verified });
        n = citations.length;
      }
      text += ` [${n}]`;
    }
  }
  return { text, citations };
}
```

Each chunk is its own document, so `c.document_index` tells you exactly which chunk (and therefore which PDF page) supports a claim. `char_location` citations carry `cited_text` plus 0-indexed character offsets into that chunk. Citations must be enabled on all documents in a request or none. Use any current Claude model in place of `claude-opus-5-5`; a smaller one is usually enough once the sources are this narrow.

### Step 5: Run it and show the evidence

```typescript
// src/main.ts
import { setup, ingestPdf, pool } from "./ingest.js";
import { retrieve } from "./retrieve.js";
import { answer } from "./cite.js";

await setup();
await ingestPdf("contracts/msa.pdf", "Master Services Agreement");
const chunks = await retrieve("When can the customer terminate for convenience?");
const { text, citations } = await answer("When can the customer terminate for convenience?", chunks);
console.log(text);
for (const c of citations) {
  console.log(`[${c.n}] ${c.chunk.docName}, p. ${c.chunk.page}${c.verified ? "" : "  (UNVERIFIED)"}: "${c.citedText}"`);
}
await pool.end();
```

Show the user each citation next to the answer with its document name, page and quoted passage, and mark any citation whose `verified` flag is false instead of hiding it. A reply with no citations means the sources did not cover the question; show that as "not found in these documents" rather than retrying with a looser prompt.

## Real-World Example

A small firm loads 40 client contracts and asks, "When can the customer terminate for convenience?" The retriever returns five chunks from three contracts; Claude answers that termination for convenience needs 60 days written notice, citing the clause on page 14 of the master services agreement, and says that the second contract has no such right. The associate clicks the citation, sees the quoted sentence with its page number, and confirms it in the PDF in seconds. The range check passes for every citation, and a question about a clause the contracts do not contain returns "not covered by these documents" with no citations.

This pipeline finds and quotes text; it does not interpret it. A lawyer still reads the clause before it goes into advice.

## What to Build Next

- **PDF highlighting:** PDF documents sent directly to Claude return page-number citations; map them to a highlighted viewer.
- **Contradiction check:** run a second query over the cited passages from different contracts and flag disagreement.
- **Evaluation set:** keep 30 questions with known answer pages and track retrieval hit rate whenever you change the chunk size or the reranker.

## Related Skills

- [langchain](../skills/langchain/SKILL.md) -- document loaders and text splitters for the ingestion step
- [cohere-api](../skills/cohere-api/SKILL.md) -- embeddings and reranking
- [anthropic-sdk](../skills/anthropic-sdk/SKILL.md) -- Claude Messages API with citations
- [pageindex](../skills/pageindex/SKILL.md) -- alternative retrieval for long structured PDFs: a section tree searched by an LLM instead of embeddings, with page-level citations
