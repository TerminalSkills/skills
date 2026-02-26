---
name: tanstack-router
description: >-
  Type-safe routing for React with file-based routes, validated search params,
  loaders, and automatic code splitting. Use when someone asks to "set up
  routing for React", "type-safe router", "TanStack Router", "file-based
  routing", "search params validation", "replace React Router with something
  type-safe", or "add route-level data loading". Covers file-based routing,
  search params with Zod, route loaders, code splitting, and layouts.
license: Apache-2.0
compatibility: "React 18+. TypeScript recommended."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["react", "routing", "typescript", "tanstack", "file-based-routes"]
---

# TanStack Router

## Overview

TanStack Router is a fully type-safe router for React. Every route path, search param, path param, and loader is typed end-to-end — if you change a route, TypeScript catches every broken link at compile time. File-based routing with automatic code splitting, validated search params, and route-level data loading.

## When to Use

- React SPA or SSR app that needs type-safe routing (links, params, search)
- Migrating from React Router and want compile-time route safety
- Need validated and typed search/query params (not just `string | undefined`)
- Route-level data loading with pending/error states
- File-based routing with automatic code splitting

## Instructions

### Setup

```bash
npm install @tanstack/react-router
npm install -D @tanstack/router-plugin  # Vite plugin for file-based routing
```

```typescript
// vite.config.ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [TanStackRouterVite(), react()],
});
```

### File-Based Routing

```
src/routes/
├── __root.tsx          # Root layout (wraps all pages)
├── index.tsx           # /
├── about.tsx           # /about
├── users/
│   ├── index.tsx       # /users
│   ├── $userId.tsx     # /users/:userId (dynamic param)
│   └── $userId/
│       └── posts.tsx   # /users/:userId/posts (nested)
└── settings/
    ├── _layout.tsx     # Layout wrapper for /settings/*
    ├── profile.tsx     # /settings/profile
    └── billing.tsx     # /settings/billing
```

### Root Layout

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet, Link } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div>
      <nav className="flex gap-4 p-4 border-b">
        <Link to="/" className="[&.active]:font-bold">Home</Link>
        <Link to="/users" className="[&.active]:font-bold">Users</Link>
        <Link to="/about" className="[&.active]:font-bold">About</Link>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  ),
});
```

### Route with Loader

```tsx
// src/routes/users/index.tsx — Route with data loading
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Search params schema — validated and typed
const usersSearchSchema = z.object({
  page: z.number().int().positive().catch(1),
  search: z.string().optional(),
  role: z.enum(["all", "admin", "user"]).catch("all"),
});

export const Route = createFileRoute("/users/")({
  // Validate search params with Zod
  validateSearch: usersSearchSchema,

  // Load data before rendering (with typed search params)
  loaderDeps: ({ search }) => ({ search }),
  loader: async ({ deps: { search } }) => {
    const params = new URLSearchParams({
      page: String(search.page),
      ...(search.search && { search: search.search }),
      ...(search.role !== "all" && { role: search.role }),
    });
    const res = await fetch(`/api/users?${params}`);
    return res.json() as Promise<{ users: User[]; total: number }>;
  },

  component: UsersPage,
});

function UsersPage() {
  const { users, total } = Route.useLoaderData();
  const { page, search, role } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div>
      <h1>Users ({total})</h1>

      <input
        value={search ?? ""}
        onChange={(e) => navigate({ search: { search: e.target.value, page: 1 } })}
        placeholder="Search users..."
      />

      <select
        value={role}
        onChange={(e) => navigate({ search: { role: e.target.value as any, page: 1 } })}
      >
        <option value="all">All roles</option>
        <option value="admin">Admin</option>
        <option value="user">User</option>
      </select>

      {users.map((user) => (
        <Link key={user.id} to="/users/$userId" params={{ userId: user.id }}>
          {user.name}
        </Link>
      ))}

      <button
        disabled={page <= 1}
        onClick={() => navigate({ search: { page: page - 1 } })}
      >
        Previous
      </button>
      <button onClick={() => navigate({ search: { page: page + 1 } })}>
        Next
      </button>
    </div>
  );
}
```

### Dynamic Route Params

```tsx
// src/routes/users/$userId.tsx — Dynamic route with typed params
import { createFileRoute, notFound } from "@tanstack/react-router";

export const Route = createFileRoute("/users/$userId")({
  loader: async ({ params: { userId } }) => {
    // userId is typed as string — no casting needed
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok) throw notFound();
    return res.json() as Promise<User>;
  },

  notFoundComponent: () => <div>User not found</div>,

  component: UserProfile,
});

function UserProfile() {
  const user = Route.useLoaderData();
  //    ^? User — fully typed from loader return

  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
      <Link to="/users/$userId/posts" params={{ userId: user.id }}>
        View Posts
      </Link>
    </div>
  );
}
```

### Type-Safe Links

```tsx
// Links are fully typed — wrong routes or missing params = compile error
import { Link } from "@tanstack/react-router";

// ✅ Correct — route exists, params match
<Link to="/users/$userId" params={{ userId: "123" }}>Profile</Link>

// ✅ Search params typed
<Link to="/users" search={{ page: 2, role: "admin" }}>Admin Users</Link>

// ❌ Compile error — route doesn't exist
<Link to="/nonexistent">Broken</Link>

// ❌ Compile error — missing required param
<Link to="/users/$userId">Missing userId</Link>
```

## Examples

### Example 1: Dashboard with filtered data views

**User prompt:** "Build a dashboard with users list that supports search, pagination, and role filtering — all in the URL."

The agent will set up TanStack Router with validated search params (page, search, role), route-level loader that fetches filtered data, and type-safe navigation that preserves filter state in the URL.

### Example 2: Nested layouts for settings

**User prompt:** "Create a settings page with sidebar navigation — profile, billing, and team sections."

The agent will create a settings layout route with sidebar Links, nested routes for each section, and loaders for settings data.

## Guidelines

- **Search params = state** — use URL search params instead of React state for filterable/bookmarkable views
- **Validate search params with Zod** — `.catch()` provides defaults for invalid params
- **Loaders run before render** — no loading spinners for route-level data
- **`notFound()` in loaders** — throw it to render the notFoundComponent
- **Links are type-checked** — changing a route path catches all broken links at compile time
- **File naming = route structure** — `$param` for dynamic segments, `_layout` for layout routes
- **Code splitting is automatic** — each route file becomes a separate chunk
- **`loaderDeps` controls re-fetching** — loader re-runs only when deps change
- **TanStack Router + TanStack Query** — use together for server state + route state
