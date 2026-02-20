---
name: hygraph
description: When the user wants to use Hygraph (formerly GraphCMS) for GraphQL-native headless content management. Use for "Hygraph," "GraphCMS," "GraphQL CMS," "GraphQL content," or building applications with GraphQL-first content delivery.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - hygraph
    - graphcms
    - graphql
    - content-management
---

# Hygraph

## Overview

You are an expert in Hygraph (formerly GraphCMS), the GraphQL-native headless content management system. Your role is to help users build content-driven applications using Hygraph's GraphQL-first approach, flexible content modeling, and powerful API.

Hygraph provides a GraphQL API by default, making it ideal for modern frontend frameworks and enabling efficient data fetching with precise control over what data is retrieved.

## Instructions

### Step 1: Content Model Design

Create content models in Hygraph's schema editor:

```graphql
# Example schema for a blog application
type BlogPost {
  id: ID! @unique
  createdAt: DateTime!
  updatedAt: DateTime!
  title: String!
  slug: String! @unique
  excerpt: String
  content: RichText!
  featuredImage: Asset
  author: Author @relation(name: "AuthorPosts")
  categories: [Category!]! @relation(name: "PostCategories")
  tags: [Tag!]! @relation(name: "PostTags")
  publishedAt: DateTime
  status: PostStatus! @default(value: DRAFT)
  seo: Seo @relation(name: "PostSeo")
}

type Author {
  id: ID! @unique
  name: String!
  bio: String
  avatar: Asset
  social: [SocialLink!]!
  posts: [BlogPost!]! @relation(name: "AuthorPosts")
}

enum PostStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}
```

### Step 2: Install GraphQL Client

```bash
# Using Apollo Client for React
npm install @apollo/client graphql

# Using urql (lightweight alternative)
npm install urql graphql

# Using graphql-request (simple client)
npm install graphql-request graphql
```

### Step 3: Configure GraphQL Client

```javascript
// lib/hygraph.js - Hygraph client configuration
import { GraphQLClient } from 'graphql-request'

const endpoint = process.env.HYGRAPH_ENDPOINT
const token = process.env.HYGRAPH_TOKEN

// Public client for published content
export const hygraph = new GraphQLClient(endpoint, {
  headers: {
    ...(token && { authorization: `Bearer ${token}` }),
  },
})

// Preview client for draft content
export const hygraphPreview = new GraphQLClient(endpoint, {
  headers: {
    ...(token && { authorization: `Bearer ${token}` }),
    'gcms-stage': 'DRAFT', // Fetch draft content
  },
})
```

### Step 4: GraphQL Queries

```graphql
# queries/posts.graphql - Blog post queries

# Get all published posts
query GetAllPosts($first: Int = 10, $skip: Int = 0) {
  blogPosts(
    where: { status: PUBLISHED }
    orderBy: publishedAt_DESC
    first: $first
    skip: $skip
  ) {
    id
    title
    slug
    excerpt
    publishedAt
    featuredImage {
      id
      url
      width
      height
      alt: fileName
    }
    author {
      id
      name
      avatar {
        url
      }
    }
    categories {
      id
      name
      slug
    }
  }
}

# Get single post by slug
query GetPostBySlug($slug: String!) {
  blogPost(where: { slug: $slug }) {
    id
    title
    slug
    excerpt
    content {
      html
      markdown
      text
      raw
    }
    featuredImage {
      id
      url
      width
      height
      alt: fileName
    }
    author {
      id
      name
      bio
      avatar {
        url
      }
      social {
        platform
        url
      }
    }
    categories {
      id
      name
      slug
      description
    }
    tags {
      id
      name
      slug
    }
    publishedAt
    updatedAt
    seo {
      title
      description
      image {
        url
      }
    }
  }
}
```

## Guidelines

- **GraphQL First**: Leverage GraphQL's type safety and efficient data fetching. Use fragments to reuse field selections.
- **Content Modeling**: Design your schema with relationships in mind. Use proper field types and validation.
- **Error Handling**: Always handle GraphQL errors gracefully. Check for both network and GraphQL errors.
- **Performance**: Use GraphQL fragments and only fetch the fields you need. Implement proper caching strategies.
- **Localization**: If building multilingual sites, structure your content model to support localization from the start.
- **Asset Optimization**: Use Hygraph's built-in image transformations for responsive images and performance.
- **Real-time**: Consider subscriptions for live content updates, especially for collaborative editing scenarios.
- **Preview Mode**: Implement preview functionality using Hygraph's draft/published workflow.
- **Security**: Use environment-specific tokens and never expose management tokens on the client side.
- **Pagination**: Implement proper pagination for better performance with large content sets.