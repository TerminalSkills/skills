---
title: Build an Internal Knowledge Base with AI-Powered Search
slug: build-knowledge-base-with-ai-search
description: "Replace Confluence with a Git-backed knowledge base featuring semantic search, AI answer mode with citations, per-team access permissions, and analytics that surface content gaps."
skills: [langchain, prisma]
category: productivity
tags: [knowledge-base, semantic-search, ai, rag, langchain, prisma, teams, internal-tools]
---

# Build an Internal Knowledge Base with AI-Powered Search

## The Problem

Your engineering team's knowledge lives in three places: a Confluence instance nobody updates, a Notion workspace with 400 pages and no structure, and Slack threads that disappear after 90 days. Someone spent four hours last week searching for how the deploy process works. Another engineer wrote a runbook nobody can find. New hires spend their first two weeks asking questions that are documented somewhere — they just can't find them.

The real problem isn't that knowledge isn't written down. It's that keyword search is terrible for how people actually ask questions. "How do we handle database migrations?" won't find an article titled "Deployment Checklist — DB Steps" unless you know to search for those words. AI semantic search fixes this: it finds what you mean, not just what you typed.

## The Solution

Use **LangChain** to build a semantic search layer on top of your markdown content. Use **Prisma** to manage documents, teams, permissions, and search analytics. Add an AI answer mode that retrieves relevant docs and synthesizes a cited answer.

## Step-by-Step Walkthrough

### Step 1: Prisma Schema

```text
Design a Prisma schema for a permission-based knowledge base. Include: 
Document (title, content, slug, teamId), Team (name, members), 
SearchLog (query, userId, wasAnswered), and DocumentView analytics.
```

```prisma
// prisma/schema.prisma

model Team {
  id        String     @id @default(cuid())
  name      String
  slug      String     @unique
  members   TeamMember[]
  documents Document[]
  createdAt DateTime   @default(now())
}

model TeamMember {
  id     String @id @default(cuid())
  teamId String
  team   Team   @relation(fields: [teamId], references: [id])
  userId String
  user   User   @relation(fields: [userId], references: [id])
  role   String @default("member") // "member" | "editor" | "admin"

  @@unique([teamId, userId])
}

model Document {
  id          String    @id @default(cuid())
  title       String
  slug        String    @unique
  content     String    // Markdown
  teamId      String?   // null = public to all org members
  team        Team?     @relation(fields: [teamId], references: [id])
  tags        String[]
  authorId    String
  gitPath     String?   // Optional: source file path in Git
  embeddedAt  DateTime? // When this doc was last indexed for vector search
  published   Boolean   @default(true)
  views       DocumentView[]
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model DocumentView {
  id         String   @id @default(cuid())
  documentId String
  document   Document @relation(fields: [documentId], references: [id])
  userId     String
  viewedAt   DateTime @default(now())
}

model SearchLog {
  id           String   @id @default(cuid())
  query        String
  userId       String
  resultsCount Int
  wasAnswered  Boolean  @default(false) // Did user click a result?
  aiUsed       Boolean  @default(false)
  searchedAt   DateTime @default(now())
}
```

### Step 2: Document Ingestion and Embedding

```typescript
// lib/embeddings.ts — Embed documents and store in pgvector

import { OpenAIEmbeddings } from '@langchain/openai'
import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter'
import { Document } from 'langchain/document'
import { prisma } from './prisma'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const embeddings = new OpenAIEmbeddings({ model: 'text-embedding-3-small' })

export async function embedDocument(docId: string) {
  const doc = await prisma.document.findUnique({ where: { id: docId } })
  if (!doc || !doc.published) return

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 800,
    chunkOverlap: 150,
  })

  const chunks = await splitter.createDocuments(
    [doc.content],
    [{ docId: doc.id, title: doc.title, slug: doc.slug, teamId: doc.teamId }]
  )

  const vectorStore = await PGVectorStore.initialize(embeddings, {
    pool,
    tableName: 'document_embeddings',
  })

  // Remove existing embeddings for this doc before re-indexing
  await pool.query('DELETE FROM document_embeddings WHERE metadata->>\'docId\' = $1', [doc.id])

  await vectorStore.addDocuments(chunks)

  await prisma.document.update({
    where: { id: docId },
    data: { embeddedAt: new Date() },
  })
}

/** Nightly job: re-embed all documents updated since last embedding. */
export async function reEmbedStale() {
  const stale = await prisma.document.findMany({
    where: {
      published: true,
      OR: [
        { embeddedAt: null },
        { updatedAt: { gt: prisma.document.fields.embeddedAt } },
      ],
    },
  })

  console.log(`Re-embedding ${stale.length} documents`)
  for (const doc of stale) {
    await embedDocument(doc.id)
    await new Promise(r => setTimeout(r, 200)) // Throttle API calls
  }
}
```

