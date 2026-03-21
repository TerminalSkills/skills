---
title: "Build a RAG System with Accurate Source Citations"
description: "Build a retrieval-augmented generation pipeline that answers questions with precise inline citations, source highlighting, and citation verification."
skills: [langchain, cohere-api, anthropic-sdk]
difficulty: advanced
time_estimate: "5 hours"
tags: [rag, citations, langchain, cohere, anthropic, vector-search, legal-tech, pdf]
---

# Build a RAG System with Accurate Source Citations

> **Persona:** You're a legal tech developer building a contract research tool. Lawyers need to know *exactly* where an answer came from — not just the document, but the precise clause. Hallucinated citations are career-ending.

Standard RAG answers questions. Citation RAG proves them. This guide builds a pipeline where every claim is traceable to a source chunk, with exact text highlighted.

## Architecture

```
Documents (PDF/HTML/MD)
    ↓ Chunk + metadata
Cohere Embed v3
    ↓ Store in pgvector
Query → Hybrid retrieval (vector + BM25)
    ↓ Rerank with Cohere Rerank v3
Claude generates answer with [1][2] citations
    ↓ Verify citations against source chunks
Return answer + highlighted source passages
```

## Setup

```bash
npm install @langchain/community @langchain/cohere @langchain/anthropic \
  langchain pdf-parse cheerio pg pgvector
```

## Document Ingestion

```typescript
// ingest/loader.ts
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

export async function ingestDocument(source: string, metadata: Record<string, string>) {
  let loader;
  if (source.endsWith('.pdf')) {
    loader = new PDFLoader(source, { splitPages: true });
  } else if (source.startsWith('http')) {
    loader = new CheerioWebBaseLoader(source);
  } else {
    // Treat as markdown/text file
    loader = new TextLoader(source);
  }

  const docs = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 64,
    separators: ['\n\n', '\n', '. ', ' '],
  });

  const chunks = await splitter.splitDocuments(docs);

  // Enrich with metadata for later citation display
  return chunks.map((chunk, i) => ({
    ...chunk,
    metadata: {
      ...chunk.metadata,
      ...metadata,
      chunkIndex: i,
      sourceId: `${metadata.docId}-${i}`,
    },
  }));
}
```

## Hybrid Retrieval — Vector + BM25

```typescript
// retrieval/hybrid.ts
import { CohereEmbeddings } from '@langchain/cohere';
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector';
import { CohereRerank } from '@langchain/cohere';

export class HybridRetriever {
  private vectorStore: PGVectorStore;
  private reranker = new CohereRerank({ model: 'rerank-v3.5', topN: 5 });

  async initialize(pool: Pool) {
    this.vectorStore = await PGVectorStore.initialize(
      new CohereEmbeddings({ model: 'embed-english-v3.0' }),
      { pool, tableName: 'document_chunks' }
    );
  }

  async retrieve(query: string, k = 10): Promise<RankedChunk[]> {
    // 1. Dense vector search
    const vectorResults = await this.vectorStore.similaritySearchWithScore(query, k);

    // 2. BM25 keyword search (via Postgres full-text)
    const bm25Results = await this.bm25Search(query, k);

    // 3. Merge and deduplicate
    const combined = this.mergeResults(vectorResults, bm25Results);

    // 4. Rerank with Cohere for precision
    const reranked = await this.reranker.compressDocuments(
      combined.map(r => r.doc),
      query
    );

    return reranked.map((doc, i) => ({
      sourceId: doc.metadata.sourceId,
      content: doc.pageContent,
      metadata: doc.metadata,
      rank: i + 1,
    }));
  }

  private async bm25Search(query: string, k: number) {
    const { rows } = await this.pool.query(
      `SELECT *, ts_rank(to_tsvector('english', content), plainto_tsquery('english', $1)) as rank
       FROM document_chunks
       WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $1)
       ORDER BY rank DESC LIMIT $2`,
      [query, k]
    );
    return rows;
  }
}
```

## Citation-Aware Generation

```typescript
// generation/cite.ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

export async function generateWithCitations(
  query: string,
  chunks: RankedChunk[]
): Promise<CitedAnswer> {
  // Build numbered source list for the prompt
  const sourcesContext = chunks
    .map((c, i) => `[${i + 1}] (${c.metadata.docName}, ${c.metadata.section})\n${c.content}`)
    .join('\n\n');

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: `You are a legal research assistant. Answer questions using ONLY the provided sources.
- Cite sources inline using [1], [2], etc.
- Every factual claim must have a citation.
- If sources don't cover the question, say so explicitly.
- Quote key phrases directly when precision matters.`,
    messages: [{
      role: 'user',
      content: `SOURCES:\n${sourcesContext}\n\nQUESTION: ${query}`,
    }],
  });

  const answer = response.content[0].type === 'text' ? response.content[0].text : '';

  // Extract citation numbers from the answer
  const citedNums = [...answer.matchAll(/\[(\d+)\]/g)].map(m => parseInt(m[1]));
  const uniqueCited = [...new Set(citedNums)];

  // Build citation map
  const citations = uniqueCited
    .filter(n => n <= chunks.length)
    .map(n => ({
      number: n,
      sourceId: chunks[n - 1].sourceId,
      docName: chunks[n - 1].metadata.docName,
      section: chunks[n - 1].metadata.section,
      excerpt: chunks[n - 1].content,
    }));

  return { answer, citations, chunks };
}
```

## Citation Verification

```typescript
// verification/verify.ts
export async function verifyCitations(answer: string, citations: Citation[]): Promise<VerificationResult[]> {
  return Promise.all(citations.map(async (citation) => {
    // Check that the answer's claim about this source is actually in the source text
    const verification = await client.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 128,
      messages: [{
        role: 'user',
        content: `Does this source support the claim made in the answer?
SOURCE TEXT: "${citation.excerpt}"
ANSWER CLAIM: "${extractClaimForCitation(answer, citation.number)}"
Reply with JSON: {"supported": boolean, "confidence": 0-1, "quotedText": "exact quote if supported"}`
      }]
    });

    const result = JSON.parse(
      verification.content[0].type === 'text' ? verification.content[0].text : '{}'
    );

    return { ...citation, ...result };
  }));
}
```

## Full Pipeline

```typescript
// main.ts
const retriever = new HybridRetriever();
await retriever.initialize(pool);

async function researchQuery(question: string) {
  // 1. Retrieve relevant chunks
  const chunks = await retriever.retrieve(question, 10);
  console.log(`Retrieved ${chunks.length} chunks`);

  // 2. Generate answer with citations
  const { answer, citations } = await generateWithCitations(question, chunks);

  // 3. Verify citations are accurate
  const verified = await verifyCitations(answer, citations);

  // 4. Flag low-confidence citations
  const flagged = verified.filter(c => c.confidence < 0.7);
  if (flagged.length > 0) {
    console.warn('⚠️ Low-confidence citations:', flagged.map(c => `[${c.number}]`).join(', '));
  }

  return {
    answer,
    citations: verified,
    reliable: flagged.length === 0,
  };
}

// Example usage
const result = await researchQuery(
  'What are the termination clauses in the Microsoft services agreement?'
);
console.log(result.answer);
// → "Microsoft may terminate services with 30 days notice [1]. 
//    Immediate termination is allowed for material breach [2]..."
```

## What to Build Next

- **PDF annotation:** Highlight cited passages directly on the PDF
- **Cross-reference check:** Flag when two sources contradict each other
- **Citation graph:** Visualize which sources are most frequently cited
- **Confidence scoring:** Score answer reliability based on citation quality
