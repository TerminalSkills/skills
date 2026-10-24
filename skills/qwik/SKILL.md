---
name: qwik
description: >-
  Qwik is a resumable web framework that delivers instant-loading applications by
  eliminating hydration. Use when building a Qwik City app: components, signals,
  routeLoader$, routeAction$ forms, layouts, middleware, deployment adapters, or
  deciding between Qwik 1.x and the 2.0 release candidate.
license: Apache-2.0
compatibility: 'node >= 18.17, npm, yarn, pnpm or bun'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/QwikDev/qwik
  tags:
    - typescript
    - frontend
    - ssr
    - resumable
    - performance
---

# Qwik

## Overview

Qwik eliminates hydration by serializing the application state into HTML. JavaScript loads lazily on user interaction, not on page load. This means near-zero JS on initial load regardless of app complexity.

The stable line is Qwik 1.x (`@builder.io/qwik` and `@builder.io/qwik-city` 1.20, which is what `npm create qwik@latest` installs). Qwik 2.0 is a release candidate under new names: `@qwik.dev/core` and `@qwik.dev/router` (2.0.0-rc.3). The examples below are for 1.x and were type-checked and built against 1.20.2; for 2.0 change the import paths and follow the migration guide on qwik.dev.

## Instructions

### Installation

```bash
# Interactive; pass a starter and directory to skip the prompts
npm create qwik@latest empty ./newsroom-web
cd newsroom-web
npm install
npm start       # Vite dev server in SSR mode (npm run dev does not open a browser)
```

### Project Structure

```
# Qwik City project layout
src/
├── entry.ssr.tsx         # SSR entry
├── root.tsx              # Root component
├── global.css
├── routes/               # File-based routing
│   ├── layout.tsx        # Root layout
│   ├── index.tsx         # / page
│   └── articles/
│       ├── index.tsx     # /articles
│       └── [slug]/
│           └── index.tsx # /articles/:slug
├── components/           # Reusable components
│   └── article-card/
│       └── article-card.tsx
└── lib/                  # Utilities
```

### Components

```tsx
// src/components/article-card/article-card.tsx — Qwik component
import { component$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';

interface Props {
  title: string;
  slug: string;
  excerpt: string;
}

export const ArticleCard = component$<Props>((props) => {
  return (
    <article>
      <Link href={`/articles/${props.slug}`}>
        <h2>{props.title}</h2>
      </Link>
      <p>{props.excerpt}</p>
    </article>
  );
});
```

### Signals and State

```tsx
// src/routes/counter/index.tsx — signals and reactivity
import { component$, useSignal, useComputed$, useTask$ } from '@builder.io/qwik';

export default component$(() => {
  const count = useSignal(0);
  const doubled = useComputed$(() => count.value * 2);

  useTask$(({ track }) => {
    track(() => count.value);
    console.log(`Count changed to ${count.value}`);
  });

  return (
    <div>
      <p>Count: {count.value} (doubled: {doubled.value})</p>
      <button onClick$={() => count.value++}>+1</button>
    </div>
  );
});
```

### Data Loading with routeLoader$

```tsx
// src/routes/articles/index.tsx — server-side data loading
import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { ArticleCard } from '~/components/article-card/article-card';
import type { Article } from '~/lib/types';

export const useArticles = routeLoader$(async ({ env, fail }) => {
  const res = await fetch(`${env.get('API_URL')}/articles`);
  if (!res.ok) return fail(502, { message: 'Article service unavailable' });
  return (await res.json()) as Article[];
});

export default component$(() => {
  const articles = useArticles();
  const list = Array.isArray(articles.value) ? articles.value : [];
  return (
    <div>
      <h1>Articles</h1>
      {list.map((article) => (
        <ArticleCard key={article.id} title={article.title} slug={article.slug} excerpt={article.excerpt} />
      ))}
    </div>
  );
});
```

### Server Actions

```tsx
// src/routes/articles/new/index.tsx — form with server action
import { component$ } from '@builder.io/qwik';
import { routeAction$, Form, zod$, z } from '@builder.io/qwik-city';

export const useCreateArticle = routeAction$(
  async (data, { redirect, env, fail }) => {
    const res = await fetch(`${env.get('API_URL')}/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return fail(502, { message: 'Failed to create' });
    throw redirect(302, '/articles');
  },
  zod$({
    title: z.string().min(1).max(200),
    body: z.string().min(1),
  }),
);

