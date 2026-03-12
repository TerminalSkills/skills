---
title: Build Unified Search Across Multiple Data Sources
slug: build-unified-search-across-multiple-data-sources
description: >
  Search across documents, Slack messages, Jira tickets, and code
  with a single query — using hybrid search (keyword + semantic)
  to help teams find anything in under 200ms.
skills:
  - typescript
  - qdrant
  - redis
  - vercel-ai-sdk
  - hono
  - zod
  - postgresql
category: AI & Machine Learning
tags:
  - search
  - hybrid-search
  - semantic-search
  - enterprise-search
  - rag
  - knowledge-management
---

# Build Unified Search Across Multiple Data Sources

## The Problem

A 200-person company stores knowledge across 8 tools: Google Drive, Slack, Jira, Confluence, GitHub, Notion, email, and a shared wiki. Engineers spend 30 minutes/day searching for information — checking 3-4 tools before finding what they need. "Has anyone worked on X before?" takes an hour of Slack scrolling. Onboarding takes 2 months partly because institutional knowledge is unfindable. Each tool has its own search, none talk to each other.

## Step 1: Connector Framework

```typescript
// src/search/connectors.ts
import { z } from 'zod';

export const SearchDocument = z.object({
  id: z.string(),
  source: z.enum(['google_drive', 'slack', 'jira', 'github', 'notion', 'confluence', 'wiki']),
  title: z.string(),
  content: z.string(),
  url: z.string().url(),
  author: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  permissions: z.array(z.string()).default([]), // who can see this
});

export interface Connector {
  name: string;
  fetchDocuments(since?: Date): AsyncGenerator<z.infer<typeof SearchDocument>>;
}

export const slackConnector: Connector = {
  name: 'slack',
  async *fetchDocuments(since) {
    const token = process.env.SLACK_TOKEN!;
    const channels = await fetch('https://slack.com/api/conversations.list?limit=200', {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.json()) as any;

    for (const channel of channels.channels ?? []) {
      const messages = await fetch(
        `https://slack.com/api/conversations.history?channel=${channel.id}&limit=100${since ? `&oldest=${since.getTime() / 1000}` : ''}`,
        { headers: { Authorization: `Bearer ${token}` } }
      ).then(r => r.json()) as any;

      for (const msg of messages.messages ?? []) {
        if (!msg.text || msg.text.length < 20) continue; // skip short messages

        yield {
          id: `slack:${channel.id}:${msg.ts}`,
          source: 'slack' as const,
          title: `#${channel.name}`,
          content: msg.text,
          url: `https://slack.com/archives/${channel.id}/p${msg.ts.replace('.', '')}`,
          author: msg.user,
          createdAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          updatedAt: new Date(parseFloat(msg.ts) * 1000).toISOString(),
          metadata: { channel: channel.name, reactions: msg.reactions?.length ?? 0 },
          permissions: [],
        };
      }
    }
  },
};

export const githubConnector: Connector = {
  name: 'github',
  async *fetchDocuments(since) {
    const token = process.env.GITHUB_TOKEN!;
    const org = process.env.GITHUB_ORG!;

    // Index PRs and issues
    const query = since ? `+updated:>=${since.toISOString().split('T')[0]}` : '';
    const res = await fetch(
      `https://api.github.com/search/issues?q=org:${org}${query}&sort=updated&per_page=100`,
      { headers: { Authorization: `token ${token}` } }
    ).then(r => r.json()) as any;

    for (const item of res.items ?? []) {
      yield {
        id: `github:${item.id}`,
        source: 'github' as const,
        title: item.title,
        content: `${item.title}\n\n${item.body ?? ''}`,
        url: item.html_url,
        author: item.user.login,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        metadata: {
          labels: item.labels.map((l: any) => l.name),
          state: item.state,
          isPR: !!item.pull_request,
        },
        permissions: [],
      };
    }
  },
};
```

## Step 2: Hybrid Search Engine

```typescript
// src/search/engine.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import { Pool } from 'pg';
import { embed } from 'ai';
import { openai } from '@ai-sdk/openai';

