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
compatibility: "React 16.11+ (18 or 19 recommended). Works in Next.js, Remix and Vite; hooks need Client Components."
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["data-fetching", "swr", "react", "cache", "revalidation"]
  repository: "https://github.com/vercel/swr"
---

# SWR

## Overview

SWR (stale-while-revalidate) is a React hooks library from Vercel for remote data: it returns cached data immediately, then revalidates in the background. It deduplicates requests, revalidates on window focus and network reconnect, retries errors with exponential backoff, and supports polling, pagination, infinite loading, mutations and optimistic UI. The current stable release is 2.5.1 (August 2026); 2.5 added an experimental `cacheData` option for preloading from React Server Components and an `unload()` function that clears the whole cache. SWR does not issue requests itself: you give it a key and a fetcher function.

## Instructions

### Setup

```bash
npm install swr
```

### Basic data fetching

`fetch` does not throw on 4xx/5xx, so the fetcher must do it or SWR will treat an error body as data.

```tsx
// lib/fetcher.ts
export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export const fetcher = async <T,>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(`Request failed: ${res.status}`, res.status);
  return res.json();
};
```

```tsx
// hooks/useUser.ts
import useSWR from "swr";
import { fetcher } from "@/lib/fetcher";

interface User { id: string; name: string; email: string }

export function useUser(userId: string | null) {
  // A null key skips the request (conditional fetching)
  const { data, error, isLoading, isValidating, mutate } = useSWR<User>(
    userId ? `/api/users/${userId}` : null,
    fetcher,
  );
  return { user: data, error, isLoading, isValidating, mutate };
}
```

`isLoading` is true only while there is no data yet; `isValidating` is true during any request, including background revalidation. If the key is an array or object, the whole value is passed to the fetcher as one argument (it is not spread, unlike SWR 1.x).

### Global configuration

```tsx
// app/providers.tsx
"use client";
import { SWRConfig } from "swr";
import { fetcher } from "@/lib/fetcher";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher,
        revalidateOnFocus: true,       // default true
        revalidateOnReconnect: true,   // default true
        dedupingInterval: 2000,        // default 2000 ms
        errorRetryCount: 3,            // default: retry without a limit
        shouldRetryOnError: (err) => !(err instanceof Error && "status" in err && err.status === 404),
      }}
    >
      {children}
    </SWRConfig>
  );
}
```

Polling is `refreshInterval: 5000` (ms) on a hook or in the config. `refreshWhenHidden` and `refreshWhenOffline` are off by default.

### Mutation and optimistic updates

For a write triggered by a user action, use `useSWRMutation`: it sends the request only when `trigger` is called, shares the cache with `useSWR`, and supports `optimisticData` and rollback.

```tsx
// components/TodoList.tsx
import useSWR from "swr";
import useSWRMutation from "swr/mutation";

interface Todo { id: number; title: string; done: boolean }

async function createTodo(url: string, { arg }: { arg: { title: string } }) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(arg),
  });
  if (!res.ok) throw new Error("Could not create todo");
  return (await res.json()) as Todo;
}

export function TodoList() {
  const { data: todos = [] } = useSWR<Todo[]>("/api/todos");
  const { trigger, isMutating } = useSWRMutation("/api/todos", createTodo);

  const addTodo = (title: string) =>
    trigger(
      { title },
      {
        optimisticData: (current?: Todo[]) => [...(current ?? []), { id: -1, title, done: false }],
        populateCache: (created: Todo, current?: Todo[]) => [...(current ?? []), created],
        rollbackOnError: true,
        revalidate: false,
      },
    );
  // render todos and a form that calls addTodo
}
```

With the plain `mutate(key, asyncFn, options)` API the async function must return the new data. A function that returns nothing writes `undefined` into the cache until the revalidation finishes, so `data` is briefly `undefined`:

```tsx
const { mutate } = useSWR<Todo[]>("/api/todos");
await mutate(
  async (current = []) => [...current, await createTodo("/api/todos", { arg: { title } })],
  { optimisticData: (current = []) => [...current, { id: -1, title, done: false }], rollbackOnError: true },
);
```

