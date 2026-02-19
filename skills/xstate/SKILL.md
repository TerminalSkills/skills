---
name: xstate
description: >-
  Model complex UI logic with XState state machines. Use when a user asks to
  manage complex multi-step flows, model stateful UI (wizards, forms, auth),
  prevent impossible states, or implement finite state machines in JavaScript.
license: Apache-2.0
compatibility: 'React, Vue, Svelte, vanilla JS'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags:
    - xstate
    - state-machine
    - statechart
    - react
    - logic
---

# XState

## Overview

XState models application logic as state machines. Instead of managing boolean flags (`isLoading`, `isError`, `isSuccess`), you define states and transitions explicitly — making impossible states impossible. Ideal for complex flows: checkout, onboarding, authentication, multi-step forms.

## Instructions

### Step 1: Define a Machine

```typescript
// machines/authMachine.ts — Authentication state machine
import { setup, assign, fromPromise } from 'xstate'

export const authMachine = setup({
  types: {
    context: {} as {
      user: { id: string; name: string; email: string } | null
      error: string | null
      retries: number
    },
    events: {} as
      | { type: 'LOGIN'; email: string; password: string }
      | { type: 'LOGOUT' }
      | { type: 'RETRY' },
  },
  actors: {
    loginUser: fromPromise(async ({ input }: { input: { email: string; password: string } }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Invalid credentials')
      return res.json()
    }),
  },
}).createMachine({
  id: 'auth',
  initial: 'idle',
  context: { user: null, error: null, retries: 0 },

  states: {
    idle: {
      on: { LOGIN: 'authenticating' },
    },

    authenticating: {
      invoke: {
        src: 'loginUser',
        input: ({ event }) => ({ email: event.email, password: event.password }),
        onDone: {
          target: 'authenticated',
          actions: assign({ user: ({ event }) => event.output, error: null }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => event.error.message,
            retries: ({ context }) => context.retries + 1,
          }),
        },
      },
    },

    authenticated: {
      on: { LOGOUT: { target: 'idle', actions: assign({ user: null }) } },
    },

    error: {
      on: {
        RETRY: { target: 'authenticating', guard: ({ context }) => context.retries < 3 },
        LOGIN: 'authenticating',
      },
    },
  },
})
```

### Step 2: Use in React

```tsx
// components/LoginPage.tsx — XState in React
import { useMachine } from '@xstate/react'
import { authMachine } from '../machines/authMachine'

export function LoginPage() {
  const [state, send] = useMachine(authMachine)

  if (state.matches('authenticated')) {
    return <div>Welcome, {state.context.user.name}!</div>
  }

  return (
    <form onSubmit={(e) => {
      e.preventDefault()
      const form = new FormData(e.currentTarget)
      send({
        type: 'LOGIN',
        email: form.get('email') as string,
        password: form.get('password') as string,
      })
    }}>
      <input name="email" type="email" required />
      <input name="password" type="password" required />

      {state.matches('error') && (
        <p className="error">{state.context.error}</p>
      )}

      <button disabled={state.matches('authenticating')}>
        {state.matches('authenticating') ? 'Signing in...' : 'Sign In'}
      </button>

      {state.matches('error') && state.context.retries < 3 && (
        <button type="button" onClick={() => send({ type: 'RETRY' })}>
          Retry ({3 - state.context.retries} left)
        </button>
      )}
    </form>
  )
}
```

## Guidelines

- Use XState for complex flows (multi-step forms, checkout, real-time connections). Overkill for simple toggle state.
- State machines prevent impossible states — you can't be "loading" and "error" simultaneously.
- XState Visualizer (stately.ai/viz) renders your machine as a diagram — great for documentation.
- For simple state: Zustand or Jotai. For complex stateful logic: XState.
