---
name: react-query
description: >-
  Manage server state in React with TanStack Query (React Query). Use when a
  user asks to fetch data in React, cache API responses, handle loading states,
  implement optimistic updates, paginate data, or manage server state.
license: Apache-2.0
compatibility: 'React 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags:
    - react-query
    - tanstack
    - data-fetching
    - cache
    - react
---

# React Query (TanStack Query)

## Overview

TanStack Query (formerly React Query) manages server state — fetching, caching, synchronizing, and updating data from APIs. It replaces manual useEffect+useState patterns with declarative hooks that handle loading, error, refetching, and cache invalidation.

## Instructions

### Step 1: Setup

```bash
npm install @tanstack/react-query
```

```tsx
// app/providers.tsx — Query client provider
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
const queryClient = new QueryClient()

export function Providers({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
```

### Step 2: Fetch Data

```tsx
// hooks/usePosts.ts — Data fetching with automatic caching
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function usePosts() {
  return useQuery({
    queryKey: ['posts'],
    queryFn: () => fetch('/api/posts').then(r => r.json()),
    staleTime: 5 * 60 * 1000,    // cache for 5 minutes
  })
}

// In component:
function PostList() {
  const { data, isLoading, error } = usePosts()
  if (isLoading) return <Spinner />
  if (error) return <p>Error: {error.message}</p>
  return <ul>{data.map(p => <li key={p.id}>{p.title}</li>)}</ul>
}
```

### Step 3: Mutations

```tsx
export function useCreatePost() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (newPost) => fetch('/api/posts', {
      method: 'POST', body: JSON.stringify(newPost), headers: { 'Content-Type': 'application/json' },
    }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['posts'] })    // refetch posts
    },
  })
}
```

### Step 4: Pagination

```tsx
export function usePaginatedPosts(page) {
  return useQuery({
    queryKey: ['posts', page],
    queryFn: () => fetch(`/api/posts?page=${page}`).then(r => r.json()),
    placeholderData: (prev) => prev,    // show previous data while loading next page
  })
}
```

## Guidelines

- Use `queryKey` arrays to organize cache — `['posts']`, `['posts', id]`, `['posts', { filter }]`.
- `staleTime` controls how long data is considered fresh. Set per-query based on how often data changes.
- `invalidateQueries` after mutations to refetch affected data — don't manually update the cache unless you need optimistic updates.
- React Query DevTools (`@tanstack/react-query-devtools`) is essential for debugging cache behavior.
