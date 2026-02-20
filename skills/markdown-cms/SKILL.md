---
name: markdown-cms
description: When the user wants to build a file-based CMS using Markdown and Git. Use for "markdown CMS," "file-based CMS," "static CMS," "Git-based content," or building websites where content is stored as Markdown files in version control.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - markdown
    - file-based
    - git
    - static-site
    - mdx
---

# Markdown CMS

## Overview

You are an expert in building file-based content management systems using Markdown and Git. Your role is to help users create websites where content is stored as Markdown files in version control, providing a simple, version-controlled, and developer-friendly approach to content management.

This approach is ideal for blogs, documentation sites, and content that benefits from version control, offline editing, and simple deployment workflows.

## Instructions

### Step 1: Project Structure Setup

```bash
# Create project structure
mkdir my-markdown-cms
cd my-markdown-cms

# Install dependencies for Next.js with MDX
npm init -y
npm install next react react-dom @next/mdx @mdx-js/loader @mdx-js/react
npm install gray-matter reading-time date-fns remark remark-html
npm install --save-dev @types/node typescript

# For enhanced markdown processing
npm install remark-gfm remark-prism rehype-slug rehype-autolink-headings
npm install react-syntax-highlighter
```

### Step 2: Content Structure

```
content/
├── posts/
│   ├── 2024/
│   │   ├── 01-getting-started.md
│   │   ├── 02-advanced-features.md
│   │   └── 03-deployment-guide.md
│   └── 2023/
│       ├── 12-year-in-review.md
│       └── 11-new-features.md
├── pages/
│   ├── about.md
│   ├── contact.md
│   └── privacy.md
├── authors/
│   ├── john-doe.md
│   └── jane-smith.md
```

### Step 3: Frontmatter Schema

```markdown
---
# content/posts/2024/01-getting-started.md - Example blog post
title: "Getting Started with Markdown CMS"
slug: "getting-started-with-markdown-cms"
description: "Learn how to build a powerful CMS using Markdown files and Git"
date: "2024-01-15"
updated: "2024-01-20"
author: "john-doe"
categories: ["tutorial", "cms"]
tags: ["markdown", "git", "static-site"]
featured: true
draft: false
image: "/images/getting-started-hero.jpg"
excerpt: "Building a CMS with Markdown files offers simplicity, version control, and developer-friendly workflows."

# SEO and social
seo:
  title: "Getting Started with Markdown CMS - Complete Guide"
  description: "Step-by-step guide to building a content management system using Markdown files and Git version control."
  image: "/images/getting-started-social.jpg"

# Table of contents
toc: true

# Related posts
related: ["advanced-features", "deployment-guide"]
---

# Getting Started with Markdown CMS

This is the content of your blog post written in Markdown...

## Why Choose Markdown?

- **Version Control**: Every change is tracked in Git
- **Simplicity**: Write in plain text with simple formatting
- **Portability**: Markdown files work everywhere
- **Developer Friendly**: Familiar workflow for developers

## Getting Started

Here's how to set up your first markdown-based CMS...

```javascript
// Example code block
const content = await getPostBySlug('getting-started')
console.log(content.title)
```
```

### Step 4: Content Processing Library

```javascript
// lib/markdown.js - Markdown processing utilities
import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'
import readingTime from 'reading-time'
import { remark } from 'remark'
import remarkGfm from 'remark-gfm'
import remarkHtml from 'remark-html'

const postsDirectory = path.join(process.cwd(), 'content/posts')
const pagesDirectory = path.join(process.cwd(), 'content/pages')

// Get all posts with metadata
export function getAllPosts(fields = []) {
  const years = fs.readdirSync(postsDirectory).filter(name => !name.startsWith('.'))
  const allPosts = []

  years.forEach(year => {
    const yearPath = path.join(postsDirectory, year)
    if (fs.statSync(yearPath).isDirectory()) {
      const files = fs.readdirSync(yearPath).filter(name => name.endsWith('.md'))
      
      files.forEach(fileName => {
        const slug = fileName.replace(/\.md$/, '')
        const post = getPostBySlug(slug, fields, year)
        if (post) {
          allPosts.push(post)
        }
      })
    }
  })

  return allPosts.sort((a, b) => new Date(b.date) - new Date(a.date))
}

// Get single post by slug
export function getPostBySlug(slug, fields = [], year = null) {
  let fullPath

  if (year) {
    fullPath = path.join(postsDirectory, year, `${slug}.md`)
  } else {
    // Search across all years
    const years = fs.readdirSync(postsDirectory).filter(name => !name.startsWith('.'))
    for (const y of years) {
      const testPath = path.join(postsDirectory, y, `${slug}.md`)
      if (fs.existsSync(testPath)) {
        fullPath = testPath
        year = y
        break
      }
    }
  }

  if (!fullPath || !fs.existsSync(fullPath)) {
    return null
  }

  const fileContents = fs.readFileSync(fullPath, 'utf8')
  const { data, content } = matter(fileContents)

  const items = {}

  fields.forEach((field) => {
    switch (field) {
      case 'slug':
        items[field] = slug
        break
      case 'content':
        items[field] = content
        break
      case 'readingTime':
        items[field] = readingTime(content)
        break
      case 'year':
        items[field] = year
        break
      case 'wordCount':
        items[field] = content.split(/\s+/).length
        break
      default:
        if (data[field]) {
          items[field] = data[field]
        }
        break
    }
  })

  return items
}

// Convert markdown to HTML
export async function markdownToHtml(markdown) {
  const result = await remark()
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .process(markdown)

  return result.toString()
}

// Search posts
export function searchPosts(query, fields = []) {
  const allPosts = getAllPosts([...fields, 'title', 'description', 'content', 'tags', 'categories'])
  const searchTerm = query.toLowerCase()

  return allPosts.filter(post => {
    const searchableText = [
      post.title,
      post.description,
      post.content,
      ...(post.tags || []),
      ...(post.categories || []),
    ].join(' ').toLowerCase()

    return searchableText.includes(searchTerm)
  })
}
```

