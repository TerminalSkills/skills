---
name: ghost-api
description: When the user wants to use Ghost CMS API for publishing and content management. Use for "Ghost API," "Ghost CMS," "publishing platform," "blog API," or building websites/apps that consume Ghost content via API.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - ghost
    - api
    - publishing
    - blog
    - content-api
---

# Ghost API

## Overview

You are an expert in Ghost CMS and its API. Your role is to help users build websites and applications that consume content from Ghost using its Content API and Admin API. Ghost is a powerful publishing platform with a clean API for headless implementations.

Ghost provides both a Content API for reading published content and an Admin API for managing content programmatically.

## Instructions

### Step 1: Ghost Setup and API Keys

```bash
# Install Ghost JavaScript SDK
npm install @tryghost/content-api @tryghost/admin-api

# For handling webhooks
npm install @tryghost/webhook-parser

# Rich text rendering
npm install @tryghost/helpers
```

### Step 2: API Client Configuration

```javascript
// lib/ghost.js - Ghost API client setup
import GhostContentAPI from '@tryghost/content-api'
import GhostAdminAPI from '@tryghost/admin-api'

// Content API (read-only, public)
const contentApi = new GhostContentAPI({
  url: process.env.GHOST_API_URL, // e.g., https://your-site.ghost.io
  key: process.env.GHOST_CONTENT_API_KEY,
  version: 'v5.0',
})

// Admin API (read/write, private)
const adminApi = new GhostAdminAPI({
  url: process.env.GHOST_API_URL,
  key: process.env.GHOST_ADMIN_API_KEY,
  version: 'v5.0',
})

export { contentApi, adminApi }

// Helper functions
export async function getAllPosts(options = {}) {
  try {
    const posts = await contentApi.posts.browse({
      limit: 'all',
      include: 'tags,authors',
      ...options,
    })
    return posts
  } catch (error) {
    console.error('Error fetching posts:', error)
    return []
  }
}

export async function getPostBySlug(slug) {
  try {
    const post = await contentApi.posts.read(
      { slug },
      { include: 'tags,authors' }
    )
    return post
  } catch (error) {
    console.error('Error fetching post:', error)
    return null
  }
}

export async function getAllTags() {
  try {
    const tags = await contentApi.tags.browse({
      limit: 'all',
      include: 'count.posts',
    })
    return tags
  } catch (error) {
    console.error('Error fetching tags:', error)
    return []
  }
}

export async function getSettings() {
  try {
    const settings = await contentApi.settings.browse()
    return settings
  } catch (error) {
    console.error('Error fetching settings:', error)
    return null
  }
}
```

### Step 3: Next.js Blog Implementation

```jsx
// pages/blog/index.js - Blog listing page
import { getAllPosts, getSettings } from '../../lib/ghost'
import Link from 'next/link'
import Image from 'next/image'

export default function Blog({ posts, settings }) {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold mb-4">
          {settings?.title || 'Blog'}
        </h1>
        {settings?.description && (
          <p className="text-xl text-gray-600">{settings.description}</p>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {posts.map(post => (
          <article key={post.id} className="bg-white rounded-lg shadow-md overflow-hidden">
            {post.feature_image && (
              <Image
                src={post.feature_image}
                alt={post.title}
                width={400}
                height={225}
                className="w-full h-48 object-cover"
              />
            )}
            
            <div className="p-6">
              <h2 className="text-xl font-semibold mb-2">
                <Link href={`/blog/${post.slug}`}>
                  <a className="hover:text-blue-600 transition-colors">
                    {post.title}
                  </a>
                </Link>
              </h2>
              
              {post.excerpt && (
                <p className="text-gray-600 mb-4 line-clamp-3">
                  {post.excerpt}
                </p>
              )}
              
              <div className="flex items-center justify-between text-sm text-gray-500">
                <time>{new Date(post.published_at).toLocaleDateString()}</time>
                <span>{post.reading_time} min read</span>
              </div>
              
              {post.tags && post.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {post.tags.slice(0, 3).map(tag => (
                    <span
                      key={tag.id}
                      className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export async function getStaticProps() {
  const [posts, settings] = await Promise.all([
    getAllPosts({ limit: 50 }),
    getSettings(),
  ])

  return {
    props: {
      posts,
      settings,
    },
    revalidate: 60,
  }
}
```

### Step 4: Webhook Integration

```javascript
// pages/api/webhooks/ghost.js - Ghost webhook handler
import { parseWebhook } from '@tryghost/webhook-parser'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' })
  }

  const signingSecret = process.env.GHOST_WEBHOOK_SECRET
  
  try {
    const webhook = parseWebhook(req.body, signingSecret)
    
    switch (webhook.event) {
      case 'post.published':
        await handlePostPublished(webhook.data.post)
        break
      case 'post.unpublished':
        await handlePostUnpublished(webhook.data.post)
        break
      default:
        console.log('Unhandled webhook event:', webhook.event)
    }
    
    res.status(200).json({ message: 'Webhook processed successfully' })
  } catch (error) {
    console.error('Webhook processing error:', error)
    res.status(400).json({ message: 'Invalid webhook' })
  }
}

async function handlePostPublished(post) {
  try {
    // Revalidate blog pages
    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/revalidate?path=/blog`)
    await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/revalidate?path=/blog/${post.slug}`)
    
    console.log('Post published webhook processed:', post.title)
  } catch (error) {
    console.error('Error handling post published:', error)
  }
}
```

## Guidelines

- **API Rate Limits**: Be aware of Ghost's API rate limits. Implement proper caching and avoid excessive API calls.
- **Content Structure**: Leverage Ghost's built-in content features like tags, authors, and featured posts for better organization.
- **SEO Optimization**: Use Ghost's built-in SEO fields (meta_title, meta_description, og_* fields) for better search engine visibility.
- **Performance**: Implement caching at multiple levels - API responses, static generation, and CDN caching.
- **Security**: Keep your Admin API key secure. Never expose it on the client side. Use Content API for public data.
- **Webhooks**: Set up webhooks for real-time updates and cache invalidation when content changes.
- **Image Optimization**: Use Ghost's image transformation parameters for responsive images and better performance.
- **Search**: For better search functionality, consider integrating with external search services like Algolia or Elasticsearch.
- **Backup**: Regularly backup your Ghost content and database. Consider automated backup strategies.
- **Monitoring**: Monitor your Ghost instance and API usage. Set up alerts for downtime or API errors.