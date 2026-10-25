---
name: sveltekit
description: >-
  Assists with building full-stack web applications using SvelteKit, the Svelte framework with file-based routing,
  server-side rendering, form actions and API endpoints. Use when creating or upgrading a SvelteKit app, writing
  load functions, form actions, hooks or +server.ts endpoints, or picking an adapter. Trigger words: sveltekit,
  svelte, svelte routing, form actions, svelte hooks, svelte adapter, svelte load function, sveltekit 3.
license: Apache-2.0
compatibility: "SvelteKit 3 needs Node.js 22.17+, Svelte 5.57.1+, Vite 8; SvelteKit 2 notes are marked in the text"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  repository: https://github.com/sveltejs/kit
  tags: "sveltekit, svelte, full-stack, ssr, web-framework"
---

# SvelteKit

## Overview

SvelteKit is a full-stack framework built on Svelte's compiler-first approach, shipping minimal JavaScript with no virtual DOM runtime. It provides file-based routing for pages and API endpoints, server-side form actions with progressive enhancement, and deployment adapters for any hosting platform. This skill targets SvelteKit 3 (`@sveltejs/kit` 3.x, with Svelte 5 runes); where a project is still on 2.x the differences are called out.

## Instructions

- When creating a project, run `npx sv create invoice-app` (options: `--template minimal|demo|library`, `--types ts`, `--add eslint vitest playwright tailwindcss sveltekit-adapter`). Then `npm run dev` starts the dev server on port 5173.
- When setting up routing, use file-based conventions: `+page.svelte` for pages, `+layout.svelte` for shared layouts, `+server.ts` for API endpoints, and route groups `(name)` for shared layouts without URL impact.
- When loading data, use `+page.server.ts` for server-only loading (database queries, secrets) and `+page.ts` for universal loading. Keep `load()` functions thin and move business logic to `src/lib/server/`.
- When handling forms, use server-side form actions in `+page.server.ts` with `fail()` for validation errors and `redirect()` for success. Add `use:enhance` for progressive enhancement. In SvelteKit 3 an enhanced submission reports the status code passed to `fail()` instead of always 200.
- When creating API routes, export `GET`, `POST`, `PUT`, `DELETE` handlers from `+server.ts` returning a `Response`. In v3 `json()` and `text()` from `@sveltejs/kit` are deprecated: use `Response.json(...)` and `new Response(text)`. Use `error()` for HTTP errors.
- When configuring rendering, default to SSR, use `export const prerender = true` for static pages (marketing, docs, blog), and `export const ssr = false` for client-only pages.
- When adding middleware, use `src/hooks.server.ts` with the `handle` function for auth, logging, and redirects, and `sequence()` to compose hooks. In v3 the `Handle` type is imported from `@sveltejs/kit/hooks` (alongside `sequence`), not `@sveltejs/kit`.
- When deploying, choose the adapter: `adapter-auto` (detects some platforms, cannot build for a self-hosted box), `adapter-node` for self-hosting (`node build`, `HOST`/`PORT` env vars, default `0.0.0.0:3000`), `adapter-static` for full SSG, or `adapter-vercel`, `adapter-cloudflare`, `adapter-netlify`.

### SvelteKit 3 setup and upgrade notes

- Configuration lives in `vite.config.ts`: options formerly under `config.kit` in `svelte.config.js` are now top-level options of the `sveltekit({...})` Vite plugin (`adapter`, `paths`, `csrf`, `compilerOptions`). `svelte.config.js` is no longer read.
- The `$lib` alias is replaced by `#lib`, declared by you in `package.json` `imports` (`"#lib": "./src/lib/index.js"`, `"#lib/*": "./src/lib/*"`). Imports need the file extension: `#lib/server/tasks.js`. `sv create` writes this for new projects.
- `$app/environment` became `$app/env`; `$app/stores` is gone (use `$app/state`: `page`, `navigating`, `updated`); `base` and `assets` from `$app/paths` are gone (use `resolve()` and `asset()`).
- `csrf.checkOrigin` is replaced by `csrf.trustedOrigins: ['https://billing.partner.dev']`; CSRF protection is always on. Cross-origin form posts need a `Content-Type` header.
- `error(status, message)` takes a string message only; extra fields go in a third argument. `redirect()` to another origin needs `{ external: true }`. `handleError` now sees expected errors too.
- `adapter-node` no longer reads `ORIGIN`: set `paths.origin` in the Vite config (for example `paths: { origin: process.env.ORIGIN }`) when the app sits behind a proxy that hides the host. `adapter-vercel` dropped the `edge` runtime.
- `data-sveltekit-preload-data="off"` is now `"false"`. `invalidateAll` is deprecated in favour of `refreshAll`.
- To migrate from 2.x, upgrade to the latest 2.x first, then run `npx sv migrate sveltekit-3`.

