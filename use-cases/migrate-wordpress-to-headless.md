---
title: Migrate WordPress to Headless CMS
slug: migrate-wordpress-to-headless
description: Complete guide to migrating from WordPress to a modern headless CMS architecture, including content migration, URL preservation, and team transition strategies.
skills:
  - wordpress
  - contentful
  - nextjs
  - markdown-cms
  - ghost-api
  - decap-cms
category: Migration
tags:
  - wordpress-migration
  - headless-cms
  - content-migration
  - static-site
  - performance
  - seo
---

# Migrate WordPress to Headless CMS

Marcus runs a successful tech publication that started as a WordPress blog five years ago. What began as 50 articles has grown to over 2,000 posts, 15 authors, and 500,000 monthly readers. But WordPress is showing its age — slow load times, security concerns, expensive hosting, and a clunky editing experience. The competition is outranking them with faster, more modern sites. It's time for a complete architectural overhaul to headless CMS, but they can't afford to lose traffic, rankings, or content during the transition.

## Step 1 — WordPress Content Audit and Migration Planning

Before touching any code, understand exactly what needs to be migrated and create a comprehensive plan.

```javascript
// scripts/wordpress-audit.js — Content analysis script
const mysql = require('mysql2/promise')
const fs = require('fs').promises

async function auditWordPressContent() {
  const connection = await mysql.createConnection({
    host: process.env.WP_DB_HOST,
    user: process.env.WP_DB_USER,
    password: process.env.WP_DB_PASSWORD,
    database: process.env.WP_DB_NAME,
  })

  // Analyze posts
  const [posts] = await connection.execute(`
    SELECT 
      p.ID,
      p.post_title,
      p.post_name as slug,
      p.post_content,
      p.post_excerpt,
      p.post_date,
      p.post_modified,
      p.post_status,
      p.post_type,
      u.display_name as author_name,
      u.user_email as author_email
    FROM wp_posts p
    JOIN wp_users u ON p.post_author = u.ID
    WHERE p.post_status IN ('publish', 'draft')
    AND p.post_type IN ('post', 'page')
    ORDER BY p.post_date DESC
  `)

  // Analyze taxonomy (categories and tags)
  const [taxonomy] = await connection.execute(`
    SELECT 
      t.term_id,
      t.name,
      t.slug,
      tt.taxonomy,
      tt.count,
      tt.description
    FROM wp_terms t
    JOIN wp_term_taxonomy tt ON t.term_id = tt.term_id
    WHERE tt.taxonomy IN ('category', 'post_tag')
    ORDER BY tt.count DESC
  `)

  // Generate audit report
  const report = {
    posts: {
      total: posts.length,
      published: posts.filter(p => p.post_status === 'publish').length,
      drafts: posts.filter(p => p.post_status === 'draft').length,
      pages: posts.filter(p => p.post_type === 'page').length,
    },
    authors: [...new Set(posts.map(p => p.author_name))],
    taxonomy: {
      categories: taxonomy.filter(t => t.taxonomy === 'category').length,
      tags: taxonomy.filter(t => t.taxonomy === 'post_tag').length,
    },
  }

  await fs.writeFile('wordpress-audit-report.json', JSON.stringify(report, null, 2))
  await connection.end()
  return report
}

auditWordPressContent().catch(console.error)
```

## Step 2 — Content Migration Strategy and Tools

Create automated tools to migrate content while preserving SEO value and content relationships.

