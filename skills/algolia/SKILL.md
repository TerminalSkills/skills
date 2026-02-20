---
name: algolia
description: Search-as-a-service with Algolia for instant search, faceting, personalization, and analytics
license: Apache-2.0
metadata:
  author: terminal-skills
  version: 1.0.0
  category: search
  tags:
    - algolia
    - search-as-a-service
    - instant-search
    - faceting
    - personalization
    - analytics
---

# Algolia - Search-as-a-Service

Build lightning-fast search experiences with Algolia's hosted search service, featuring instant search, advanced faceting, personalization, and comprehensive analytics.

## Overview

Algolia is a hosted search API that delivers instant search experiences. It provides powerful features like typo tolerance, faceting, geo-search, personalization, and A/B testing, all through a simple API that scales automatically.

Key features:
- **Instant search**: Sub-millisecond response times with global CDN
- **Advanced relevance**: Machine learning-powered ranking and personalization
- **Rich UI components**: Pre-built search interfaces for web and mobile
- **Analytics**: Detailed search analytics and A/B testing capabilities
- **Multi-language**: Support for 60+ languages with advanced tokenization
- **Scalability**: Handles millions of queries per second automatically

## Instructions

### Step 1: Setup and Index Configuration

```javascript
// algolia-setup.js
import { algoliasearch } from 'algoliasearch'
import fs from 'fs'
import csv from 'csv-parser'

class AlgoliaManager {
  constructor(appId, adminApiKey) {
    this.client = algoliasearch(appId, adminApiKey)
    this.indices = new Map()
  }

  async createAdvancedIndex(indexName, settings = {}) {
    const index = this.client.initIndex(indexName)
    
    // Advanced index settings
    const defaultSettings = {
      // Search configuration
      searchableAttributes: [
        'unordered(title)',
        'unordered(description)',
        'unordered(brand)',
        'category',
        'tags'
      ],
      
      // Faceting and filtering
      attributesForFaceting: [
        'searchable(brand)',
        'searchable(category)', 
        'price',
        'rating',
        'availability',
        'filterOnly(created_at)'
      ],
      
      // Ranking and relevance
      ranking: [
        'typo',
        'geo',
        'words', 
        'filters',
        'proximity',
        'attribute',
        'exact',
        'custom'
      ],
      
      customRanking: [
        'desc(popularity_score)',
        'desc(rating)',
        'asc(price)'
      ],
      
      // Typo tolerance
      typoTolerance: {
        minWordSizefor1Typo: 4,
        minWordSizefor2Typos: 8,
        disableOnWords: ['brand', 'model'],
        disableOnAttributes: ['sku', 'id']
      },
      
      // Highlighting and snippeting
      attributesToHighlight: ['title', 'description'],
      attributesToSnippet: ['description:50'],
      highlightPreTag: '<mark>',
      highlightPostTag: '</mark>',
      
      // Performance
      hitsPerPage: 20,
      maxValuesPerFacet: 100,
      
      // Languages and locales
      queryLanguages: ['en', 'es', 'fr', 'de'],
      
      // Advanced features
      enableReRanking: true,
      reRankingApplyFilter: true
    }
    
    const finalSettings = { ...defaultSettings, ...settings }
    
    try {
      await index.setSettings(finalSettings)
      this.indices.set(indexName, index)
      console.log(`✅ Created index "${indexName}" with advanced settings`)
      return index
    } catch (error) {
      console.error(`❌ Failed to create index "${indexName}":`, error)
      throw error
    }
  }

  async indexDocuments(indexName, documents, options = {}) {
    if (!this.indices.has(indexName)) {
      throw new Error(`Index "${indexName}" not found. Create it first.`)
    }
    
    const index = this.indices.get(indexName)
    const batchSize = options.batchSize || 1000
    
    console.log(`📊 Indexing ${documents.length} documents to "${indexName}"`)
    
    try {
      // Process in batches
      const results = []
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize)
        
        // Enhance documents with computed fields
        const enhancedBatch = batch.map(doc => ({
          ...doc,
          objectID: doc.objectID || doc.id || `${Date.now()}-${Math.random()}`,
          _tags: doc.tags || [],
          popularity_score: doc.popularity_score || this.calculatePopularityScore(doc),
          price_range: this.categorizePrice(doc.price),
          indexed_at: Math.floor(Date.now() / 1000)
        }))
        
        const response = await index.saveObjects(enhancedBatch)
        results.push(response)
        
        console.log(`✅ Indexed batch ${Math.floor(i/batchSize) + 1}: ${batch.length} documents`)
      }
      
      console.log(`🎉 Successfully indexed ${documents.length} documents`)
      return results
      
    } catch (error) {
      console.error('❌ Indexing failed:', error)
      throw error
    }
  }

  calculatePopularityScore(doc) {
    // Simple popularity scoring algorithm
    let score = 0
    
    // Rating contribution (0-5 scale to 0-50 points)
    if (doc.rating) {
      score += doc.rating * 10
    }
    
    // Reviews count contribution (logarithmic scale)
    if (doc.review_count) {
      score += Math.log(doc.review_count + 1) * 5
    }
    
    // Sales/views contribution
    if (doc.sales_count) {
      score += Math.log(doc.sales_count + 1) * 3
    }
    
    // Recency boost (newer items get slight boost)
    if (doc.created_at) {
      const daysSinceCreated = (Date.now() - new Date(doc.created_at)) / (1000 * 60 * 60 * 24)
      const recencyBoost = Math.max(0, 10 - daysSinceCreated / 30)
      score += recencyBoost
    }
    
    return Math.round(score)
  }

  categorizePrice(price) {
    if (!price || price <= 0) return 'unknown'
    if (price < 25) return 'budget'
    if (price < 100) return 'affordable'  
    if (price < 500) return 'mid-range'
    if (price < 1000) return 'premium'
    return 'luxury'
  }

  // Load sample e-commerce data
  async loadSampleData() {
    return [
      {
        id: 'prod-001',
        title: 'Wireless Bluetooth Headphones',
        description: 'Premium noise-canceling wireless headphones with 30-hour battery life and superior sound quality.',
        brand: 'AudioTech',
        category: 'Electronics > Audio > Headphones',
        price: 199.99,
        rating: 4.5,
        review_count: 1247,
        tags: ['wireless', 'bluetooth', 'noise-canceling', 'premium'],
        availability: 'in_stock',
        created_at: '2024-01-15T10:00:00Z',
        _geoloc: { lat: 40.7128, lng: -74.0060 }
      },
      {
        id: 'prod-002', 
        title: 'Gaming Mechanical Keyboard',
        description: 'RGB backlit mechanical keyboard with Cherry MX switches, perfect for gaming and productivity.',
        brand: 'GameGear',
        category: 'Electronics > Computers > Keyboards',
        price: 149.99,
        rating: 4.7,
        review_count: 892,
        tags: ['gaming', 'mechanical', 'rgb', 'keyboard'],
        availability: 'in_stock',
        created_at: '2024-02-01T14:30:00Z'
      }
    ]
  }
}

// Usage example
const algoliaManager = new AlgoliaManager(
  'YOUR_APP_ID',
  'YOUR_ADMIN_API_KEY'
)

// Create advanced product index
await algoliaManager.createAdvancedIndex('products', {
  // Custom settings for products
  attributesForFaceting: [
    'searchable(brand)',
    'searchable(category)',
    'price',
    'rating', 
    'availability',
    'tags'
  ]
})

// Load and index sample data
const sampleData = await algoliaManager.loadSampleData()
await algoliaManager.indexDocuments('products', sampleData)
```

