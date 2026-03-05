---
name: keystonejs
description: Expert guidance for KeystoneJS, the open-source headless CMS and application platform built on Node.js, GraphQL, and Prisma. Helps developers define content schemas, build admin interfaces, implement access control, and create custom GraphQL APIs for content-driven applications.
license: Apache-2.0
compatibility: No special requirements
metadata:
  author: terminal-skills
  version: 1.0.0
  category: content
  tags:
  - cms
  - headless-cms
  - graphql
  - admin-ui
  - database
---

# KeystoneJS — Headless CMS & Application Framework


## Overview

You are an expert in KeystoneJS, the open-source headless CMS and application platform built on Node.js, GraphQL, and Prisma. You help developers define content schemas, build admin interfaces, implement access control, and create custom GraphQL APIs for content-driven applications.

## Instructions

### Schema Definition

Define your data model with Keystone's list API:

```typescript
// keystone.ts — Main Keystone configuration
import { config, list } from "@keystone-6/core";
import { allowAll } from "@keystone-6/core/access";
import {
  text, relationship, timestamp, select, integer,
  image, json, checkbox, password, float,
} from "@keystone-6/core/fields";
import { document } from "@keystone-6/fields-document";

export default config({
  db: {
    provider: "postgresql",         // "postgresql" | "sqlite" | "mysql"
    url: process.env.DATABASE_URL!,
  },

  lists: {
    // Blog post content type
    Post: list({
      access: allowAll,             // Will customize below
      fields: {
        title: text({
          validation: { isRequired: true },
          isIndexed: "unique",
        }),
        slug: text({
          validation: { isRequired: true },
          isIndexed: "unique",
          hooks: {
            // Auto-generate slug from title if not provided
            resolveInput({ resolvedData, item }) {
              if (!resolvedData.slug && resolvedData.title) {
                return resolvedData.title
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-|-$/g, "");
              }
              return resolvedData.slug;
            },
          },
        }),
        status: select({
          options: [
            { label: "Draft", value: "draft" },
            { label: "Published", value: "published" },
            { label: "Archived", value: "archived" },
          ],
          defaultValue: "draft",
          ui: { displayMode: "segmented-control" },
        }),
        content: document({
          // Rich text editor with custom blocks
          formatting: true,
          links: true,
          dividers: true,
          layouts: [
            [1, 1],                 // Two-column layout
            [1, 1, 1],             // Three-column layout
          ],
          componentBlocks: {},     // Custom editor components
        }),
        heroImage: image({
          storage: "localImages",  // Configured in storage section
        }),
        publishedAt: timestamp(),
        author: relationship({
          ref: "User.posts",       // Bidirectional relationship
          ui: { displayMode: "cards", cardFields: ["name", "email"] },
        }),
        categories: relationship({
          ref: "Category.posts",
          many: true,              // Many-to-many relationship
          ui: { displayMode: "select" },
        }),
        readingTime: integer({
          ui: { createView: { fieldMode: "hidden" } },  // Auto-calculated
          hooks: {
            resolveInput({ resolvedData }) {
              if (resolvedData.content) {
                const wordCount = JSON.stringify(resolvedData.content).split(/\s+/).length;
                return Math.ceil(wordCount / 200);  // ~200 words per minute
              }
              return undefined;
            },
          },
        }),
      },
    }),

    // Category taxonomy
    Category: list({
      access: allowAll,
      fields: {
        name: text({ validation: { isRequired: true }, isIndexed: "unique" }),
        description: text({ ui: { displayMode: "textarea" } }),
        posts: relationship({ ref: "Post.categories", many: true }),
      },
    }),

    // User with authentication
    User: list({
      access: allowAll,
      fields: {
        name: text({ validation: { isRequired: true } }),
        email: text({ validation: { isRequired: true }, isIndexed: "unique" }),
        password: password({
          validation: { isRequired: true, length: { min: 8 } },
        }),
        role: select({
          options: [
            { label: "Admin", value: "admin" },
            { label: "Editor", value: "editor" },
            { label: "Author", value: "author" },
          ],
          defaultValue: "author",
        }),
        posts: relationship({ ref: "Post.author", many: true }),
      },
    }),
  },

  // File storage configuration
  storage: {
    localImages: {
      kind: "local",
      type: "image",
      generateUrl: (path) => `/images${path}`,
      serverRoute: { path: "/images" },
      storagePath: "public/images",
    },
  },

  // Authentication
  session: {
    maxAge: 60 * 60 * 24 * 30,     // 30 days
    secret: process.env.SESSION_SECRET!,
  },
});
```

### Access Control

Implement fine-grained permissions:

```typescript
// access.ts — Role-based access control rules
import { ListAccessArgs } from "@keystone-6/core/types";

// Helper to check if user is authenticated
function isSignedIn({ session }: ListAccessArgs) {
  return !!session;
}

// Helper to check user role
function hasRole(role: string) {
  return ({ session }: ListAccessArgs) => session?.data?.role === role;
}

// Post-specific access rules
export const postAccess = {
  operation: {
    query: allowAll,                        // Anyone can read published posts
    create: isSignedIn,                     // Must be logged in to create
    update: isSignedIn,
    delete: hasRole("admin"),               // Only admins can delete
  },
  filter: {
    // Non-admins can only see published posts (in query results)
    query: ({ session }: ListAccessArgs) => {
      if (session?.data?.role === "admin") return {};  // Admins see everything
      return { status: { equals: "published" } };
    },
    // Authors can only update their own posts
    update: ({ session }: ListAccessArgs) => {
      if (session?.data?.role === "admin") return {};
      return { author: { id: { equals: session?.itemId } } };
    },
  },
  item: {
    // Additional per-item checks
    update: async ({ session, item }: any) => {
      // Editors can update any post, authors only their own
      if (session?.data?.role === "editor") return true;
      return item.authorId === session?.itemId;
    },
  },
};
```

