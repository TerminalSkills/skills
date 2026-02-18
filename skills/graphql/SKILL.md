---
name: graphql
description: >-
  Build and consume GraphQL APIs. Use when a user asks to create a GraphQL
  server, write GraphQL schemas, implement resolvers, set up subscriptions,
  build a GraphQL API, add authentication to GraphQL, optimize queries with
  DataLoader, implement pagination, handle file uploads, generate types from
  schema, consume a GraphQL endpoint, or migrate from REST to GraphQL. Covers
  Apollo Server, Apollo Client, schema design, resolvers, subscriptions,
  federation, and production patterns.
license: Apache-2.0
compatibility: 'Node.js 18+ (Apollo Server/Client) or Python 3.9+ (Strawberry, Ariadne)'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - graphql
    - api
    - apollo
    - schema
    - resolvers
---

# GraphQL

## Overview

Design, build, and consume GraphQL APIs. This skill covers schema-first and code-first approaches, resolver patterns, real-time subscriptions, authentication, performance optimization with DataLoader, pagination, federation for microservices, and client-side consumption with Apollo Client.

## Instructions

### Step 1: Project Setup

**Server (Apollo Server):**
```bash
npm install @apollo/server graphql
npm install @apollo/server express cors  # With Express
npm install dataloader                    # For N+1 prevention
```

**Client (Apollo Client):**
```bash
npm install @apollo/client graphql
```

**Type generation:**
```bash
npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-resolvers
```

### Step 2: Schema Design

```graphql
type Query {
  user(id: ID!): User
  users(filter: UserFilter, pagination: PaginationInput): UserConnection!
  feed(cursor: String, limit: Int = 20): PostConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  createPost(input: CreatePostInput!): Post!
  likePost(id: ID!): Post!
}

type Subscription {
  postCreated: Post!
}

type User {
  id: ID!
  email: String!
  name: String!
  posts(limit: Int = 10): [Post!]!
  createdAt: DateTime!
}

type Post {
  id: ID!
  title: String!
  content: String!
  author: User!
  comments: [Comment!]!
  likes: Int!
  createdAt: DateTime!
}

# Relay-style cursor pagination
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}
type UserEdge { node: User!; cursor: String! }
type PageInfo { hasNextPage: Boolean!; hasPreviousPage: Boolean!; endCursor: String }

input CreateUserInput { email: String!; name: String! }
input UpdateUserInput { name: String; avatar: String }
input CreatePostInput { title: String!; content: String!; tags: [String!] }
input PaginationInput { first: Int; after: String }
scalar DateTime
```

Schema design rules: use `!` for non-nullable fields, input types for mutations, Relay-style connections for pagination, descriptive verb names (`createUser`, not `addUser`).

### Step 3: Resolvers

```javascript
import { GraphQLError } from 'graphql';

export const resolvers = {
  Query: {
    user: async (_, { id }, { dataSources }) => dataSources.users.getById(id),
    users: async (_, { filter, pagination }, { dataSources }) => {
      const { first = 20, after } = pagination || {};
      const result = await dataSources.users.getMany({ filter, first, after });
      return {
        edges: result.items.map(item => ({
          node: item, cursor: Buffer.from(item.id).toString('base64'),
        })),
        pageInfo: { hasNextPage: result.hasMore, hasPreviousPage: !!after,
          endCursor: result.items.at(-1) ? Buffer.from(result.items.at(-1).id).toString('base64') : null },
        totalCount: result.totalCount,
      };
    },
  },
  Mutation: {
    createUser: async (_, { input }, { dataSources, user }) => {
      if (!user) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      return dataSources.users.create(input);
    },
    createPost: async (_, { input }, { dataSources, user }) => {
      if (!user) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      return dataSources.posts.create({ ...input, authorId: user.id });
    },
  },
  User: { posts: async (parent, { limit }, { dataSources }) => dataSources.posts.getByAuthor(parent.id, limit) },
  Post: { author: async (parent, _, { dataSources }) => dataSources.users.getById(parent.authorId) },
};
```

### Step 4: Server Setup with Subscriptions

