---
name: orama
description: Full-text search engine that runs in the browser and Node.js with vector search, faceting, and real-time capabilities
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - orama
    - client-side-search
    - browser
    - javascript
    - full-text-search
    - vector-search
    - real-time
---

# Orama - Client-Side Search Engine

Build fast, full-text search experiences that run entirely in the browser or Node.js with Orama's advanced search capabilities, vector search, and real-time indexing.

## Overview

Orama is a full-text and vector search engine that runs entirely on the client-side, offering instant search experiences without server round-trips. It provides advanced features like vector search, faceting, and real-time indexing while being incredibly lightweight and fast.

Key features:
- **Client-side execution**: Runs entirely in browser or Node.js
- **Full-text search**: Advanced text search with stemming and fuzzy matching
- **Vector search**: Semantic similarity search with embeddings
- **Real-time indexing**: Dynamic updates without rebuilding the entire index
- **Faceted search**: Dynamic filtering and categorization
- **Lightweight**: Small bundle size with tree-shaking support

## Instructions

### Step 1: Installation and Basic Setup

```bash
# Install Orama
npm install @orama/orama

# For vector search capabilities
npm install @orama/plugin-embeddings

# For additional features
npm install @orama/plugin-analytics
npm install @orama/plugin-data-persistence
```

```javascript
// Advanced Orama setup
import { create, insert, search } from '@orama/orama'
import { pluginEmbeddings } from '@orama/plugin-embeddings'

class AdvancedOramaManager {
  constructor() {
    this.db = null
  }

  async createAdvancedIndex() {
    // Define comprehensive schema
    const schema = {
      id: 'string',
      title: 'string',
      content: 'string',
      category: 'enum',
      tags: 'string[]',
      author: 'string',
      rating: 'number',
      publishDate: 'string',
      wordCount: 'number',
      
      // Vector field for semantic search
      titleEmbedding: 'vector[384]',
      contentEmbedding: 'vector[384]',
      
      // Geographic data
      location: {
        lat: 'number',
        lng: 'number',
        city: 'string',
        country: 'string'
      }
    }

    // Create database with plugins
    this.db = await create({
      schema,
      plugins: [
        pluginEmbeddings({
          embeddings: {
            model: '@orama/plugin-embeddings/models/gte-small'
          }
        })
      ],
      
      components: {
        tokenizer: {
          stemming: true,
          stopWords: ['the', 'a', 'an', 'and', 'or', 'but'],
          language: 'english'
        },
        index: {
          prefix: true,
          exact: true,
          tolerance: 2
        }
      }
    })

    console.log('✅ Advanced Orama index created')
    return this.db
  }

  async insertDocumentsWithEmbeddings(documents) {
    const results = []
    
    for (const doc of documents) {
      try {
        const processedDoc = {
          ...doc,
          id: doc.id || this.generateId(),
          wordCount: doc.content ? doc.content.split(' ').length : 0,
          publishDate: doc.publishDate || new Date().toISOString(),
          
          // Auto-generate embeddings if not provided
          titleEmbedding: doc.titleEmbedding || await this.generateEmbedding(doc.title || ''),
          contentEmbedding: doc.contentEmbedding || await this.generateEmbedding(doc.content || '')
        }

        const insertResult = await insert(this.db, processedDoc)
        results.push({ id: processedDoc.id, success: true })
        
      } catch (error) {
        console.error(`Error inserting document ${doc.id}:`, error)
        results.push({ id: doc.id || 'unknown', success: false, error: error.message })
      }
    }

    console.log(`✅ Inserted ${results.filter(r => r.success).length}/${results.length} documents`)
    return results
  }

  generateId() {
    return Math.random().toString(36).substr(2, 9)
  }

  async generateEmbedding(text) {
    // Mock embedding generation
    if (!text || text.length === 0) {
      return new Array(384).fill(0)
    }
    
    const embedding = new Array(384).fill(0)
    for (let i = 0; i < text.length && i < 384; i++) {
      embedding[i] = (text.charCodeAt(i) % 100) / 100
    }
    return embedding
  }
}

// Usage
const oramaManager = new AdvancedOramaManager()
await oramaManager.createAdvancedIndex()

const sampleDocuments = [
  {
    id: '1',
    title: 'Introduction to Vector Databases',
    content: 'Vector databases are specialized systems designed for storing and querying high-dimensional vectors.',
    category: 'technology',
    tags: ['vector-db', 'ai', 'search'],
    author: 'Jane Smith',
    rating: 4.8,
    location: { lat: 37.7749, lng: -122.4194, city: 'San Francisco', country: 'US' }
  }
]

await oramaManager.insertDocumentsWithEmbeddings(sampleDocuments)
```

### Step 2: Advanced Search Implementation

