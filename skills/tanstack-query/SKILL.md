---
name: tanstack-query
description: >-
  TanStack Query (formerly React Query) fetches, caches and updates server
  data in React apps, replacing hand-written useEffect + useState fetching.
  Use it when the user wants caching, background refetching, mutations with
  optimistic updates, infinite scroll, Suspense or Next.js server prefetching
  with v5 hooks such as useQuery, useMutation and useInfiniteQuery.
license: Apache-2.0
compatibility: React 18+, @tanstack/react-query v5, TypeScript 4.7+
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/TanStack/query
  category: development
  tags:
    - react
    - data-fetching
    - cache
    - state-management
    - async
---

# TanStack Query

## Overview

TanStack Query (v5, package `@tanstack/react-query`) manages server state: it caches responses by query key, dedupes requests, refetches in the background and gives mutations a lifecycle for optimistic UI. It needs React 18 or newer. These examples use the v5 object-only API; v4 names (`cacheTime`, `isLoading` as "no data yet", `keepPreviousData`, `onSuccess` on `useQuery`) no longer exist.

## Instructions

### Setup

```bash
npm install @tanstack/react-query
npm install -D @tanstack/react-query-devtools
```

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,   // fresh for 1 min; default is 0 (always stale)
      gcTime: 10 * 60_000, // unused cache kept 10 min; default is 5 min
    },
  },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Dashboard />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
```

Devtools are left out of production builds automatically.

### Queries

`fetch` does not reject on HTTP 4xx/5xx, so throw yourself or the query ends up "successful" with an error body.

```tsx
import { useQuery } from "@tanstack/react-query";

type User = { id: number; name: string };

async function fetchUsers(): Promise<User[]> {
  const res = await fetch("/api/users");
  if (!res.ok) throw new Error(`Users request failed: ${res.status}`);
  return res.json();
}

function UserList() {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers,
  });

  if (isPending) return <p>Loading...</p>;
  if (isError) return <p>{error.message}</p>; // error is Error by default in v5
  return <ul>{data.map((u) => <li key={u.id}>{u.name}</li>)}</ul>;
}
```

In v5, `isPending` means "no data yet"; `isLoading` is `isPending && isFetching` (first fetch in flight). Only `isPending` narrows `data` to defined.

Share key and function with `queryOptions` so `useQuery`, `useSuspenseQuery`, `prefetchQuery` and `setQueryData` stay in sync and typed:

```tsx
import { queryOptions, useQuery } from "@tanstack/react-query";

export const userQuery = (id: number) =>
  queryOptions({
    queryKey: ["users", id],
    queryFn: () => fetch(`/api/users/${id}`).then((r) => r.json() as Promise<User>),
    staleTime: 30_000,
  });

const { data } = useQuery({ ...userQuery(7), select: (u) => u.name });
```

Dependent query: `useQuery({ ...projectsQuery(userId!), enabled: userId != null })`.

### Mutations and optimistic updates

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";

type Todo = { id: number | string; title: string; completed: boolean };

export function useCreateTodo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (newTodo: { title: string }) => {
      const res = await fetch("/api/todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newTodo),
      });
      if (!res.ok) throw new Error(`Create failed: ${res.status}`);
      return (await res.json()) as Todo;
    },
    onMutate: async (newTodo) => {
      await queryClient.cancelQueries({ queryKey: ["todos"] });
      const previous = queryClient.getQueryData<Todo[]>(["todos"]);
      queryClient.setQueryData<Todo[]>(["todos"], (old = []) => [
        ...old,
        { id: `temp-${Date.now()}`, completed: false, ...newTodo },
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["todos"], context?.previous);
    },
    // return the promise so the mutation stays pending until the refetch ends
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["todos"] }),
  });
}
```

Simpler alternative with no cache writes: render `mutation.variables` as a greyed item while `mutation.isPending`; it disappears on its own after the refetch. From another component use `useMutationState` with a `mutationKey`.

