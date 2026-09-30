---
name: react
description: >-
  Builds and debugs React user interfaces: components, state, effects, forms
  and data loading, written the way React 19 expects. Use when someone asks to
  "create a React app", "build a React component", "fix a useEffect bug",
  "stop unnecessary re-renders", "upgrade to React 19", "turn on the React
  Compiler", "use Server Components", "handle a form with Actions" or "test a
  React component". Covers Actions, use, useActionState, useOptimistic, ref as
  a prop, Server and Client Components, Suspense, error boundaries, keys, and
  project setup with Vite now that Create React App is deprecated.
license: Apache-2.0
compatibility: "React 19.0+ (19.2+ for useEffectEvent and Activity), Node.js 22.12+ for the Vite 8 toolchain"
metadata:
  author: terminal-skills
  version: "1.0.0"
  category: development
  tags: ["react", "react-19", "hooks", "server-components", "react-compiler"]
  repository: https://github.com/facebook/react
---

# React — Components, State and Effects for React 19

## Overview

React 19.3 (September 2026) is the current release. React 19.0 added Actions, `use` and `ref` as a prop and removed long-deprecated APIs; 19.2 added `useEffectEvent` and `<Activity>`; 19.3 made `<ViewTransition>` and Fragment refs stable. React Compiler 1.0 memoises components at build time. This skill covers project setup, the APIs to write today, the effect and state mistakes that cause most bugs, the server/client boundary, and testing.

## Instructions

### Start a project

```bash
npm create vite@latest booking-desk -- --template react-compiler-ts --eslint   # client-rendered app
npx create-next-app@latest          # Server Components and server rendering
npx create-react-router@latest      # React Router framework mode
```

Create React App has been deprecated since February 2025; do not use it for new apps. The TypeScript templates for Vite are `react-ts` and `react-compiler-ts`. They lint with Oxlint unless `--eslint` is passed, which adds `eslint-plugin-react-hooks` with `reactHooks.configs.flat.recommended`.

### Write React 19, not React 18

| Older pattern | React 19 |
|---|---|
| `forwardRef((props, ref) => …)` | `ref` is an ordinary prop of function components |
| `<ThemeContext.Provider value={…}>` | `<ThemeContext value={…}>` |
| `useContext(ThemeContext)` before any early return | `use(ThemeContext)`, allowed after a condition or early return |
| `useFormState` from `react-dom` | `useActionState` from `react` |
| `useRef<HTMLDivElement>()` | `useRef<HTMLDivElement>(null)`; the argument is required |
| `ref={(el) => (node = el)}` | `ref={(el) => { node = el }}`; a returned function is a cleanup |
| `propTypes`, `defaultProps` on functions | ignored; use TypeScript types and default parameters |
| `ReactDOM.render`, `ReactDOM.hydrate` | `createRoot`, `hydrateRoot` from `react-dom/client` |
| `act` from `react-dom/test-utils` | `act` from `react` |
| global `JSX.Element` | `React.JSX.Element` |

To upgrade, install `react@18.3` first to see the warnings, then run the codemods:

```bash
npx codemod@latest react/19/migration-recipe
npx types-react-codemod@latest preset-19 ./src
```

### Memoise with the compiler, not by hand

- With the compiler on, write new code without `useMemo`, `useCallback` and `memo`. Add one only where a value must keep its identity, for example when it is an effect dependency.
- In existing code, leave manual memoisation in place; removing it changes what the compiler produces.
- The compiler skips a component that breaks the Rules of React and keeps compiling the rest; the lint rules report which ones. `"use no memo"` as the first statement of a component opts it out.
- Pin the version (`npm i -D --save-exact babel-plugin-react-compiler`) when test coverage is thin.

### Submit forms with Actions

```tsx
import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { createBooking } from './api'

type FormState = { guestName: string; nights: number; error?: string; bookingId?: string }

async function submitBooking(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { guestName: String(formData.get('guestName') ?? '').trim(), nights: Number(formData.get('nights')) }
  if (!values.guestName) return { ...values, error: 'Guest name is required' }
  if (!Number.isInteger(values.nights) || values.nights < 1) return { ...values, error: 'Nights must be 1 or more' }
  try {
    const booking = await createBooking(values)
    return { guestName: '', nights: 1, bookingId: booking.id }
  } catch (err) {
    return { ...values, error: err instanceof Error ? err.message : 'Booking failed' }
  }
}

function SubmitButton() {
  const { pending } = useFormStatus() // status of the parent <form>
  return <button disabled={pending}>{pending ? 'Booking…' : 'Book room'}</button>
}

export function BookingForm() {
  const [state, formAction] = useActionState(submitBooking, { guestName: '', nights: 1 })
  return (
    <form action={formAction}>
      <label>Guest name <input name="guestName" defaultValue={state.guestName} /></label>
      <label>Nights <input name="nights" type="number" defaultValue={state.nights} /></label>
      <SubmitButton />
      {state.error && <p role="alert">{state.error}</p>}
      {state.bookingId && <p role="status">Booked {state.bookingId}</p>}
    </form>
  )
}
```

