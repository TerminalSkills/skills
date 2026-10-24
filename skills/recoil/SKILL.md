---
name: recoil
description: >-
  Recoil is Meta's atom-and-selector state management library for React. The
  repository was archived in January 2025 and the library does not run on
  React 19, so use this skill to maintain existing React 18 or older apps.
  Use when the user has code with atom, selector, useRecoilState or RecoilRoot,
  asks how Recoil atoms, selectors and families work, or wants to migrate
  away from Recoil.
license: Apache-2.0
compatibility: 'recoil 0.7.7 with React 16.13.1 through 18; fails on React 19'
metadata:
  author: terminal-skills
  version: "1.1.0"
  repository: https://github.com/facebookexperimental/Recoil
  category: development
  tags:
    - state-management
    - react
    - atoms
    - selectors
    - meta
---

# Recoil

## Overview

Recoil models React state as a graph: atoms hold state, selectors derive from atoms and other selectors (sync or async), and components subscribe only to the nodes they read. The latest and final release is 0.7.7 (February 2024); the GitHub repository `facebookexperimental/Recoil` is archived (read-only; last push 2025-01-01).

It is not compatible with React 19: rendering any component under `RecoilRoot` throws `Cannot destructure property 'ReactCurrentDispatcher' of 'react.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED' as it is undefined` (verified with recoil 0.7.7 and react 19.3.1; the same code works on react 18.3.1). Its peer range `react >=16.13.1` does not stop the install. For a new project, or an app moving to React 19, pick a maintained library instead: Jotai has the closest model (atoms plus derived atoms), Zustand is the simplest store.

## Instructions

### Install (React 18 or older only)

```bash
npm install recoil@0.7.7
```

### Atoms, selectors and components

```tsx
import { atom, selector, useRecoilState, useRecoilValue, RecoilRoot } from "recoil";

type Todo = { id: string; title: string; done: boolean };
type Filter = "all" | "active" | "completed";

const todosAtom = atom<Todo[]>({ key: "todos", default: [] });
const filterAtom = atom<Filter>({ key: "todoFilter", default: "all" });

const filteredTodosSelector = selector<Todo[]>({
  key: "filteredTodos",
  get: ({ get }) => {
    const todos = get(todosAtom);
    switch (get(filterAtom)) {
      case "active": return todos.filter((t) => !t.done);
      case "completed": return todos.filter((t) => t.done);
      default: return todos;
    }
  },
});

const statsSelector = selector({
  key: "todoStats",
  get: ({ get }) => {
    const todos = get(todosAtom);
    const completed = todos.filter((t) => t.done).length;
    return { total: todos.length, completed, percent: todos.length ? Math.round((completed / todos.length) * 100) : 0 };
  },
});

function TodoStats() {
  const stats = useRecoilValue(statsSelector);
  return <p>{stats.completed}/{stats.total} done ({stats.percent}%)</p>;
}

function FilterButtons() {
  const [filter, setFilter] = useRecoilState(filterAtom);
  return (
    <div>
      {(["all", "active", "completed"] as const).map((f) => (
        <button key={f} onClick={() => setFilter(f)} style={{ fontWeight: filter === f ? "bold" : "normal" }}>
          {f}
        </button>
      ))}
    </div>
  );
}

export function App() {
  return (
    <RecoilRoot>
      <TodoStats />
      <FilterButtons />
    </RecoilRoot>
  );
}
```

Hook choice: `useRecoilValue` to read, `useSetRecoilState` to write without subscribing, `useRecoilState` for both, `useResetRecoilState` to restore the default.

### Async selectors, families and loadables

```tsx
import { Suspense } from "react";
import { atom, atomFamily, selectorFamily, useRecoilValue, useRecoilValueLoadable } from "recoil";

type User = { id: string; name: string };

const currentUserIdAtom = atom<string>({ key: "currentUserId", default: "u_1042" });

// one cached selector per id
const userByIdSelector = selectorFamily<User, string>({
  key: "userById",
  get: (userId) => async () => {
    const res = await fetch(`/api/users/${userId}`);
    if (!res.ok) throw new Error(`User ${userId}: ${res.status}`);
    return res.json();
  },
});

// one atom per id, with a default computed from the id
const draftNoteAtom = atomFamily<string, string>({ key: "draftNote", default: (id) => `Note for ${id}` });

function UserProfile() {
  const userId = useRecoilValue(currentUserIdAtom);
  const user = useRecoilValue(userByIdSelector(userId)); // suspends; throws to the error boundary on failure
  return <h1>{user.name}</h1>;
}

function UserBadge({ userId }: { userId: string }) {
  const loadable = useRecoilValueLoadable(userByIdSelector(userId)); // no Suspense needed
  if (loadable.state === "loading") return <span>...</span>;
  if (loadable.state === "hasError") return <span>unavailable</span>;
  return <span>{loadable.contents.name}</span>;
}

export const Page = () => (
  <Suspense fallback={<p>Loading profile...</p>}>
    <UserProfile />
  </Suspense>
);
```

### Atom effects (persistence, sync)

```tsx
const themeAtom = atom<"light" | "dark">({
  key: "theme",
  default: "light",
  effects: [
    ({ setSelf, onSet }) => {
      if (typeof window === "undefined") return; // effects also run during server rendering
      const saved = localStorage.getItem("theme");
      if (saved === "light" || saved === "dark") setSelf(saved);
      onSet((value) => localStorage.setItem("theme", value));
    },
  ],
});
```

## Examples

**"Add a dark-mode toggle that survives reloads in our Recoil app."** Create `themeAtom` with the effect above and use `const [theme, setTheme] = useRecoilState(themeAtom)` in the toggle. Reloading restores the saved theme. The `window` guard keeps server rendering from touching `localStorage`.

**"Why does my app crash after upgrading to React 19?"** Recoil 0.7.7 reads a React internal that React 19 removed; the error above is thrown on first render. Options: pin `react` and `react-dom` to 18.3.x, or move the atoms to Jotai (`atom` for atoms, derived atoms via `atom((get) => ...)`, `useAtom` / `useAtomValue`), one slice at a time.

## Guidelines

- Do not start new work on Recoil and do not expect fixes: the project is archived. Say so when the user is choosing a library.
- Every atom and selector needs a key that is unique across the whole app; a duplicate key logs a warning and causes confusing state sharing.
- Put `RecoilRoot` once near the app root; nested roots start with isolated state.
- Use selectors for derived values instead of computing in components. Values read from atoms and selectors are frozen in development, so copy before mutating.
- An async selector with no `Suspense` boundary above it throws to React; either add `<Suspense>` or read it with `useRecoilValueLoadable`.
- Prefer `selectorFamily` and `atomFamily` over one big atom for collections, and keep family parameters serializable (strings, numbers, plain objects).
- If server data is the main use case, a data-fetching library such as TanStack Query fits better than async selectors.