### Minimal form action, endpoint and hook

```ts
// src/routes/tasks/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { addTask, listTasks } from '#lib/server/tasks.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({ tasks: listTasks() });

export const actions: Actions = {
  create: async ({ request }) => {
    const data = await request.formData();
    const title = String(data.get('title') ?? '').trim();
    if (title.length < 3) return fail(400, { title, error: 'Title needs 3+ characters' });
    addTask(title);
    redirect(303, '/tasks');
  }
};
```

```svelte
<!-- src/routes/tasks/+page.svelte -->
<script lang="ts">
  import { enhance } from '$app/forms';
  let { data, form } = $props();
</script>

<form method="POST" action="?/create" use:enhance>
  <input name="title" value={form?.title ?? ''} />
  <button>Add</button>
  {#if form?.error}<p>{form.error}</p>{/if}
</form>
<ul>{#each data.tasks as task (task.id)}<li>{task.title}</li>{/each}</ul>
```

```ts
// src/routes/api/health/+server.ts
import type { RequestHandler } from './$types';
export const GET: RequestHandler = () => Response.json({ ok: true });
```

```ts
// src/hooks.server.ts
import { redirect } from '@sveltejs/kit';
import { sequence, type Handle } from '@sveltejs/kit/hooks';

const auth: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/tasks') && !event.cookies.get('session')) redirect(303, '/login');
  return resolve(event);
};
const logging: Handle = async ({ event, resolve }) => resolve(event);
export const handle = sequence(logging, auth);
```

On 2.x use `import type { Handle } from '@sveltejs/kit'` and `$lib/...` instead. These files build and type-check with `npm run build` and `npx svelte-check` on SvelteKit 3.1.

## Examples

### Example 1: Build a CRUD app with form actions

**User request:** "Create a SvelteKit app with form-based task management"

**Actions:**
1. Run `npx sv create task-app --template minimal --types ts --no-add-ons`, then `npm install`
2. Define routes for task list (`src/routes/tasks/+page.svelte`) and detail (`src/routes/tasks/[id]/+page.svelte`)
3. Implement `load()` in `+page.server.ts` to fetch tasks from the database through `#lib/server/` helpers
4. Add `create`, `update` and `delete` named actions with `fail(400, {...})` validation (Zod works well here)
5. Enhance forms with `use:enhance`; without JavaScript they still post and the page re-renders with `form`

**Output:** A full-stack task management app with progressive enhancement and server-side validation.

### Example 2: Deploy a hybrid SvelteKit app

**User request:** "Set up a SvelteKit site with static marketing pages and dynamic dashboard"

**Actions:**
1. Create marketing pages with `export const prerender = true`
2. Build dashboard routes with SSR and `+page.server.ts` for authenticated data loading
3. Add an auth hook in `src/hooks.server.ts` to protect `/dashboard` routes
4. Pick the adapter in `vite.config.ts`: `adapter-node` for a VPS (`npm run build && node build`) or `adapter-vercel` / `adapter-cloudflare` for a platform

**Output:** A hybrid app with pre-rendered marketing pages and a server-rendered authenticated dashboard.

## Guidelines

- Use `+page.server.ts` for data loading that touches databases or secrets; never expose credentials in `+page.ts`. Modules under `src/lib/server/` cannot be imported by client code.
- Default to server-side form handling with actions; add `use:enhance` for progressive enhancement.
- Use `export const prerender = true` on marketing pages, docs, and blog posts.
- Keep `load()` functions thin: fetch data and return it, move business logic to `src/lib/server/`.
- Use route groups `(name)` to share layouts without affecting URLs.
- Set `data-sveltekit-preload-data="hover"` on links for perceived-instant navigation.
- Always handle the `form` prop in `+page.svelte` to display validation errors after failed actions.
- Behind a reverse proxy set `PROTOCOL_HEADER`/`HOST_HEADER` (adapter-node) only when the proxy is trusted; spoofed headers break CSRF checks and client IP detection.
- Remote functions are still experimental (opt in with `experimental.remoteFunctions` and `compilerOptions.experimental.async`); prefer actions and `load` for production code.
