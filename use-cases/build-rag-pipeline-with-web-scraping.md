---
title: Build a RAG Pipeline That Scrapes and Indexes Documentation
slug: build-rag-pipeline-with-web-scraping
description: Crawl a documentation site with Firecrawl, store embeddings in pgvector, and build a Q&A system that answers questions from the scraped content.
skills:
  - firecrawl
  - pgvector
  - crawlee
category: data-ai
tags:
  - rag
  - vector-search
  - scraping
  - embeddings
  - pgvector
  - firecrawl
---

## The Problem

Kai's DevRel team needs an internal Q&A bot that answers questions about their product documentation, blog posts, and changelog. The docs are spread across three sites, updated weekly, and total about 800 pages. Existing chatbot solutions either require manual document uploads (impractical for 800 pages that change weekly) or cost $500+/month for managed RAG services. Kai wants something that auto-crawls the docs, keeps the index fresh, and runs on their existing Postgres database.

## The Solution

Use Firecrawl to crawl all three doc sites and convert pages to clean markdown. Chunk the content and store embeddings in pgvector (their Postgres already runs on Supabase). Build a scheduled job that re-crawls weekly and updates only changed pages. The Q&A endpoint retrieves relevant chunks via vector similarity and generates answers with GPT-4o.

## Step-by-Step Walkthrough

### Step 1: Crawl Documentation Sites

```typescript
// src/ingest/crawl.ts — Crawl docs and convert to markdown
/**
 * Uses Firecrawl to crawl documentation sites.
 * Returns clean markdown for each page with metadata.
 * Handles JS-rendered pages, navigation, and pagination automatically.
 */
import FirecrawlApp from "@mendable/firecrawl-js";

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY,
});

interface CrawledPage {
  url: string;
  title: string;
  markdown: string;
  lastModified: string | null;
}

async function crawlSite(siteUrl: string, limit = 500): Promise<CrawledPage[]> {
  console.log(`Crawling ${siteUrl} (limit: ${limit} pages)...`);

  const result = await firecrawl.crawlUrl(siteUrl, {
    limit,
    scrapeOptions: { formats: ["markdown"] },
  });

  return result.data.map((page) => ({
    url: page.metadata.sourceURL,
    title: page.metadata.title || "Untitled",
    markdown: page.markdown,
    lastModified: page.metadata.modifiedTime || null,
  }));
}

// Crawl all three doc sites
export async function crawlAllDocs(): Promise<CrawledPage[]> {
  const sites = [
    { url: "https://docs.myproduct.com", limit: 500 },
    { url: "https://blog.myproduct.com", limit: 200 },
    { url: "https://changelog.myproduct.com", limit: 100 },
  ];

  const allPages: CrawledPage[] = [];
  for (const site of sites) {
    const pages = await crawlSite(site.url, site.limit);
    allPages.push(...pages);
    console.log(`  ✓ ${pages.length} pages from ${site.url}`);
  }

  console.log(`Total: ${allPages.length} pages crawled`);
  return allPages;
}
```

### Step 2: Chunk and Embed Content

```typescript
// src/ingest/chunk.ts — Split documents into searchable chunks
/**
 * Splits markdown into overlapping chunks optimized for retrieval.
 * Preserves heading context so chunks make sense in isolation.
 * Overlap prevents relevant content from being split across chunks.
 */

interface Chunk {
  content: string;
  sourceUrl: string;
  title: string;
  heading: string;      // Current section heading for context
  chunkIndex: number;
}

export function chunkDocument(
  markdown: string,
  sourceUrl: string,
  title: string,
  chunkSize = 1200,     // ~300 tokens per chunk
  overlap = 200,         // 200 char overlap between chunks
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentHeading = title;

  // Split by headings first to preserve section context
  const sections = markdown.split(/(?=^#{1,3}\s)/m);

  for (const section of sections) {
    // Track the current heading
    const headingMatch = section.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      currentHeading = headingMatch[2].trim();
    }

    // Split long sections into overlapping chunks
    if (section.length <= chunkSize) {
      if (section.trim().length > 50) {  // Skip tiny fragments
        chunks.push({
          content: section.trim(),
          sourceUrl,
          title,
          heading: currentHeading,
          chunkIndex: chunks.length,
        });
      }
    } else {
      for (let i = 0; i < section.length; i += chunkSize - overlap) {
        const chunk = section.slice(i, i + chunkSize).trim();
        if (chunk.length > 50) {
          chunks.push({
            content: chunk,
            sourceUrl,
            title,
            heading: currentHeading,
            chunkIndex: chunks.length,
          });
        }
      }
    }
  }

  return chunks;
}
```

### Step 3: Store in pgvector

