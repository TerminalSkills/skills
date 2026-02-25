---
title: Add Instant Search to Your App
slug: add-instant-search-to-your-app
description: >-
  A SaaS startup needs to replace their slow SQL LIKE queries with real search.
  They deploy Meilisearch, build a sync pipeline from PostgreSQL, and add an
  instant search UI with faceted filtering — going from 2-second queries to
  sub-50ms results with typo tolerance and category filters.
skills:
  - meilisearch
  - postgresql
  - nextjs
category: development
tags:
  - search
  - meilisearch
  - full-text
  - autocomplete
  - performance
---

# Add Instant Search to Your App

Dani runs the backend for a SaaS knowledge base product. The app stores 50,000+ articles across hundreds of customer workspaces. Currently, search is a PostgreSQL `ILIKE '%query%'` query — it takes 2-3 seconds, misses typos entirely, and can't filter by category or date range from the search bar. Users complain constantly.

Dani decides to add Meilisearch — a dedicated search engine that handles typo tolerance, instant results, and faceted filtering out of the box. The plan: keep PostgreSQL as the source of truth, sync articles to Meilisearch on write, and point the frontend search bar at Meilisearch's API.

## Step 1: Deploy Meilisearch

Dani adds Meilisearch to the existing Docker Compose stack. It runs alongside PostgreSQL and the Next.js app.

```yaml
# docker-compose.yml — Add Meilisearch service to existing stack
# Meilisearch stores its index on a volume for persistence across restarts

services:
  meilisearch:
    image: getmeili/meilisearch:latest
    ports:
      - "7700:7700"
    volumes:
      - meili_data:/meili_data
    environment:
      # Master key gates all write operations — generate a strong one
      MEILI_MASTER_KEY: ${MEILI_MASTER_KEY}
      MEILI_ENV: production        # disables the web dashboard
      MEILI_MAX_INDEXING_MEMORY: 1Gb

volumes:
  meili_data:
```

The master key protects write access. Dani generates API keys (one for indexing, one for search-only) from the master key — the search key goes to the frontend, the admin key stays server-side.

## Step 2: Configure the Index

Before syncing data, Dani configures which fields are searchable, filterable, and sortable. This tells Meilisearch how to build its index.

```javascript
// scripts/configure-search.js — Set up index schema and ranking rules
// Run once on initial setup, or whenever the schema changes

import { MeiliSearch } from 'meilisearch'

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_URL || 'http://localhost:7700',
  apiKey: process.env.MEILI_MASTER_KEY,
})

async function configureIndex() {
  const index = client.index('articles')

  // Searchable attributes — order matters: title matches rank higher than body
  await index.updateSearchableAttributes([
    'title',
    'summary',
    'body',
    'author_name',
    'tags',
  ])

  // Filterable attributes — powers the sidebar filters and tenant isolation
  await index.updateFilterableAttributes([
    'workspace_id',      // multi-tenancy: each customer sees only their articles
    'category',
    'status',            // published, draft, archived
    'created_at',
    'tags',
  ])

  // Sortable — users can sort by date or relevancy
  await index.updateSortableAttributes(['created_at', 'updated_at', 'title'])

  // Synonyms — domain-specific terms
  await index.updateSynonyms({
    'k8s': ['kubernetes'],
    'js': ['javascript'],
    'ts': ['typescript'],
    'db': ['database'],
    'api': ['endpoint', 'route'],
  })

  // Typo tolerance — disable for tags (exact match expected)
  await index.updateTypoTolerance({
    enabled: true,
    disableOnAttributes: ['tags', 'workspace_id'],
    minWordSizeForTypos: { oneTypo: 4, twoTypos: 8 },
  })

  console.log('Index configured')
}

configureIndex()
```

The attribute order in `searchableAttributes` is intentional — Meilisearch weights matches in earlier attributes higher. A title match for "kubernetes" ranks above a body match.

## Step 3: Build the Sync Pipeline

Dani needs to keep Meilisearch in sync with PostgreSQL. The approach: sync on every create/update/delete, plus a nightly full re-index as a safety net.

```javascript
// lib/search-sync.js — Sync articles from PostgreSQL to Meilisearch
// Called from API routes on article create/update/delete

import { MeiliSearch } from 'meilisearch'

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_URL,
  apiKey: process.env.MEILI_ADMIN_KEY,    // admin key, not master key
})

const articlesIndex = client.index('articles')

export async function indexArticle(article) {
  /**
   * Index a single article in Meilisearch.
   * Meilisearch upserts by primary key — safe to call on both create and update.
   *
   * Args:
   *   article: Article object from the database
   */
  await articlesIndex.addDocuments([{
    id: article.id,
    title: article.title,
    summary: article.summary,
    body: article.body,
    author_name: article.author?.name,
    category: article.category,
    tags: article.tags,                    // array of strings
    workspace_id: article.workspace_id,
    status: article.status,
    created_at: article.created_at,        // ISO timestamp for sorting
    updated_at: article.updated_at,
  }])
}

export async function removeArticle(articleId) {
  await articlesIndex.deleteDocument(articleId)
}

export async function fullReindex(db) {
  /**
   * Full re-index: reads all published articles from PostgreSQL and
   * replaces the entire Meilisearch index. Run nightly as a safety net.
   */
  const articles = await db.query(`
    SELECT id, title, summary, body, category, tags, workspace_id,
           status, created_at, updated_at, author_name
    FROM articles
    WHERE status = 'published'
  `)

  // addDocuments in batches of 1000 to avoid memory spikes
  const BATCH_SIZE = 1000
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE)
    await articlesIndex.addDocuments(batch)
    console.log(`Indexed ${Math.min(i + BATCH_SIZE, articles.length)}/${articles.length}`)
  }

  console.log(`Full reindex complete: ${articles.length} articles`)
}
```

