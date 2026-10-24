---
name: apollo-client
description: >-
  Apollo Client is the GraphQL client for React with a normalized in-memory
  cache. Use when someone asks to "set up Apollo Client", "fetch GraphQL data in
  React", "add pagination with fetchMore", "do optimistic updates with
  useMutation", "send an auth header with Apollo", "handle GraphQL errors", or
  "migrate Apollo Client 3 to 4".
license: Apache-2.0
compatibility: "React 18 or 19, @apollo/client 4.x, graphql 16, rxjs 7. TypeScript recommended."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags:
    - graphql
    - react
    - cache
    - state-management
    - data-fetching
  repository: https://github.com/apollographql/apollo-client
---

# Apollo Client — GraphQL Client for React

## Overview

Apollo Client fetches GraphQL data into React components and keeps it in a normalized cache keyed by `__typename` and `id`, so one update refreshes every query that shows that entity. This skill targets **version 4** (4.3.5 at the time of writing). Version 4 moved a lot compared with 3.x: React hooks and `ApolloProvider` import from `@apollo/client/react`, the client takes a `link` instead of `uri`/`headers`, links are classes (`HttpLink`, `SetContextLink`, `ErrorLink`), `rxjs` is a peer dependency, and errors are typed classes. Apollo also ships its own guide inside the package at `node_modules/@apollo/client/skills/apollo-client/`.

## Instructions

### Install and create the client

```bash
npm install @apollo/client graphql rxjs
```

```tsx
// src/apollo.tsx
import { ApolloClient, InMemoryCache, HttpLink } from "@apollo/client";
import { ApolloProvider } from "@apollo/client/react";
import type { ReactNode } from "react";

export const client = new ApolloClient({
  link: new HttpLink({ uri: "https://api.northwind.dev/graphql", credentials: "include" }),
  cache: new InMemoryCache(),
});

export function Providers({ children }: { children: ReactNode }) {
  return <ApolloProvider client={client}>{children}</ApolloProvider>;
}
```

`uri`, `headers` and `credentials` on `new ApolloClient({...})` were removed in 4.0; configure them on `HttpLink`. Prefer HttpOnly cookies (`credentials: "include"`) for sessions.

### Queries (typed)

Attach types to the document with `TypedDocumentNode` (or use GraphQL Code Generator); do not pass generics at the hook call site. Check `dataState` or `data` before using the result.

```tsx
import { gql, type TypedDocumentNode } from "@apollo/client";
import { useQuery } from "@apollo/client/react";

type PostsData = { posts: { id: string; title: string; excerpt: string }[] };
type PostsVars = { limit: number; offset: number };

export const GET_POSTS: TypedDocumentNode<PostsData, PostsVars> = gql`
  query GetPosts($limit: Int!, $offset: Int!) {
    posts(limit: $limit, offset: $offset) { id title excerpt }
  }
`;

export function PostList() {
  const { data, error, fetchMore } = useQuery(GET_POSTS, { variables: { limit: 10, offset: 0 } });
  if (error) return <p>Failed to load: {error.message}</p>;
  if (!data) return <p>Loading…</p>;
  return (
    <div>
      {data.posts.map((p) => <article key={p.id}><h3>{p.title}</h3><p>{p.excerpt}</p></article>)}
      <button onClick={() => fetchMore({ variables: { offset: data.posts.length } })}>Load more</button>
    </div>
  );
}
```

For offset pagination, merge pages in the cache rather than in the component. Without a merge policy on the cache your client uses, `fetchMore` replaces the list with the new page instead of appending it. Pass this cache to the `ApolloClient` in `src/apollo.tsx`:

```ts
import { InMemoryCache } from "@apollo/client";
import { offsetLimitPagination } from "@apollo/client/utilities";

const cache = new InMemoryCache({
  typePolicies: { Query: { fields: { posts: offsetLimitPagination() } } },
});
// With extra arguments that select a different list: offsetLimitPagination(["filter"])
// For Relay connections: relayStylePagination() from the same module.
```

`useSuspenseQuery`, `useBackgroundQuery`, `useLazyQuery`, `useFragment` and `skipToken` live in `@apollo/client/react` too.

### Mutations with optimistic UI

`optimisticResponse` must be a complete result for the mutation, including `__typename`. The `update` function runs twice: once for the optimistic data and again for the server result.

