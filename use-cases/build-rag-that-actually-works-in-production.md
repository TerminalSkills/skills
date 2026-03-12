---
title: Build a RAG System That Actually Works in Production
slug: build-rag-that-actually-works-in-production
description: A developer tools company builds a production RAG system for their documentation — going beyond naive "embed and retrieve" with hybrid search, re-ranking, chunk optimization, metadata filtering, evaluation-driven iteration, and hallucination detection — solving the real problems that make the difference between a demo and a product that users trust.
skills: [qdrant, llamaindex-ts, langfuse, braintrust, crawl4ai, vercel-ai-sdk]
category: AI & Machine Learning
tags: [rag, vector-search, llm, production, evaluation, retrieval, documentation]
---

# Build a RAG System That Actually Works in Production

Noor builds developer tools. Her product has 500 pages of documentation, and developers spend 45 minutes per day searching for answers. She builds a "chat with docs" feature. The first version — standard RAG tutorial approach — is terrible: it hallucinates API endpoints that don't exist, retrieves irrelevant chunks, and confidently gives wrong code examples. The demo looked great; production exposed every weakness.

## Why Naive RAG Fails

The standard tutorial RAG:
1. Split docs into 500-token chunks
2. Embed chunks with `text-embedding-3-small`
3. On query, embed the question, find top-5 similar chunks
4. Send chunks + question to GPT-4

This fails in production because:

- **Chunk boundaries**: Splitting mid-paragraph loses context. A function signature in one chunk and its description in the next.
- **Semantic gap**: "How do I authenticate?" doesn't embed close to "Set the `Authorization` header with your API key" — different words, same concept.
- **Retrieval precision**: Top-5 by cosine similarity returns 2 relevant chunks and 3 noise chunks. The noise confuses the LLM.
- **No metadata awareness**: User asks about v3 API; retriever returns chunks from v1 and v2 because the text is similar.
- **Hallucination**: LLM confidently invents API parameters that sound plausible but don't exist.

## Step 1: Smart Chunking (The Foundation)

The biggest impact comes from how you split documents. Noor replaces fixed-size chunking with structure-aware splitting:

```typescript
// indexer/chunking.ts — Structure-aware document splitting
interface DocumentChunk {
  content: string;
  metadata: {
    source: string;                        // URL or file path
    title: string;                         // Page title
    section: string;                       // H2 heading this belongs to
    subsection: string | null;             // H3 heading
    apiVersion: string;                    // v1, v2, v3
    type: "guide" | "api-reference" | "tutorial" | "changelog";
    codeLanguage: string | null;           // If chunk contains code
    lastUpdated: string;                   // ISO date
  };
}

function chunkDocumentation(markdown: string, metadata: Partial<DocumentChunk["metadata"]>): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let currentSection = "";
  let currentSubsection: string | null = null;

  // Split by headings (H2 and H3) — each section is a logical unit
  const sections = markdown.split(/(?=^##\s)/m);

  for (const section of sections) {
    const h2Match = section.match(/^##\s+(.+)/);
    if (h2Match) currentSection = h2Match[1];

    const subsections = section.split(/(?=^###\s)/m);

    for (const sub of subsections) {
      const h3Match = sub.match(/^###\s+(.+)/);
      if (h3Match) currentSubsection = h3Match[1];

      // If subsection is too long, split further — but at paragraph boundaries, never mid-sentence
      if (sub.length > 2000) {
        const paragraphs = sub.split(/\n\n+/);
        let buffer = "";

        for (const para of paragraphs) {
          if (buffer.length + para.length > 1500 && buffer.length > 200) {
            chunks.push(createChunk(buffer, currentSection, currentSubsection, metadata));
            buffer = para;
          } else {
            buffer += (buffer ? "\n\n" : "") + para;
          }
        }
        if (buffer.length > 50) {
          chunks.push(createChunk(buffer, currentSection, currentSubsection, metadata));
        }
      } else if (sub.length > 50) {
        chunks.push(createChunk(sub, currentSection, currentSubsection, metadata));
      }
    }
  }

  // CRITICAL: Add parent context to each chunk
  // A chunk about "rate limiting" should include that it belongs to "Authentication" → "API Reference"
  return chunks.map(chunk => ({
    ...chunk,
    content: `[${chunk.metadata.title} > ${chunk.metadata.section}${chunk.metadata.subsection ? ` > ${chunk.metadata.subsection}` : ""}]\n\n${chunk.content}`,
  }));
}
```

## Step 2: Hybrid Search (Semantic + Keyword)

Pure vector search misses exact matches. When a developer searches for `createUser`, semantic search might return chunks about "user management" instead of the exact `createUser` function. Hybrid search fixes this:

