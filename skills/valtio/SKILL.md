---
name: valtio
description: >-
  Manage React state with Valtio — proxy-based state that just works. Use when
  someone asks to "simple React state management", "Valtio", "proxy state",
  "mutable state in React", "alternative to Zustand/Redux", or "state
  management without boilerplate". Covers proxy state, subscriptions, computed
  values, and devtools.
license: Apache-2.0
compatibility: "React 18+. Also works with vanilla JS, Vue, Svelte."
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["state", "valtio", "react", "proxy", "store"]
---

# Valtio

## Overview

Valtio makes React state management feel like plain JavaScript — mutate objects directly and React re-renders automatically. No reducers, no actions, no selectors. Wrap an object in `proxy()`, mutate it anywhere, and components that read the changed properties re-render. Based on JavaScript Proxy, it tracks which properties each component uses and only re-renders when those specific properties change.

## When to Use

- Want the simplest possible state management
- Tired of Redux boilerplate or Zustand's `set()` function
- Sharing state between components without prop drilling
- State that's accessed/modified outside React (event handlers, WebSocket callbacks)
- Team prefers mutable patterns over immutable

## Instructions

### Setup

```bash
npm install valtio
```

### Basic Store

```typescript
// store/app.ts — Define state as a plain object
import { proxy, useSnapshot } from "valtio";

export const appState = proxy({
  user: null as { name: string; email: string } | null,
  theme: "light" as "light" | "dark",
  notifications: [] as Array<{ id: string; text: string; read: boolean }>,
  sidebar: { open: true, width: 280 },
});

// Mutate directly — React components auto-update
export function login(user: { name: string; email: string }) {
  appState.user = user;
}

export function toggleTheme() {
  appState.theme = appState.theme === "light" ? "dark" : "light";
}

export function addNotification(text: string) {
  appState.notifications.push({ id: crypto.randomUUID(), text, read: false });
}

export function markAllRead() {
  appState.notifications.forEach((n) => { n.read = true; });
}

export function toggleSidebar() {
  appState.sidebar.open = !appState.sidebar.open;
}
```

### Use in Components

```tsx
// components/Header.tsx — Read state with useSnapshot
import { useSnapshot } from "valtio";
import { appState, toggleTheme, toggleSidebar } from "@/store/app";

export function Header() {
  // useSnapshot creates a read-only snapshot
  // Component ONLY re-renders when `user` or `theme` changes
  // Changes to `notifications` or `sidebar` don't trigger re-render here
  const snap = useSnapshot(appState);

  return (
    <header className="flex items-center justify-between p-4">
      <button onClick={toggleSidebar}>☰</button>
      <span>{snap.user?.name ?? "Guest"}</span>
      <button onClick={toggleTheme}>
        {snap.theme === "light" ? "🌙" : "☀️"}
      </button>
    </header>
  );
}
```

```tsx
// components/NotificationBell.tsx — Derived/computed values
import { useSnapshot } from "valtio";
import { appState, markAllRead } from "@/store/app";

export function NotificationBell() {
  const snap = useSnapshot(appState);
  const unread = snap.notifications.filter((n) => !n.read).length;

  return (
    <button onClick={markAllRead} className="relative">
      🔔
      {unread > 0 && (
        <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {unread}
        </span>
      )}
    </button>
  );
}
```

### Computed Values with derive

```typescript
// store/derived.ts — Computed values that auto-update
import { derive } from "valtio/utils";
import { appState } from "./app";

export const derived = derive({
  unreadCount: (get) => get(appState).notifications.filter((n) => !n.read).length,
  isDarkMode: (get) => get(appState).theme === "dark",
  isLoggedIn: (get) => get(appState).user !== null,
});
```

### Subscribe Outside React

```typescript
// Listen to state changes outside components
import { subscribe } from "valtio";
import { appState } from "./store/app";

// Log every state change
subscribe(appState, () => {
  console.log("State changed:", JSON.stringify(appState));
});

// Subscribe to specific property
subscribe(appState.sidebar, () => {
  localStorage.setItem("sidebar-open", String(appState.sidebar.open));
});

// Use in WebSocket handler
socket.on("notification", (data) => {
  appState.notifications.push(data);  // Components auto-update
});
```

## Examples

### Example 1: Build a shopping cart

**User prompt:** "Build a shopping cart with add/remove/update quantity using simple state management."

The agent will create a Valtio proxy for cart state, actions that directly mutate the array, and components that reactively display cart contents and total.

### Example 2: Theme and layout preferences

**User prompt:** "Store user preferences (theme, language, sidebar state) that persist across page loads."

The agent will create a Valtio store with localStorage sync via subscribe, and components that read preferences reactively.

## Guidelines

- **`proxy()` for state, `useSnapshot()` for reading** — always use snapshot in components
- **Mutate directly** — `state.count++` works; no `setState` or `set()` needed
- **Automatic render optimization** — only re-renders when accessed properties change
- **`subscribe()` for side effects** — persist to localStorage, log, sync
- **`derive()` for computed values** — auto-recalculates when dependencies change
- **Works outside React** — mutate from event handlers, WebSocket, timers
- **Snapshot is read-only** — don't mutate `snap`, mutate the original `proxy`
- **Arrays work naturally** — `push`, `splice`, `filter` all trigger re-renders
- **Nested objects tracked** — `state.user.name = "new"` triggers re-render
- **Devtools** — `import { devtools } from "valtio/utils"` for Redux DevTools integration
