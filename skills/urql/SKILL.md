---
name: urql
description: >-
  urql is a small, extensible GraphQL client for React, Preact, Vue, Svelte,
  Solid and plain JavaScript that sends queries, mutations and subscriptions
  and caches the results. Use when a user asks to add a GraphQL client to a
  frontend, fetch data with useQuery or useMutation, set up normalized caching
  with Graphcache, add auth, retry or subscription exchanges, replace Apollo
  Client with something lighter, or upgrade to urql 5.
license: Apache-2.0
compatibility: "Node.js or any modern browser. urql 5 (React 16.8+) with @urql/core 6; framework bindings exist for Preact, Vue 3, Svelte and Solid."
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags:
    - graphql
    - react
    - client
    - cache
    - typescript
  repository: https://github.com/urql-graphql/urql
---

# urql — Lightweight GraphQL Client

## Overview

urql is a GraphQL client built from a small core (`@urql/core`) and a pipeline of "exchanges" — middleware that each operation passes through, such as caching, auth, retries and the HTTP fetch itself. The default document cache stores whole query results and is enough for content-driven apps; `@urql/exchange-graphcache` adds a normalized cache when several queries must stay in sync after a mutation. The `urql` package holds the React bindings; `@urql/preact`, `@urql/vue`, `@urql/svelte` and `@urql/solid` wrap the same core.

## Instructions

### Installation

```bash
npm install urql graphql                  # React bindings + core (graphql is an optional peer dependency)
npm install @urql/exchange-graphcache     # Optional normalized cache
npm install @urql/exchange-auth @urql/exchange-retry graphql-ws   # Optional: auth, retries, subscriptions
```

### Setup and Queries

```tsx
import { Client, Provider, cacheExchange, fetchExchange, gql, useQuery, useMutation } from "urql";

const client = new Client({
  url: "https://api.northwind.dev/graphql",
  exchanges: [cacheExchange, fetchExchange],   // required; order matters
  fetchOptions: () => ({
    headers: { Authorization: `Bearer ${getToken()}` },
  }),
});

function App() {
  return <Provider value={client}><Dashboard /></Provider>;
}

type Post = { id: string; title: string; createdAt: string; author: { id: string; name: string } };

// Type arguments give typed `data` and `variables` in the hooks
const POSTS_QUERY = gql<{ posts: Post[] }, { limit: number }>`
  query Posts($limit: Int!) {
    posts(limit: $limit) { id title author { id name } createdAt }
  }
`;

function PostList() {
  const [result, reexecute] = useQuery({
    query: POSTS_QUERY,
    variables: { limit: 10 },
  });

  const { data, fetching, error } = result;
  if (fetching) return <Spinner />;
  if (error) return <ErrorBanner message={error.message} />;
  return (
    <div>
      {data?.posts.map(p => <PostCard key={p.id} post={p} />)}
      <button onClick={() => reexecute({ requestPolicy: "network-only" })}>Refresh</button>
    </div>
  );
}
```

Since `@urql/core` 6 (urql 5), queries are sent as HTTP `GET` when the query string plus variables is under 2048 characters. If the server only accepts `POST`, add `preferGetMethod: false` to the `Client` options. Mutations always use `POST`.

### Mutations

```tsx
const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) { id title createdAt author { id name } }
  }
`;

function CreatePostForm() {
  const [result, createPost] = useMutation(CREATE_POST);

  const handleSubmit = (input: { title: string }) => {
    // The promise never rejects — check result.error instead of try/catch
    createPost({ input }).then(result => {
      if (result.error) console.error(result.error);
    });
  };

  return <PostForm onSubmit={handleSubmit} loading={result.fetching} />;
}
```

### Graphcache (Normalized Cache)

```typescript
import { cacheExchange } from "@urql/exchange-graphcache";

// Replaces the default cacheExchange in the exchanges array
const cache = cacheExchange({
  // Types are keyed by `id` or `_id` automatically; configure others here
  keys: { PostStats: () => null },         // null = embedded, not a separate entity
  resolvers: {
    Query: {
      // Serve Query.post(id) from a Post already cached by the list query
      post: (_, args) => ({ __typename: "Post", id: args.id }),
    },
  },
  updates: {
    Mutation: {
      // New entities are not added to lists automatically
      createPost(result, _args, cache) {
        cache.updateQuery({ query: POSTS_QUERY, variables: { limit: 10 } }, (data) => {
          if (data) data.posts.unshift(result.createPost as Post);
          return data;
        });
      },
      deletePost(_result, args, cache) {
        cache.invalidate({ __typename: "Post", id: args.id as string });
      },
    },
  },
});
```

### Auth, Retry and Subscriptions

```typescript
import { Client, cacheExchange, fetchExchange, subscriptionExchange } from "urql";
import { authExchange } from "@urql/exchange-auth";
import { retryExchange } from "@urql/exchange-retry";
import { createClient as createWSClient } from "graphql-ws";