### Infinite queries

`initialPageParam` is required in v5. `maxPages` only works together with both `getNextPageParam` and `getPreviousPageParam`. Returning `undefined` or `null` from `getNextPageParam` means there is no next page.

```tsx
import { useInfiniteQuery } from "@tanstack/react-query";

type FeedPage = { items: { id: number; text: string }[]; nextCursor: string | null; prevCursor: string | null };

function InfiniteFeed() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: async ({ pageParam }): Promise<FeedPage> => {
      const res = await fetch(`/api/feed?cursor=${encodeURIComponent(pageParam)}`);
      if (!res.ok) throw new Error(`Feed failed: ${res.status}`);
      return res.json();
    },
    initialPageParam: "",
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    getPreviousPageParam: (firstPage) => firstPage.prevCursor, // required with maxPages
    maxPages: 5, // optional: keep at most 5 pages in memory
  });

  return (
    <>
      {data?.pages.flatMap((p) => p.items).map((i) => <p key={i.id}>{i.text}</p>)}
      <button onClick={() => fetchNextPage()} disabled={!hasNextPage || isFetchingNextPage}>
        {isFetchingNextPage ? "Loading..." : hasNextPage ? "Load more" : "No more"}
      </button>
    </>
  );
}
```

### Suspense, pagination and Next.js

- `useSuspenseQuery` never returns `data` as undefined; wrap it in `<Suspense>` and an error boundary. It has no `enabled` option.
- For page-number pagination keep the old page visible with `placeholderData: keepPreviousData` (imported from the package; replaces the removed `keepPreviousData: true`).
- Next.js App Router: create the client in a `"use client"` providers file and reuse one client in the browser (new client per request on the server); set `staleTime` above 0 so hydrated data is not refetched at once. Prefetch in a Server Component and hand it over:

```tsx
// app/posts/page.tsx
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import { getQueryClient } from "../get-query-client"; // your per-request factory
import Posts from "./posts"; // client component calling useQuery({ queryKey: ["posts"], ... })

export default async function PostsPage() {
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({ queryKey: ["posts"], queryFn: getPosts });
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <Posts />
    </HydrationBoundary>
  );
}
```

## Examples

**"Show a list of users and refetch when I add one."** Use the `UserList` query above plus a mutation whose `onSuccess` returns `queryClient.invalidateQueries({ queryKey: ["users"] })`. The list refetches in the background; `isFetching` is true meanwhile while `data` stays on screen.

**"Make the todo checkbox update instantly and roll back if the server fails."** Use `useCreateTodo`'s pattern with `setQueryData` in `onMutate`, the snapshot in the returned context, rollback in `onError` and `invalidateQueries` in `onSettled`. In the browser the checkbox flips at once; on a 500 it flips back.

**"Infinite scroll for a feed."** Use `InfiniteFeed`; trigger `fetchNextPage` from a button or an IntersectionObserver. With `maxPages: 5`, pages beyond the window are dropped and refetched when you scroll back.

## Guidelines

- Query keys are arrays; put every variable the function uses in them (`["users", userId, { status }]`). `invalidateQueries({ queryKey: ["users"] })` matches by prefix.
- `staleTime` decides when a mounted query refetches (default 0); `gcTime` decides how long unused data stays cached (default 5 min). `staleTime: "static"` also blocks manual invalidation; use `Infinity` when you still want invalidation to work.
- v5 removed `onSuccess`, `onError` and `onSettled` from `useQuery`; run side effects in `useEffect`, or in a `QueryCache` callback (`new QueryClient({ queryCache: new QueryCache({ onError }) })`). Mutation callbacks still exist.
- Do not copy query data into `useState`; read it from the hook and derive values with `select`.
- Retries are 3 on the client with exponential backoff and none on the server. Set `retry: false` in tests.
- Not a fit for purely client-side state (modals, form drafts); use component state or a store.
