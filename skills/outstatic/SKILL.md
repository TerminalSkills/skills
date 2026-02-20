---
name: outstatic
description: When the user wants to use Outstatic for static CMS with Next.js. Use for "Outstatic," "Next.js CMS," "static CMS," "no database CMS," or building Next.js sites with integrated content management that requires no backend database.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - outstatic
    - nextjs
    - static-site
    - no-database
    - file-based
---

# Outstatic

## Overview

You are an expert in Outstatic, the static CMS for Next.js that requires no database. Your role is to help users build content management systems directly integrated with Next.js applications, where content is stored as files and managed through a built-in admin interface.

Outstatic enables developers to add a content management system to their Next.js applications without external dependencies, databases, or complex setup procedures.

## Instructions

### Step 1: Project Setup and Installation

```bash
# Create new Next.js project
npx create-next-app@latest my-outstatic-site
cd my-outstatic-site

# Install Outstatic
npm install outstatic

# Install additional dependencies
npm install date-fns reading-time gray-matter remark remark-html
npm install @tailwindcss/typography # for content styling
```

### Step 2: Basic Configuration

```javascript
// outstatic/metadata.json - Outstatic configuration
{
  "commit": "main",
  "monorepoPath": "",
  "contentPath": "outstatic/content",
  "publicPath": "/images",
  "mediaPath": "public/images",
  "collections": [
    {
      "name": "posts",
      "title": "Blog Posts",
      "type": "content",
      "path": "posts",
      "description": "Blog posts and articles"
    },
    {
      "name": "pages", 
      "title": "Pages",
      "type": "content",
      "path": "pages",
      "description": "Static pages"
    },
    {
      "name": "projects",
      "title": "Projects",
      "type": "content", 
      "path": "projects",
      "description": "Portfolio projects"
    },
    {
      "name": "authors",
      "title": "Authors",
      "type": "content",
      "path": "authors", 
      "description": "Author profiles"
    }
  ]
}
```

### Step 3: Admin Panel Setup

```jsx
// pages/outstatic/[[...ost]].js - Admin panel route
import { Outstatic, OstClient } from 'outstatic'
import { OstLayout } from 'outstatic/client'

const OutstaticPage = () => {
  return (
    <Outstatic
      monorepoPath=""
      contentPath="outstatic/content"
      mediaPath="public/images"
      publicPath="/images"
    />
  )
}

export default OutstaticPage

// Apply admin layout
OutstaticPage.getLayout = function getLayout(page) {
  return <OstLayout>{page}</OstLayout>
}
```

### Step 4: Content Fetching Utilities

```javascript
// lib/outstatic.js - Content fetching utilities
import { getCollectionPaths, getDocumentPaths, getDocumentSlugs, load } from 'outstatic/server'

// Get all posts
export async function getAllPosts() {
  const posts = getCollectionPaths('posts')
    .map((slug) => load(slug, 'posts'))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .filter((post) => post.status === 'published')

  return posts
}

// Get single post by slug
export async function getPostBySlug(slug) {
  try {
    const post = load(slug, 'posts')
    return post
  } catch {
    return null
  }
}

// Get all pages
export async function getAllPages() {
  const pages = getCollectionPaths('pages')
    .map((slug) => load(slug, 'pages'))
    .filter((page) => page.status === 'published')

  return pages
}

// Get all projects
export async function getAllProjects() {
  const projects = getCollectionPaths('projects')
    .map((slug) => load(slug, 'projects'))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .filter((project) => project.status === 'published')

  return projects
}

// Get related posts
export async function getRelatedPosts(currentPost, limit = 3) {
  const allPosts = await getAllPosts()
  
  const currentTags = currentPost.tags || []
  
  if (currentTags.length === 0) {
    return allPosts.filter(post => post.slug !== currentPost.slug).slice(0, limit)
  }
  
  const relatedPosts = allPosts
    .filter(post => post.slug !== currentPost.slug)
    .map(post => {
      const postTags = post.tags || []
      const commonTags = postTags.filter(tag => currentTags.includes(tag))
      return {
        ...post,
        relevanceScore: commonTags.length
      }
    })
    .filter(post => post.relevanceScore > 0)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)

  return relatedPosts
}

// Search posts
export async function searchPosts(query) {
  const allPosts = await getAllPosts()
  const searchTerm = query.toLowerCase()
  
  return allPosts.filter(post => {
    const searchableText = [
      post.title,
      post.description,
      post.content,
      ...(post.tags || [])
    ].join(' ').toLowerCase()
    
    return searchableText.includes(searchTerm)
  })
}
```

### Step 5: Blog Implementation

