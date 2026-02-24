---
name: next-safe-action
description: >-
  Type-safe Server Actions in Next.js with next-safe-action. Use when a user
  asks to validate server action inputs, handle errors in server actions,
  add middleware to actions, or build type-safe mutations in Next.js.
license: Apache-2.0
compatibility: 'Next.js 14+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - next-safe-action
    - server-actions
    - nextjs
    - type-safety
    - zod
---

# next-safe-action

## Overview

next-safe-action adds type safety, input validation, and middleware to Next.js Server Actions. Instead of manually parsing FormData and handling errors, define a Zod schema and get validated, typed inputs with automatic error handling.

## Instructions

### Step 1: Setup

```bash
npm install next-safe-action zod
```

```typescript
// lib/safe-action.ts — Action client with auth middleware
import { createSafeActionClient } from 'next-safe-action'
import { auth } from '@/auth'

// Public actions (no auth required)
export const publicAction = createSafeActionClient()

// Authenticated actions
export const authAction = createSafeActionClient({
  async middleware() {
    const session = await auth()
    if (!session?.user) throw new Error('Not authenticated')
    return { user: session.user }
  },
})
```

### Step 2: Define Actions

```typescript
// actions/projects.ts — Type-safe server actions
'use server'
import { authAction } from '@/lib/safe-action'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { revalidatePath } from 'next/cache'

const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
})

export const createProject = authAction
  .schema(createProjectSchema)
  .action(async ({ parsedInput, ctx }) => {
    const project = await prisma.project.create({
      data: {
        ...parsedInput,
        ownerId: ctx.user.id,
      },
    })

    revalidatePath('/dashboard')
    return { project }
  })

const updateProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(['active', 'archived']).optional(),
})

export const updateProject = authAction
  .schema(updateProjectSchema)
  .action(async ({ parsedInput, ctx }) => {
    const { id, ...data } = parsedInput

    // Verify ownership
    const project = await prisma.project.findFirst({
      where: { id, ownerId: ctx.user.id },
    })
    if (!project) throw new Error('Project not found')

    const updated = await prisma.project.update({
      where: { id },
      data,
    })

    revalidatePath(`/projects/${id}`)
    return { project: updated }
  })
```

### Step 3: Use in Components

```tsx
// components/CreateProjectForm.tsx — Form with safe action
'use client'
import { useAction } from 'next-safe-action/hooks'
import { createProject } from '@/actions/projects'

export function CreateProjectForm() {
  const { execute, result, isExecuting } = useAction(createProject)

  return (
    <form action={execute}>
      <input name="name" placeholder="Project name" required />
      <textarea name="description" placeholder="Description (optional)" />

      {result.validationErrors && (
        <div className="errors">
          {Object.entries(result.validationErrors).map(([field, errors]) => (
            <p key={field}>{field}: {errors?.join(', ')}</p>
          ))}
        </div>
      )}

      {result.serverError && (
        <p className="error">{result.serverError}</p>
      )}

      <button disabled={isExecuting}>
        {isExecuting ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  )
}
```

## Guidelines

- Always use Zod schemas for input validation — never trust client-submitted data.
- Use middleware for authentication — runs before every action in the chain.
- `useAction` hook provides `isExecuting`, `result`, and automatic error handling.
- Combine with `useOptimisticAction` for instant UI feedback.
- Revalidate paths/tags after mutations to keep the UI in sync with the database.
