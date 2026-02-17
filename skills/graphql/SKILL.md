---
name: graphql
description: >-
  Build and consume GraphQL APIs. Use when a user asks to create a GraphQL server,
  write GraphQL schemas, implement resolvers, set up subscriptions, build a GraphQL
  API, add authentication to GraphQL, optimize queries with DataLoader, implement
  pagination, handle file uploads, generate types from schema, consume a GraphQL
  endpoint, or migrate from REST to GraphQL. Covers Apollo Server, Apollo Client,
  schema design, resolvers, subscriptions, federation, and production patterns.
license: Apache-2.0
compatibility: "Node.js 18+ (Apollo Server/Client) or Python 3.9+ (Strawberry, Ariadne)"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["graphql", "api", "apollo", "schema", "resolvers", "federation"]
---

# GraphQL

## Overview

Design, build, and consume GraphQL APIs. This skill covers schema-first and code-first approaches, resolver patterns, real-time subscriptions, authentication, performance optimization with DataLoader, pagination, federation for microservices, and client-side consumption with Apollo Client.

## Instructions

### Step 1: Project Setup

Determine approach — **server** (building an API) or **client** (consuming one).

**Server (Node.js — Apollo Server):**
```bash
npm init -y
npm install @apollo/server graphql
# With Express:
npm install @apollo/server express cors
# With DataLoader:
npm install dataloader
```

**Server (Python — Strawberry):**
```bash
pip install strawberry-graphql[fastapi] uvicorn
```

**Client (React — Apollo Client):**
```bash
npm install @apollo/client graphql
```

**Type generation:**
```bash
npm install -D @graphql-codegen/cli @graphql-codegen/typescript @graphql-codegen/typescript-resolvers
```

### Step 2: Schema Design

The schema is the contract. Design it before writing resolvers.

```graphql
# schema.graphql

type Query {
  user(id: ID!): User
  users(filter: UserFilter, pagination: PaginationInput): UserConnection!
  post(id: ID!): Post
  feed(cursor: String, limit: Int = 20): PostConnection!
}

type Mutation {
  createUser(input: CreateUserInput!): User!
  updateUser(id: ID!, input: UpdateUserInput!): User!
  deleteUser(id: ID!): Boolean!
  createPost(input: CreatePostInput!): Post!
  likePost(id: ID!): Post!
}

type Subscription {
  postCreated: Post!
  messageReceived(channelId: ID!): Message!
}

type User {
  id: ID!
  email: String!
  name: String!
  avatar: String
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
  tags: [String!]!
  createdAt: DateTime!
}

type Comment {
  id: ID!
  text: String!
  author: User!
  createdAt: DateTime!
}

# Relay-style pagination
type UserConnection {
  edges: [UserEdge!]!
  pageInfo: PageInfo!
  totalCount: Int!
}

type UserEdge {
  node: User!
  cursor: String!
}

type PageInfo {
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String
  endCursor: String
}

# Inputs
input CreateUserInput {
  email: String!
  name: String!
  avatar: String
}

input UpdateUserInput {
  name: String
  avatar: String
}

input CreatePostInput {
  title: String!
  content: String!
  tags: [String!]
}

input UserFilter {
  name: String
  createdAfter: DateTime
}

input PaginationInput {
  first: Int
  after: String
  last: Int
  before: String
}

scalar DateTime
```

Schema design rules:
- **Use `!` for non-nullable fields** — be strict about what's always present
- **Input types for mutations** — never reuse output types as inputs
- **Connections for pagination** — Relay-style cursor pagination scales better than offset
- **Descriptive names** — `createUser`, not `addUser` or `newUser`

### Step 3: Resolvers (Apollo Server)

```javascript
// src/resolvers.js
import { GraphQLError } from 'graphql';

export const resolvers = {
  Query: {
    user: async (_, { id }, { dataSources, user }) => {
      return dataSources.users.getById(id);
    },

    users: async (_, { filter, pagination }, { dataSources }) => {
      const { first = 20, after } = pagination || {};
      const result = await dataSources.users.getMany({ filter, first, after });
      return {
        edges: result.items.map(item => ({
          node: item,
          cursor: Buffer.from(item.id).toString('base64'),
        })),
        pageInfo: {
          hasNextPage: result.hasMore,
          hasPreviousPage: !!after,
          startCursor: result.items[0] ? Buffer.from(result.items[0].id).toString('base64') : null,
          endCursor: result.items.at(-1) ? Buffer.from(result.items.at(-1).id).toString('base64') : null,
        },
        totalCount: result.totalCount,
      };
    },

    feed: async (_, { cursor, limit }, { dataSources }) => {
      return dataSources.posts.getFeed({ cursor, limit });
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

    likePost: async (_, { id }, { dataSources, user }) => {
      if (!user) throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
      return dataSources.posts.like(id, user.id);
    },
  },

  // Field-level resolvers — resolve relationships
  User: {
    posts: async (parent, { limit }, { dataSources }) => {
      return dataSources.posts.getByAuthor(parent.id, limit);
    },
  },

  Post: {
    author: async (parent, _, { dataSources }) => {
      return dataSources.users.getById(parent.authorId);
    },
    comments: async (parent, _, { dataSources }) => {
      return dataSources.comments.getByPost(parent.id);
    },
  },

  Comment: {
    author: async (parent, _, { dataSources }) => {
      return dataSources.users.getById(parent.authorId);
    },
  },
};
```