The real-time sync calls `indexArticle` from the API route handlers. The nightly `fullReindex` catches anything that slipped through — maybe a direct database migration or a failed webhook. Belt and suspenders.

## Step 4: Add the Search API Endpoint

Dani wraps the Meilisearch query in a Next.js API route that handles tenant isolation — each workspace can only search their own articles.

```typescript
// app/api/search/route.ts — Search endpoint with workspace isolation
// The workspace_id filter ensures multi-tenant data separation

import { MeiliSearch } from 'meilisearch'
import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'

const client = new MeiliSearch({
  host: process.env.MEILISEARCH_URL!,
  apiKey: process.env.MEILI_SEARCH_KEY!,    // search-only key
})

export async function GET(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const query = req.nextUrl.searchParams.get('q') || ''
  const category = req.nextUrl.searchParams.get('category')
  const page = parseInt(req.nextUrl.searchParams.get('page') || '1')
  const limit = 20

  // Build filter array — always include workspace isolation
  const filters: string[] = [
    `workspace_id = "${session.workspaceId}"`,
    'status = "published"',
  ]
  if (category) filters.push(`category = "${category}"`)

  const results = await client.index('articles').search(query, {
    filter: filters,
    limit,
    offset: (page - 1) * limit,
    sort: query ? undefined : ['updated_at:desc'],    // sort by date when no query
    attributesToHighlight: ['title', 'summary'],
    attributesToCrop: ['body'],
    cropLength: 150,
    facets: ['category', 'tags'],
  })

  return NextResponse.json({
    hits: results.hits,
    total: results.estimatedTotalHits,
    facets: results.facetDistribution,
    processingTimeMs: results.processingTimeMs,
  })
}
```

The `workspace_id` filter is the security boundary — without it, users could see articles from other customers. Meilisearch applies this filter before ranking, so it's as fast as searching a single-tenant index.

## Step 5: Build the Search UI

The frontend uses a debounced search input that calls the API as the user types. Results appear instantly with highlighted matches.

```tsx
// components/SearchBar.tsx — Instant search component with debounce
// Shows results in a dropdown as the user types, with category facets

'use client'
import { useState, useEffect, useCallback } from 'react'

interface SearchResult {
  id: string
  title: string
  summary: string
  category: string
  _formatted: { title: string; summary: string }    // highlighted versions
}

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [facets, setFacets] = useState<Record<string, Record<string, number>>>({})
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  const search = useCallback(async (q: string, category: string | null) => {
    if (!q && !category) {
      setResults([])
      return
    }

    const params = new URLSearchParams({ q })
    if (category) params.set('category', category)

    const res = await fetch(`/api/search?${params}`)
    const data = await res.json()

    setResults(data.hits)
    setFacets(data.facets || {})
  }, [])

  // Debounce: wait 200ms after the user stops typing before searching
  useEffect(() => {
    const timer = setTimeout(() => search(query, activeCategory), 200)
    return () => clearTimeout(timer)
  }, [query, activeCategory, search])

  return (
    <div className="relative w-full max-w-2xl">
      <input
        type="text"
        placeholder="Search articles... (typos OK)"
        value={query}
        onChange={e => { setQuery(e.target.value); setIsOpen(true) }}
        onFocus={() => setIsOpen(true)}
        className="w-full px-4 py-3 border rounded-lg text-lg"
      />

      {isOpen && results.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-white border rounded-lg shadow-xl z-50 max-h-96 overflow-auto">
          {/* Category facets */}
          {facets.category && (
            <div className="flex gap-2 p-3 border-b">
              <button
                onClick={() => setActiveCategory(null)}
                className={!activeCategory ? 'font-bold' : 'text-gray-500'}
              >
                All
              </button>
              {Object.entries(facets.category).map(([cat, count]) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={activeCategory === cat ? 'font-bold' : 'text-gray-500'}
                >
                  {cat} ({count})
                </button>
              ))}
            </div>
          )}

          {/* Search results with highlighting */}
          {results.map(hit => (
            <a key={hit.id} href={`/articles/${hit.id}`} className="block p-3 hover:bg-gray-50">
              <h4
                className="font-medium"
                dangerouslySetInnerHTML={{ __html: hit._formatted.title }}
              />
              <p
                className="text-sm text-gray-600 mt-1"
                dangerouslySetInnerHTML={{ __html: hit._formatted.summary }}
              />
              <span className="text-xs text-gray-400">{hit.category}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
```

The 200ms debounce prevents hammering the API on every keystroke while still feeling instant. Meilisearch typically responds in under 50ms, so the total time from typing to results is about 250ms — fast enough that users perceive it as instant.

The `_formatted` fields contain HTML with `<em>` tags around matched terms. Using `dangerouslySetInnerHTML` is safe here because Meilisearch only adds `<em>` tags — it doesn't pass through user HTML.

After deploying, search queries that used to take 2-3 seconds via PostgreSQL `ILIKE` now return in under 50ms. Users can find articles even with typos ("kuberntes" matches "kubernetes"), filter by category without a separate page load, and see highlighted matches that tell them exactly why a result appeared.