const wsClient = createWSClient({ url: "wss://api.northwind.dev/graphql" });

const client = new Client({
  url: "https://api.northwind.dev/graphql",
  exchanges: [
    cacheExchange,                          // synchronous exchanges first
    authExchange(async (utils) => {
      let token = localStorage.getItem("token");
      return {
        addAuthToOperation: (operation) =>
          token ? utils.appendHeaders(operation, { Authorization: `Bearer ${token}` }) : operation,
        didAuthError: (error) => error.graphQLErrors.some(e => e.extensions?.code === "UNAUTHENTICATED"),
        refreshAuth: async () => {
          token = await refreshSession();   // runs once; failed operations are then retried
        },
      };
    }),
    retryExchange({ maxNumberAttempts: 2, retryIf: (error) => !!error.networkError }),
    fetchExchange,
    subscriptionExchange({
      forwardSubscription(request) {
        const input = { ...request, query: request.query || "" };
        return { subscribe: (sink) => ({ unsubscribe: wsClient.subscribe(input, sink) }) };
      },
    }),
  ],
});
```

In components, `useSubscription({ query }, (previous = [], event) => [event.newMessages, ...previous])` accumulates events with a reducer.

## Examples

### Example 1: Add urql to a React app and list posts

**User request:** "Our React dashboard needs to read posts from our GraphQL API. Set up a client and show the ten latest."

The agent installs `urql graphql`, creates the `Client` and `Provider` and writes `PostList` as above. Checking the network tab (or server log) shows one request and none on re-render:

```text
GET /graphql?query=query+Posts(...)&operationName=Posts&variables={"limit":10}
```

The second render of `PostList` with the same variables is answered from the document cache (`cache-first`). After `CreatePost` runs, the document cache drops every cached query containing a `Post` and `PostList` refetches on its own.

### Example 2: Keep a list in sync after a mutation without refetching

**User request:** "After creating a post the list reloads from the server and flickers. Make the new post appear instantly."

The agent swaps the default `cacheExchange` for the Graphcache configuration above (`exchanges: [cache, fetchExchange]`) and adds the `createPost` updater. The server now sees only the mutation:

```text
GET  Posts          → 2 posts
POST CreatePost     → { id: "p3", title: "Postmortem: checkout latency" }
(no further request) → list shows 3 posts, new one first
```

`Query.post(id: "p1")` is also answered without a request, because the resolver points it at the `Post` already normalized from the list.

## Guidelines

1. **Document cache** — Default cache keys by query+variables and invalidates by `__typename` after mutations; sufficient for most apps
2. **Empty lists are never invalidated** — a result of `[]` carries no `__typename`. Pass `context: useMemo(() => ({ additionalTypenames: ["Post"] }), [])` to `useQuery`, or use Graphcache
3. **Graphcache for complex** — Use normalized cache only when you need cache updates across queries; every entity type needs an `id`/`_id` or a `keys` entry, otherwise Graphcache warns and embeds it in its parent
4. **Exchange order** — synchronous exchanges (cache) first, then asynchronous ones (auth, retry), with `fetchExchange` after them; the retry exchange only works between the cache and the fetch exchange
5. **GET by default** — urql 5 sends short queries as `GET`; set `preferGetMethod: false` for servers, CDNs or CSRF middleware that expect `POST`
6. **Request policies** — Use `cache-first` (default), `network-only` for refresh, `cache-and-network` for stale-while-revalidate (watch `result.stale`), `cache-only` to never hit the network
7. **Stable inputs** — keep the `context` object reference stable with `useMemo`, and use `pause: true` to hold a query back until its variables exist
8. **Tokens** — read tokens at request time (`fetchOptions` as a function or the auth exchange); never hardcode them in the client config
9. **Bundle size** — urql is about 10 kB min+gzip (11 kB with bindings) against roughly 50 kB for Apollo Client; Graphcache adds about 8 kB
10. **SSR** — Use `ssrExchange` for server-side rendering and rehydration, or `@urql/next` for the Next.js App Router
11. **Subscriptions** — Add `subscriptionExchange` with a `graphql-ws` client; for servers that stream subscriptions over HTTP, set `fetchSubscriptions: true` instead