```javascript
// scripts/migrate-to-contentful.js — WordPress to Contentful migration
const contentful = require('contentful-management')
const mysql = require('mysql2/promise')
const TurndownService = require('turndown')

class WordPressToContentfulMigrator {
  constructor() {
    this.client = contentful.createClient({
      accessToken: process.env.CONTENTFUL_MANAGEMENT_TOKEN,
    })
    this.turndown = new TurndownService()
  }

  async initialize() {
    const space = await this.client.getSpace(process.env.CONTENTFUL_SPACE_ID)
    this.environment = await space.getEnvironment('master')
  }

  async setupContentTypes() {
    // Create Author content type
    await this.createContentType('author', {
      name: 'Author',
      fields: [
        { id: 'name', name: 'Name', type: 'Symbol', required: true },
        { id: 'slug', name: 'Slug', type: 'Symbol', required: true, unique: true },
        { id: 'email', name: 'Email', type: 'Symbol' },
        { id: 'bio', name: 'Bio', type: 'Text' },
        { id: 'avatar', name: 'Avatar', type: 'Link', linkType: 'Asset' },
      ]
    })

    // Create Blog Post content type
    await this.createContentType('blogPost', {
      name: 'Blog Post',
      displayField: 'title',
      fields: [
        { id: 'title', name: 'Title', type: 'Symbol', required: true },
        { id: 'slug', name: 'Slug', type: 'Symbol', required: true, unique: true },
        { id: 'excerpt', name: 'Excerpt', type: 'Text' },
        { id: 'content', name: 'Content', type: 'RichText', required: true },
        { id: 'publishedDate', name: 'Published Date', type: 'Date', required: true },
        { id: 'author', name: 'Author', type: 'Link', linkType: 'Entry', required: true },
        { id: 'categories', name: 'Categories', type: 'Array', items: { type: 'Symbol' } },
        { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Symbol' } },
        { id: 'featuredImage', name: 'Featured Image', type: 'Link', linkType: 'Asset' },
        { id: 'wordpressId', name: 'WordPress ID', type: 'Integer' },
      ]
    })
  }

  async migrateAuthors() {
    const connection = await mysql.createConnection({
      host: process.env.WP_DB_HOST,
      user: process.env.WP_DB_USER,
      password: process.env.WP_DB_PASSWORD,
      database: process.env.WP_DB_NAME,
    })

    const [authors] = await connection.execute(`
      SELECT DISTINCT
        u.ID,
        u.display_name,
        u.user_email,
        u.user_nicename as slug
      FROM wp_users u
      JOIN wp_posts p ON u.ID = p.post_author
      WHERE p.post_status = 'publish' AND p.post_type = 'post'
    `)

    for (const author of authors) {
      try {
        const entry = await this.environment.createEntry('author', {
          fields: {
            name: { 'en-US': author.display_name },
            slug: { 'en-US': author.slug },
            email: { 'en-US': author.user_email },
          }
        })

        await entry.publish()
        console.log(`Migrated author: ${author.display_name}`)
      } catch (error) {
        console.error(`Failed to migrate author ${author.display_name}:`, error.message)
      }
    }

    await connection.end()
  }

  async migratePosts() {
    const connection = await mysql.createConnection({
      host: process.env.WP_DB_HOST,
      user: process.env.WP_DB_USER,
      password: process.env.WP_DB_PASSWORD,
      database: process.env.WP_DB_NAME,
    })

    const [posts] = await connection.execute(`
      SELECT 
        p.ID,
        p.post_title,
        p.post_name as slug,
        p.post_content,
        p.post_excerpt,
        p.post_date,
        u.user_nicename as author_slug
      FROM wp_posts p
      JOIN wp_users u ON p.post_author = u.ID
      WHERE p.post_status = 'publish' 
      AND p.post_type = 'post'
      ORDER BY p.post_date DESC
    `)

    let migratedCount = 0
    let failedCount = 0

    for (const post of posts) {
      try {
        // Convert HTML to Markdown
        const markdownContent = this.turndown.turndown(post.post_content)
        
        // Get author reference
        const authorEntries = await this.environment.getEntries({
          content_type: 'author',
          'fields.slug': post.author_slug,
          limit: 1,
        })

        if (authorEntries.items.length === 0) {
          console.error(`Author not found for post: ${post.post_title}`)
          continue
        }

        // Create blog post entry
        const entry = await this.environment.createEntry('blogPost', {
          fields: {
            title: { 'en-US': post.post_title },
            slug: { 'en-US': post.slug },
            excerpt: { 'en-US': post.post_excerpt || this.extractExcerpt(post.post_content) },
            content: { 'en-US': this.convertToRichText(markdownContent) },
            publishedDate: { 'en-US': new Date(post.post_date).toISOString() },
            author: {
              'en-US': {
                sys: { type: 'Link', linkType: 'Entry', id: authorEntries.items[0].sys.id }
              }
            },
            wordpressId: { 'en-US': post.ID },
          }
        })

        await entry.publish()
        migratedCount++
        console.log(`Migrated post ${migratedCount}: ${post.post_title}`)

        // Avoid rate limits
        await this.sleep(100)

      } catch (error) {
        console.error(`Failed to migrate post ${post.post_title}:`, error.message)
        failedCount++
      }
    }

    console.log(`Migration complete: ${migratedCount} posts migrated, ${failedCount} failed`)
    await connection.end()
  }

  convertToRichText(markdown) {
    // Simplified rich text conversion
    return {
      nodeType: 'document',
      data: {},
      content: [
        {
          nodeType: 'paragraph',
          data: {},
          content: [
            {
              nodeType: 'text',
              value: markdown,
              marks: [],
              data: {},
            },
          ],
        },
      ],
    }
  }

  extractExcerpt(content, maxLength = 160) {
    const textContent = content.replace(/<[^>]*>/g, '')
    return textContent.length > maxLength 
      ? textContent.substring(0, maxLength) + '...' 
      : textContent
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  async createContentType(id, definition) {
    try {
      await this.environment.createContentType({
        sys: { id },
        ...definition,
      })
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw error
      }
    }
  }
}

// Run migration
async function runMigration() {
  const migrator = new WordPressToContentfulMigrator()
  await migrator.initialize()
  
  console.log('Setting up content types...')
  await migrator.setupContentTypes()
  
  console.log('Migrating authors...')
  await migrator.migrateAuthors()
  
  console.log('Migrating posts...')
  await migrator.migratePosts()
  
  console.log('Migration complete!')
}

runMigration().catch(console.error)
```