```javascript
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import express from 'express';
import cors from 'cors';

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
const httpServer = require('http').createServer(app);
const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
useServer({ schema }, wsServer);

const server = new ApolloServer({ schema });
await server.start();
app.use('/graphql', cors(), express.json(), expressMiddleware(server, {
  context: async ({ req }) => ({
    user: await getUserFromToken(req.headers.authorization?.replace('Bearer ', '')),
    dataSources: createDataSources(),
  }),
}));
httpServer.listen(4000);
```

### Step 5: DataLoader (N+1 Problem)

```javascript
import DataLoader from 'dataloader';

export function createDataSources() {
  const userLoader = new DataLoader(async (ids) => {
    const users = await db.users.findMany({ where: { id: { in: ids } } });
    const userMap = new Map(users.map(u => [u.id, u]));
    return ids.map(id => userMap.get(id) || null); // Must return in same order as input
  });
  return {
    users: { getById: (id) => userLoader.load(id), create: (input) => db.users.create({ data: input }) },
    posts: { getByAuthor: (authorId, limit) => db.posts.findMany({ where: { authorId }, take: limit }) },
  };
}
```

### Step 6: Apollo Client (React)

```jsx
import { ApolloClient, InMemoryCache, gql, useQuery, useMutation } from '@apollo/client';

const client = new ApolloClient({ uri: '/graphql', cache: new InMemoryCache() });

const GET_FEED = gql`
  query GetFeed($cursor: String) {
    feed(cursor: $cursor, limit: 20) {
      edges { node { id title author { name } likes } cursor }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

function Feed() {
  const { data, loading, fetchMore } = useQuery(GET_FEED);
  if (loading) return <p>Loading...</p>;
  return (
    <div>
      {data.feed.edges.map(({ node }) => (
        <article key={node.id}><h2>{node.title}</h2><p>By {node.author.name}</p></article>
      ))}
      {data.feed.pageInfo.hasNextPage && (
        <button onClick={() => fetchMore({ variables: { cursor: data.feed.pageInfo.endCursor } })}>
          Load more
        </button>
      )}
    </div>
  );
}
```

### Step 7: Security

```javascript
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(7)], // Prevent deeply nested abuse queries
});

// Use @cacheControl directive for response caching
// type Query { user(id: ID!): User @cacheControl(maxAge: 60) }
```

## Examples

### Example 1: Build a blog API with cursor pagination
**User prompt:** "Create a GraphQL API for a blog with users, posts, and comments. Include cursor-based pagination for the post feed and authentication for mutations."

The agent will:
1. Define the schema with `User`, `Post`, `Comment` types, `PostConnection` for Relay-style pagination, and input types for mutations
2. Set up Apollo Server with Express, configure JWT-based context extraction
3. Implement resolvers with DataLoader to batch user lookups (preventing N+1 queries when loading post authors)
4. Add cursor pagination using base64-encoded IDs as cursors in the `feed` query
5. Protect mutation resolvers with authentication checks that throw `UNAUTHENTICATED` GraphQL errors

### Example 2: Add real-time post notifications to a React app
**User prompt:** "Add a real-time subscription so users see new posts appear in the feed without refreshing the page."

The agent will:
1. Add a `Subscription { postCreated: Post! }` type to the schema
2. Set up WebSocket server alongside the HTTP server using `graphql-ws`
3. Implement a `PubSub` instance and publish events in the `createPost` mutation resolver
4. On the client, use `useSubscription` from Apollo Client with a `POST_CREATED` subscription query
5. Update the Apollo Client cache when new posts arrive via the subscription callback

## Guidelines

1. **Schema-first design** — agree on the schema before coding resolvers
2. **Always use DataLoader** — the N+1 problem is GraphQL's biggest gotcha
3. **Cursor pagination** — offset breaks on large datasets; cursors are stable
4. **Input types for mutations** — cleaner, more evolvable than inline arguments
5. **Error codes in extensions** — `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND` for client handling
6. **Depth and complexity limits** — prevent abusive nested queries in production
7. **Codegen for types** — hand-typing GraphQL types is error-prone and wastes time
8. **Cache normalization** — Apollo Client's `InMemoryCache` deduplicates by `id` + `__typename`
9. **Subscriptions only when needed** — polling is simpler if real-time isn't critical
10. **Federation for microservices** — split schema across services with Apollo Federation