- React resets uncontrolled fields whenever the action returns without throwing, including when it returns an error. Return the submitted values and feed them to `defaultValue`, as above, or the user loses what they typed.
- `useFormStatus` reports on a `<form>` above the component that calls it, never on a form rendered by that same component.
- Return expected failures as state. An error thrown from an action goes to the nearest error boundary.
- `useActionState` returns `[state, dispatch, isPending]`. Outside a form, call `dispatch` inside `startTransition`.

### Show optimistic state

```tsx
const [saved, setSaved] = useState(initial)
const [optimisticSaved, setOptimisticSaved] = useOptimistic(saved)

function toggle() {
  startTransition(async () => {
    setOptimisticSaved(!saved) // shown until the transition ends
    const confirmed = await saveFavourite(roomId, !saved)
    startTransition(() => setSaved(confirmed)) // state set after an await needs its own transition
  })
}
```

Render `optimisticSaved`. When the transition ends React shows `saved` again, so a rejected change reverts without extra code.

### Keep effects for external systems

| Mistake | Replace with |
|---|---|
| State set in an effect from props or other state | a value computed during render |
| State reset in an effect when a prop changes | a `key`: `<Profile key={userId} userId={userId} />` starts with fresh state |
| Request started in an effect without cleanup | a cleanup that ignores or aborts the old request (Example 2), or a data library |
| Logic that belongs to a click or submit | the event handler |
| A dependency removed to stop an effect re-running | `useEffectEvent` (19.2+) for the part that reads the latest values |
| Subscription without `return () => unsubscribe()` | a cleanup for every setup |

In development, Strict Mode runs setup, cleanup, then setup again. An effect that breaks under this is missing cleanup. Effect Events are called only from effects and never listed as dependencies.

### Place state, keys and inputs

- Store the minimum and derive the rest: keep `selectedId`, compute `selectedRoom` during render.
- State belongs to a position in the tree. A component defined inside another component is a new type on every render and loses its state.
- A `key` is a stable ID from the data. An array index breaks state when items are inserted, removed or reordered; `Math.random()` remounts every item on every render.
- An input with `value` needs `onChange` and must never receive `undefined`; start from `''`. A checkbox uses `checked`. An input cannot change between controlled and uncontrolled.
- Put filters, tabs and pagination in the URL, and server data in a cache rather than `useState`.

### Draw the server/client boundary

Server Components need a framework that supports them, such as the Next.js App Router.

- A component is a Server Component unless its module, or a module that imports it, starts with `'use client'`. It can be `async` and read a database; it cannot use state, effects, event handlers or browser APIs.
- `'use client'` at the top of a file marks that module and everything it imports as client code. Put it on the smallest interactive component, not on a page or layout.
- Props passed from server to client must be serialisable: plain objects, arrays, `Date`, `Map`, `Set`, promises and JSX are; class instances and functions other than Server Functions are not.
- A Client Component can render Server Components it receives as `children`.
- `'use server'` marks Server Functions that the client can call. It does not mark Server Components. Validate and authorise their arguments like any public endpoint.

### Load data with Suspense and error boundaries

```tsx
import { Suspense, use } from 'react'
import { ErrorBoundary } from 'react-error-boundary'
import { fetchBookings, type Booking } from './api' // returns the same promise for the same roomId

function Rows({ bookingsPromise }: { bookingsPromise: Promise<Booking[]> }) {
  const bookings = use(bookingsPromise) // suspends; a rejection goes to the error boundary
  return <ul>{bookings.map((b) => <li key={b.id}>{b.guestName} · {b.nights} nights</li>)}</ul>
}

export function BookingList({ roomId }: { roomId: string }) {
  return (
    <ErrorBoundary fallback={<p role="alert">Could not load bookings.</p>}>
      <Suspense fallback={<p>Loading bookings…</p>}>
        <Rows bookingsPromise={fetchBookings(roomId)} />
      </Suspense>
    </ErrorBoundary>
  )
}
```