```tsx
import { gql, type TypedDocumentNode } from "@apollo/client";
import { useMutation } from "@apollo/client/react";

type AddPostData = { addPost: { __typename: "Post"; id: string; title: string; excerpt: string } };
type AddPostVars = { title: string; body: string };

const ADD_POST: TypedDocumentNode<AddPostData, AddPostVars> = gql`
  mutation AddPost($title: String!, $body: String!) {
    addPost(title: $title, body: $body) { id title excerpt }
  }
`;

export function useAddPost() {
  return useMutation(ADD_POST, {
    optimisticResponse: (vars) => ({
      addPost: { __typename: "Post" as const, id: `temp-${Date.now()}`, title: vars.title, excerpt: vars.body.slice(0, 120) },
    }),
    update(cache, { data }) {
      if (!data) return;
      cache.modify({
        fields: {
          posts(existing = [], { toReference }) {
            return [toReference(data.addPost)!, ...existing];
          },
        },
      });
    },
  });
}
```

Use `refetchQueries: [GET_POSTS]` instead when the server result is easier to refetch than to patch.

### Auth headers and error handling

Links compose with `.concat()` / `ApolloLink.from`. Use `SetContextLink` for headers and `ErrorLink` for global errors; the handler receives a single `error` (not `graphQLErrors` / `networkError` as in 3.x). Identify the kind of error with the static `is` helpers from `@apollo/client/errors`.

```ts
import { ApolloClient, ApolloLink, HttpLink, InMemoryCache } from "@apollo/client";
import { SetContextLink } from "@apollo/client/link/context";
import { ErrorLink } from "@apollo/client/link/error";
import { CombinedGraphQLErrors } from "@apollo/client/errors";

const authLink = new SetContextLink(({ headers }) => ({
  headers: { ...headers, authorization: `Bearer ${sessionStorage.getItem("access_token") ?? ""}` },
}));

const errorLink = new ErrorLink(({ error }) => {
  if (CombinedGraphQLErrors.is(error) && error.errors.some((e) => e.extensions?.code === "UNAUTHENTICATED")) {
    sessionStorage.removeItem("access_token");
    window.location.assign("/login");
  }
});

export const client = new ApolloClient({
  link: ApolloLink.from([errorLink, authLink, new HttpLink({ uri: "https://api.northwind.dev/graphql" })]),
  cache: new InMemoryCache(),
});
```

Retry with `RetryLink` from `@apollo/client/link/retry`. In development, call `loadDevMessages()` and `loadErrorMessages()` from `@apollo/client/dev` to get readable error text.

## Examples

### Example 1: Add Apollo to a Vite React app

**Request:** "Hook our React app up to the GraphQL API at https://api.northwind.dev/graphql and list posts."

Install `@apollo/client graphql rxjs`, add `src/apollo.tsx` from above (with the `offsetLimitPagination` cache from the pagination snippet), wrap `<App />` in `<Providers>` in `main.tsx`, and render `<PostList />`. The page shows "Loading…" and then ten posts; "Load more" appends the next ten through the offset policy.

### Example 2: Migrate a 3.x codebase to 4

**Request:** "We upgraded to @apollo/client 4 and everything stopped compiling."

Change `import { useQuery, ApolloProvider } from "@apollo/client"` to `@apollo/client/react`; replace `new ApolloClient({ uri, headers })` with `link: new HttpLink({ uri, headers })`; replace `setContext`/`onError`/`createHttpLink` with `SetContextLink`/`ErrorLink`/`HttpLink`; install `rxjs`; and read errors through `CombinedGraphQLErrors.is(error)` instead of `error.graphQLErrors`. Run `npx tsc --noEmit` to find the remainder; Apollo's migration guide lists the rest.

## Guidelines

- Always request `id` (or your configured key fields) on entities, or normalization and cache updates silently fail.
- Define `TypedDocumentNode`s or generate types with GraphQL Code Generator; avoid `any` data.
- Do not keep access tokens in `localStorage` if cookies are possible; tokens there are readable by any script on the page.
- Set `keyArgs` in type policies for any paginated field that also takes filters, or different filters will share one list.
- Prefer `cache.modify` / `refetchQueries` over manually rewriting query results.
- For Next.js App Router and other SSR frameworks, use the framework integration packages and guides rather than a client created at module scope on the server.