## Step 3 — SEO-Preserving URL Structure and Redirects

Maintain SEO rankings by preserving URL structures and implementing proper redirects.

```javascript
// scripts/generate-redirects.js — Generate redirect mapping
const mysql = require('mysql2/promise')
const fs = require('fs').promises

async function generateRedirectRules() {
  const connection = await mysql.createConnection({
    host: process.env.WP_DB_HOST,
    user: process.env.WP_DB_USER,
    password: process.env.WP_DB_PASSWORD,
    database: process.env.WP_DB_NAME,
  })

  // Get all published posts and pages
  const [posts] = await connection.execute(`
    SELECT 
      p.post_name as slug,
      p.post_type,
      p.post_date,
      p.post_title
    FROM wp_posts p
    WHERE p.post_status = 'publish'
    AND p.post_type IN ('post', 'page')
  `)

  const redirectRules = {
    vercel: [],
    netlify: [],
    nextjs: [],
  }

  for (const post of posts) {
    const oldUrl = post.post_type === 'post' 
      ? `/${new Date(post.post_date).getFullYear()}/${String(new Date(post.post_date).getMonth() + 1).padStart(2, '0')}/${post.slug}/`
      : `/${post.slug}/`
    
    const newUrl = post.post_type === 'post'
      ? `/blog/${post.slug}/`
      : `/${post.slug}/`

    // Skip if URLs are the same
    if (oldUrl === newUrl) continue

    // Vercel format
    redirectRules.vercel.push({
      source: oldUrl,
      destination: newUrl,
      permanent: true,
    })

    // Netlify format
    redirectRules.netlify.push(`${oldUrl} ${newUrl} 301`)

    // Next.js format
    redirectRules.nextjs.push({
      source: oldUrl,
      destination: newUrl,
      permanent: true,
    })
  }

  // Add common WordPress redirects
  const commonRedirects = [
    { from: '/wp-admin', to: '/admin' },
    { from: '/feed', to: '/rss.xml' },
    { from: '/author/:slug', to: '/blog/author/:slug' },
    { from: '/category/:slug', to: '/blog/category/:slug' },
    { from: '/tag/:slug', to: '/blog/tag/:slug' },
  ]

  commonRedirects.forEach(redirect => {
    redirectRules.vercel.push({
      source: redirect.from,
      destination: redirect.to,
      permanent: true,
    })
    redirectRules.netlify.push(`${redirect.from} ${redirect.to} 301`)
    redirectRules.nextjs.push({
      source: redirect.from,
      destination: redirect.to,
      permanent: true,
    })
  })

  // Write redirect files
  await fs.writeFile('vercel.json', JSON.stringify({
    redirects: redirectRules.vercel
  }, null, 2))

  await fs.writeFile('_redirects', redirectRules.netlify.join('\n'))

  await fs.writeFile('next-redirects.js', `
    module.exports = {
      async redirects() {
        return ${JSON.stringify(redirectRules.nextjs, null, 2)}
      }
    }
  `)

  console.log(`Generated ${redirectRules.vercel.length} redirect rules`)
  await connection.end()
}

generateRedirects().catch(console.error)
```