`mutate(key)` with no data just marks the key stale and refetches it. The global `mutate` (from `useSWRConfig()` or imported from `swr`) accepts a filter function as key, for example to revalidate every key starting with `/api/todos`.

### Pagination

Keep the previous page on screen while the next one loads with `keepPreviousData`:

```tsx
import { useState } from "react";
import useSWR from "swr";

function PostList() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useSWR<{ posts: Post[]; hasMore: boolean }>(
    `/api/posts?page=${page}&limit=20`,
    { keepPreviousData: true },
  );
  // render data?.posts plus Previous / Next buttons using page and data?.hasMore
}
```

### Infinite loading

`useSWRInfinite` takes a key function that receives the page index and the previous page's data; return `null` to stop.

```tsx
import useSWRInfinite from "swr/infinite";

const getKey = (index: number, previous: { posts: Post[]; hasMore: boolean } | null) => {
  if (previous && !previous.hasMore) return null;
  return `/api/feed?page=${index + 1}&limit=20`;
};

function InfiniteFeed() {
  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite(getKey);
  const posts = data?.flatMap((page) => page.posts) ?? [];
  const hasMore = data ? data[data.length - 1].hasMore : false;
  // render posts and a button: onClick={() => setSize(size + 1)}
}
```

### Other APIs worth knowing

`preload(key, fetcher)` starts a request before the component renders, `useSWRSubscription` wraps WebSocket or SSE sources, `fallbackData` and `fallback` (in `SWRConfig`) seed the cache for SSR, and `unload()` (2.5+) clears all cached data.

## Examples

### Example 1: Dashboard with auto-refreshing data

**User prompt:** "Build a dashboard that shows live order metrics for our store and refreshes every 5 seconds."

```tsx
"use client";
import useSWR from "swr";

interface Metrics { ordersToday: number; revenue: number; updatedAt: string }

export function MetricsCard() {
  const { data, error, isLoading } = useSWR<Metrics>("/api/metrics/orders", {
    refreshInterval: 5000,
  });
  if (isLoading) return <p>Loading metrics…</p>;
  if (error) return <p role="alert">Could not load metrics. Retrying…</p>;
  return (
    <p>
      {data!.ordersToday} orders, ${data!.revenue.toFixed(2)} revenue (updated {data!.updatedAt})
    </p>
  );
}
```

Result: the card renders the cached value instantly on revisit, polls every 5 seconds, pauses while the tab is hidden, and keeps the last good numbers on screen if a poll fails.

### Example 2: Todo app where adding and deleting feels instant

**User prompt:** "Adding and deleting todos should show up instantly, and roll back if the server rejects it."

Use `useSWR("/api/todos")` for the list and one `useSWRMutation` per action (`POST` for create, `DELETE /api/todos/:id` for remove) with `optimisticData` and `rollbackOnError: true`, as in the mutation section above. For delete, `optimisticData: (current = []) => current.filter((t) => t.id !== id)` removes the row immediately. Result: the UI updates before the request ends; if the API returns 500 the list snaps back and `trigger` rejects so you can show a toast.

## Guidelines

- The key is the cache key: the same key anywhere in the app shares one cached value and one request. Include every input that changes the response (`/api/posts?page=2`).
- Throw in the fetcher for non-2xx responses; otherwise `error` is never set.
- Pass `null` (or a falsy-returning function) as key to wait for a dependency such as a user id; do not call hooks conditionally.
- Use `useSWRMutation` for writes and `mutate` for revalidating or editing cached data; do not call `fetch` for a POST and hope the list updates.
- `useSWR` hooks must run in Client Components (`"use client"` in the Next.js App Router). Fetching in a Server Component and passing `fallbackData` avoids a client waterfall.
- Never put secrets in keys: keys appear in the cache and DevTools.
- SWR is for client fetching. For complex server-state needs such as dependent mutations with devtools, query invalidation by tag or offline persistence, TanStack Query has more features; for simple read-heavy UIs SWR is smaller.
