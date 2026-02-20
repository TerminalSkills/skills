---
name: tina-cms
description: When the user wants to use TinaCMS for Git-backed content management with visual editing. Use for "TinaCMS," "Tina," "Git CMS," "visual editing," "markdown CMS," or building content sites with inline editing capabilities.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - tina-cms
    - git-based
    - visual-editing
    - markdown
    - nextjs
---

# TinaCMS

## Overview

You are an expert in TinaCMS, the Git-backed content management system with visual editing capabilities. Your role is to help users build content sites where content is stored in Git and editors can make changes through an intuitive visual interface.

TinaCMS enables developers to create sites where content editors can modify content directly on the page through a visual editing interface, with all changes committed back to Git automatically.

## Instructions

### Step 1: Project Setup

```bash
# Create new Next.js project with TinaCMS
npx create-tina-app@latest my-tina-site

# Or add to existing Next.js project
npm install tinacms @tinacms/cli
```

### Step 2: TinaCMS Configuration

```javascript
// tina/config.js - Main TinaCMS configuration
import { defineConfig } from 'tinacms'

export default defineConfig({
  branch: process.env.NEXT_PUBLIC_TINA_BRANCH || 'main',
  clientId: process.env.NEXT_PUBLIC_TINA_CLIENT_ID,
  token: process.env.TINA_TOKEN,
  
  build: {
    outputFolder: 'admin',
    publicFolder: 'public',
  },
  
  media: {
    tina: {
      mediaRoot: 'uploads',
      publicFolder: 'public',
    },
  },
  
  schema: {
    collections: [
      {
        name: 'post',
        label: 'Posts',
        path: 'content/posts',
        format: 'mdx',
        fields: [
          {
            type: 'string',
            name: 'title',
            label: 'Title',
            isTitle: true,
            required: true,
          },
          {
            type: 'string',
            name: 'slug',
            label: 'Slug',
            required: true,
          },
          {
            type: 'datetime',
            name: 'date',
            label: 'Date',
            required: true,
          },
          {
            type: 'boolean',
            name: 'draft',
            label: 'Draft',
          },
          {
            type: 'image',
            name: 'featuredImage',
            label: 'Featured Image',
          },
          {
            type: 'string',
            name: 'categories',
            label: 'Categories',
            list: true,
            options: [
              'Technology',
              'Design', 
              'Business',
            ],
          },
          {
            type: 'rich-text',
            name: 'body',
            label: 'Body',
            isBody: true,
            templates: [
              {
                name: 'callout',
                label: 'Callout',
                fields: [
                  {
                    type: 'string',
                    name: 'type',
                    label: 'Type',
                    options: ['info', 'warning', 'error'],
                  },
                  {
                    type: 'rich-text',
                    name: 'content',
                    label: 'Content',
                  },
                ],
              },
            ],
          },
        ],
        ui: {
          router: ({ document }) => `/blog/${document._sys.filename}`,
        },
      },
    ],
  },
})
```

### Step 3: Next.js Setup

```javascript
// next.config.js - Next.js configuration for TinaCMS
/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: '/admin',
        destination: '/admin/index.html',
      },
    ]
  },
}

module.exports = nextConfig
```

### Step 4: Dynamic Content Pages

```jsx
// pages/blog/[slug].js - Dynamic blog post page
import { useTina } from 'tinacms/dist/react'
import { client } from '../../tina/__generated__/client'
import { TinaMarkdown } from 'tinacms/dist/rich-text'

export default function BlogPost(props) {
  const { data } = useTina({
    query: props.query,
    variables: props.variables,
    data: props.data,
  })
  
  const post = data.post

  if (!post) {
    return <div>Post not found</div>
  }

  return (
    <article className="max-w-4xl mx-auto px-4 py-8">
      {post.featuredImage && (
        <img
          src={post.featuredImage}
          alt={post.title}
          className="w-full h-64 object-cover rounded-lg mb-8"
        />
      )}
      
      <header className="mb-8">
        <h1 className="text-5xl font-bold mb-4">{post.title}</h1>
        <time className="text-gray-600">
          {new Date(post.date).toLocaleDateString()}
        </time>
      </header>

      <div className="prose prose-lg max-w-none">
        <TinaMarkdown content={post.body} />
      </div>
    </article>
  )
}

export const getStaticPaths = async () => {
  const { data } = await client.queries.postConnection()
  
  return {
    paths: data.postConnection.edges.map(({ node }) => ({
      params: { slug: node._sys.filename }
    })),
    fallback: 'blocking',
  }
}

export const getStaticProps = async ({ params }) => {
  const { data, query, variables } = await client.queries.post({
    relativePath: `${params.slug}.mdx`,
  })

  return {
    props: {
      data,
      query,
      variables,
    },
    revalidate: 60,
  }
}
```

## Guidelines

- **Content Structure**: Organize your content in clear folder structures. Use descriptive filenames and consistent formats.
- **Schema Design**: Plan your content model carefully. Consider how editors will use the interface and what fields they need.
- **Visual Editing**: Leverage TinaCMS's visual editing capabilities. Create intuitive components that editors can easily modify.
- **Git Workflow**: Set up proper Git workflows. Consider using branch protection and pull request reviews for important content.
- **Performance**: Use static generation where possible. Implement proper caching and optimization strategies.
- **Custom Components**: Create reusable components for common content patterns. Make them easy for editors to configure.
- **Validation**: Add proper validation to your fields. Help editors create valid content with helpful error messages.
- **Media Management**: Set up efficient media workflows. Consider image optimization and CDN integration.
- **Backup**: Ensure your Git repository is properly backed up. Consider multiple remotes for important projects.
- **Testing**: Test the editing experience thoroughly. Ensure editors can create and modify content without technical knowledge.