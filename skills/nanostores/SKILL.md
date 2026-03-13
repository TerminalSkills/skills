---
name: nanostores
description: >-
   You are an expert in Nanostores, the tiny (< 1KB) state manager for
  framework-agnostic JavaScript. You help developers manage application state
  with atoms, maps, computed stores, and async data fetching — working
  identically across React, Vue, Svelte, Solid, Angular, and vanilla JS with
  lazy subscriptions that only activate when the store is actually used in a
  component.
category: Frontend Development
tags: [state-management, tiny, framework-agnostic, react, vue, svelte, atoms]
version: 1.0.0
author: terminal-skills
---

# Nanostores — Tiny State Manager

You are an expert in Nanostores, the tiny (< 1KB) state manager for framework-agnostic JavaScript. You help developers manage application state with atoms, maps, computed stores, and async data fetching — working identically across React, Vue, Svelte, Solid, Angular, and vanilla JS with lazy subscriptions that only activate when the store is actually used in a component.

## Core Capabilities

### Atoms and Maps

```typescript
// stores/auth.ts — Framework-agnostic stores
import { atom, map, computed, onMount } from "nanostores";

// Atom: single value
export const $isAuthenticated = atom(false);
export const $theme = atom<"light" | "dark">("light");

// Map: object with per-key subscriptions
export const $user = map<{ name: string; email: string; plan: "free" | "pro" }>({
  name: "",
  email: "",
  plan: "free",
});

// Computed: derived state
export const $isPro = computed($user, (user) => user.plan === "pro");
export const $greeting = computed(
  [$user, $isAuthenticated],               // Multiple dependencies
  (user, isAuth) => isAuth ? `Welcome, ${user.name}!` : "Please sign in",
);

// Lifecycle: runs when first subscriber appears, cleanup when last unsubscribes
onMount($user, () => {
  const unsubscribe = authService.onAuthChange((userData) => {
    if (userData) {
      $user.set(userData);
      $isAuthenticated.set(true);
    } else {
      $user.set({ name: "", email: "", plan: "free" });
      $isAuthenticated.set(false);
    }
  });
  return unsubscribe;                      // Cleanup function
});

// Update
$user.setKey("plan", "pro");               // Per-key update (triggers only plan subscribers)
$theme.set("dark");
```

### React Integration

```tsx
import { useStore } from "@nanostores/react";
import { $user, $isPro, $greeting } from "../stores/auth";

function UserProfile() {
  const user = useStore($user);
  const isPro = useStore($isPro);
  const greeting = useStore($greeting);

  return (
    <div>
      <h1>{greeting}</h1>
      <p>{user.email}</p>
      {isPro && <span className="badge">PRO</span>}
      <button onClick={() => $user.setKey("plan", "pro")}>Upgrade</button>
    </div>
  );
}
```

### Async Data (with @nanostores/query)

```typescript
// stores/api.ts — Data fetching with caching
import { nanoquery } from "@nanostores/query";

const [createFetcherStore, createMutatorStore] = nanoquery({
  fetcher: (url: string) => fetch(url).then((r) => r.json()),
});

export const $projects = createFetcherStore<Project[]>(["/api/projects"]);
export const $currentProject = createFetcherStore<Project>(
  ["/api/projects/", $projectId],          // Reactive key — refetches when $projectId changes
);

export const $createProject = createMutatorStore<Project>(
  async ({ data }) => {
    const res = await fetch("/api/projects", {
      method: "POST",
      body: JSON.stringify(data),
    });
    return res.json();
  },
  { invalidates: ["/api/projects"] },      // Auto-invalidate projects list
);
```

```tsx
// React component using async stores
import { useStore } from "@nanostores/react";
import { $projects, $createProject } from "../stores/api";

function ProjectList() {
  const { data: projects, loading, error } = useStore($projects);

  if (loading) return <Spinner />;
  if (error) return <Error message={error.message} />;

  return (
    <ul>
      {projects?.map((p) => <li key={p.id}>{p.name}</li>)}
      <button onClick={() => $createProject.mutate({ data: { name: "New Project" } })}>
        Add Project
      </button>
    </ul>
  );
}
```

## Installation

```bash
npm install nanostores
npm install @nanostores/react          # React binding
# Or: @nanostores/vue | @nanostores/svelte | @nanostores/solid | @nanostores/angular
npm install @nanostores/query          # Async data fetching (optional)
```

## Best Practices

1. **Framework-agnostic** — Define stores once; use in React, Vue, Svelte, or any framework simultaneously
2. **Lazy subscriptions** — Stores only compute/fetch when subscribed; zero cost for unused stores
3. **$ prefix convention** — Name stores with `$` prefix (`$user`, `$theme`); distinguishes stores from regular variables
4. **Map per-key updates** — Use `setKey()` for map stores; only subscribers of that key re-render
5. **Computed for derived state** — Use `computed()` instead of manual subscriptions; auto-tracks dependencies
6. **onMount lifecycle** — Initialize data/subscriptions in `onMount`; auto-cleanup when no subscribers remain
7. **Tiny bundle** — Core is 298 bytes; keeps your app fast, especially for micro-frontends
8. **@nanostores/query** — Use for server data; built-in caching, invalidation, and reactive refetching
