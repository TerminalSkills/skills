---
name: remix
description: >-
  Assists with building full-stack React web applications with Remix v2 and its successor, React Router framework mode.
  Use when creating apps with nested routing, loader/action patterns, progressive enhancement, or deploying to Node.js,
  Cloudflare Workers, or other adapters, or when migrating Remix v2 to React Router v7. Trigger words: remix, remix run,
  loader, action, useFetcher, nested routes, progressive enhancement, remix to react router.
license: Apache-2.0
compatibility: "Node.js 20+ for React Router v7; Remix v2 runs on Node.js 18+ or an edge runtime with an adapter"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: ["remix", "react", "full-stack", "web-standards", "progressive-enhancement"]
  repository: https://github.com/remix-run/remix
---

# Remix

## Overview

Remix is a full-stack web framework built on web standards: nested routing, `loader`/`action` data patterns, progressive enhancement, and error boundaries that isolate failures to one route segment. Forms work without JavaScript and nested route loaders run in parallel.

Know which "Remix" you are in before writing code:

- **Remix v2** (`@remix-run/*` packages) is the React framework most existing apps use. Its features were merged into **React Router v7** (November 2024) as "framework mode", and the team recommends upgrading. New React projects should start on React Router, not Remix v2.
- **Remix 3** (`remix` package, `npx remix new`) is a different, new framework: it is not built on React and uses its own component runtime and router. Its release candidate appeared on 2026-08-31 and a stable release was scheduled for 2026-10-02. Its API is not compatible with the loader/action code below.

The patterns in this skill (loader, action, `Form`, fetchers, error boundaries) apply to Remix v2 and React Router framework mode. Check `package.json` first: `@remix-run/*` means v2, `react-router` plus `@react-router/dev` means framework mode, `remix` alone means Remix 3.

## Instructions

- **Routes**: file-based nested routing; each route module holds the UI and its data layer, with `<Outlet />` for children and pathless layouts for shared UI. In React Router v7 routes are declared in `app/routes.ts` (flat-file conventions are available through `@react-router/fs-routes`).
- **Loaders**: server-side `loader` functions; nested loaders run in parallel, so there is no client-server waterfall. In Remix v2 with single fetch, and in React Router v7, return plain objects (and `data()` for status codes or headers) rather than `json()`; `defer()` is replaced by returning promises, rendered with `<Suspense>` and `<Await>`. Use `redirect()` to redirect.
- **Actions**: `action` functions triggered by `<Form method="post">`; return validation errors with a 400 status and rely on automatic revalidation of every active loader afterwards.
- **UX**: `useFetcher()` for mutations that should not navigate (like buttons, inline edits), `useNavigation()` for pending state, `fetcher.formData` for optimistic UI.
- **Errors**: export an `ErrorBoundary` per route and use `isRouteErrorResponse()` to tell thrown responses (404, 403) from unexpected errors.
- **Sessions**: `createCookieSessionStorage()` with a `secrets` array from the environment; redirect from the loader when unauthenticated. Remix has no built-in CSRF protection: validate the `Origin` header or add a token for state-changing actions.
- **Types (v7)**: import `type { Route } from "./+types/<module>"` and annotate `Route.LoaderArgs`, `Route.ActionArgs`, `Route.ComponentProps`; run `react-router typegen` (also part of `npm run typecheck`).
- **Deploy**: Vite is the compiler. Remix v2 adapters: `@remix-run/node`, `@remix-run/cloudflare`, `@remix-run/deno`. React Router v7: `@react-router/node`, `@react-router/cloudflare`, `@react-router/serve`.

### Migrating Remix v2 to React Router v7

```bash
npx codemod remix/2/react-router/upgrade && npm install
npm run typecheck && npm run build
```

1. Enable all Remix v2 future flags first and make the app work.
2. Run the community codemod shown above (it covers most of steps 3 to 5).
3. Package mapping: `@remix-run/react` to `react-router`, `@remix-run/node` to `@react-router/node`, `@remix-run/dev` to `@react-router/dev`.
4. Scripts become `react-router dev`, `react-router build`, `react-router-serve build/server/index.js`.
5. Add `app/routes.ts` and `react-router.config.ts` (`ssr: true`), swap `remix()` for `reactRouter()` from `@react-router/dev/vite`, rename `RemixServer` to `ServerRouter` and `RemixBrowser` to `HydratedRouter` (from `react-router/dom`), and add `.react-router/` to `.gitignore`.

## Examples

### Example 1: Task manager with progressive enhancement

**User request:** "Create a route that lists tasks and lets me add one with a form that works without JavaScript."

```tsx
// app/routes/tasks.tsx (React Router framework mode)
import { data, Form } from "react-router";
import type { Route } from "./+types/tasks";
import { createTask, listTasks } from "~/models/task.server";

export async function loader() {
  return { tasks: await listTasks() };
}

export async function action({ request }: Route.ActionArgs) {
  const form = await request.formData();
  const title = String(form.get("title") ?? "").trim();
  if (!title) return data({ error: "Title is required" }, { status: 400 });
  await createTask({ title });
  return { ok: true };
}

export default function Tasks({ loaderData, actionData }: Route.ComponentProps) {
  return (
    <>
      <ul>{loaderData.tasks.map((t) => <li key={t.id}>{t.title}</li>)}</ul>
      <Form method="post">
        <input name="title" />
        {actionData && "error" in actionData && <p>{actionData.error}</p>}
        <button type="submit">Add task</button>
      </Form>
    </>
  );
}
```

Result: submitting with JavaScript disabled does a normal POST and re-renders the list; with JavaScript it submits via fetch and revalidates the loader without a full reload.

### Example 2: Upgrade an existing Remix v2 app

**User request:** "Move our Remix 2 app to React Router 7."

Run the codemod and the commands from the migration steps. A typical leftover fix, a like button that must not navigate:

```tsx
const fetcher = useFetcher();
<fetcher.Form method="post" action="/posts/42/like">
  <button type="submit">{fetcher.formData ? "Liked" : "Like"}</button>
</fetcher.Form>
```

Result: imports come from `react-router`, scripts call `react-router`, and remaining errors are mostly `json()`/`defer()` calls to replace with plain returns and `useLoaderData` call sites to move to `loaderData` props (or keep the hook).

## Guidelines

- Fetch initial page data in `loader`, not `useEffect` plus `fetch`.
- Use `<Form>` rather than `<form onSubmit>` so the page works before hydration.
- Return real status codes (400, 403, 404) from loaders and actions.
- Put `ErrorBoundary` on every route that can fail so one child does not take the page down.
- Stream slow, non-critical data by returning promises instead of awaiting them.
- Keep server-only code in `*.server.ts` files; the build removes `loader` and `action` from client bundles, but imports they share do not get removed unless they are server modules.
- Do not start new work on Remix v2 or mix `@remix-run/*` with `react-router` packages; pick one.
- Do not apply this skill's code to Remix 3, which has its own APIs; read its documentation instead.
