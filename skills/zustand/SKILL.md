---
name: zustand
description: >-
  Manage React state with Zustand. Use when a user asks to set up global state
  in React, replace Redux with something simpler, share state between components,
  persist state to localStorage, or implement a lightweight store.
license: Apache-2.0
compatibility: 'React 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - zustand
    - react
    - state
    - store
    - frontend
---

# Zustand

## Overview

Zustand is a minimal state management library for React. No providers, no boilerplate, no context — just a hook. It's 1KB, works outside React components, supports middleware (persist, devtools, immer), and handles async operations natively.

## Instructions

### Step 1: Create Store

```typescript
// stores/useAuthStore.ts — Authentication state
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'member'
}

interface AuthState {
  user: User | null
  token: string | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  updateProfile: (updates: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true })
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password }),
          })
          const { user, token } = await res.json()
          set({ user, token, isLoading: false })
        } catch {
          set({ isLoading: false })
          throw new Error('Login failed')
        }
      },

      logout: () => set({ user: null, token: null }),

      updateProfile: (updates) =>
        set((state) => ({
          user: state.user ? { ...state.user, ...updates } : null,
        })),
    }),
    { name: 'auth-storage' }   // persists to localStorage
  )
)
```

### Step 2: Use in Components

```tsx
// components/Header.tsx — Consume state with a hook
import { useAuthStore } from '../stores/useAuthStore'

export function Header() {
  // Only re-renders when these specific values change
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)

  return (
    <header>
      {user ? (
        <>
          <span>Welcome, {user.name}</span>
          <button onClick={logout}>Sign Out</button>
        </>
      ) : (
        <a href="/login">Sign In</a>
      )}
    </header>
  )
}
```

### Step 3: Complex Store with Slices

```typescript
// stores/useAppStore.ts — Combined store with slices
import { create } from 'zustand'
import { devtools, immer } from 'zustand/middleware'

interface AppState {
  // UI slice
  sidebarOpen: boolean
  theme: 'light' | 'dark'
  toggleSidebar: () => void
  setTheme: (theme: 'light' | 'dark') => void

  // Notifications slice
  notifications: Array<{ id: string; message: string; type: 'info' | 'error' }>
  addNotification: (message: string, type: 'info' | 'error') => void
  removeNotification: (id: string) => void
}

export const useAppStore = create<AppState>()(
  devtools(
    immer((set) => ({
      sidebarOpen: true,
      theme: 'light',
      notifications: [],

      toggleSidebar: () => set((state) => { state.sidebarOpen = !state.sidebarOpen }),
      setTheme: (theme) => set((state) => { state.theme = theme }),

      addNotification: (message, type) => set((state) => {
        state.notifications.push({ id: crypto.randomUUID(), message, type })
      }),
      removeNotification: (id) => set((state) => {
        state.notifications = state.notifications.filter(n => n.id !== id)
      }),
    })),
    { name: 'app-store' }    // shows in Redux DevTools
  )
)
```

### Step 4: Use Outside React

```typescript
// lib/api.ts — Access store from non-React code
import { useAuthStore } from '../stores/useAuthStore'

export async function fetchWithAuth(url: string) {
  const token = useAuthStore.getState().token
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (res.status === 401) {
    useAuthStore.getState().logout()
  }
  return res
}
```

## Guidelines

- Use selectors `useStore(s => s.field)` to avoid unnecessary re-renders.
- `persist` middleware saves to localStorage automatically — great for auth, preferences.
- `immer` middleware allows mutable-style updates (Zustand handles immutability).
- Zustand works with Redux DevTools via the `devtools` middleware.
- For server-side state (API data), use TanStack Query instead — Zustand is for client state.