### Step 4: Server Setup

```javascript
// src/index.js
import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { WebSocketServer } from 'ws';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import { resolvers } from './resolvers.js';
import { getUserFromToken } from './auth.js';
import { createDataSources } from './datasources.js';

const typeDefs = readFileSync('./schema.graphql', 'utf-8');
const schema = makeExecutableSchema({ typeDefs, resolvers });

const app = express();
const httpServer = createServer(app);

// WebSocket server for subscriptions
const wsServer = new WebSocketServer({ server: httpServer, path: '/graphql' });
const serverCleanup = useServer({
  schema,
  context: async (ctx) => {
    const token = ctx.connectionParams?.authorization;
    return { user: await getUserFromToken(token) };
  },
}, wsServer);

const server = new ApolloServer({
  schema,
  plugins: [{
    async serverWillStart() {
      return { async drainServer() { await serverCleanup.dispose(); } };
    },
  }],
});

await server.start();

app.use('/graphql', cors(), express.json(), expressMiddleware(server, {
  context: async ({ req }) => {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await getUserFromToken(token);
    const dataSources = createDataSources();
    return { user, dataSources };
  },
}));

httpServer.listen(4000, () => console.log('Server ready at http://localhost:4000/graphql'));
```

### Step 5: DataLoader (N+1 Problem)

Without DataLoader, loading 20 posts with authors makes 20 separate DB queries. DataLoader batches them into one:

```javascript
// src/datasources.js
import DataLoader from 'dataloader';
import db from './db.js';

export function createDataSources() {
  const userLoader = new DataLoader(async (ids) => {
    const users = await db.users.findMany({ where: { id: { in: ids } } });
    // DataLoader requires results in the same order as input ids
    const userMap = new Map(users.map(u => [u.id, u]));
    return ids.map(id => userMap.get(id) || null);
  });

  return {
    users: {
      getById: (id) => userLoader.load(id),
      getMany: ({ filter, first, after }) => { /* ... */ },
      create: (input) => { /* ... */ },
    },
    posts: {
      getByAuthor: async (authorId, limit) => {
        return db.posts.findMany({ where: { authorId }, take: limit, orderBy: { createdAt: 'desc' } });
      },
      create: async (input) => {
        const post = await db.posts.create({ data: input });
        // Publish for subscriptions
        pubsub.publish('POST_CREATED', { postCreated: post });
        return post;
      },
    },
    comments: {
      getByPost: async (postId) => {
        return db.comments.findMany({ where: { postId }, orderBy: { createdAt: 'asc' } });
      },
    },
  };
}
```

### Step 6: Subscriptions

```javascript
// In resolvers
import { PubSub } from 'graphql-subscriptions';
const pubsub = new PubSub();

export const resolvers = {
  // ... Query, Mutation as above

  Subscription: {
    postCreated: {
      subscribe: () => pubsub.asyncIterableIterator(['POST_CREATED']),
    },
    messageReceived: {
      subscribe: (_, { channelId }) => {
        return pubsub.asyncIterableIterator([`MESSAGE_${channelId}`]);
      },
    },
  },
};
```

For production, replace in-memory PubSub with Redis:
```bash
npm install graphql-redis-subscriptions ioredis
```
```javascript
import { RedisPubSub } from 'graphql-redis-subscriptions';
import Redis from 'ioredis';
const pubsub = new RedisPubSub({
  publisher: new Redis(),
  subscriber: new Redis(),
});
```

### Step 7: Authentication and Authorization

```javascript
// src/auth.js
import jwt from 'jsonwebtoken';

export async function getUserFromToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}

// Directive-based authorization
import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';

function authDirective(schema) {
  return mapSchema(schema, {
    [MapperKind.OBJECT_FIELD]: (fieldConfig) => {
      const authDir = getDirective(schema, fieldConfig, 'auth')?.[0];
      if (authDir) {
        const { resolve } = fieldConfig;
        fieldConfig.resolve = async (source, args, context, info) => {
          if (!context.user) {
            throw new GraphQLError('Not authenticated', { extensions: { code: 'UNAUTHENTICATED' } });
          }
          if (authDir.requires && !context.user.roles.includes(authDir.requires)) {
            throw new GraphQLError('Forbidden', { extensions: { code: 'FORBIDDEN' } });
          }
          return resolve(source, args, context, info);
        };
      }
      return fieldConfig;
    },
  });
}
```

### Step 8: Apollo Client (React)

