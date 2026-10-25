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
compatibility: "React 18+, Vite. TypeScript recommended."
metadata:
  author: terminal-skills
  repository: https://github.com/TanStack/router
  version: "1.1.0"
  category: development
  tags: "react, routing, typescript, tanstack, file-based-routes"
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
npm install @tanstack/react-router zod
npm install -D @tanstack/router-plugin  # Vite plugin: generates the route tree, splits code
```

```typescript
// vite.config.ts — the router plugin goes BEFORE the React plugin
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

export default defineConfig({
  plugins: [
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
  ],
});
```

The plugin used to be exported as `TanStackRouterVite`; that name is deprecated. On first `vite dev` or `vite build` it generates `src/routeTree.gen.ts` from the files in `src/routes/`. Commit that file or add it to `.gitignore` consistently, and never edit it.

Create the router once and register it, so every `Link`, `useNavigate` and `useSearch` is typed against your routes:

```tsx
// src/main.tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
```

### File-Based Routing

```
src/routes/
├── __root.tsx            # Root layout (wraps all pages)
├── index.tsx             # /
├── about.tsx             # /about
├── users/
│   ├── index.tsx         # /users
│   └── $userId/
│       ├── route.tsx     # layout + loader for /users/:userId (renders <Outlet />)
│       ├── index.tsx     # /users/:userId
│       └── posts.tsx     # /users/:userId/posts
├── settings/
│   ├── route.tsx         # layout wrapper for /settings/*
│   ├── profile.tsx       # /settings/profile
│   └── billing.tsx       # /settings/billing
└── _auth/                # `_` prefix = pathless layout: adds no URL segment
    └── dashboard.tsx     # /dashboard
```

`route.tsx` inside a directory is the layout for that path. A file such as `users/$userId.tsx` next to a `users/$userId/` directory is also a parent route, so it must render `<Outlet />` or its children never show. Dots in a file name are the same as slashes (`users.$userId.tsx`).

### Root Layout

```tsx
// src/routes/__root.tsx
import { createRootRoute, Outlet, Link } from "@tanstack/react-router";

export const Route = createRootRoute({
  component: () => (
    <div>
      <nav className="flex gap-4 p-4 border-b">
        <Link to="/" activeProps={{ className: "font-bold" }}>Home</Link>
        <Link to="/users" activeProps={{ className: "font-bold" }}>Users</Link>
        <Link to="/about" activeProps={{ className: "font-bold" }}>About</Link>
      </nav>
      <main className="p-4">
        <Outlet />
      </main>
    </div>
  ),
});
```

`Link` also adds an `active` class on its own, so Tailwind's `[&.active]:font-bold` works too.

### Route with Search Params and Loader

Zod 4 (current) schemas go straight into `validateSearch` with no adapter. Use `.default(x).catch(x)`: `.default` keeps the search params optional on `<Link>`, `.catch` replaces malformed URL values instead of showing an error. With only `.catch`, every `<Link to="/users">` has to pass `search`. Zod 3 needs `zodValidator` and `fallback` from `@tanstack/zod-adapter`.

```tsx
// src/routes/users/index.tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";

type User = { id: string; name: string; email: string };

const usersSearchSchema = z.object({
  page: z.number().int().positive().default(1).catch(1),
  search: z.string().optional(),
  role: z.enum(["all", "admin", "user"]).default("all").catch("all"),
});

export const Route = createFileRoute("/users/")({
  validateSearch: usersSearchSchema,
  loaderDeps: ({ search }) => ({ page: search.page, search: search.search, role: search.role }),
  loader: async ({ deps }) => {
    const params = new URLSearchParams({ page: String(deps.page), role: deps.role });
    if (deps.search) params.set("search", deps.search);
    const res = await fetch(`/api/users?${params}`);
    return (await res.json()) as { users: User[]; total: number };
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
        onChange={(e) =>
          navigate({ search: (prev) => ({ ...prev, search: e.target.value || undefined, page: 1 }), replace: true })
        }
      />
      <select
        value={role}
        onChange={(e) =>
          navigate({ search: (prev) => ({ ...prev, role: e.target.value as "all" | "admin" | "user", page: 1 }) })
        }
      >
        <option value="all">All roles</option>
      </select>
      {users.map((u) => (
        <Link key={u.id} to="/users/$userId" params={{ userId: u.id }}>{u.name}</Link>
      ))}
      <button disabled={page <= 1} onClick={() => navigate({ search: (prev) => ({ ...prev, page: page - 1 }) })}>Previous</button>
      <Link to="/users" search={{ page: 2, role: "admin" }}>Admin Users</Link>
    </div>
  );
}
```

`navigate({ search: { page: 2 } })` replaces the whole query string, so the filters would be lost. Pass a function, `search: (prev) => ({ ...prev, page: 2 })`, to keep them. The loader re-runs only when the values returned by `loaderDeps` change, which is why every search param the fetch uses is listed there.

### Dynamic Route Params

```tsx
// src/routes/users/$userId/route.tsx
import { createFileRoute, notFound, Link, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/users/$userId")({
  loader: async ({ params: { userId } }) => {
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok) throw notFound();
    return (await res.json()) as { id: string; name: string; email: string };
  },
  notFoundComponent: () => <div>User not found</div>,
  component: UserLayout,
});

function UserLayout() {
  const user = Route.useLoaderData();
  return (
    <div>
      <h1>{user.name}</h1>
      <Link to="/users/$userId/posts" params={{ userId: user.id }}>Posts</Link>
      <Outlet />
    </div>
  );
}
```

`params.userId` is typed as `string`. `throw notFound()` renders the nearest `notFoundComponent`. Add `errorComponent` and `pendingComponent` to the same route for failed and slow loads.

### Type-Safe Links

```tsx
import { Link } from "@tanstack/react-router";

// Route exists, params match
<Link to="/users/$userId" params={{ userId: "123" }}>Profile</Link>

// Search params are typed against validateSearch
<Link to="/users" search={{ page: 2, role: "admin" }}>Admin Users</Link>

// Compile error: route does not exist
<Link to="/nonexistent">Broken</Link>

// Compile error: missing required param
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

- **Search params = state**: use URL search params instead of React state for filterable, bookmarkable views
- **Validate search params**: Zod 4 with `.default(x).catch(x)`; Zod 3 needs `@tanstack/zod-adapter` (`zodValidator`, `fallback`); Valibot and ArkType work without an adapter
- **Merge, don't replace**: `navigate({ search: (prev) => ({ ...prev, page: 2 }) })`
- **Loaders start before render**, so route data needs no spinner. A slow loader shows `pendingComponent` after `defaultPendingMs` (1000 ms); set both on the router if you need different timing
- **`loaderDeps` controls re-fetching**: list every search param the loader reads, or stale data stays on screen
- **TanStack Query**: for caching and invalidation, call `queryClient.ensureQueryData` in the loader and read the data with `useSuspenseQuery`
- **Links are type-checked**: renaming a route file breaks every `Link` to it at compile time, which is the point. Run `tsc --noEmit` in CI
- **File naming = route structure**: `$param` dynamic segment, `route.tsx` layout, `_name` pathless layout, `index.tsx` for the directory path. The old `_layout.tsx` convention is not a layout file
- **Code splitting**: with `autoCodeSplitting: true` each route's `component`, `errorComponent` and `notFoundComponent` become separate lazy chunks, while the loader and `pendingComponent` stay in the main bundle. Do not `export` those properties from a route file, or they are no longer split
- **Devtools**: `npm install -D @tanstack/react-router-devtools` and render `<TanStackRouterDevtools />` in the root layout (development only)
