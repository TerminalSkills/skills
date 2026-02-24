---
name: jotai
description: >-
  Manage React state with Jotai atoms. Use when a user asks to manage granular
  React state, replace Context with something performant, create derived state,
  or build bottom-up state management with atomic primitives.
license: Apache-2.0
compatibility: 'React 18+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - jotai
    - react
    - state
    - atoms
    - frontend
---

# Jotai

## Overview

Jotai is an atomic state management library for React. State is composed from independent atoms — each component subscribes only to the atoms it uses, getting automatic render optimization. Think of it as React.useState but shareable across components.

## Instructions

### Step 1: Primitive Atoms

```typescript
// atoms/theme.ts — Basic atoms
import { atom, useAtom } from 'jotai'

export const themeAtom = atom<'light' | 'dark'>('light')
export const sidebarOpenAtom = atom(true)
export const countAtom = atom(0)

// Usage in any component
function ThemeToggle() {
  const [theme, setTheme] = useAtom(themeAtom)
  return (
    <button onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}>
      {theme === 'light' ? '🌙' : '☀️'}
    </button>
  )
}
```

### Step 2: Derived Atoms

```typescript
// atoms/cart.ts — Derived and async atoms
import { atom } from 'jotai'

interface CartItem { id: string; name: string; price: number; quantity: number }

export const cartItemsAtom = atom<CartItem[]>([])

// Read-only derived atom — recalculates when cartItemsAtom changes
export const cartTotalAtom = atom((get) => {
  const items = get(cartItemsAtom)
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0)
})

export const cartCountAtom = atom((get) => {
  return get(cartItemsAtom).reduce((sum, item) => sum + item.quantity, 0)
})

// Write-only atom (action)
export const addToCartAtom = atom(null, (get, set, newItem: CartItem) => {
  const items = get(cartItemsAtom)
  const existing = items.find(i => i.id === newItem.id)
  if (existing) {
    set(cartItemsAtom, items.map(i =>
      i.id === newItem.id ? { ...i, quantity: i.quantity + 1 } : i
    ))
  } else {
    set(cartItemsAtom, [...items, { ...newItem, quantity: 1 }])
  }
})
```

### Step 3: Async Atoms

```typescript
// atoms/user.ts — Async data fetching atoms
import { atom } from 'jotai'

export const userIdAtom = atom<string | null>(null)

// Async derived atom — fetches when userIdAtom changes
export const userAtom = atom(async (get) => {
  const id = get(userIdAtom)
  if (!id) return null
  const res = await fetch(`/api/users/${id}`)
  return res.json()
})
```

### Step 4: Persistence

```typescript
import { atomWithStorage } from 'jotai/utils'

// Automatically syncs with localStorage
export const authTokenAtom = atomWithStorage<string | null>('auth-token', null)
export const preferencesAtom = atomWithStorage('preferences', {
  language: 'en',
  notifications: true,
})
```

## Guidelines

- Jotai atoms are bottom-up (compose small pieces); Zustand stores are top-down (one big object).
- Use Jotai when state is granular and spread across many components.
- Use Zustand when state is centralized (auth, app config, complex business logic).
- `atomWithStorage` handles localStorage persistence with SSR support.
- No Provider needed (uses default store), but Provider is available for testing/isolation.
