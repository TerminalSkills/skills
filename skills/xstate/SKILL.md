---
name: xstate
description: >-
  Model complex UI logic with XState state machines. Use when a user asks to
  manage complex multi-step flows, model stateful UI (wizards, forms, auth),
  prevent impossible states, or implement finite state machines in JavaScript.
license: Apache-2.0
compatibility: 'xstate 5.x, a bundler or Node; @xstate/react 6 for React 16.8-19'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/statelyai/xstate
  tags: "xstate, state-machine, statechart, react, logic"
---

# XState

## Overview

XState models application logic as state machines. Instead of managing boolean flags (`isLoading`, `isError`, `isSuccess`), you define states and transitions explicitly — making impossible states impossible. Ideal for complex flows: checkout, onboarding, authentication, multi-step forms.

## Instructions

Install with `npm install xstate` (version 5; the `setup()` API below is v5 only) and, for React, `npm install @xstate/react`. Other framework bindings: `@xstate/vue`, `@xstate/svelte`. Without a framework, run a machine with `createActor(machine).start()`, `actor.send(event)` and `actor.subscribe(snapshot => ...)`.

### Step 1: Define a machine

`setup()` declares types, actors, guards and actions once, so `createMachine` is fully typed. The credentials live in context so that `RETRY` can re-run the request without carrying them in the event.

```typescript
// machines/authMachine.ts
import { setup, assign, fromPromise } from 'xstate'

type User = { id: string; name: string; email: string }

export const authMachine = setup({
  types: {
    context: {} as {
      credentials: { email: string; password: string } | null
      user: User | null
      error: string | null
      retries: number
    },
    events: {} as
      | { type: 'LOGIN'; email: string; password: string }
      | { type: 'LOGOUT' }
      | { type: 'RETRY' },
  },
  actors: {
    loginUser: fromPromise<User, { email: string; password: string }>(async ({ input }) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error('Invalid credentials')
      return (await res.json()) as User
    }),
  },
  guards: {
    canRetry: ({ context }) => context.retries < 3,
  },
}).createMachine({
  id: 'auth',
  initial: 'idle',
  context: { credentials: null, user: null, error: null, retries: 0 },
  states: {
    idle: {
      on: {
        LOGIN: {
          target: 'authenticating',
          actions: assign({
            credentials: ({ event }) => ({ email: event.email, password: event.password }),
            retries: 0,
          }),
        },
      },
    },
    authenticating: {
      invoke: {
        src: 'loginUser',
        input: ({ context }) => context.credentials!,
        onDone: {
          target: 'authenticated',
          actions: assign({ user: ({ event }) => event.output, error: null, credentials: null }),
        },
        onError: {
          target: 'error',
          actions: assign({
            error: ({ event }) => (event.error as Error).message,
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
        RETRY: { target: 'authenticating', guard: 'canRetry' },
        LOGIN: {
          target: 'authenticating',
          actions: assign({
            credentials: ({ event }) => ({ email: event.email, password: event.password }),
            retries: 0,
          }),
        },
      },
    },
  },
})
```

### Step 2: Use it in React

`useMachine` returns `[snapshot, send, actorRef]`. `state.can(event)` tells whether an event would cause a transition, which removes duplicated guard logic from the UI.

```tsx
// components/LoginPage.tsx
import { useMachine } from '@xstate/react'
import { authMachine } from '../machines/authMachine'

export function LoginPage() {
  const [state, send] = useMachine(authMachine)

  if (state.matches('authenticated')) {
    return <div>Welcome, {state.context.user?.name}!</div>
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        send({
          type: 'LOGIN',
          email: form.get('email') as string,
          password: form.get('password') as string,
        })
      }}
    >
      <input name="email" type="email" required />
      <input name="password" type="password" required />
      {state.matches('error') && <p role="alert">{state.context.error}</p>}
      <button disabled={state.matches('authenticating')}>
        {state.matches('authenticating') ? 'Signing in...' : 'Sign in'}
      </button>
      {state.can({ type: 'RETRY' }) && (
        <button type="button" onClick={() => send({ type: 'RETRY' })}>
          Retry ({3 - state.context.retries} left)
        </button>
      )}
    </form>
  )
}
```

### Step 3: Run and test without a UI

Machines are plain logic. Replace an actor with `machine.provide()` to test without the network:

```typescript
import { createActor, fromPromise } from 'xstate'

const fake = authMachine.provide({
  actors: { loginUser: fromPromise(async () => ({ id: 'u1', name: 'Dana', email: 'dana@acme.dev' })) },
})
const actor = createActor(fake).start()
actor.send({ type: 'LOGIN', email: 'dana@acme.dev', password: 'correct-horse' })
// after the promise resolves: actor.getSnapshot().value === 'authenticated'
```

### Step 4: Delays and re-entry

Use `after` for timers instead of `setTimeout`. The timer is cancelled automatically when the state exits.

```typescript
import { setup } from 'xstate'

export const toastMachine = setup({
  types: { events: {} as { type: 'SHOW' } | { type: 'DISMISS' } },
}).createMachine({
  id: 'toast',
  initial: 'hidden',
  states: {
    hidden: { on: { SHOW: 'visible' } },
    visible: {
      after: { 3000: 'hidden' },
      on: { DISMISS: 'hidden', SHOW: { target: 'visible', reenter: true } },
    },
  },
})
```

`reenter: true` restarts the state (and its timer) on a self-transition; without it, a transition to the same state keeps the running timer.

## Examples

**"Build a login flow with retry limits."** Use the `authMachine` above. After `LOGIN` fails the machine is in `error` with `retries: 1`; `RETRY` re-runs the stored credentials until `retries` reaches 3, after which `state.can({ type: 'RETRY' })` is false and the UI hides the button.

**"Auto-hide a toast after three seconds."** Use `toastMachine`: `SHOW` enters `visible`, `after: { 3000: 'hidden' }` leaves it, and a second `SHOW` restarts the countdown. In a test, `createActor(toastMachine).start()` then `send({ type: 'SHOW' })` gives `getSnapshot().value === 'visible'`.

## Guidelines

- Use XState for flows with real states and transitions (multi-step forms, checkout, connections). It is overkill for a single toggle.
- Version 5 differs from 4: `setup()` and `createActor` replace `createMachine` options plus `interpret`; promises are invoked through `fromPromise`; guards and actions receive one object, such as `({ context, event })`.
- Do not keep credentials, large objects or non-serialisable values in context longer than needed; clear them on success as the example does.
- Inspect running machines with `@statelyai/inspect`, and draw or edit them in Stately Studio (stately.ai).
- For simple shared state use Zustand or Jotai; use XState when the allowed next step depends on the current state.