### Step 5: Next.js Pages Implementation

```jsx
// pages/blog/[slug].js - Individual blog post
import { getPostBySlug, getAllPosts, markdownToHtml } from '../../lib/markdown'
import { GetStaticProps, GetStaticPaths } from 'next'
import Head from 'next/head'
import Image from 'next/image'
import { formatDate } from '../../lib/utils'

export default function BlogPost({ post }) {
  if (!post) {
    return <div>Post not found</div>
  }

  return (
    <>
      <Head>
        <title>{post.seo?.title || post.title}</title>
        <meta name="description" content={post.seo?.description || post.description} />
        <meta property="og:title" content={post.seo?.title || post.title} />
        <meta property="og:description" content={post.seo?.description || post.description} />
        <meta property="og:image" content={post.seo?.image || post.image} />
      </Head>

      <article className="max-w-4xl mx-auto px-4 py-8">
        {post.image && (
          <div className="mb-8">
            <Image
              src={post.image}
              alt={post.title}
              width={800}
              height={400}
              className="w-full h-64 md:h-96 object-cover rounded-lg shadow-lg"
              priority
            />
          </div>
        )}

        <header className="mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4 leading-tight">
            {post.title}
          </h1>
          
          <div className="flex items-center space-x-6 text-gray-600 mb-6">
            <time>{formatDate(post.date)}</time>
            <span>{post.readingTime.text}</span>
            <span>{post.wordCount} words</span>
          </div>
          
          {post.categories && post.categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {post.categories.map(category => (
                <span
                  key={category}
                  className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm"
                >
                  {category}
                </span>
              ))}
            </div>
          )}
          
          {post.description && (
            <p className="text-xl text-gray-600 leading-relaxed">
              {post.description}
            </p>
          )}
        </header>

        <div 
          className="prose prose-lg max-w-none mb-8"
          dangerouslySetInnerHTML={{ __html: post.htmlContent }}
        />
        
        {post.tags && post.tags.length > 0 && (
          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-lg font-semibold mb-4">Tags</h3>
            <div className="flex flex-wrap gap-2">
              {post.tags.map(tag => (
                <span 
                  key={tag}
                  className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm"
                >
                  #{tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </article>
    </>
  )
}

export const getStaticPaths: GetStaticPaths = async () => {
  const posts = getAllPosts(['slug'])
  
  return {
    paths: posts.map(post => ({
      params: { slug: post.slug }
    })),
    fallback: false,
  }
}

export const getStaticProps: GetStaticProps = async ({ params }) => {
  const post = getPostBySlug(params?.slug as string, [
    'title',
    'slug',
    'date',
    'description',
    'image',
    'categories',
    'tags',
    'content',
    'readingTime',
    'wordCount',
    'seo',
  ])

  if (!post) {
    return { notFound: true }
  }

  const htmlContent = await markdownToHtml(post.content || '')

  return {
    props: {
      post: {
        ...post,
        htmlContent,
      },
    },
  }
}
```

## Guidelines

- **Content Organization**: Structure your content logically with consistent frontmatter. Use clear folder hierarchies and naming conventions.
- **Version Control**: Leverage Git for content versioning, collaboration, and backup. Use meaningful commit messages for content changes.
- **Performance**: Implement proper static generation, image optimization, and caching strategies for fast loading times.
- **SEO**: Use proper frontmatter for SEO metadata. Generate sitemaps, RSS feeds, and structured data for better search visibility.
- **Search**: Implement client-side or server-side search functionality. Consider indexing with external search services for large content volumes.
- **Validation**: Validate frontmatter schema and markdown syntax. Use linting tools to maintain content quality.
- **Automation**: Set up automated content processing, RSS generation, and deployment workflows.
- **Backup**: Ensure your content is properly backed up in version control and consider additional backup strategies.
- **Security**: Sanitize markdown content and implement proper security headers. Be careful with user-generated content.
- **Accessibility**: Ensure your content is accessible. Use proper heading structures, alt texts, and semantic HTML.