---
name: apollo-client
description: >-
  You are an expert in Apollo Client, the comprehensive GraphQL client for
  React applications. You help developers fetch data with GraphQL queries and
  mutations, manage local and remote state with Apollo's normalized cache,
  implement optimistic UI updates, handle pagination, and configure
  authentication — providing a complete data management solution for
  GraphQL-powered apps.
license: Apache-2.0
compatibility: ''
metadata:
  author: terminal-skills
  version: 1.0.0
  category: Frontend Development
  tags:
    - graphql
    - react
    - cache
    - state-management
    - typescript
    - data-fetching
---

# Apollo Client — GraphQL Client for React

You are an expert in Apollo Client, the comprehensive GraphQL client for React applications. You help developers fetch data with GraphQL queries and mutations, manage local and remote state with Apollo's normalized cache, implement optimistic UI updates, handle pagination, and configure authentication — providing a complete data management solution for GraphQL-powered apps.

## Core Capabilities

### Setup and Queries

```tsx
import { ApolloClient, InMemoryCache, ApolloProvider, gql, useQuery, useMutation } from "@apollo/client";

const client = new ApolloClient({
  uri: "https://api.example.com/graphql",
  cache: new InMemoryCache({
    typePolicies: {
      Query: {
        fields: {
          posts: { keyArgs: ["filter"], merge(existing = [], incoming) { return [...existing, ...incoming]; } },
        },
      },
    },
  }),
  headers: { Authorization: `Bearer ${getToken()}` },
});

const GET_POSTS = gql`
  query GetPosts($limit: Int!, $offset: Int!, $filter: PostFilter) {
    posts(limit: $limit, offset: $offset, filter: $filter) {
      id
      title
      excerpt
      author { id name avatar }
      createdAt
    }
  }
`;

function PostList({ filter }: { filter?: PostFilter }) {
  const { data, loading, error, fetchMore } = useQuery(GET_POSTS, {
    variables: { limit: 10, offset: 0, filter },
  });

  if (loading) return <Skeleton />;
  if (error) return <Error message={error.message} />;

  return (
    <div>
      {data.posts.map(post => <PostCard key={post.id} post={post} />)}
      <button onClick={() => fetchMore({ variables: { offset: data.posts.length } })}>
        Load more
      </button>
    </div>
  );
}
```

### Mutations with Optimistic Updates

```tsx
const CREATE_POST = gql`
  mutation CreatePost($input: CreatePostInput!) {
    createPost(input: $input) { id title excerpt author { id name } createdAt }
  }
`;

function CreatePostForm() {
  const [createPost, { loading }] = useMutation(CREATE_POST, {
    optimisticResponse: (vars) => ({
      createPost: {
        __typename: "Post",
        id: "temp-id",
        title: vars.input.title,
        excerpt: vars.input.body.slice(0, 200),
        author: { __typename: "User", id: currentUser.id, name: currentUser.name },
        createdAt: new Date().toISOString(),
      },
    }),
    update(cache, { data: { createPost } }) {
      cache.modify({
        fields: {
          posts(existing = []) {
            const ref = cache.writeFragment({ data: createPost, fragment: POST_FRAGMENT });
            return [ref, ...existing];
          },
        },
      });
    },
  });

  const handleSubmit = (data) => createPost({ variables: { input: data } });
  return <Form onSubmit={handleSubmit} loading={loading} />;
}
```

### Authentication

```tsx
import { ApolloClient, createHttpLink, ApolloLink } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import { onError } from "@apollo/client/link/error";

const httpLink = createHttpLink({ uri: "/graphql" });

const authLink = setContext((_, { headers }) => ({
  headers: { ...headers, authorization: `Bearer ${localStorage.getItem("token")}` },
}));

const errorLink = onError(({ graphQLErrors, networkError }) => {
  if (graphQLErrors?.some(e => e.extensions?.code === "UNAUTHENTICATED")) {
    localStorage.removeItem("token");
    window.location.href = "/login";
  }
});

const client = new ApolloClient({
  link: ApolloLink.from([errorLink, authLink, httpLink]),
  cache: new InMemoryCache(),
});
```

## Installation

```bash
npm install @apollo/client graphql
```

## Best Practices

1. **Normalized cache** — Apollo normalizes data by `__typename:id`; updates to one entity propagate everywhere
2. **Optimistic updates** — Provide `optimisticResponse` for mutations; UI updates instantly, corrects on server response
3. **Type policies** — Configure `typePolicies` for pagination merging, field read/write policies
4. **Code generation** — Use `graphql-codegen` to generate TypeScript types from your schema; fully typed queries
5. **Error link** — Use `onError` link for global error handling (auth refresh, logging, retry)
6. **Fragments** — Define reusable fragments for entity fields; share between queries and mutations
7. **Cache updates** — Use `update` function or `refetchQueries` after mutations; prefer cache.modify for performance
8. **Polling and subscriptions** — Use `pollInterval` for simple real-time, WebSocket subscriptions for true real-time