export default component$(() => {
  const action = useCreateArticle();
  return (
    <Form action={action}>
      <input name="title" placeholder="Title" required />
      <textarea name="body" placeholder="Body" required />
      <button type="submit">Create</button>
      {action.value?.failed && <p>{action.value.message ?? 'Check the fields'}</p>}
    </Form>
  );
});
```

### Layouts

```tsx
// src/routes/layout.tsx — root layout
import { component$, Slot } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';

export default component$(() => {
  return (
    <div>
      <header>
        <nav>
          <Link href="/">Home</Link>
          <Link href="/articles">Articles</Link>
        </nav>
      </header>
      <main>
        <Slot />
      </main>
    </div>
  );
});
```

### Middleware

```tsx
// src/routes/admin/layout.tsx — auth check on every /admin request
import { component$, Slot } from '@builder.io/qwik';
import type { RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ cookie, redirect }) => {
  if (!cookie.get('session')?.value) throw redirect(302, '/login');
};

export default component$(() => <Slot />);
```

### useStore for Complex State

```tsx
// src/routes/dashboard/index.tsx — store for nested reactive state
import { component$, useStore, $ } from '@builder.io/qwik';
import type { Article } from '~/lib/types';

export default component$(() => {
  const state = useStore({ articles: [] as Article[], filter: '', loading: false });
  const load = $(async () => {
    state.loading = true;
    const res = await fetch('/api/articles');
    state.articles = await res.json();
    state.loading = false;
  });
  return (
    <div>
      <button onClick$={load}>Load</button>
      <input value={state.filter} onInput$={(_, el) => (state.filter = el.value)} placeholder="Filter..." />
      {state.loading ? <p>Loading...</p> : state.articles
        .filter((a) => a.title.includes(state.filter))
        .map((a) => <div key={a.id}>{a.title}</div>)}
    </div>
  );
});
```

### Deployment

```bash
npm run qwik add            # pick an adapter interactively, or name one below
npm run qwik add node-server
npm run build
```

Adapters shipped with the 1.20 starters: `aws-lambda`, `azure-swa`, `bun`, `cloudflare-pages`, `cloudflare-workers`, `cloud-run`, `deno`, `express`, `fastify`, `firebase`, `netlify-edge`, `node-server`, `static`, `vercel-edge`. The adapter adds its own build and deploy scripts to `package.json`.

## Examples

### Example 1: "Start a Qwik City blog that lists articles from my API"

Run the scaffold command above, create `src/lib/types.ts` exporting an `Article` interface (`id`, `title`, `slug`, `excerpt`), add the card component and the `routeLoader$` page, and start with `API_URL=http://localhost:4000 npm start` (the loader reads it through `env.get`). The server then serves `/articles` with the list already in the HTML; `npm run build.types` passes.

### Example 2: "Protect /admin and add a create form"

Add the `admin/layout.tsx` middleware, an `admin/index.tsx` page (the layout's `onRequest` runs only for routes beneath it; without a page `/admin` answers 200), and the `articles/new` action. A request to `/admin/` without a `session` cookie answers a 302 to `/login`. Submitting the form with an empty title never reaches your handler: `zod$` rejects it and `action.value.failed` is true.

## Guidelines

- Use `$` suffix on functions (`onClick$`, `component$`, `routeLoader$`) — it marks serialization boundaries
- Use `useSignal` for primitives, `useStore` for objects — similar to Solid's signal/store split
- `routeLoader$` runs on the server during SSR — data is serialized into HTML
- `routeAction$` handles form submissions server-side with Zod validation
- JavaScript loads lazily per interaction — no hydration step
- Use `onRequest` handlers in layouts for server-side middleware (auth, redirects)
- Deploy through adapters (`npm run qwik add`); pick the one that matches your host
- `bind:value` takes a signal, not a store property: with `useStore` use `value` plus `onInput$`
- Return `fail(status, data)` from loaders and actions for expected errors; `throw redirect(...)` for redirects