```typescript
// search/hybrid.ts — Combine vector search with keyword search
import { QdrantClient } from "@qdrant/js-client-rest";

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });

async function hybridSearch(query: string, filters?: { apiVersion?: string; type?: string }) {
  // 1. Vector search (semantic understanding)
  const queryEmbedding = await embed(query);
  const vectorResults = await qdrant.search("docs", {
    vector: queryEmbedding,
    limit: 20,                             // Over-fetch for re-ranking
    filter: buildQdrantFilter(filters),
    with_payload: true,
  });

  // 2. Keyword search (exact matches — catches function names, error codes)
  const keywordResults = await qdrant.search("docs", {
    vector: queryEmbedding,                // Still need a vector, but we'll re-score
    limit: 20,
    filter: {
      must: [
        ...buildQdrantFilter(filters).must || [],
        {
          key: "content",
          match: { text: extractKeyTerms(query) },  // Full-text match
        },
      ],
    },
    with_payload: true,
  });

  // 3. Reciprocal Rank Fusion — merge both result sets
  const fusedResults = reciprocalRankFusion(
    vectorResults.map(r => ({ id: r.id, score: r.score, payload: r.payload })),
    keywordResults.map(r => ({ id: r.id, score: r.score, payload: r.payload })),
    { vectorWeight: 0.6, keywordWeight: 0.4 },
  );

  return fusedResults.slice(0, 10);        // Top 10 after fusion
}

function reciprocalRankFusion(listA: Result[], listB: Result[], weights: { vectorWeight: number; keywordWeight: number }) {
  const K = 60;                            // RRF constant
  const scores = new Map<string, { score: number; payload: any }>();

  listA.forEach((item, rank) => {
    const rrf = weights.vectorWeight / (K + rank + 1);
    const existing = scores.get(item.id as string) || { score: 0, payload: item.payload };
    existing.score += rrf;
    scores.set(item.id as string, existing);
  });

  listB.forEach((item, rank) => {
    const rrf = weights.keywordWeight / (K + rank + 1);
    const existing = scores.get(item.id as string) || { score: 0, payload: item.payload };
    existing.score += rrf;
    scores.set(item.id as string, existing);
  });

  return [...scores.entries()]
    .sort((a, b) => b[1].score - a[1].score)
    .map(([id, data]) => ({ id, ...data }));
}
```

## Step 3: Re-Ranking (The Secret Weapon)

After retrieval, a re-ranker model scores each chunk's relevance to the specific question. This is the single biggest quality improvement:

```typescript
// search/rerank.ts — Cross-encoder re-ranking
async function rerankResults(query: string, results: SearchResult[]): Promise<SearchResult[]> {
  // Use Cohere rerank or a cross-encoder model
  const reranked = await cohere.rerank({
    query,
    documents: results.map(r => r.payload.content),
    model: "rerank-english-v3.0",
    topN: 5,                               // Keep only top 5 after re-ranking
  });

  return reranked.results.map(r => ({
    ...results[r.index],
    relevanceScore: r.relevanceScore,
  }));
}
```

## Step 4: Generation with Hallucination Guard

```typescript
// chat/generate.ts — Answer with citations and hallucination detection
import { streamText } from "ai";
import { openai } from "@ai-sdk/openai";

async function generateAnswer(query: string, chunks: SearchResult[]) {
  const context = chunks.map((c, i) =>
    `[Source ${i + 1}: ${c.payload.metadata.title} > ${c.payload.metadata.section}]\n${c.payload.content}`
  ).join("\n\n---\n\n");

  const result = streamText({
    model: openai("gpt-4o"),
    system: `You are a documentation assistant. Answer ONLY based on the provided sources.

RULES:
- Cite sources using [Source N] for every claim
- If the sources don't contain the answer, say "I couldn't find this in the documentation" — NEVER guess
- For code examples, only use code that appears in the sources
- If a function/parameter is mentioned in sources, include the exact name (don't paraphrase API names)
- If the user asks about a version not covered in sources, say which versions are covered`,
    messages: [
      { role: "user", content: `Sources:\n${context}\n\nQuestion: ${query}` },
    ],
    temperature: 0.1,                      // Low temperature for factual accuracy
  });

  return result;
}
```

## Step 5: Evaluation Loop (How You Actually Improve)

The most important step: measuring quality and iterating. Without evaluation, you're guessing.

```typescript
// eval/rag-eval.ts — Weekly evaluation pipeline
import { Eval } from "braintrust";
import { Factuality } from "autoevals";

const testSet = [
  { question: "How do I authenticate with the API?", expectedAnswer: "Use API key in Authorization header", expectedSources: ["authentication.md"] },
  { question: "What's the rate limit for the createUser endpoint?", expectedAnswer: "100 requests per minute", expectedSources: ["rate-limits.md"] },
  { question: "How do I handle webhook signature verification?", expectedAnswer: "HMAC-SHA256 with your webhook secret", expectedSources: ["webhooks.md"] },
  // ... 200 test questions from real user queries
];

await Eval("rag-docs", {
  data: () => testSet,
  task: async (input) => {
    const results = await hybridSearch(input.question);
    const reranked = await rerankResults(input.question, results);
    const answer = await generateAnswerSync(input.question, reranked);
    return {
      answer: answer.text,
      sources: reranked.map(r => r.payload.metadata.source),
      retrievalCount: results.length,
    };
  },
  scores: [
    Factuality,
    // Source accuracy: did we retrieve the right documents?
    (output, expected) => {
      const correctSources = expected.expectedSources.filter(s => output.sources.includes(s));
      return { name: "source_precision", score: correctSources.length / expected.expectedSources.length };
    },
    // Hallucination detection: does the answer contain claims not in sources?
    async (output, expected) => {
      const hallCheck = await detectHallucination(output.answer, output.sources);
      return { name: "no_hallucination", score: hallCheck.isGrounded ? 1.0 : 0.0 };
    },
  ],
});
```

## Results

After 3 iterations of evaluate → improve → evaluate:

- **Answer accuracy**: 71% → 89% (v1 naive RAG → v3 with hybrid search + re-ranking + eval)
- **Hallucination rate**: 23% → 3% (source-grounded generation + "I don't know" instruction)
- **Retrieval precision**: 45% → 82% (hybrid search + metadata filtering + re-ranking)
- **User satisfaction**: 4.1/5 rating after 3 months; users report saving 30 minutes/day
- **Support tickets**: Documentation-related tickets dropped 40% after chat feature launch
- **Latency**: P50 = 1.2 seconds end-to-end (search + rerank + generate); acceptable for chat
- **Cost**: $0.03 per query (embedding + rerank + GPT-4o); $450/month for 15K queries/month
- **Key lesson**: Re-ranking and evaluation loops had 10x more impact than changing the embedding model or chunk size