```jsx
// src/apollo.js
import { ApolloClient, InMemoryCache, createHttpLink, split } from '@apollo/client';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { getMainDefinition } from '@apollo/client/utilities';
import { setContext } from '@apollo/client/link/context';

const httpLink = createHttpLink({ uri: '/graphql' });

const authLink = setContext((_, { headers }) => ({
  headers: { ...headers, authorization: `Bearer ${localStorage.getItem('token')}` },
}));

const wsLink = new GraphQLWsLink(createClient({
  url: 'ws://localhost:4000/graphql',
  connectionParams: { authorization: localStorage.getItem('token') },
}));

const splitLink = split(
  ({ query }) => {
    const def = getMainDefinition(query);
    return def.kind === 'OperationDefinition' && def.operation === 'subscription';
  },
  wsLink,
  authLink.concat(httpLink),
);

export const client = new ApolloClient({
  link: splitLink,
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          feed: { keyArgs: false, merge: (existing = { edges: [] }, incoming) => ({
            ...incoming,
            edges: [...existing.edges, ...incoming.edges],
          })},
        },
      },
    },
  }),
});

// React component
import { useQuery, useMutation, useSubscription, gql } from '@apollo/client';

const GET_FEED = gql`
  query GetFeed($cursor: String) {
    feed(cursor: $cursor, limit: 20) {
      edges { node { id title author { name } likes createdAt } cursor }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) { id title }
  }
`;

const POST_CREATED = gql`
  subscription OnPostCreated {
    postCreated { id title author { name } }
  }
`;

function Feed() {
  const { data, loading, fetchMore } = useQuery(GET_FEED);
  const [createPost] = useMutation(CREATE_POST, {
    update(cache, { data: { createPost } }) {
      // Update cache optimistically
      cache.modify({
        fields: {
          feed(existing) {
            const newEdge = { node: createPost, cursor: btoa(createPost.id), __typename: 'PostEdge' };
            return { ...existing, edges: [newEdge, ...existing.edges] };
          },
        },
      });
    },
  });

  useSubscription(POST_CREATED, {
    onData: ({ data }) => console.log('New post:', data.data.postCreated),
  });

  if (loading) return <p>Loading...</p>;

  return (
    <div>
      {data.feed.edges.map(({ node }) => (
        <article key={node.id}>
          <h2>{node.title}</h2>
          <p>By {node.author.name} · {node.likes} likes</p>
        </article>
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

### Step 9: Type Generation (Codegen)

```yaml
# codegen.yml
schema: "./schema.graphql"
generates:
  src/generated/types.ts:
    plugins:
      - typescript
      - typescript-resolvers
    config:
      contextType: "../context#GraphQLContext"
      mapperTypeSuffix: Model
      useIndexSignature: true
  src/generated/operations.ts:
    documents: "src/**/*.graphql"
    plugins:
      - typescript
      - typescript-operations
      - typescript-react-apollo
```

```bash
npx graphql-codegen
```

Now resolvers are fully typed:
```typescript
import { Resolvers } from './generated/types';

const resolvers: Resolvers = {
  Query: {
    user: async (_, { id }, { dataSources }) => {
      // TypeScript knows id is string, return type must be User
      return dataSources.users.getById(id);
    },
  },
};
```

### Step 10: Performance and Security

**Query depth limiting:**
```bash
npm install graphql-depth-limit
```
```javascript
import depthLimit from 'graphql-depth-limit';

const server = new ApolloServer({
  schema,
  validationRules: [depthLimit(7)],
});
```

**Query complexity:**
```bash
npm install graphql-query-complexity
```
```javascript
import { createComplexityLimitRule } from 'graphql-query-complexity';

const server = new ApolloServer({
  schema,
  validationRules: [
    createComplexityLimitRule(1000, { /* field costs */ }),
  ],
});
```

**Persisted queries (Apollo Automatic Persisted Queries):**
```javascript
import { ApolloServerPluginCacheControlDisabled } from '@apollo/server/plugin/disabled';

// Client sends hash instead of full query — reduces bandwidth, prevents arbitrary queries
```

**Response caching:**
```graphql
type Query {
  user(id: ID!): User @cacheControl(maxAge: 60)
  feed: PostConnection! @cacheControl(maxAge: 10)
}
```

## Best Practices

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

## Common Pitfalls

- **N+1 queries**: Every field resolver runs per item — batch with DataLoader
- **Over-fetching on server**: Resolve only requested fields; check `info.fieldNodes` for optimization
- **Circular types without limits**: `User → Posts → Author → Posts → ...` needs depth limiting
- **Mutations returning void**: Always return the modified object so the client cache updates
- **Not handling nullability**: A non-null field (`String!`) throws if the resolver returns null — plan your schema carefully
- **PubSub in production**: In-memory PubSub doesn't work across multiple server instances — use Redis
- **Missing error handling**: Unhandled resolver errors leak stack traces — use `formatError` to sanitize