```jsx
// pages/blog/index.js - Blog listing page
import { getAllPosts, getAllTags, getAllAuthors } from '../../lib/outstatic'
import Link from 'next/link'
import Image from 'next/image'
import { formatDistance } from 'date-fns'

export default function Blog({ posts, tags, authors }) {
  const featuredPosts = posts.filter(post => post.featured).slice(0, 2)
  const recentPosts = posts.slice(0, 8)

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <header className="text-center mb-12">
        <h1 className="text-5xl font-bold mb-4">Our Blog</h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Insights, tutorials, and thoughts on web development
        </p>
      </header>

      {/* Featured Posts */}
      {featuredPosts.length > 0 && (
        <section className="mb-16">
          <h2 className="text-3xl font-bold mb-8">Featured Posts</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {featuredPosts.map(post => (
              <article key={post.slug} className="group">
                <Link href={`/blog/${post.slug}`}>
                  <a className="block">
                    {post.coverImage && (
                      <div className="aspect-w-16 aspect-h-9 mb-4">
                        <Image
                          src={post.coverImage}
                          alt={post.title}
                          width={600}
                          height={338}
                          className="w-full h-64 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    )}
                    <div className="space-y-3">
                      <div className="flex items-center space-x-4 text-sm text-gray-500">
                        <time>{formatDistance(new Date(post.publishedAt), new Date(), { addSuffix: true })}</time>
                        {post.author && <span>{post.author.name}</span>}
                      </div>
                      
                      <h3 className="text-2xl font-bold group-hover:text-blue-600 transition-colors">
                        {post.title}
                      </h3>
                      
                      {post.description && (
                        <p className="text-gray-600 line-clamp-2">
                          {post.description}
                        </p>
                      )}
                      
                      {post.tags && post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {post.tags.slice(0, 3).map(tag => (
                            <span 
                              key={tag}
                              className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </a>
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-3">
          <h2 className="text-3xl font-bold mb-8">Recent Posts</h2>
          <div className="space-y-8">
            {recentPosts.map(post => (
              <article key={post.slug} className="group border-b border-gray-200 pb-8">
                <div className="flex flex-col md:flex-row gap-6">
                  {post.coverImage && (
                    <div className="md:w-1/3">
                      <Link href={`/blog/${post.slug}`}>
                        <a>
                          <Image
                            src={post.coverImage}
                            alt={post.title}
                            width={300}
                            height={200}
                            className="w-full h-48 md:h-32 object-cover rounded-lg group-hover:scale-105 transition-transform duration-300"
                          />
                        </a>
                      </Link>
                    </div>
                  )}
                  
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center space-x-4 text-sm text-gray-500">
                      <time>{formatDistance(new Date(post.publishedAt), new Date(), { addSuffix: true })}</time>
                      {post.author && <span>by {post.author.name}</span>}
                    </div>
                    
                    <h3 className="text-xl font-semibold">
                      <Link href={`/blog/${post.slug}`}>
                        <a className="hover:text-blue-600 transition-colors">
                          {post.title}
                        </a>
                      </Link>
                    </h3>
                    
                    {post.description && (
                      <p className="text-gray-600 line-clamp-2">
                        {post.description}
                      </p>
                    )}
                    
                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {post.tags.slice(0, 4).map(tag => (
                          <span 
                            key={tag}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded-md"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-1 space-y-8">
          {/* Popular Tags */}
          {tags.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold mb-4">Popular Tags</h3>
              <div className="flex flex-wrap gap-2">
                {tags.slice(0, 15).map(tag => (
                  <span
                    key={tag.name}
                    className="px-3 py-1 bg-white text-gray-700 text-sm rounded-md border hover:border-blue-300 transition-colors"
                  >
                    {tag.name} ({tag.count})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export async function getStaticProps() {
  const posts = await getAllPosts()

  return {
    props: {
      posts,
    },
  }
}
```

## Guidelines

- **Content Organization**: Structure your collections thoughtfully. Consider how editors will create and organize content through the Outstatic interface.
- **Performance**: Implement proper static generation and image optimization. Outstatic works best with static deployment strategies.
- **SEO**: Use proper meta tags and structured data. Outstatic content should be optimized for search engines.
- **User Experience**: Design intuitive interfaces for both content editors (admin panel) and site visitors.
- **Image Management**: Set up proper image handling with Next.js Image component and appropriate domains configuration.
- **Content Validation**: Implement proper validation and error handling for content loading and display.
- **Responsive Design**: Ensure your site works well on all devices and screen sizes.
- **Version Control**: Your content is stored in your repository, providing automatic versioning and backup.
- **Deployment**: Use static deployment platforms like Vercel, Netlify, or GitHub Pages for optimal performance.
- **Security**: Outstatic admin panel should be properly secured in production environments.