```typescript
// src/ingest/store.ts — Store embeddings in Postgres with pgvector
import { Pool } from "pg";
import OpenAI from "openai";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI();

// Initialize the table (run once)
export async function initSchema() {
  await pool.query(`
    CREATE EXTENSION IF NOT EXISTS vector;

    CREATE TABLE IF NOT EXISTS doc_chunks (
      id BIGSERIAL PRIMARY KEY,
      content TEXT NOT NULL,
      source_url TEXT NOT NULL,
      title TEXT NOT NULL,
      heading TEXT,
      chunk_index INTEGER,
      embedding vector(1536),
      content_hash TEXT NOT NULL,        -- For detecting changes
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- HNSW index for fast similarity search
    CREATE INDEX IF NOT EXISTS doc_chunks_embedding_idx
      ON doc_chunks USING hnsw (embedding vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);

    -- Index for finding existing chunks by URL
    CREATE INDEX IF NOT EXISTS doc_chunks_source_idx
      ON doc_chunks (source_url);
  `);
}

// Embed and store chunks (batch processing)
export async function storeChunks(chunks: Chunk[]) {
  const BATCH_SIZE = 100;  // OpenAI embedding batch limit

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);

    // Generate embeddings in batch
    const embedRes = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: batch.map((c) => c.content),
    });

    // Insert into Postgres
    for (let j = 0; j < batch.length; j++) {
      const chunk = batch[j];
      const embedding = embedRes.data[j].embedding;
      const contentHash = createHash(chunk.content);

      await pool.query(
        `INSERT INTO doc_chunks (content, source_url, title, heading, chunk_index, embedding, content_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (source_url, chunk_index)
         DO UPDATE SET content = $1, embedding = $6, content_hash = $7`,
        [chunk.content, chunk.sourceUrl, chunk.title, chunk.heading, chunk.chunkIndex,
         JSON.stringify(embedding), contentHash]
      );
    }

    console.log(`  Stored ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
  }
}

function createHash(content: string): string {
  const { createHash } = require("crypto");
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}
```

### Step 4: Build the Q&A Endpoint

```typescript
// src/api/ask.ts — Answer questions using retrieved context
import { Pool } from "pg";
import OpenAI from "openai";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const openai = new OpenAI();

export async function answerQuestion(question: string): Promise<{
  answer: string;
  sources: Array<{ url: string; title: string; heading: string }>;
}> {
  // 1. Embed the question
  const qEmbed = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: question,
  });

  // 2. Find relevant chunks via pgvector
  const { rows: chunks } = await pool.query(
    `SELECT content, source_url, title, heading,
            1 - (embedding <=> $1::vector) AS similarity
     FROM doc_chunks
     WHERE 1 - (embedding <=> $1::vector) > 0.65
     ORDER BY embedding <=> $1::vector
     LIMIT 8`,
    [JSON.stringify(qEmbed.data[0].embedding)]
  );

  if (chunks.length === 0) {
    return {
      answer: "I couldn't find relevant information in the documentation.",
      sources: [],
    };
  }

  // 3. Build context and generate answer
  const context = chunks
    .map((c, i) => `[${i + 1}] (${c.title} > ${c.heading})\n${c.content}`)
    .join("\n\n---\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a helpful documentation assistant. Answer questions based on the following documentation excerpts. Cite sources using [1], [2], etc. If the docs don't cover the question, say so.\n\n${context}`,
      },
      { role: "user", content: question },
    ],
    temperature: 0.2,
  });

  // 4. Deduplicate sources
  const sources = [...new Map(chunks.map((c) => [
    c.source_url,
    { url: c.source_url, title: c.title, heading: c.heading },
  ])).values()];

  return {
    answer: completion.choices[0].message.content!,
    sources,
  };
}
```

### Step 5: Weekly Re-Crawl Job

```typescript
// src/ingest/sync.ts — Incremental sync: only re-embed changed pages
export async function incrementalSync() {
  const pages = await crawlAllDocs();

  let updated = 0;
  let skipped = 0;

  for (const page of pages) {
    const chunks = chunkDocument(page.markdown, page.url, page.title);
    const newHash = createHash(page.markdown);

    // Check if content changed
    const { rows } = await pool.query(
      "SELECT content_hash FROM doc_chunks WHERE source_url = $1 LIMIT 1",
      [page.url]
    );

    if (rows.length > 0 && rows[0].content_hash === newHash) {
      skipped++;
      continue;  // Content unchanged — skip re-embedding
    }

    // Delete old chunks for this URL
    await pool.query("DELETE FROM doc_chunks WHERE source_url = $1", [page.url]);

    // Store new chunks
    await storeChunks(chunks);
    updated++;
  }

  console.log(`Sync complete: ${updated} updated, ${skipped} unchanged`);
}
```

## The Outcome

Kai's Q&A bot indexes 800 pages from three documentation sites in 12 minutes (initial crawl + embedding). Weekly syncs take 2-3 minutes because only changed pages are re-embedded. The bot answers questions with cited sources in under 2 seconds — vector search is 15ms (pgvector HNSW), LLM generation is the bottleneck at 1.5s. The team uses it 40-50 times per day, mostly for "how do I configure X" and "what changed in the last release" questions. Total infrastructure cost: $0 additional — pgvector runs on their existing Supabase instance, Firecrawl self-hosted, and OpenAI embeddings cost about $3/month for weekly re-indexing.