```javascript
// Advanced search capabilities
class OramaSearchEngine {
  constructor(oramaManager) {
    this.db = oramaManager.db
  }

  async fullTextSearch(query, options = {}) {
    const searchParams = {
      term: query,
      properties: ['title', 'content', 'author', 'tags'],
      boost: {
        title: 3,
        content: 1,
        author: 2,
        tags: 2.5
      },
      tolerance: options.tolerance || 1,
      limit: options.limit || 10,
      offset: options.offset || 0,
      
      where: options.where || {},
      facets: options.facets || {},
      sortBy: options.sortBy || 'rating:desc',
      
      highlight: {
        fields: ['title', 'content'],
        options: {
          pre: '<mark>',
          post: '</mark>'
        }
      }
    }

    try {
      const results = await search(this.db, searchParams)
      
      return {
        query: query,
        searchType: 'fullText',
        totalHits: results.count,
        processingTime: results.elapsed.formatted,
        results: results.hits.map(hit => ({
          id: hit.id,
          score: hit.score,
          document: hit.document,
          highlights: this.extractHighlights(hit),
          relevanceCategory: this.categorizeRelevance(hit.score)
        })),
        facets: results.facets || {},
        suggestions: await this.generateSuggestions(query, results)
      }
      
    } catch (error) {
      console.error('Full-text search error:', error)
      return { error: error.message, results: [] }
    }
  }

  async geospatialSearch(query, centerLat, centerLng, radiusKm, options = {}) {
    const geoFilter = (doc) => {
      if (!doc.location || !doc.location.lat || !doc.location.lng) {
        return false
      }
      
      const distance = this.calculateDistance(
        centerLat, centerLng,
        doc.location.lat, doc.location.lng
      )
      
      return distance <= radiusKm
    }

    const searchOptions = {
      term: query,
      properties: ['title', 'content'],
      where: (doc) => geoFilter(doc),
      limit: options.limit || 10
    }

    const results = await search(this.db, searchOptions)

    const resultsWithDistance = results.hits.map(hit => {
      const distance = this.calculateDistance(
        centerLat, centerLng,
        hit.document.location.lat,
        hit.document.location.lng
      )
      
      return {
        ...hit,
        distance: Math.round(distance * 100) / 100
      }
    })

    resultsWithDistance.sort((a, b) => a.distance - b.distance)

    return {
      query: query,
      searchType: 'geospatial',
      center: { lat: centerLat, lng: centerLng },
      radius: radiusKm,
      results: resultsWithDistance
    }
  }

  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371 // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180
    const dLng = (lng2 - lng1) * Math.PI / 180
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2)
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
    return R * c
  }

  extractHighlights(hit) {
    const highlights = {}
    
    if (hit.document.title && hit.highlights && hit.highlights.title) {
      highlights.title = hit.highlights.title
    }
    
    if (hit.document.content && hit.highlights && hit.highlights.content) {
      highlights.content = hit.highlights.content
    }
    
    return highlights
  }

  categorizeRelevance(score) {
    if (score >= 0.8) return 'high'
    if (score >= 0.5) return 'medium'
    if (score >= 0.2) return 'low'
    return 'very_low'
  }

  async generateSuggestions(query, searchResults) {
    if (searchResults.totalHits === 0) {
      return ['Try different keywords', 'Check spelling', 'Use broader terms']
    }
    
    const suggestions = []
    const topResults = searchResults.results.slice(0, 3)
    
    topResults.forEach(result => {
      if (result.document.tags) {
        result.document.tags.forEach(tag => {
          if (!query.toLowerCase().includes(tag.toLowerCase())) {
            suggestions.push(`${query} ${tag}`)
          }
        })
      }
    })
    
    return suggestions.slice(0, 3)
  }
}

// Usage
const searchEngine = new OramaSearchEngine(oramaManager)

// Full-text search
const textResults = await searchEngine.fullTextSearch('vector database', {
  tolerance: 1,
  limit: 5,
  facets: { category: {}, rating: {} }
})

// Geospatial search
const geoResults = await searchEngine.geospatialSearch(
  'technology',
  37.7749, -122.4194, // San Francisco coordinates
  50, // 50km radius
  { limit: 5 }
)

console.log(`Text search found ${textResults.totalHits} results`)
console.log(`Geo search found ${geoResults.results.length} results`)
```

## Guidelines

**Index Design:**
- Design comprehensive schemas with appropriate data types
- Use enums for categorical data to improve search performance
- Plan vector dimensions based on your embedding models
- Include computed fields for better filtering

**Performance Optimization:**
- Use appropriate tolerance levels for fuzzy matching (1-2 for most cases)
- Implement proper stemming and stop words for your language
- Use prefix search for autocomplete functionality
- Consider index size vs search accuracy trade-offs

**Client-Side Architecture:**
- Implement proper data loading strategies (lazy loading, chunking)
- Use Web Workers for heavy indexing operations
- Implement proper caching strategies for repeated searches
- Consider memory usage with large datasets