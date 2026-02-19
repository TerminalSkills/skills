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

Qwik eliminates hydration by serializing application state into HTML. JavaScript loads lazily on user interaction — near-zero JS on initial load.

## Installation

```bash
# Create Qwik project with Qwik City
npm create qwik@latest
cd my-app && npm install && npm run dev
```

## Components

```tsx
// src/components/article-card.tsx — Qwik component
import { component$ } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';

export const ArticleCard = component$<{ title: string; slug: string; excerpt: string }>((props) => {
  return (
    <article>
      <Link href={`/articles/${props.slug}`}><h2>{props.title}</h2></Link>
      <p>{props.excerpt}</p>
    </article>
  );
});
```

## Signals and State

```tsx
// src/routes/counter/index.tsx — signals and reactivity
import { component$, useSignal, useComputed$ } from '@builder.io/qwik';

export default component$(() => {
  const count = useSignal(0);
  const doubled = useComputed$(() => count.value * 2);

  return (
    <div>
      <p>Count: {count.value} (doubled: {doubled.value})</p>
      <button onClick$={() => count.value++}>+1</button>
    </div>
  );
});
```

## Data Loading

```tsx
// src/routes/articles/index.tsx — server-side data loading
import { component$ } from '@builder.io/qwik';
import { routeLoader$ } from '@builder.io/qwik-city';
import { ArticleCard } from '~/components/article-card';

export const useArticles = routeLoader$(async ({ env }) => {
  const res = await fetch(`${env.get('API_URL')}/articles`);
  return res.json() as Promise<Article[]>;
});

export default component$(() => {
  const articles = useArticles();
  return (
    <div>
      <h1>Articles</h1>
      {articles.value.map((a) => (
        <ArticleCard key={a.id} title={a.title} slug={a.slug} excerpt={a.excerpt} />
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
    if (!res.ok) return { success: false, error: 'Failed' };
    throw redirect(302, '/articles');
  },
  zod$({ title: z.string().min(1).max(200), body: z.string().min(1) })
);

export default component$(() => {
  const action = useCreateArticle();
  return (
    <Form action={action}>
      <input name="title" required />
      <textarea name="body" required />
      <button type="submit">Create</button>
      {action.value?.error && <p>{action.value.error}</p>}
    </Form>
  );
});
```

## Layouts and Middleware

```tsx
// src/routes/layout.tsx — root layout
import { component$, Slot } from '@builder.io/qwik';
import { Link } from '@builder.io/qwik-city';

export default component$(() => (
  <div>
    <nav><Link href="/">Home</Link> <Link href="/articles">Articles</Link></nav>
    <main><Slot /></main>
  </div>
));
```

```tsx
// src/routes/admin/layout.tsx — auth middleware
import { type RequestHandler } from '@builder.io/qwik-city';

export const onRequest: RequestHandler = async ({ cookie, redirect }) => {
  if (!cookie.get('session')?.value) throw redirect(302, '/login');
};
```

## Deployment

```bash
# Add adapter and deploy
npm run qwik add cloudflare-pages  # or: vercel, netlify, node-server
npm run build && npm run deploy
```

## Key Patterns

- Use `$` suffix (`onClick$`, `component$`, `routeLoader$`) — marks serialization boundaries
- Use `useSignal` for primitives, `useStore` for objects
- `routeLoader$` runs server-side during SSR — data serialized into HTML
- `routeAction$` handles form submissions with Zod validation
- No hydration step — JavaScript loads per-interaction
- Use `onRequest` in layouts for server middleware
