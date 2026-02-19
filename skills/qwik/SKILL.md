---
name: qwik
description: |
  Qwik is a resumable web framework that delivers instant-loading applications by
  eliminating hydration. It serializes application state on the server and lazily
  loads JavaScript on interaction, making it ideal for edge deployment.
license: Apache-2.0
compatibility:
  - node >= 18
  - npm or yarn or pnpm
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frameworks
  tags:
    - typescript
    - frontend
    - ssr
    - resumable
    - edge
    - performance
---

# Qwik

Qwik eliminates hydration by serializing the application state into HTML. JavaScript loads lazily on user interaction, not on page load. This means near-zero JS on initial load regardless of app complexity.

## Installation

```bash
# Create Qwik project with Qwik City (meta-framework)
npm create qwik@latest
cd my-app
npm install
npm run dev
```

## Project Structure

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

## Components

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

## Signals and State

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

## Data Loading with routeLoader$

```tsx
// src/routes/articles/index.tsx — server-side data loading
import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { ArticleCard } from '~/components/article-card/article-card';

export const useArticles = routeLoader$(async ({ env }) => {
  const res = await fetch(`${env.get('API_URL')}/articles`);
  return res.json() as Promise<Article[]>;
});

export default component$(() => {
  const articles = useArticles();

  return (
    <div>
      <h1>Articles</h1>
      {articles.value.map((article) => (
        <ArticleCard key={article.id} title={article.title} slug={article.slug} excerpt={article.excerpt} />
      ))}
    </div>
  );
});
```

## Server Actions

```tsx
// src/routes/articles/new/index.tsx — form with server action
import { component$ } from '@builder.io/qwik';
import { routeAction$, Form, zod$, z } from '@builder.io/qwik-city';

export const useCreateArticle = routeAction$(
  async (data, { redirect, env }) => {
    const res = await fetch(`${env.get('API_URL')}/articles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) return { success: false, error: 'Failed to create' };
    throw redirect(302, '/articles');
  },
  zod$({
    title: z.string().min(1).max(200),
    body: z.string().min(1),
  })
);

export default component$(() => {
  const action = useCreateArticle();

  return (
    <Form action={action}>
      <input name="title" placeholder="Title" required />
      <textarea name="body" placeholder="Body" required />
      <button type="submit">Create</button>
      {action.value?.error && <p>{action.value.error}</p>}
    </Form>
  );
});
```

## Layouts

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

## Middleware

```tsx
// src/routes/admin/layout.tsx — auth middleware via onRequest
import { type RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ cookie, redirect }) => {
  const token = cookie.get('session')?.value;
  if (!token) throw redirect(302, '/login');
};
```

## useStore for Complex State

```tsx
// src/routes/dashboard/index.tsx — store for nested reactive state
import { component$, useStore, $ } from '@builder.io/qwik';

export default component$(() => {
  const state = useStore({
    articles: [] as Article[],
    filter: '',
    loading: false,
  });

  const fetchArticles = $(async () => {
    state.loading = true;
    const res = await fetch('/api/articles');
    state.articles = await res.json();
    state.loading = false;
  });

  return (
    <div>
      <button onClick$={fetchArticles}>Load</button>
      <input bind:value={state.filter} placeholder="Filter..." />
      {state.loading ? <p>Loading...</p> : (
        state.articles
          .filter((a) => a.title.includes(state.filter))
          .map((a) => <div key={a.id}>{a.title}</div>)
      )}
    </div>
  );
});
```

## Deployment

```bash
# Add deployment adapter
npm run qwik add cloudflare-pages  # or: vercel, netlify, node-server, deno
npm run build
npm run deploy
```

## Key Patterns

- Use `$` suffix on functions (`onClick$`, `component$`, `routeLoader$`) — it marks serialization boundaries
- Use `useSignal` for primitives, `useStore` for objects — similar to Solid's signal/store split
- `routeLoader$` runs on the server during SSR — data is serialized into HTML
- `routeAction$` handles form submissions server-side with Zod validation
- JavaScript loads lazily per interaction — no hydration step
- Use `onRequest` handlers in layouts for server-side middleware (auth, redirects)
- Deploy anywhere: Cloudflare, Vercel, Netlify, Deno, Node — via adapters