### Step 3: Semantic Search with Permission Filtering

```typescript
// lib/search.ts — Semantic search with team permission filtering

import { PGVectorStore } from '@langchain/community/vectorstores/pgvector'
import { OpenAIEmbeddings } from '@langchain/openai'
import { prisma } from './prisma'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

interface SearchResult {
  docId: string
  title: string
  slug: string
  excerpt: string
  score: number
}

export async function semanticSearch(
  query: string,
  userId: string,
  limit = 8
): Promise<SearchResult[]> {
  // Get teams this user belongs to
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true },
  })
  const userTeamIds = memberships.map(m => m.teamId)

  const vectorStore = await PGVectorStore.initialize(
    new OpenAIEmbeddings({ model: 'text-embedding-3-small' }),
    { pool, tableName: 'document_embeddings' }
  )

  // Search without filters, then apply permission filter client-side
  // (pgvector doesn't support metadata filtering natively in all setups)
  const rawResults = await vectorStore.similaritySearchWithScore(query, limit * 3)

  const allowed = rawResults.filter(([doc]) => {
    const teamId = doc.metadata.teamId
    // Visible if: public (no teamId) or user is in the team
    return !teamId || userTeamIds.includes(teamId)
  })

  // Log the search for analytics
  await prisma.searchLog.create({
    data: {
      query,
      userId,
      resultsCount: allowed.length,
      aiUsed: false,
    }
  })

  return allowed.slice(0, limit).map(([doc, score]) => ({
    docId: doc.metadata.docId,
    title: doc.metadata.title,
    slug: doc.metadata.slug,
    excerpt: doc.pageContent.substring(0, 200) + '...',
    score,
  }))
}
```

### Step 4: AI Answer Mode with Source Citations

```typescript
// lib/ai-answer.ts — Ask a question, get an answer with citations

import Anthropic from '@anthropic-ai/sdk'
import { semanticSearch } from './search'
import { prisma } from './prisma'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function getAIAnswer(query: string, userId: string) {
  // Get relevant documents
  const searchResults = await semanticSearch(query, userId, 5)

  if (searchResults.length === 0) {
    return {
      answer: null,
      message: "No relevant documentation found. Try rephrasing or contact the team.",
      sources: [],
    }
  }

  // Fetch full content for top results
  const docs = await prisma.document.findMany({
    where: { id: { in: searchResults.map(r => r.docId) } },
    select: { id: true, title: true, slug: true, content: true },
  })

  const context = docs.map(doc =>
    `[${doc.title}] (/${doc.slug})\n${doc.content.substring(0, 1500)}`
  ).join('\n\n---\n\n')

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1500,
    system: `You are a knowledgeable assistant for an internal company knowledge base.
Answer the question using ONLY the provided documents. 
Include citations like [Document Title](link) when referencing specific docs.
If the answer isn't fully covered by the docs, say so and suggest who might know.`,
    messages: [
      {
        role: 'user',
        content: `Question: ${query}\n\nDocuments:\n${context}`,
      }
    ],
  })

  const answer = response.content[0].type === 'text' ? response.content[0].text : ''

  // Log that AI was used for this search
  await prisma.searchLog.create({
    data: {
      query,
      userId,
      resultsCount: searchResults.length,
      aiUsed: true,
      wasAnswered: true,
    }
  })

  return {
    answer,
    sources: searchResults.map(r => ({ title: r.title, slug: r.slug, score: r.score })),
  }
}
```

### Step 5: Search UI with AI Mode Toggle

```tsx
// components/SearchBar.tsx — Search with semantic + AI answer modes

'use client'
import { useState } from 'react'

interface Result {
  docId: string
  title: string
  slug: string
  excerpt: string
}

