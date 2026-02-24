---
name: react-query
description: >-
  Manage server state in React with TanStack Query. Use when a user asks to
  fetch data in React, cache API responses, handle loading/error states,
  implement optimistic updates, or manage server state efficiently.
license: Apache-2.0
compatibility: 'React 18+, Next.js, Vue, Svelte, Solid'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - tanstack-query
    - react-query
    - data-fetching
    - cache
    - server-state
---

# TanStack Query (React Query)

## Overview

TanStack Query (formerly React Query) manages server state — data that lives on the server and is cached on the client. It handles fetching, caching, synchronization, background refetching, pagination, and optimistic updates. Replaces most Redux/Zustand usage for API data.

## Instructions

### Step 1: Setup

```bash
npm install @tanstack/react-query
```

```tsx
// app/providers.tsx — Query client setup
'use client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'

export function Providers({ children }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000,         // data is fresh for 1 minute
        gcTime: 5 * 60 * 1000,        // garbage collect after 5 minutes
        retry: 2,                      // retry failed requests twice
        refetchOnWindowFocus: false,   // don't refetch on tab switch
      },
    },
  }))

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools />
    </QueryClientProvider>
  )
}
```

### Step 2: Queries

```tsx
// hooks/useProjects.ts — Data fetching hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

// Fetch projects
export function useProjects(status?: string) {
  return useQuery({
    queryKey: ['projects', { status }],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (status) params.set('status', status)
      const res = await fetch(`/api/projects?${params}`)
      if (!res.ok) throw new Error('Failed to fetch projects')
      return res.json() as Promise<{ data: Project[]; pagination: Pagination }>
    },
  })
}

// Fetch single project
export function useProject(id: string) {
  return useQuery({
    queryKey: ['projects', id],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}`)
      if (!res.ok) throw new Error('Project not found')
      return res.json() as Promise<Project>
    },
    enabled: !!id,    // don't fetch if id is empty
  })
}

// Usage in component
function ProjectList() {
  const { data, isLoading, error } = useProjects('active')

  if (isLoading) return <Skeleton />
  if (error) return <ErrorMessage error={error} />

  return (
    <ul>
      {data.data.map(project => (
        <li key={project.id}>{project.name}</li>
      ))}
    </ul>
  )
}
```

### Step 3: Mutations with Optimistic Updates

```tsx
// hooks/useCreateProject.ts — Optimistic mutation
export function useCreateProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: CreateProjectInput) => {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Failed to create project')
      return res.json()
    },

    // Optimistic update — show new project immediately
    onMutate: async (newProject) => {
      await queryClient.cancelQueries({ queryKey: ['projects'] })

      const previous = queryClient.getQueryData(['projects', { status: 'active' }])

      queryClient.setQueryData(['projects', { status: 'active' }], (old: any) => ({
        ...old,
        data: [{ id: 'temp', ...newProject, status: 'active' }, ...(old?.data || [])],
      }))

      return { previous }
    },

    // Rollback on error
    onError: (err, newProject, context) => {
      queryClient.setQueryData(['projects', { status: 'active' }], context?.previous)
    },

    // Refetch to get real data
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
```

### Step 4: Infinite Scroll

```tsx
// hooks/useInfiniteProjects.ts — Cursor-based pagination
import { useInfiniteQuery } from '@tanstack/react-query'

export function useInfiniteProjects() {
  return useInfiniteQuery({
    queryKey: ['projects', 'infinite'],
    queryFn: async ({ pageParam }) => {
      const params = new URLSearchParams({ limit: '20' })
      if (pageParam) params.set('cursor', pageParam)
      const res = await fetch(`/api/projects?${params}`)
      return res.json()
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.nextCursor,
  })
}
```

## Guidelines

- TanStack Query is for server state (API data). Use Zustand/Jotai for client state (UI, preferences).
- Set `staleTime` based on data freshness needs — 0 for real-time, 60s for dashboards, 5min for static.
- Use `queryKey` arrays for hierarchical cache invalidation: `['projects']` invalidates all project queries.
- Optimistic updates make the UI feel instant — show changes immediately, rollback on error.
- DevTools are essential — shows cache state, refetch timing, and query health.