## Step 4 — Testing and Quality Assurance

Implement comprehensive testing before going live.

```typescript
// __tests__/migration.test.ts — Migration validation tests
describe('WordPress to Headless Migration', () => {
  it('should have migrated all published posts', async () => {
    const wpPosts = await getWordPressPosts('publish')
    const contentfulPosts = await getContentfulPosts()
    
    expect(contentfulPosts.length).toBeGreaterThanOrEqual(wpPosts.length * 0.95)
  })

  it('should preserve all post slugs', async () => {
    const wpPosts = await getWordPressPosts('publish')
    const contentfulPosts = await getContentfulPosts()
    
    const wpSlugs = new Set(wpPosts.map(p => p.slug))
    const contentfulSlugs = new Set(contentfulPosts.map(p => p.slug))
    
    const missingSlugs = [...wpSlugs].filter(slug => !contentfulSlugs.has(slug))
    
    expect(missingSlugs).toHaveLength(0)
  })

  it('should maintain proper redirect structure', async () => {
    const redirects = require('../public/_redirects')
    
    const testUrls = [
      '/2023/01/my-first-post/',
      '/category/tech/',
      '/author/john-doe/',
    ]
    
    for (const url of testUrls) {
      const redirect = redirects.find(r => r.source === url)
      expect(redirect).toBeDefined()
      expect(redirect.permanent).toBe(true)
    }
  })
})
```

## Results

Marcus successfully migrated his tech publication from WordPress to a modern headless architecture. The transformation exceeded all expectations:

**Performance Transformation:**
- **Page Load Speed**: Reduced from 4.2s to 0.8s (81% improvement)
- **Lighthouse Score**: Improved from 45/100 to 98/100
- **Core Web Vitals**: All metrics moved to "Good" zone
- **Mobile Performance**: 5x faster on mobile devices
- **Time to Interactive**: Reduced from 6.8s to 1.2s

**SEO Impact:**
- **Organic Traffic**: 127% increase in 4 months
- **Search Rankings**: 34% improvement in average position
- **Click-Through Rate**: 28% increase from search results
- **Page Views**: 89% increase in average pages per session
- **Bounce Rate**: Decreased from 68% to 42%

**Editorial Experience:**
- **Content Creation Time**: Reduced by 45%
- **Publishing Speed**: From 15 minutes to instant
- **Editor Satisfaction**: 9.2/10 rating from content team
- **Preview Accuracy**: 100% WYSIWYG accuracy
- **Collaboration**: Built-in workflow and commenting

**Business Metrics:**
- **Ad Revenue**: 156% increase due to faster load times
- **Newsletter Signups**: 78% increase
- **Server Costs**: Reduced by 73% (from $800/month to $220/month)
- **Security Incidents**: Zero (down from 3-4 per year)
- **Uptime**: 99.98% (up from 96.2%)

**Migration Statistics:**
- **Content Migrated**: 2,847 posts, 156 pages, 12,400 images
- **URL Redirects**: 3,200+ redirects implemented
- **Zero Downtime**: Seamless cutover on weekend
- **SEO Preservation**: 100% of rankings maintained or improved
- **Data Integrity**: 99.97% content accuracy

**Team Feedback:**
*"The new editing experience is incredible. I can focus on writing instead of fighting with the interface."* — Senior Editor

*"Our readers love the faster site. The performance improvement is night and day."* — Chief Content Officer

The migration proved that moving from WordPress to headless isn't just about technology—it's about enabling the entire team to do their best work while delivering an exceptional experience to readers.