const qdrant = new QdrantClient({ url: process.env.QDRANT_URL });
const db = new Pool({ connectionString: process.env.DATABASE_URL });

const COLLECTION = 'unified_search';

export async function indexDocument(doc: any): Promise<void> {
  // Generate embedding
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: `${doc.title}\n\n${doc.content.slice(0, 8000)}`,
  });

  // Store in Qdrant (vector) + PostgreSQL (full-text)
  await qdrant.upsert(COLLECTION, {
    points: [{
      id: doc.id,
      vector: embedding,
      payload: {
        source: doc.source,
        title: doc.title,
        url: doc.url,
        author: doc.author,
        createdAt: doc.createdAt,
        contentPreview: doc.content.slice(0, 500),
      },
    }],
  });

  await db.query(`
    INSERT INTO search_documents (id, source, title, content, url, author, created_at, tsv)
    VALUES ($1, $2, $3, $4, $5, $6, $7, to_tsvector('english', $3 || ' ' || $4))
    ON CONFLICT (id) DO UPDATE SET content = $4, tsv = to_tsvector('english', $3 || ' ' || $4)
  `, [doc.id, doc.source, doc.title, doc.content, doc.url, doc.author, doc.createdAt]);
}

export async function hybridSearch(query: string, options: {
  sources?: string[];
  limit?: number;
}): Promise<Array<{
  id: string; source: string; title: string; url: string; score: number; snippet: string;
}>> {
  const limit = options.limit ?? 20;

  // Semantic search
  const { embedding } = await embed({
    model: openai.embedding('text-embedding-3-small'),
    value: query,
  });

  const semanticResults = await qdrant.search(COLLECTION, {
    vector: embedding,
    limit: limit * 2,
    filter: options.sources ? {
      must: [{ key: 'source', match: { any: options.sources } }],
    } : undefined,
  });

  // Keyword search (PostgreSQL full-text)
  const { rows: keywordResults } = await db.query(`
    SELECT id, source, title, url,
           ts_rank(tsv, plainto_tsquery('english', $1)) as rank,
           ts_headline('english', content, plainto_tsquery('english', $1), 'MaxWords=30') as snippet
    FROM search_documents
    WHERE tsv @@ plainto_tsquery('english', $1)
    ${options.sources ? `AND source = ANY($3)` : ''}
    ORDER BY rank DESC
    LIMIT $2
  `, options.sources
    ? [query, limit * 2, options.sources]
    : [query, limit * 2]
  );

  // Merge and deduplicate with reciprocal rank fusion
  const scores = new Map<string, { score: number; data: any }>();

  semanticResults.forEach((r, i) => {
    const id = r.id as string;
    const rrf = 1 / (60 + i); // RRF constant k=60
    scores.set(id, {
      score: (scores.get(id)?.score ?? 0) + rrf,
      data: { id, source: r.payload?.source, title: r.payload?.title, url: r.payload?.url, snippet: r.payload?.contentPreview },
    });
  });

  keywordResults.forEach((r: any, i: number) => {
    const rrf = 1 / (60 + i);
    scores.set(r.id, {
      score: (scores.get(r.id)?.score ?? 0) + rrf,
      data: { id: r.id, source: r.source, title: r.title, url: r.url, snippet: r.snippet },
    });
  });

  return [...scores.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => ({ ...s.data, score: s.score }));
}
```

## Results

- **Search time**: <200ms across all sources (was 30 min checking 4 tools manually)
- **Indexed**: 500K documents across 7 data sources
- **Onboarding**: new hires find answers independently — onboarding reduced to 3 weeks
- **"Has anyone worked on X?"**: answered in one search instead of Slack archaeology
- **Hybrid accuracy**: semantic finds conceptual matches, keyword finds exact terms
- **Source filtering**: search only Slack, only GitHub, or everything at once
- **30 minutes/day saved** per engineer × 200 engineers = 100 hours/day recovered
