---
name: solid
description: |
  SolidJS is a reactive UI library that compiles to efficient vanilla JavaScript.
  It uses fine-grained reactivity with signals and stores, has no virtual DOM,
  and provides JSX components with excellent performance and small bundle size.
license: Apache-2.0
compatibility:
  - node >= 18
  - npm or yarn or pnpm
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - javascript
    - typescript
    - frontend
    - reactive
    - signals
    - performance
---

# SolidJS

SolidJS uses fine-grained reactivity with signals — no virtual DOM diffing. Components run once, and only the specific DOM nodes that depend on changed signals update. This makes it extremely fast.

## Installation

```bash
# Create SolidJS project
npx degit solidjs/templates/ts my-app
cd my-app
npm install
npm run dev
```

## Project Structure

```
# SolidJS project layout
src/
├── index.tsx            # Entry point
├── App.tsx              # Root component
├── routes/              # Page components
│   ├── Home.tsx
│   └── Articles.tsx
├── components/          # Shared components
│   └── ArticleCard.tsx
├── stores/              # Stores for state
│   └── articles.ts
├── lib/                 # Utilities
│   └── api.ts
└── index.css
```

## Signals (Primitives)

```tsx
// src/components/Counter.tsx — basic signals demo
import { createSignal, createEffect, createMemo } from 'solid-js';

export default function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);

  createEffect(() => {
    console.log(`Count is now: ${count()}`);
  });

  return (
    <div>
      <p>Count: {count()} (doubled: {doubled()})</p>
      <button onClick={() => setCount((c) => c + 1)}>+1</button>
    </div>
  );
}
```

## Components and Props

```tsx
// src/components/ArticleCard.tsx — component with typed props
import { Component } from 'solid-js';

interface Article {
  id: number;
  title: string;
  slug: string;
  excerpt: string;
}

interface Props {
  article: Article;
  onDelete?: (id: number) => void;
}

const ArticleCard: Component<Props> = (props) => {
  return (
    <article>
      <a href={`/articles/${props.article.slug}`}>
        <h2>{props.article.title}</h2>
      </a>
      <p>{props.article.excerpt}</p>
      <button onClick={() => props.onDelete?.(props.article.id)}>Delete</button>
    </article>
  );
};

export default ArticleCard;
```

## Resources (Data Fetching)

```tsx
// src/routes/Articles.tsx — async data fetching with createResource
import { createResource, For, Show, Suspense } from 'solid-js';
import ArticleCard from '../components/ArticleCard';

async function fetchArticles(): Promise<Article[]> {
  const res = await fetch('/api/articles');
  return res.json();
}

export default function Articles() {
  const [articles] = createResource(fetchArticles);

  return (
    <div>
      <h1>Articles</h1>
      <Suspense fallback={<p>Loading...</p>}>
        <Show when={!articles.error} fallback={<p>Error loading articles.</p>}>
          <For each={articles()}>
            {(article) => <ArticleCard article={article} />}
          </For>
        </Show>
      </Suspense>
    </div>
  );
}
```

## Stores (Complex State)

```tsx
// src/stores/articles.ts — store for nested reactive state
import { createStore, produce } from 'solid-js/store';

interface ArticlesState {
  items: Article[];
  loading: boolean;
  filter: string;
}

const [state, setState] = createStore<ArticlesState>({
  items: [],
  loading: false,
  filter: '',
});

export function useArticles() {
  async function fetchAll() {
    setState('loading', true);
    const res = await fetch('/api/articles');
    const data = await res.json();
    setState({ items: data, loading: false });
  }

  function removeArticle(id: number) {
    setState('items', (items) => items.filter((a) => a.id !== id));
  }

  function setFilter(query: string) {
    setState('filter', query);
  }

  return { state, fetchAll, removeArticle, setFilter };
}
```

## Control Flow

```tsx
// src/components/ArticleList.tsx — control flow components
import { For, Show, Switch, Match } from 'solid-js';

export default function ArticleList(props: { articles: Article[]; status: string }) {
  return (
    <div>
      <Switch>
        <Match when={props.status === 'loading'}>
          <p>Loading...</p>
        </Match>
        <Match when={props.status === 'error'}>
          <p>Error loading articles.</p>
        </Match>
        <Match when={props.status === 'ready'}>
          <Show when={props.articles.length > 0} fallback={<p>No articles.</p>}>
            <For each={props.articles}>
              {(article) => <ArticleCard article={article} />}
            </For>
          </Show>
        </Match>
      </Switch>
    </div>
  );
}
```

## Routing (SolidStart)

```tsx
// src/routes/articles/[slug].tsx — SolidStart file-based route
import { useParams } from '@solidjs/router';
import { createResource } from 'solid-js';

export default function ArticlePage() {
  const params = useParams();
  const [article] = createResource(() => params.slug, async (slug) => {
    const res = await fetch(`/api/articles/${slug}`);
    if (!res.ok) throw new Error('Not found');
    return res.json();
  });

  return (
    <Suspense fallback={<p>Loading...</p>}>
      <Show when={article()}>
        {(a) => (
          <article>
            <h1>{a().title}</h1>
            <div innerHTML={a().body} />
          </article>
        )}
      </Show>
    </Suspense>
  );
}
```

## Context (Dependency Injection)

```tsx
// src/lib/AuthContext.tsx — context for shared auth state
import { createContext, useContext, ParentComponent } from 'solid-js';
import { createStore } from 'solid-js/store';

const AuthContext = createContext<{ user: () => User | null; login: (u: User) => void }>();

export const AuthProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<{ user: User | null }>({ user: null });

  const value = {
    user: () => state.user,
    login: (u: User) => setState('user', u),
  };

  return <AuthContext.Provider value={value}>{props.children}</AuthContext.Provider>;
};

export function useAuth() {
  return useContext(AuthContext)!;
}
```

## Key Patterns

- Signals are called as functions: `count()` reads, `setCount()` writes — parentheses matter
- Components run once; only signal-dependent expressions re-execute
- Use `<For>` for lists (keyed by reference), `<Index>` for index-based iteration
- Use `<Show>` for conditional rendering, `<Switch>`/`<Match>` for multiple branches
- Use `createResource` for async data — it integrates with `<Suspense>`
- Use stores (`createStore`) for nested objects — signals are for primitives
- Don't destructure props — it breaks reactivity. Access `props.x` directly