### Step 2: Advanced Search Implementation

```javascript
// algolia-search.js
import { algoliasearch } from 'algoliasearch'

class AlgoliaSearch {
  constructor(appId, searchApiKey) {
    this.client = algoliasearch(appId, searchApiKey)
  }

  async search(indexName, query, options = {}) {
    const index = this.client.initIndex(indexName)
    
    const searchParams = {
      query: query,
      hitsPerPage: options.hitsPerPage || 20,
      page: options.page || 0,
      
      // Faceting
      facets: options.facets || ['brand', 'category', 'price_range', 'rating'],
      maxValuesPerFacet: options.maxValuesPerFacet || 10,
      
      // Filtering
      filters: options.filters || '',
      numericFilters: options.numericFilters || [],
      
      // Highlighting and snippeting  
      attributesToHighlight: options.attributesToHighlight || ['title', 'description'],
      attributesToSnippet: options.attributesToSnippet || ['description:50'],
      
      // Geographic search
      ...(options.location && {
        aroundLatLng: `${options.location.lat},${options.location.lng}`,
        aroundRadius: options.location.radius || 10000
      }),
      
      // Analytics
      clickAnalytics: true,
      analytics: true,
      analyticsTags: options.analyticsTags || []
    }

    try {
      const results = await index.search(searchParams)
      
      // Enhance results with additional processing
      return {
        ...results,
        processedFacets: this.processFacets(results.facets),
        searchMetadata: {
          query: query,
          processingTimeMS: results.processingTimeMS,
          totalHits: results.nbHits,
          page: results.page,
          hasMore: (results.page + 1) * results.hitsPerPage < results.nbHits
        }
      }
      
    } catch (error) {
      console.error('Search failed:', error)
      throw error
    }
  }

  processFacets(facets) {
    if (!facets) return {}
    
    const processed = {}
    
    Object.entries(facets).forEach(([key, values]) => {
      processed[key] = {
        displayName: this.getFacetDisplayName(key),
        type: this.getFacetType(key),
        values: Object.entries(values)
          .map(([value, count]) => ({
            value,
            count,
            displayValue: this.formatFacetValue(key, value)
          }))
          .sort((a, b) => b.count - a.count)
      }
    })
    
    return processed
  }

  getFacetDisplayName(facetKey) {
    const displayNames = {
      'brand': 'Brand',
      'category': 'Category',
      'price_range': 'Price Range',
      'rating': 'Rating',
      'availability': 'Availability'
    }
    return displayNames[facetKey] || facetKey
  }

  getFacetType(facetKey) {
    const types = {
      'brand': 'list',
      'category': 'hierarchical',
      'price_range': 'list',
      'rating': 'rating',
      'availability': 'list'
    }
    return types[facetKey] || 'list'
  }

  formatFacetValue(facetKey, value) {
    if (facetKey === 'price_range') {
      const ranges = {
        'budget': 'Under $25',
        'affordable': '$25 - $100', 
        'mid-range': '$100 - $500',
        'premium': '$500 - $1000',
        'luxury': 'Over $1000'
      }
      return ranges[value] || value
    }
    
    if (facetKey === 'availability') {
      return value === 'in_stock' ? 'In Stock' : 'Out of Stock'
    }
    
    return value
  }

  // Advanced search with multiple strategies
  async multiSearch(queries) {
    try {
      const results = await this.client.multipleQueries(queries)
      return results.results
    } catch (error) {
      console.error('Multi-search failed:', error)
      throw error
    }
  }

  // Personalized search
  async personalizedSearch(indexName, query, userToken, options = {}) {
    const index = this.client.initIndex(indexName)
    
    const searchParams = {
      ...options,
      query,
      userToken,
      enablePersonalization: true,
      personalizationImpact: options.personalizationImpact || 95
    }

    return await index.search(searchParams)
  }

  // Search with A/B testing
  async searchWithABTest(indexName, query, abTestID, abTestVariant, options = {}) {
    const searchParams = {
      ...options,
      query,
      // A/B test headers
      headers: {
        'X-Algolia-Analytics-Tags': [`abtest:${abTestID}:${abTestVariant}`]
      }
    }

    const index = this.client.initIndex(indexName)
    return await index.search(searchParams)
  }
}

// Usage examples
const searchClient = new AlgoliaSearch('YOUR_APP_ID', 'YOUR_SEARCH_API_KEY')

// Basic search with faceting
const searchResults = await searchClient.search('products', 'wireless headphones', {
  facets: ['brand', 'price_range', 'rating'],
  filters: 'availability:in_stock',
  hitsPerPage: 12
})

// Geographic search
const geoResults = await searchClient.search('products', 'electronics', {
  location: {
    lat: 40.7128,
    lng: -74.0060,
    radius: 5000 // 5km radius
  }
})

// Multi-search for different categories
const multiResults = await searchClient.multiSearch([
  { indexName: 'products', query: 'laptop', params: { hitsPerPage: 5, filters: 'category:computers' }},
  { indexName: 'products', query: 'laptop', params: { hitsPerPage: 5, filters: 'category:accessories' }}
])

console.log(`Found ${searchResults.nbHits} products`)
```

