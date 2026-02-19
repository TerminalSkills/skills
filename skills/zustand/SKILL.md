---
name: zustand
description: >-
  Assists with managing global and shared state in React applications using Zustand. Use
  when creating stores, handling async operations, persisting state, integrating with
  DevTools, or splitting stores into slices. Trigger words: zustand, state management,
  store, persist, selectors, react state.
license: Apache-2.0
compatibility: "Requires React 18+"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["zustand", "state-management", "react", "store", "global-state"]
---

# Zustand

## Overview

Zustand is a lightweight state management library for React that provides global stores with minimal boilerplate, automatic render optimization via selectors, built-in middleware for persistence and DevTools integration, and async action support without additional libraries. Stores are created outside of React and require no providers.

## Instructions

- When creating stores, use `create<State>()((set, get) => ({ ... }))` with typed state and actions, using `set()` for updates (shallow merge by default) and `get()` for reading current state in async functions.
- When consuming state, always use selectors (`useStore((s) => s.count)`) to prevent unnecessary re-renders, and use the `shallow` comparator for object or array selectors.
- When handling async operations, define async functions directly in the store that call `set()` for loading, success, and error states, without needing middleware.
- When persisting state, use the `persist` middleware with `partialize` to save only specific fields, `version` for schema migrations, and custom storage backends (localStorage, sessionStorage, AsyncStorage).
- When debugging, use the `devtools` middleware to connect to Redux DevTools for state inspection and time-travel debugging.
- When scaling stores, use the slices pattern to split large stores into focused domain slices (auth, cart, ui) that combine into a single store with cross-slice access via `get()`.

## Examples

### Example 1: Build an e-commerce cart store with persistence

**User request:** "Create a Zustand store for a shopping cart that persists across page reloads"

**Actions:**
1. Define the store with cart items, add/remove/update actions, and computed total
2. Add `persist` middleware with `partialize` to save only cart items (not UI state)
3. Add `devtools` middleware for debugging
4. Use selectors in components: `useCartStore((s) => s.items)` and `useCartStore((s) => s.total)`

**Output:** A cart store with add, remove, and quantity update actions, persisted to localStorage and connected to DevTools.

### Example 2: Build an auth store with async login

**User request:** "Create a Zustand store for authentication with login/logout and token management"

**Actions:**
1. Define the store with user, token, loading, and error state fields
2. Implement `login` as an async action that calls the API and updates state
3. Add `persist` middleware to save the token (not loading/error state)
4. Use `subscribeWithSelector` to trigger side effects on token changes

**Output:** An auth store with async login/logout, persistent token storage, and reactive side effects.

## Guidelines

- Always use selectors (`useStore((s) => s.count)`); never call `useStore()` without a selector since it re-renders on any state change.
- Use `shallow` for object selectors to prevent unnecessary re-renders from new object references.
- Use `persist` with `partialize` to save only what needs to survive page reloads, not the entire store.
- Use `immer` middleware for deeply nested state updates to avoid spread chains.
- Keep stores small and focused: one store per domain (auth, cart, ui) rather than one giant global store.
- Use `devtools` middleware in development for state inspection via Redux DevTools.
- Define actions inside the store, not in components, to colocate state with the logic that modifies it.
