---
name: firecrawl
description: >-
  Convert any website into clean, structured data with Firecrawl — API-first
  web scraping service. Use when someone asks to "turn a website into markdown",
  "scrape website for LLM", "Firecrawl", "extract website content as clean
  text", "crawl and convert to structured data", or "scrape website for RAG".
  Covers single-page scraping, full-site crawling, structured extraction,
  and LLM-ready output.
license: Apache-2.0
compatibility: "Any language. REST API. TypeScript/Python SDKs. Self-hostable."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: data-ai
  tags: ["scraping", "firecrawl", "llm", "rag", "markdown"]
---

# Firecrawl

## Overview

Firecrawl is an API that scrapes websites and returns clean, LLM-ready content. Point it at any URL and get back markdown, HTML, or structured data — no selectors to write, no anti-bot handling, no browser management. It handles JavaScript rendering, proxy rotation, and content extraction automatically. Built for feeding web content into LLMs, RAG pipelines, and data workflows.

## When to Use

- Extracting website content for RAG (Retrieval-Augmented Generation)
- Converting web pages to clean markdown for LLM consumption
- Crawling entire sites and getting structured content
- Scraping without managing browsers, proxies, or anti-bot
- Extracting structured data (products, articles) with LLM-powered extraction

## Instructions

### Setup

```bash
npm install @mendable/firecrawl-js
# Or Python: pip install firecrawl-py

# Self-hosted: docker run -p 3002:3002 mendableai/firecrawl
```

### Single Page Scrape

```typescript
// scrape.ts — Convert any URL to clean markdown
import FirecrawlApp from "@mendable/firecrawl-js";

const firecrawl = new FirecrawlApp({
  apiKey: process.env.FIRECRAWL_API_KEY,
  // apiUrl: "http://localhost:3002" // For self-hosted
});

// Scrape a single page
const result = await firecrawl.scrapeUrl("https://docs.example.com/getting-started", {
  formats: ["markdown", "html"],  // Get both formats
});

console.log(result.markdown);     // Clean markdown content
console.log(result.metadata);     // Title, description, language, etc.
```

### Full Site Crawl

```typescript
// crawl.ts — Crawl an entire site
const crawlResult = await firecrawl.crawlUrl("https://docs.example.com", {
  limit: 100,                     // Max pages to crawl
  scrapeOptions: {
    formats: ["markdown"],
  },
});

// Process all pages
for (const page of crawlResult.data) {
  console.log(`${page.metadata.title}: ${page.markdown.length} chars`);
  // Feed into your RAG pipeline, vector DB, etc.
}
```

### Structured Data Extraction

```typescript
// extract.ts — Extract structured data using LLM
import { z } from "zod";

const ProductSchema = z.object({
  name: z.string(),
  price: z.number(),
  currency: z.string(),
  rating: z.number().optional(),
  inStock: z.boolean(),
  features: z.array(z.string()),
});

const result = await firecrawl.scrapeUrl("https://shop.example.com/product/123", {
  formats: ["extract"],
  extract: {
    schema: ProductSchema,
  },
});

console.log(result.extract);
// { name: "Widget Pro", price: 49.99, currency: "USD", rating: 4.5, inStock: true, features: [...] }
```

### Build a RAG Knowledge Base

```typescript
// rag-ingest.ts — Crawl docs site and ingest into vector DB
import FirecrawlApp from "@mendable/firecrawl-js";
import { ChromaClient } from "chromadb";

const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY });
const chroma = new ChromaClient();
const collection = await chroma.getOrCreateCollection({ name: "docs" });

// Crawl documentation site
const crawl = await firecrawl.crawlUrl("https://docs.myproduct.com", {
  limit: 500,
  scrapeOptions: { formats: ["markdown"] },
});

// Chunk and store in vector DB
for (const page of crawl.data) {
  const chunks = splitIntoChunks(page.markdown, 1000);  // 1000 char chunks

  await collection.add({
    ids: chunks.map((_, i) => `${page.metadata.sourceURL}-chunk-${i}`),
    documents: chunks,
    metadatas: chunks.map(() => ({
      source: page.metadata.sourceURL,
      title: page.metadata.title,
    })),
  });
}

function splitIntoChunks(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
}
```

## Examples

### Example 1: Build a docs chatbot

**User prompt:** "I want a chatbot that answers questions about my product documentation."

The agent will use Firecrawl to crawl the docs site, convert to markdown, chunk the content, store in a vector database, and build a RAG query pipeline.

### Example 2: Monitor competitor content changes

**User prompt:** "Track when our competitor updates their pricing page."

The agent will schedule periodic Firecrawl scrapes, compare markdown diffs between runs, and alert on significant changes.

## Guidelines

- **`scrapeUrl` for single pages** — fast, returns markdown + metadata
- **`crawlUrl` for entire sites** — follows links, respects limits
- **Markdown is the best LLM format** — cleaner than HTML, preserves structure
- **Structured extraction for data** — use Zod/JSON schema to extract typed data
- **Self-host for privacy** — `docker run mendableai/firecrawl` for sensitive data
- **Rate limits on cloud API** — 500 pages/min on free tier
- **Chunk markdown for RAG** — 500-1500 char chunks with overlap work best
- **Cache results** — don't re-scrape unchanged pages
- **`formats` array** — request only what you need (markdown, html, extract)