### Step 3: Analytics and Insights Implementation

```javascript
// algolia-analytics.js
import aa from 'search-insights'

class AlgoliaAnalytics {
  constructor(appId, apiKey) {
    // Initialize search insights
    aa('init', {
      appId: appId,
      apiKey: apiKey,
      useCookie: true
    })
    
    this.userId = null
    this.userToken = null
  }

  // Set user context
  setUser(userId, userToken) {
    this.userId = userId
    this.userToken = userToken
    
    aa('setUserToken', userToken)
  }

  // Track search events
  trackSearch(indexName, query, filters, results) {
    aa('clickedObjectIDsAfterSearch', {
      index: indexName,
      eventName: 'search',
      queryID: results.queryID,
      objectIDs: results.hits.slice(0, 20).map(hit => hit.objectID),
      positions: results.hits.slice(0, 20).map((_, index) => index + 1),
      filters: filters
    })
  }

  // Track click events
  trackClick(indexName, objectID, position, query, queryID) {
    aa('clickedObjectIDsAfterSearch', {
      index: indexName,
      eventName: 'click',
      queryID: queryID,
      objectIDs: [objectID],
      positions: [position],
      userToken: this.userToken
    })
  }

  // Track conversions
  trackConversion(indexName, objectID, query, queryID) {
    aa('convertedObjectIDsAfterSearch', {
      index: indexName,
      eventName: 'conversion',
      queryID: queryID,
      objectIDs: [objectID],
      userToken: this.userToken
    })
  }

  // Track custom events
  trackCustomEvent(eventName, indexName, objectIDs, metadata = {}) {
    aa('sendEvents', [{
      eventType: 'click',
      eventName: eventName,
      index: indexName,
      objectIDs: objectIDs,
      userToken: this.userToken,
      timestamp: Date.now(),
      ...metadata
    }])
  }
}

// Usage
const analytics = new AlgoliaAnalytics('YOUR_APP_ID', 'YOUR_SEARCH_API_KEY')

// Set user context
analytics.setUser('user123', 'anonymous-token-456')

// Example: Track search and subsequent click
const results = await searchClient.search('products', 'wireless headphones')
analytics.trackSearch('products', 'wireless headphones', '', results)

// When user clicks on a result
analytics.trackClick('products', 'prod-001', 1, 'wireless headphones', results.queryID)

// When user makes a purchase
analytics.trackConversion('products', 'prod-001', 'wireless headphones', results.queryID)
```

## Guidelines

**Index Design:**
- Structure searchable attributes by importance (most important first)
- Use appropriate faceting attributes for your filtering needs
- Configure custom ranking to match your business priorities
- Test different typo tolerance settings with your content

**Search Optimization:**
- Implement proper query preprocessing (stop words, stemming)
- Use geographic search for location-aware applications
- Configure appropriate snippet lengths for your UI
- Monitor search performance and adjust ranking rules

**User Experience:**
- Implement instant search with proper debouncing
- Show relevant facets based on current search context
- Provide search suggestions and query completions
- Handle empty states and search refinements gracefully

**Analytics & Monitoring:**
- Track all search interactions for optimization
- Monitor search performance and success metrics
- Set up A/B tests for ranking improvements
- Use personalization to improve relevance over time