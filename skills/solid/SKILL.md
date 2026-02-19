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
  category: frameworks
  tags:
    - javascript
    - typescript
    - frontend
    - reactive
    - signals
    - performance
---

# SolidJS

SolidJS uses fine-grained reactivity with signals — no virtual DOM diffing. Components run once, and only the specific DOM nodes that depend on changed signals update.

## Installation

```bash
# Create SolidJS project
npx degit solidjs/templates/ts my-app
cd my-app && npm install && npm run dev
```

## Signals

```tsx
// src/components/Counter.tsx — basic signals demo
import { createSignal, createEffect, createMemo } from 'solid-js';

export default function Counter() {
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);

  createEffect(() => console.log(`Count: ${count()}`));

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

const ArticleCard: Component<{ article: Article; onDelete?: (id: number) => void }> = (props) => {
  return (
    <article>
      <a href={`/articles/${props.article.slug}`}><h2>{props.article.title}</h2></a>
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
    <Suspense fallback={<p>Loading...</p>}>
      <Show when={!articles.error} fallback={<p>Error loading.</p>}>
        <For each={articles()}>{(a) => <ArticleCard article={a} />}</For>
      </Show>
    </Suspense>
  );
}
```

## Stores

```tsx
// src/stores/articles.ts — store for nested reactive state
import { createStore } from 'solid-js/store';

const [state, setState] = createStore({ items: [] as Article[], loading: false, filter: '' });

export function useArticles() {
  async function fetchAll() {
    setState('loading', true);
    const res = await fetch('/api/articles');
    setState({ items: await res.json(), loading: false });
  }

  function removeArticle(id: number) {
    setState('items', (items) => items.filter((a) => a.id !== id));
  }

  return { state, fetchAll, removeArticle };
}
```

## Control Flow

```tsx
// src/components/ArticleList.tsx — control flow components
import { For, Show, Switch, Match } from 'solid-js';

export default function ArticleList(props: { articles: Article[]; status: string }) {
  return (
    <Switch>
      <Match when={props.status === 'loading'}><p>Loading...</p></Match>
      <Match when={props.status === 'error'}><p>Error.</p></Match>
      <Match when={props.status === 'ready'}>
        <Show when={props.articles.length > 0} fallback={<p>No articles.</p>}>
          <For each={props.articles}>{(a) => <ArticleCard article={a} />}</For>
        </Show>
      </Match>
    </Switch>
  );
}
```

## Context

```tsx
// src/lib/AuthContext.tsx — context for shared state
import { createContext, useContext, ParentComponent } from 'solid-js';
import { createStore } from 'solid-js/store';

const AuthContext = createContext<{ user: () => User | null; login: (u: User) => void }>();

export const AuthProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<{ user: User | null }>({ user: null });
  return (
    <AuthContext.Provider value={{ user: () => state.user, login: (u) => setState('user', u) }}>
      {props.children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext)!;
```

## Key Patterns

- Signals are called as functions: `count()` reads, `setCount()` writes
- Components run once; only signal-dependent expressions re-execute
- Use `<For>` for lists, `<Show>` for conditionals, `<Switch>/<Match>` for branches
- Use `createResource` for async data — integrates with `<Suspense>`
- Use stores for nested objects, signals for primitives
- Don't destructure props — it breaks reactivity. Access `props.x` directly
