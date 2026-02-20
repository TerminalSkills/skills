---
name: keystonejs
description: When the user wants to use Keystone.js for building headless CMS applications. Use for "Keystone.js," "Prisma CMS," "GraphQL CMS framework," "Node.js CMS," or building custom headless CMS with GraphQL and database integration.
license: Apache-2.0
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: cms
  tags:
    - headless-cms
    - keystonejs
    - prisma
    - graphql
    - nodejs
    - typescript
---

# Keystone.js

## Overview

You are an expert in Keystone.js, the open-source headless CMS framework built on Prisma and GraphQL. Your role is to help users build custom content management systems with powerful admin UI, flexible data modeling, and GraphQL API.

Keystone.js provides a complete framework for building headless CMS applications with TypeScript support, authentication, file handling, and customizable admin interface.

## Instructions

### Step 1: Project Setup

```bash
# Create new Keystone project
npm create keystone-app@latest my-cms

# Or initialize in existing project
npm install @keystone-6/core @keystone-6/auth @keystone-6/session-store-redis

# Database dependencies (choose one)
npm install prisma @prisma/client  # PostgreSQL/MySQL/SQLite
```

### Step 2: Basic Configuration

```typescript
// keystone.ts - Main configuration file
import { config } from '@keystone-6/core'
import { lists } from './schema'
import { withAuth, session } from './auth'

export default withAuth(
  config({
    db: {
      provider: 'postgresql',
      url: process.env.DATABASE_URL || 'postgres://localhost:5432/keystone',
      enableLogging: process.env.NODE_ENV === 'development',
      useMigrations: true,
      idField: { kind: 'uuid' },
    },
    
    lists,
    session,
    
    ui: {
      isAccessAllowed: (context) => !!context.session,
    },
    
    graphql: {
      playground: process.env.NODE_ENV === 'development',
      apolloConfig: {
        introspection: process.env.NODE_ENV === 'development',
      },
    },
    
    server: {
      cors: {
        origin: [process.env.FRONTEND_URL || 'http://localhost:3000'],
        credentials: true,
      },
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
    },
  })
)
```

### Step 3: Schema Definition

```typescript
// schema.ts - Define your content models
import { list } from '@keystone-6/core'
import { allowAll } from '@keystone-6/core/access'
import {
  text,
  relationship,
  password,
  timestamp,
  select,
  integer,
  checkbox,
  image,
} from '@keystone-6/core/fields'
import { document } from '@keystone-6/fields-document'

export const lists = {
  User: list({
    access: allowAll,
    fields: {
      name: text({ validation: { isRequired: true } }),
      email: text({
        validation: { isRequired: true },
        isIndexed: 'unique',
      }),
      password: password({ validation: { isRequired: true } }),
      role: select({
        options: [
          { label: 'Admin', value: 'admin' },
          { label: 'Editor', value: 'editor' },
          { label: 'Author', value: 'author' },
        ],
        defaultValue: 'author',
      }),
      isActive: checkbox({ defaultValue: true }),
      createdAt: timestamp({ defaultValue: { kind: 'now' } }),
    },
  }),

  Post: list({
    access: allowAll,
    fields: {
      title: text({ validation: { isRequired: true } }),
      slug: text({
        validation: { isRequired: true },
        isIndexed: 'unique',
      }),
      status: select({
        options: [
          { label: 'Draft', value: 'draft' },
          { label: 'Published', value: 'published' },
          { label: 'Archived', value: 'archived' },
        ],
        defaultValue: 'draft',
      }),
      
      content: document({
        formatting: true,
        layouts: [
          [1, 1],
          [1, 1, 1],
          [2, 1],
        ],
        links: true,
        dividers: true,
      }),
      
      author: relationship({
        ref: 'User',
        many: false,
      }),
      categories: relationship({
        ref: 'Category.posts',
        many: true,
      }),
      
      featuredImage: image({ storage: 'local_images' }),
      publishedDate: timestamp(),
      createdAt: timestamp({ defaultValue: { kind: 'now' } }),
      updatedAt: timestamp({ db: { updatedAt: true } }),
    },
    
    hooks: {
      resolveInput: ({ operation, resolvedData, inputData }) => {
        // Auto-generate slug from title
        if (inputData.title && !inputData.slug) {
          resolvedData.slug = inputData.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
        }
        
        return resolvedData
      },
    },
  }),
}
```

## Guidelines

- **Schema Design**: Plan your content model carefully. Consider relationships and how content will be used in your frontend.
- **Access Control**: Implement proper access control from the start. Use role-based permissions and content ownership rules.
- **Performance**: Use database indexes for frequently queried fields. Implement pagination for large datasets.
- **Validation**: Add proper validation to your fields. Use hooks for complex business logic.
- **File Storage**: Use local storage for development, cloud storage for production. Consider CDN for better performance.
- **Security**: Keep your session secret secure. Use HTTPS in production. Validate all inputs.
- **Backup**: Implement regular database backups. Consider automated migration rollback strategies.
- **Monitoring**: Add logging and monitoring for production deployments.
- **Custom Fields**: Create custom field types when needed. Leverage the component system for complex UI requirements.
- **Testing**: Write tests for your access control rules and hooks. Test GraphQL queries and mutations.