---
name: swr
description: >-
  Fetch, cache, and revalidate data in React with SWR — stale-while-revalidate
  data fetching library by Vercel. Use when someone asks to "fetch data in
  React", "SWR", "data fetching hook", "cache API calls", "stale-while-
  revalidate", "auto-refresh data", or "React data fetching without Redux".
  Covers data fetching, caching, revalidation, mutation, pagination, and
  optimistic updates.
license: Apache-2.0
compatibility: "React 18+. Next.js, Remix, Vite."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["data-fetching", "swr", "react", "cache", "revalidation"]
---

# SWR

## Overview

SWR (stale-while-revalidate) is a React data fetching library — show cached data instantly, then revalidate in the background. Built by Vercel, it handles caching, deduplication, revalidation on focus/reconnect, pagination, and optimistic updates. Simpler than TanStack Query for straightforward data fetching, with a smaller API surface.

## When to Use

- Fetching API data in React components
- Need instant page loads with background revalidation
- Real-time data that should refresh automatically
- Paginated or infinite scroll data
- Simpler alternative to TanStack Query for most use cases

## Instructions

### Setup

```bash
npm install swr
```

### Basic Data Fetching

```tsx
// hooks/useUser.ts — Fetch and cache user data
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useUser(userId: string) {
  const { data, error, isLoading, mutate } = useSWR(
    `/api/users/${userId}`,
    fetcher,
  );

  return {
    user: data,
    isLoading,
    isError: error,
    mutate,  // Manually revalidate
  };
}

// Usage in component
function UserProfile({ userId }) {
  const { user, isLoading } = useUser(userId);
  if (isLoading) return <div>Loading...</div>;
  return <div>{user.name}</div>;
}
```

### Global Configuration

```tsx
// app/providers.tsx — Global SWR config
import { SWRConfig } from "swr";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error("API error");
  return res.json();
};

export function Providers({ children }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,      // Refresh when tab regains focus
        revalidateOnReconnect: true,   // Refresh when internet reconnects
        dedupingInterval: 2000,        // Dedupe requests within 2s
        errorRetryCount: 3,
      }}
    >
      {children}
    </SWRConfig>
  );
}
```

### Mutation and Optimistic Updates

```tsx
// components/TodoList.tsx — Optimistic updates
import useSWR, { useSWRConfig } from "swr";

function TodoList() {
  const { data: todos, mutate } = useSWR("/api/todos");

  const addTodo = async (title: string) => {
    const newTodo = { id: Date.now(), title, done: false };

    // Optimistic update — show immediately, revalidate in background
    await mutate(
      async () => {
        await fetch("/api/todos", {
          method: "POST",
          body: JSON.stringify({ title }),
        });
        // Return updated data (or let SWR refetch)
      },
      {
        optimisticData: [...(todos || []), newTodo],
        rollbackOnError: true,  // Revert if API fails
        revalidate: true,       // Refetch after mutation
      }
    );
  };
}
```

### Pagination

```tsx
// components/PostList.tsx — Paginated data
import useSWR from "swr";

function PostList() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useSWR(`/api/posts?page=${page}&limit=20`);

  return (
    <div>
      {data?.posts.map((post) => <PostCard key={post.id} post={post} />)}
      <button onClick={() => setPage(page - 1)} disabled={page <= 1}>Previous</button>
      <button onClick={() => setPage(page + 1)} disabled={!data?.hasMore}>Next</button>
    </div>
  );
}
```

### Infinite Loading

```tsx
// components/InfiniteFeed.tsx — Infinite scroll
import useSWRInfinite from "swr/infinite";

function InfiniteFeed() {
  const { data, size, setSize, isLoading } = useSWRInfinite(
    (index) => `/api/feed?page=${index + 1}&limit=20`,
  );

  const posts = data?.flatMap((page) => page.posts) || [];
  const hasMore = data?.[data.length - 1]?.hasMore;

  return (
    <div>
      {posts.map((post) => <PostCard key={post.id} post={post} />)}
      {hasMore && (
        <button onClick={() => setSize(size + 1)} disabled={isLoading}>
          Load More
        </button>
      )}
    </div>
  );
}
```

## Examples

### Example 1: Dashboard with auto-refreshing data

**User prompt:** "Build a dashboard that shows live metrics — refresh every 5 seconds."

The agent will use SWR with `refreshInterval: 5000`, show cached data instantly on mount, and handle loading/error states.

### Example 2: CRUD with optimistic updates

**User prompt:** "Build a todo app where adding/deleting feels instant."

The agent will use SWR mutations with optimistic data, rollback on error, and automatic revalidation after changes.

## Guidelines

- **Key = cache key** — same key = same cached data across components
- **`null` key skips fetching** — conditional fetching: `useSWR(userId ? /api/... : null)`
- **Revalidation on focus** — data refreshes when user returns to tab
- **Optimistic updates** — show changes immediately, revert on error
- **`mutate` for cache updates** — bound (per-key) or global
- **`useSWRInfinite` for infinite scroll** — accumulates pages
- **Deduplication** — multiple components using same key = one request
- **Error retry built-in** — automatic with exponential backoff
- **Smaller than TanStack Query** — simpler API for simpler needs
- **Works with any fetcher** — fetch, axios, GraphQL clients