### Custom GraphQL Extensions

Add custom queries and mutations:

```typescript
// schema.extensions.ts — Extend the auto-generated GraphQL API
import { graphql } from "@keystone-6/core";

export const extendGraphqlSchema = graphql.extend((base) => ({
  query: {
    // Custom query: get featured posts
    featuredPosts: graphql.field({
      type: graphql.list(graphql.nonNull(base.object("Post"))),
      args: { limit: graphql.arg({ type: graphql.Int, defaultValue: 5 }) },
      async resolve(source, { limit }, context) {
        return context.db.Post.findMany({
          where: {
            status: { equals: "published" },
          },
          orderBy: { publishedAt: "desc" },
          take: limit,
        });
      },
    }),

    // Custom query: site statistics
    siteStats: graphql.field({
      type: graphql.object("SiteStats")({
        fields: {
          totalPosts: graphql.field({ type: graphql.Int }),
          totalUsers: graphql.field({ type: graphql.Int }),
          totalCategories: graphql.field({ type: graphql.Int }),
        },
      }),
      async resolve(source, args, context) {
        const [posts, users, categories] = await Promise.all([
          context.db.Post.count({ where: { status: { equals: "published" } } }),
          context.db.User.count(),
          context.db.Category.count(),
        ]);
        return {
          totalPosts: posts,
          totalUsers: users,
          totalCategories: categories,
        };
      },
    }),
  },

  mutation: {
    // Custom mutation: publish a post
    publishPost: graphql.field({
      type: base.object("Post"),
      args: { id: graphql.arg({ type: graphql.nonNull(graphql.ID) }) },
      async resolve(source, { id }, context) {
        return context.db.Post.updateOne({
          where: { id },
          data: {
            status: "published",
            publishedAt: new Date().toISOString(),
          },
        });
      },
    }),
  },
}));
```

### Webhooks and Hooks

React to data changes with lifecycle hooks:

```typescript
// hooks/post-hooks.ts — Lifecycle hooks for post content
import { ListHooks } from "@keystone-6/core/types";

export const postHooks: ListHooks<any> = {
  // Before saving to the database
  resolveInput: {
    create: async ({ resolvedData, context }) => {
      // Auto-set the author to the current user
      if (!resolvedData.author && context.session) {
        resolvedData.author = { connect: { id: context.session.itemId } };
      }
      return resolvedData;
    },
  },

  // After saving — trigger side effects
  afterOperation: {
    create: async ({ item, context }) => {
      // Send notification when a new post is created
      console.log(`New post created: ${item.title}`);
    },
    update: async ({ item, originalItem, context }) => {
      // Trigger revalidation when a post is published
      if (originalItem.status !== "published" && item.status === "published") {
        await fetch(`${process.env.FRONTEND_URL}/api/revalidate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            secret: process.env.REVALIDATION_SECRET,
            path: `/posts/${item.slug}`,
          }),
        });
      }
    },
  },

  // Validate before saving
  validateInput: async ({ resolvedData, addValidationError }) => {
    if (resolvedData.status === "published" && !resolvedData.content) {
      addValidationError("Cannot publish a post without content");
    }
  },
};
```

## Installation

```bash
# Create a new Keystone project
npm create keystone-app@latest my-cms

# Or add to existing project
npm install @keystone-6/core @keystone-6/fields-document

# Run in development mode (auto-generates Prisma schema + Admin UI)
npx keystone dev
# Admin UI at http://localhost:3000
# GraphQL playground at http://localhost:3000/api/graphql
```


## Examples

### Example 1

**User request:** "Help me set up Keystonejs"

The agent follows the instructions above to configure Keystonejs with recommended settings, handling dependencies and environment setup.

### Example 2

**User request:** "Debug an issue with my Keystonejs configuration"

The agent diagnoses common configuration problems, checks logs, validates settings, and suggests fixes based on the guidelines above.


## Guidelines

1. **Schema is code** — Define your content model in TypeScript; get auto-generated Admin UI, GraphQL API, and database migrations
2. **Use relationships over IDs** — Let Keystone manage foreign keys; bidirectional relationships (`ref: "Post.author"`) keep data consistent
3. **Access control from the start** — Don't use `allowAll` in production; define operation + filter + item level access per list
4. **Document field for rich content** — The document field gives editors a structured rich text experience with custom blocks
5. **Hooks for business logic** — Use `afterOperation` for side effects (notifications, cache invalidation, webhooks)
6. **Custom GraphQL for complex queries** — Extend the schema for aggregations, full-text search, or multi-step operations
7. **Prisma migrations** — Keystone uses Prisma under the hood; run `keystone prisma migrate` for production migrations
8. **Separate API from admin** — In production, protect the admin UI behind authentication; expose only the GraphQL API publicly
