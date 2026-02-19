---
title: Choose and Implement React State Management
slug: choose-react-state-management
description: >-
  Navigate the React state management landscape. Implement the right solution
  for each layer: Zustand for global client state, Jotai for granular atoms,
  XState for complex flows, and TanStack Query for server state.
skills:
  - zustand
  - jotai
  - xstate
  - tanstack-query
category: frontend
tags:
  - react
  - state-management
  - zustand
  - architecture
  - frontend
---

# Choose and Implement React State Management

Sami inherits a React codebase where everything lives in a single massive Redux store — auth state, UI preferences, API cache, form state, WebSocket data — all tangled together. Components re-render constantly because any state change triggers updates everywhere. The Redux boilerplate (actions, reducers, selectors, thunks) makes up 40% of the codebase. She decides to decompose state management into the right tool for each job.

## Step 1: Audit State Categories

Before picking tools, Sami categorizes every piece of state in the app:

**Client state** (owned by the frontend):
- Auth: current user, token, permissions
- UI: theme, sidebar, modal stack, active tab
- Preferences: language, notification settings, layout density

**Server state** (cache of backend data):
- User profiles, project lists, task boards, comments
- Search results, notifications feed
- Real-time updates from WebSocket

**Complex flow state** (multi-step processes):
- Checkout: cart → shipping → payment → confirmation
- Onboarding: profile → team → integrations → done
- File upload: selecting → uploading → processing → complete

**Ephemeral state** (component-local):
- Form inputs, dropdown open/closed, hover state
- Pagination cursors, scroll position

Each category has a natural tool. Forcing them all into one system is the root cause of the mess.

## Step 2: Zustand for Global Client State

Auth and app preferences are classic global state — accessed from many components, changed infrequently, needs persistence.

```typescript
// stores/auth.ts — Global auth state with Zustand
import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'

interface AuthStore {
  user: { id: string; name: string; email: string; role: string } | null
  token: string | null

  login: (email: string, password: string) => Promise<void>
  logout: () => void
}

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set) => ({
        user: null,
        token: null,

        login: async (email, password) => {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          })
          if (!res.ok) throw new Error('Login failed')
          const { user, token } = await res.json()
          set({ user, token })
        },

        logout: () => {
          set({ user: null, token: null })
          window.location.href = '/login'
        },
      }),
      { name: 'auth' }
    ),
    { name: 'auth-store' }
  )
)
```

Zustand is the right choice here because auth is a single coherent object, changed rarely, accessed from many places. The `persist` middleware handles localStorage automatically, and `devtools` enables Redux DevTools for debugging.

## Step 3: Jotai for Granular UI State

UI state is highly granular — sidebar, theme, modal stack, active filters. Each piece is independent. Zustand would work but Jotai's atomic model means each component subscribes only to the atoms it reads.

```typescript
// atoms/ui.ts — Granular UI state with Jotai
import { atom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'

// Persisted preferences
export const themeAtom = atomWithStorage<'light' | 'dark' | 'system'>('theme', 'system')
export const densityAtom = atomWithStorage<'comfortable' | 'compact'>('density', 'comfortable')
export const sidebarCollapsedAtom = atomWithStorage('sidebar-collapsed', false)

// Ephemeral UI state
export const modalStackAtom = atom<string[]>([])
export const activeTabAtom = atom<string>('overview')

// Derived atoms
export const resolvedThemeAtom = atom((get) => {
  const theme = get(themeAtom)
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
})

export const hasOpenModalAtom = atom((get) => get(modalStackAtom).length > 0)

// Action atoms
export const pushModalAtom = atom(null, (get, set, modalId: string) => {
  set(modalStackAtom, [...get(modalStackAtom), modalId])
})

export const popModalAtom = atom(null, (get, set) => {
  set(modalStackAtom, get(modalStackAtom).slice(0, -1))
})
```

A component that only reads `themeAtom` never re-renders when the sidebar state changes. With Redux, any state change to the global store could trigger re-renders across unrelated components.

## Step 4: XState for Complex Flows

The checkout flow has strict rules: you can't go to payment without a shipping address, you can't submit payment twice, cancellation should clean up partial state. Boolean flags (`isShipping`, `isPaying`, `isConfirmed`) allow impossible combinations. XState prevents this structurally.

```typescript
// machines/checkout.ts — Checkout flow state machine
import { setup, assign, fromPromise } from 'xstate'

interface CheckoutContext {
  cart: Array<{ id: string; name: string; price: number; quantity: number }>
  shipping: { address: string; city: string; zip: string } | null
  paymentIntent: string | null
  orderId: string | null
  error: string | null
}

export const checkoutMachine = setup({
  types: {
    context: {} as CheckoutContext,
    events: {} as
      | { type: 'SET_SHIPPING'; data: CheckoutContext['shipping'] }
      | { type: 'CONFIRM_PAYMENT' }
      | { type: 'BACK' }
      | { type: 'CANCEL' },
  },
  actors: {
    createPaymentIntent: fromPromise(async ({ input }: { input: { amount: number } }) => {
      const res = await fetch('/api/payments/intent', {
        method: 'POST',
        body: JSON.stringify({ amount: input.amount }),
      })
      return res.json()
    }),
    placeOrder: fromPromise(async ({ input }) => {
      const res = await fetch('/api/orders', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      return res.json()
    }),
  },
}).createMachine({
  id: 'checkout',
  initial: 'cart',
  context: { cart: [], shipping: null, paymentIntent: null, orderId: null, error: null },

  states: {
    cart: {
      on: { SET_SHIPPING: 'shipping' },
    },
    shipping: {
      on: {
        SET_SHIPPING: {
          target: 'payment',
          actions: assign({ shipping: ({ event }) => event.data }),
        },
        BACK: 'cart',
      },
    },
    payment: {
      invoke: {
        src: 'createPaymentIntent',
        input: ({ context }) => ({
          amount: context.cart.reduce((s, i) => s + i.price * i.quantity, 0),
        }),
        onDone: { actions: assign({ paymentIntent: ({ event }) => event.output.clientSecret }) },
        onError: { target: 'error', actions: assign({ error: 'Payment setup failed' }) },
      },
      on: {
        CONFIRM_PAYMENT: 'confirming',
        BACK: 'shipping',
      },
    },
    confirming: {
      invoke: {
        src: 'placeOrder',
        input: ({ context }) => context,
        onDone: {
          target: 'confirmed',
          actions: assign({ orderId: ({ event }) => event.output.orderId }),
        },
        onError: { target: 'error' },
      },
    },
    confirmed: { type: 'final' },
    error: {
      on: { BACK: 'payment' },
    },
  },
  on: { CANCEL: '.cart' },
})
```

The machine guarantees: you can only reach `payment` after `shipping`, double-submission is structurally impossible (the `confirming` state has no `CONFIRM_PAYMENT` transition), and every error has an explicit recovery path.

## Results

After the migration, the Redux store is gone. Bundle size drops by 12KB (Redux + Redux Toolkit + middleware). More importantly, re-render count drops by 60% — measured with React DevTools Profiler. Components that only read theme no longer re-render when projects load. The checkout flow, previously a source of 2-3 bugs per month (double charges, stuck states), has zero state-related bugs in the three months since the XState migration. New developers understand the checkout flow immediately by visualizing the state machine diagram, instead of tracing through 800 lines of Redux reducers.
