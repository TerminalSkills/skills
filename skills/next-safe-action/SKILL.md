---
name: next-safe-action
description: >-
  next-safe-action is a library for type-safe Next.js Server Actions with
  schema validation, middleware and typed errors. Use it when a user asks to
  validate server action inputs with Zod, handle errors in server actions, add
  authentication middleware to actions, call actions from client components
  with hooks, or build type-safe mutations in the Next.js App Router.
license: Apache-2.0
compatibility: 'Next.js 14+ (App Router), React 18.2+, TypeScript 5, a Standard Schema library such as Zod or Valibot'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  repository: https://github.com/next-safe-action/next-safe-action
  tags:
    - next-safe-action
    - server-actions
    - nextjs
    - type-safety
    - zod
---

# next-safe-action

## Overview

next-safe-action wraps Next.js Server Actions with a builder: you attach an input schema, optional middleware and metadata, then write the server code. Callers get a typed result object instead of exceptions: `data` on success, `validationErrors` when input is invalid, `serverError` when your code throws.

Version checked: 8.7.3 (peer deps: `next` >= 14, `react` >= 18.2). Differences from older (v6/v7) tutorials:

- Define input with `.inputSchema(schema)`; `.schema()` still exists but is deprecated.
- Middleware is added with `.use(async ({ next }) => next({ ctx }))`. The `middleware` option of `createSafeActionClient` no longer exists.
- Schemas can be anything that implements Standard Schema (Zod 3.24+/4, Valibot, ArkType), not just Zod.
- Hook `execute` takes the **input object**, not `FormData`. Use `useStateAction`'s `formAction`, or build the object in your own form handler.
- Hooks live in `next-safe-action/hooks` (`useAction`, `useOptimisticAction`) and `next-safe-action/stateful-hooks` (`useStateAction`).

## Instructions

### Step 1: Install and create clients

```bash
npm install next-safe-action zod
```

```typescript
// lib/safe-action.ts
import { createSafeActionClient, DEFAULT_SERVER_ERROR_MESSAGE } from 'next-safe-action'
import { auth } from '@/auth'

class AppError extends Error {}

export const actionClient = createSafeActionClient({
  // Whatever you return becomes result.serverError; never leak raw error messages.
  handleServerError(e) {
    if (e instanceof AppError) return e.message
    console.error('Action failed:', e)
    return DEFAULT_SERVER_ERROR_MESSAGE
  },
})

export const authActionClient = actionClient.use(async ({ next }) => {
  const session = await auth()
  if (!session?.user) throw new AppError('You must be signed in.')
  return next({ ctx: { user: session.user } })
})
```

`auth()` stands for your auth library (Auth.js, Clerk, Better Auth). Middleware added with `.use()` runs before input validation; for logic that needs the parsed input use `.useValidated()` after `.inputSchema()`.

### Step 2: Define actions

```typescript
// actions/projects.ts
'use server'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { returnValidationErrors } from 'next-safe-action'
import { authActionClient } from '@/lib/safe-action'
import { prisma } from '@/lib/db'

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export const createProject = authActionClient
  .inputSchema(createProjectSchema)
  .action(async ({ parsedInput, ctx }) => {
    const taken = await prisma.project.findFirst({
      where: { ownerId: ctx.user.id, name: parsedInput.name },
    })
    if (taken) {
      returnValidationErrors(createProjectSchema, {
        name: { _errors: ['You already have a project with this name'] },
      })
    }
    const project = await prisma.project.create({
      data: { ...parsedInput, ownerId: ctx.user.id },
    })
    revalidatePath('/dashboard')
    return { project }
  })
```

Always check ownership inside the action (`where: { id, ownerId: ctx.user.id }`); authentication middleware alone does not authorize access to a specific row.

### Step 3: Call from a client component

```tsx
// components/CreateProjectForm.tsx
'use client'
import { useAction } from 'next-safe-action/hooks'
import { createProject } from '@/actions/projects'

export function CreateProjectForm() {
  const { execute, result, isExecuting, hasSucceeded } = useAction(createProject)

  return (
    <form
      action={(formData: FormData) =>
        execute({
          name: String(formData.get('name') ?? ''),
          description: String(formData.get('description') ?? '') || undefined,
        })
      }
    >
      <input name="name" placeholder="Project name" required />
      {result.validationErrors?.name?._errors?.map((m) => <p key={m}>{m}</p>)}
      <textarea name="description" placeholder="Description (optional)" />

      {result.serverError && <p role="alert">{result.serverError}</p>}
      {hasSucceeded && <p>Created {result.data?.project.name}</p>}

      <button disabled={isExecuting}>{isExecuting ? 'Creating…' : 'Create project'}</button>
    </form>
  )
}
```

`validationErrors` is shaped like the schema: `{ _errors?: string[], name?: { _errors: string[] } }`. The package also exports `flattenValidationErrors` and `formatValidationErrors` for reshaping errors. `useAction` also accepts `onSuccess`, `onError` and `onSettled` callbacks, and `executeAsync` returns the result as a promise.

## Examples

### Example 1: Authenticated archive action with optimistic UI

**User request:** "Add an archive button to the project list that updates instantly and fails safely."

Define `archiveProject` with `authActionClient.inputSchema(z.object({ id: z.string().uuid() }))`, update with `where: { id, ownerId: ctx.user.id }` and return `{ id }`. In the component, `const { execute, optimisticState } = useOptimisticAction(archiveProject, { currentState: projects, updateFn: (state, { id }) => state.filter((p) => p.id !== id) })`. Clicking the button hides the row immediately; if the action returns `serverError` the list snaps back.

### Example 2: Fix "serverError: Something went wrong" in production

**User request:** "My action throws 'Not found' but the client only shows a generic message."

That is the default: next-safe-action hides thrown errors behind `DEFAULT_SERVER_ERROR_MESSAGE`. Throw a custom error class and return its message from `handleServerError` as in Step 1, log everything else on the server, and read `result.serverError` in the component. Do not return `e.message` for every error: database and library messages can reveal internals.

## Guidelines

- Validate every input with a schema; types alone do not protect a Server Action, which is a public HTTP endpoint.
- Authenticate in middleware and authorize per resource inside the action.
- Keep `'use server'` files exporting only actions; client components import the exported action and pass it to a hook.
- Call `revalidatePath` or `revalidateTag` after mutations so cached pages update.
- Use `redirect()` from `next/navigation` inside actions only when you want navigation; the hooks report it as `hasNavigated`.
- Zod v4 and v3 both work through Standard Schema; do not mix schema libraries inside one action.
- When upgrading from v7, follow https://next-safe-action.dev/docs/migrations/v7-to-v8.