export default function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [aiSources, setAiSources] = useState<any[]>([])
  const [mode, setMode] = useState<'search' | 'ask'>('search')
  const [loading, setLoading] = useState(false)

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)

    if (mode === 'search') {
      const res = await fetch(`/api/kb/search?q=${encodeURIComponent(query)}`)
      const data = await res.json()
      setResults(data.results)
      setAiAnswer(null)
    } else {
      const res = await fetch('/api/kb/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      })
      const data = await res.json()
      setAiAnswer(data.answer)
      setAiSources(data.sources || [])
      setResults([])
    }

    setLoading(false)
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Mode toggle */}
      <div className="flex gap-1 mb-3 bg-slate-100 rounded-lg p-1 w-fit">
        {(['search', 'ask'] as const).map(m => (
          <button key={m}
            onClick={() => setMode(m)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors
              ${mode === m ? 'bg-white shadow text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}>
            {m === 'search' ? '🔍 Search' : '✨ Ask AI'}
          </button>
        ))}
      </div>

      {/* Search input */}
      <div className="flex gap-2 mb-6">
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={mode === 'search' ? 'Search docs...' : 'Ask a question...'}
          className="flex-1 px-4 py-3 border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <button onClick={handleSearch} disabled={loading}
          className="px-5 py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-400 disabled:opacity-50">
          {loading ? '...' : mode === 'search' ? 'Search' : 'Ask'}
        </button>
      </div>

      {/* AI Answer */}
      {aiAnswer && (
        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-5 mb-4">
          <p className="text-xs font-semibold text-indigo-500 mb-2">✨ AI Answer</p>
          <div className="text-sm text-slate-800 whitespace-pre-wrap">{aiAnswer}</div>
          {aiSources.length > 0 && (
            <div className="mt-3 pt-3 border-t border-indigo-100">
              <p className="text-xs text-slate-400 mb-1">Sources:</p>
              {aiSources.map(s => (
                <a key={s.slug} href={`/kb/${s.slug}`}
                  className="block text-xs text-indigo-600 hover:underline">{s.title}</a>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search results */}
      {results.map(result => (
        <a key={result.docId} href={`/kb/${result.slug}`}
          className="block p-4 border rounded-xl mb-2 hover:border-indigo-300 hover:bg-indigo-50 transition-colors">
          <p className="font-semibold text-slate-900">{result.title}</p>
          <p className="text-sm text-slate-500 mt-1">{result.excerpt}</p>
        </a>
      ))}
    </div>
  )
}
```

### Step 6: Analytics — Surface Content Gaps

```typescript
// scripts/analyze-search-gaps.ts — Find unanswered queries to guide content creation

import { prisma } from '../lib/prisma'

async function analyzeGaps() {
  const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

  // Queries with zero results or no click-through
  const unanswered = await prisma.searchLog.groupBy({
    by: ['query'],
    where: {
      searchedAt: { gte: oneMonthAgo },
      OR: [{ wasAnswered: false }, { resultsCount: 0 }],
    },
    _count: { query: true },
    orderBy: { _count: { query: 'desc' } },
    take: 20,
  })

  console.log('\n=== Top Unanswered Queries (Last 30 Days) ===')
  unanswered.forEach(({ query, _count }) => {
    console.log(`[${_count.query}x] "${query}"`)
  })

  // Most viewed docs (confirm what's working)
  const topDocs = await prisma.documentView.groupBy({
    by: ['documentId'],
    where: { viewedAt: { gte: oneMonthAgo } },
    _count: { documentId: true },
    orderBy: { _count: { documentId: 'desc' } },
    take: 10,
  })

  const docs = await prisma.document.findMany({
    where: { id: { in: topDocs.map(d => d.documentId) } },
    select: { id: true, title: true },
  })

  console.log('\n=== Most Viewed Docs ===')
  topDocs.forEach(({ documentId, _count }) => {
    const doc = docs.find(d => d.id === documentId)
    console.log(`[${_count.documentId} views] ${doc?.title}`)
  })
}

analyzeGaps()
```

## Real-World Example

An engineering team of 22 people has 340 Confluence pages, of which maybe 60 are up to date and actually useful. They migrate the good ones to markdown in a Git repo (one sprint), deploy this knowledge base, and add the AI search. In week one, the most common searches are "deploy process", "how to add a feature flag", and "database migration guide" — all of which exist but were unsearchable before.

After a month, the gap analysis shows the top unanswered query is "what's our on-call rotation?" — a doc that doesn't exist yet. It gets written in an afternoon. New hires consistently rate knowledge base discoverability as the biggest improvement to their first 30 days.

## Related Skills

- [langchain](../skills/langchain/) — Document loading, chunking, embeddings, and vector stores
- [prisma](../skills/prisma/) — Document management, permissions, and analytics
