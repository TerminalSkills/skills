---
title: Build a TanStack Router App with Type-Safe Navigation
slug: build-tanstack-router-app-with-type-safe-navigation
description: >-
  Build a React SPA with TanStack Router — fully type-safe routes, search
  params, data loading, nested layouts, and code splitting for a complex
  dashboard application.
skills:
  - tanstack-router
  - tanstack
  - tailwindcss
  - zod
category: development
tags:
  - routing
  - tanstack
  - react
  - type-safety
  - spa
---

# Build a TanStack Router App with Type-Safe Navigation

Owen is building a complex dashboard with deeply nested routes: `/projects/$projectId/tasks/$taskId/comments`. React Router gives him string-based routes where typos cause runtime crashes. TanStack Router makes every route, param, and search param fully type-safe — if a route doesn't exist or a param is missing, TypeScript catches it at compile time. Plus: built-in data loading, search param validation, and route-level code splitting.

## Step 1: Define Routes with Full Type Safety

```typescript
// src/routes/__root.tsx
import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Navbar } from "@/components/Navbar";

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <Outlet />
    </div>
  ),
});
```

```typescript
// src/routes/projects/index.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const projectSearchSchema = z.object({
  search: z.string().optional(),
  status: z.enum(["active", "archived", "all"]).catch("all"),
  page: z.number().int().positive().catch(1),
  sort: z.enum(["name", "created", "updated"]).catch("created"),
});

export const Route = createFileRoute("/projects/")({
  validateSearch: projectSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ deps }) => {
    return fetchProjects(deps);
  },
  component: ProjectsPage,
});

function ProjectsPage() {
  const projects = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="flex gap-4 mb-6">
        <input
          value={search.search || ""}
          onChange={(e) => navigate({ search: (prev) => ({ ...prev, search: e.target.value, page: 1 }) })}
          placeholder="Search projects..."
          className="px-4 py-2 border rounded"
        />
        <select
          value={search.status}
          onChange={(e) => navigate({ search: (prev) => ({ ...prev, status: e.target.value as any, page: 1 }) })}
          className="px-4 py-2 border rounded"
        >
          <option value="all">All</option>
          <option value="active">Active</option>
          <option value="archived">Archived</option>
        </select>
      </div>

      <div className="grid gap-4">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} />
        ))}
      </div>

      <Pagination
        current={search.page}
        onPageChange={(page) => navigate({ search: (prev) => ({ ...prev, page }) })}
      />
    </div>
  );
}
```

## Step 2: Nested Route with Params

```typescript
// src/routes/projects/$projectId.tsx
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => {
    // params.projectId is typed as string — guaranteed to exist
    return fetchProject(params.projectId);
  },
  component: ProjectLayout,
});

function ProjectLayout() {
  const project = Route.useLoaderData();

  return (
    <div className="max-w-6xl mx-auto p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">{project.name}</h1>
        <p className="text-gray-600">{project.description}</p>
      </header>

      {/* Tabs for sub-routes */}
      <nav className="flex gap-1 border-b mb-6">
        <TabLink to="/projects/$projectId/tasks" params={{ projectId: project.id }}>
          Tasks
        </TabLink>
        <TabLink to="/projects/$projectId/settings" params={{ projectId: project.id }}>
          Settings
        </TabLink>
      </nav>

      <Outlet />
    </div>
  );
}
```

```typescript
// src/routes/projects/$projectId/tasks.tsx
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const taskSearchSchema = z.object({
  filter: z.enum(["all", "open", "done"]).catch("all"),
  assignee: z.string().optional(),
});

export const Route = createFileRoute("/projects/$projectId/tasks")({
  validateSearch: taskSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ params, deps }) => {
    return fetchTasks(params.projectId, deps);
  },
  component: TasksPage,
});

function TasksPage() {
  const tasks = Route.useLoaderData();
  const { projectId } = Route.useParams();
  const navigate = Route.useNavigate();

  return (
    <div>
      {tasks.map((task) => (
        <div key={task.id} className="p-3 border-b hover:bg-gray-50">
          <Link
            to="/projects/$projectId/tasks/$taskId"
            params={{ projectId, taskId: task.id }}
            className="font-medium hover:text-blue-600"
          >
            {task.title}
          </Link>
        </div>
      ))}
    </div>
  );
}
```

## Step 3: Type-Safe Navigation

```tsx
// src/components/ProjectCard.tsx
import { Link } from "@tanstack/react-router";

function ProjectCard({ project }: { project: Project }) {
  return (
    <div className="bg-white p-4 rounded-lg border">
      <h3 className="font-semibold">{project.name}</h3>

      {/* ✅ Type-safe: params are required and typed */}
      <Link
        to="/projects/$projectId"
        params={{ projectId: project.id }}
        className="text-blue-600"
      >
        View Project
      </Link>

      {/* ✅ Type-safe: search params validated by Zod schema */}
      <Link
        to="/projects/$projectId/tasks"
        params={{ projectId: project.id }}
        search={{ filter: "open" }}
      >
        Open Tasks ({project.openTaskCount})
      </Link>

      {/* ❌ TypeScript error: '/projects/$projectId/nonexistent' does not exist */}
      {/* <Link to="/projects/$projectId/nonexistent" params={{ projectId: project.id }}>Bad</Link> */}

      {/* ❌ TypeScript error: missing required param 'projectId' */}
      {/* <Link to="/projects/$projectId">Bad</Link> */}
    </div>
  );
}
```

## Step 4: Code Splitting with Lazy Routes

```typescript
// src/routes/projects/$projectId/settings.lazy.tsx
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/projects/$projectId/settings")({
  component: () => {
    const { projectId } = Route.useParams();
    // Settings component code-split — only loaded when visiting this route
    return <ProjectSettings projectId={projectId} />;
  },
});
```

## Step 5: Pending UI and Error Handling

```typescript
// src/routes/projects/$projectId.tsx (enhanced)
export const Route = createFileRoute("/projects/$projectId")({
  loader: async ({ params }) => fetchProject(params.projectId),
  pendingComponent: () => (
    <div className="animate-pulse p-6">
      <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
      <div className="h-4 bg-gray-200 rounded w-2/3" />
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="p-6 text-center">
      <h2 className="text-xl font-semibold text-red-600">Failed to load project</h2>
      <p className="text-gray-600 mt-2">{error.message}</p>
      <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded">
        Retry
      </button>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6 text-center">
      <h2 className="text-xl font-semibold">Project not found</h2>
      <Link to="/projects" className="text-blue-600 mt-4 inline-block">Back to projects</Link>
    </div>
  ),
});
```

## Summary

Owen's dashboard has zero runtime routing errors. Every `<Link>` is checked at compile time — wrong route names, missing params, or invalid search params are TypeScript errors, not production bugs. Search params are validated with Zod, so `?page=abc` gracefully falls back to `page=1` instead of crashing. Data loading happens in the route definition with automatic pending/error states. Lazy routes code-split the settings page — it's only downloaded when a user navigates there. The URL is the source of truth for all filter/sort/page state, making every view bookmarkable and shareable.