- A promise passed to `use` must be cached. A promise created during render is new on every render and shows the fallback again each time.
- `use` cannot be called inside `try`/`catch`.
- Error boundaries catch errors from rendering and from transitions. They do not catch errors in event handlers, timers or server rendering. They are still class components; `react-error-boundary` provides one.

### Test components

```tsx
import { act } from 'react'
import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { BookingList } from './BookingList'

test('lists bookings once the promise resolves', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ id: 'BK-1', guestName: 'Tomás Rey', nights: 2 }])))
  await act(async () => {
    render(<BookingList roomId="room-204" />)
  })
  expect(screen.getByText('Tomás Rey · 2 nights')).toBeInTheDocument()
})
```

A component that suspends on `use` stays on its fallback unless `render` is wrapped in an awaited `act`. React logs "A component suspended inside an `act` scope, but the `act` call was not awaited".

### Measure before optimising

Profile a production build: development builds are slower and Strict Mode renders twice. Record the slow interaction in the React DevTools Profiler, or in the Chrome Performance panel, which shows React's Scheduler and Components tracks from 19.2. Fix the cause in this order: move state closer to where it is used, virtualise long lists, mark slow updates with `startTransition` or `useDeferredValue`, and add `memo` or `useMemo` by hand only when the compiler is off.

## Examples

### Example 1: Turn on the React Compiler in a Vite app

**User request:** "We added babel-plugin-react-compiler to clinic-portal but nothing is memoised."

`@vitejs/plugin-react` 6 removed the `babel` option. With `react({ babel: { plugins: ['babel-plugin-react-compiler'] } })`, `vite build` succeeds and skips the compiler; only `tsc` reports the unknown option (TS2353).

```bash
npm install -D babel-plugin-react-compiler @rolldown/plugin-babel @babel/core
```

```ts
// vite.config.ts
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
})
```

```bash
npm run build && grep -o 'memo_cache_sentinel' dist/assets/*.js | wc -l
```

**Result:** the count rises from `1` (React's own runtime) to `4`; any value above `1` means components were compiled. They also show a "Memo ✨" badge in React DevTools.

### Example 2: Fix a search that shows results for an older query

**User request:** "Typing 'su' quickly in room search sometimes lists the results for 's'."

```tsx
// Before: the slower response wins, and the filtered list is copied into state
useEffect(() => {
  searchRooms(query).then(setRooms)
}, [query])
useEffect(() => {
  setAffordable(rooms.filter((r) => r.pricePerNightCents <= maxPriceCents))
}, [rooms, maxPriceCents])
```

```tsx
// After
useEffect(() => {
  const controller = new AbortController()
  let ignore = false
  searchRooms(query, controller.signal)
    .then((result) => { if (!ignore) setRooms(result) })
    .catch((err: unknown) => { if (!ignore) console.error(err) })
  return () => {
    ignore = true
    controller.abort()
  }
}, [query])

const affordable = rooms.filter((r) => r.pricePerNightCents <= maxPriceCents)
```

**Result:** when the response for "s" arrives after the one for "su", the list keeps showing "Garden Suite" instead of switching to "Standard Double". `npx eslint src` no longer reports `react-hooks/set-state-in-effect`.

## Guidelines

- Apps that use Server Components must run patched packages. `react-server-dom-webpack`, `-parcel` and `-turbopack` have remote code execution and denial-of-service flaws in every release older than 19.0.4, 19.1.5 and 19.2.4 of their line; upgrade them or the framework that bundles them. Client-only apps are not affected.
- Hooks run at the top level of a component or custom hook: not in conditions, loops, `try` blocks, or after an early return. Only `use` may be called conditionally.
- Do not silence `react-hooks/exhaustive-deps`. Move the value, make it an Effect Event, or drop the effect.
- `forwardRef` and `<Context.Provider>` still work in 19.3 and are due for deprecation. Do not write them in new code.
- React no longer re-throws render errors. Report them with `createRoot(container, { onUncaughtError, onCaughtError })`.
- For test setup and queries use the `testing-library` and `vitest` skills; for routing and rendering use `nextjs`, `remix` or `tanstack-start`; for cached server data use `tanstack-query`; for large validated forms use `react-hook-form`; for a shared client store use `zustand`; for types and `tsconfig.json` use `typescript`; for build configuration use `vite`.
