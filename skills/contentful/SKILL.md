---
name: contentful
description: When the user wants to use Contentful's headless CMS for content management. Use for "Contentful API," "headless CMS," "content delivery," "structured content," or building websites/apps with dynamic content from Contentful.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - contentful
    - api
    - content-management
    - cdn
---

# Contentful

## Overview

You are an expert in Contentful, the headless content management system (CMS). Your role is to help users build content-driven applications using Contentful's API-first approach, content modeling, and delivery infrastructure.

Contentful separates content creation from presentation, allowing editors to manage content while developers build experiences across web, mobile, and other platforms using the same content source.

## Instructions

### Step 1: Content Modeling Setup

Start by designing the content model in Contentful's web interface:

```javascript
// Example content model structure for a blog
{
  "name": "Blog Post",
  "description": "Individual blog post entries",
  "displayField": "title",
  "fields": [
    {
      "id": "title",
      "name": "Title",
      "type": "Symbol",
      "required": true
    },
    {
      "id": "slug",
      "name": "Slug",
      "type": "Symbol",
      "required": true,
      "unique": true
    },
    {
      "id": "excerpt",
      "name": "Excerpt",
      "type": "Text",
      "required": false
    },
    {
      "id": "body",
      "name": "Body",
      "type": "RichText",
      "required": true
    },
    {
      "id": "featuredImage",
      "name": "Featured Image",
      "type": "Link",
      "linkType": "Asset",
      "required": false
    },
    {
      "id": "author",
      "name": "Author",
      "type": "Link",
      "linkType": "Entry",
      "required": true
    },
    {
      "id": "tags",
      "name": "Tags",
      "type": "Array",
      "items": {
        "type": "Link",
        "linkType": "Entry"
      }
    },
    {
      "id": "publishedAt",
      "name": "Published At",
      "type": "Date",
      "required": true
    }
  ]
}
```

### Step 2: Install Contentful SDK

```bash
# For JavaScript/Node.js applications
npm install contentful

# For management API (content creation/updates)
npm install contentful-management

# For React applications
npm install @contentful/rich-text-react-renderer
```

### Step 3: Configure API Access

```javascript
// lib/contentful.js - Contentful client configuration
import { createClient } from 'contentful'

// Content Delivery API (read-only, cached)
const client = createClient({
  space: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_ACCESS_TOKEN,
  environment: process.env.CONTENTFUL_ENVIRONMENT || 'master',
})

// Preview API (draft content)
const previewClient = createClient({
  space: process.env.CONTENTFUL_SPACE_ID,
  accessToken: process.env.CONTENTFUL_PREVIEW_TOKEN,
  host: 'preview.contentful.com',
  environment: process.env.CONTENTFUL_ENVIRONMENT || 'master',
})

export { client, previewClient }
```

### Step 4: Fetching Content

```javascript
// lib/api.js - Content fetching functions
import { client, previewClient } from './contentful'

// Get all blog posts
export async function getAllPosts(preview = false) {
  const activeClient = preview ? previewClient : client
  
  const entries = await activeClient.getEntries({
    content_type: 'blogPost',
    order: '-fields.publishedAt',
    limit: 100,
    include: 2, // Include linked entries and assets
  })
  
  return entries.items.map(transformPost)
}

// Get single post by slug
export async function getPostBySlug(slug, preview = false) {
  const activeClient = preview ? previewClient : client
  
  const entries = await activeClient.getEntries({
    content_type: 'blogPost',
    'fields.slug': slug,
    limit: 1,
    include: 2,
  })
  
  return entries.items.length > 0 ? transformPost(entries.items[0]) : null
}

// Transform Contentful entry to clean object
function transformPost(entry) {
  return {
    id: entry.sys.id,
    title: entry.fields.title,
    slug: entry.fields.slug,
    excerpt: entry.fields.excerpt,
    body: entry.fields.body,
    featuredImage: entry.fields.featuredImage ? {
      url: entry.fields.featuredImage.fields.file.url,
      alt: entry.fields.featuredImage.fields.title,
      width: entry.fields.featuredImage.fields.file.details.image.width,
      height: entry.fields.featuredImage.fields.file.details.image.height,
    } : null,
    author: {
      name: entry.fields.author.fields.name,
      avatar: entry.fields.author.fields.avatar?.fields.file.url,
    },
    tags: entry.fields.tags?.map(tag => ({
      name: tag.fields.name,
      slug: tag.fields.slug,
    })) || [],
    publishedAt: entry.fields.publishedAt,
    updatedAt: entry.sys.updatedAt,
  }
}
```

## Guidelines

- **Content First**: Design your content model before building components. Consider relationships between content types.
- **Use Environment Variables**: Never hardcode space IDs or tokens. Use different environments for staging/production.
- **Leverage CDN**: Contentful's CDN is globally distributed. Use it for assets and consider image transformations via URL parameters.
- **Preview Mode**: Implement preview functionality for content editors to see unpublished changes.
- **Error Handling**: Always handle cases where content might be missing or relationships broken.
- **Image Optimization**: Use Contentful's image API for resizing, format conversion, and optimization.
- **Caching Strategy**: Implement appropriate caching with ISR, SWR, or similar techniques.
- **Rich Text**: Use the official rich text renderer and customize it for your design system.
- **Localization**: If using multiple languages, structure your content model and API calls to handle localization properly.