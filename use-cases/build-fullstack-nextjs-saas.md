---
title: Build a Full-Stack Next.js SaaS Application
slug: build-fullstack-nextjs-saas
description: >-
  Build a production SaaS app with Next.js App Router, NextAuth for
  authentication, TanStack Query for data fetching, React Hook Form for
  forms, and next-safe-action for type-safe server mutations.
skills:
  - next-auth
  - react-query
  - react-hook-form
  - next-safe-action
  - prisma
  - stripe
category: development
tags:
  - nextjs
  - saas
  - fullstack
  - authentication
  - typescript
---

# Build a Full-Stack Next.js SaaS Application

Ines is building a project management SaaS — teams create projects, assign tasks, and track progress. She needs authentication (Google + email), a dashboard with real-time data, forms that validate before and after submission, and Stripe billing. Instead of piecing together random tutorials, she builds a cohesive stack where every layer is type-safe: database schema → API → server actions → forms → UI.

## Step 1: Database Schema

```prisma
// prisma/schema.prisma — Data model
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// NextAuth required models
model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model User {
  id            String    @id @default(cuid())
  name          String?
  email         String?   @unique
  emailVerified DateTime?
  image         String?
  role          String    @default("member")
  accounts      Account[]
  sessions      Session[]
  projects      Project[]
  tasks         Task[]    @relation("assignee")
  createdAt     DateTime  @default(now())
}

model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  status      String   @default("active")
  ownerId     String
  owner       User     @relation(fields: [ownerId], references: [id])
  tasks       Task[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}

model Task {
  id          String   @id @default(cuid())
  title       String
  description String?
  status      String   @default("todo")   // todo, in_progress, done
  priority    String   @default("medium") // low, medium, high, urgent
  projectId   String
  project     Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assigneeId  String?
  assignee    User?    @relation("assignee", fields: [assigneeId], references: [id])
  dueDate     DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

## Step 2: Authentication

Ines sets up NextAuth with Google OAuth and credentials-based login, using Prisma for session storage.

```typescript
// auth.ts — Authentication configuration
import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/db'

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id
      session.user.role = user.role
      return session
    },
  },
  pages: { signIn: '/login' },
})
```

```tsx
// app/login/page.tsx — Login page
import { signIn } from '@/auth'

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-bold text-center">Welcome to TaskFlow</h1>
        <form action={async () => {
          'use server'
          await signIn('google', { redirectTo: '/dashboard' })
        }}>
          <button className="w-full bg-white border rounded-lg px-4 py-2 flex items-center gap-2">
            <img src="/google.svg" alt="" className="w-5 h-5" />
            Continue with Google
          </button>
        </form>
      </div>
    </div>
  )
}
```

## Step 3: Server Actions

All mutations go through next-safe-action — validated inputs, authenticated context, type-safe returns.

```typescript
// lib/safe-action.ts — Action client
import { createSafeActionClient } from 'next-safe-action'
import { auth } from '@/auth'

export const authAction = createSafeActionClient({
  async middleware() {
    const session = await auth()
    if (!session?.user?.id) throw new Error('Not authenticated')
    return { userId: session.user.id }
  },
})
```

```typescript
// actions/tasks.ts — Task mutations
'use server'
import { authAction } from '@/lib/safe-action'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { revalidateTag } from 'next/cache'

const createTaskSchema = z.object({
  projectId: z.string().cuid(),
  title: z.string().min(1, 'Title is required').max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeId: z.string().cuid().optional(),
  dueDate: z.coerce.date().optional(),
})

export const createTask = authAction
  .schema(createTaskSchema)
  .action(async ({ parsedInput, ctx }) => {
    // Verify project access
    const project = await prisma.project.findFirst({
      where: { id: parsedInput.projectId, ownerId: ctx.userId },
    })
    if (!project) throw new Error('Project not found')

    const task = await prisma.task.create({
      data: parsedInput,
      include: { assignee: { select: { name: true, image: true } } },
    })

    revalidateTag(`project-${parsedInput.projectId}`)
    return { task }
  })

const updateTaskStatusSchema = z.object({
  id: z.string().cuid(),
  status: z.enum(['todo', 'in_progress', 'done']),
})

export const updateTaskStatus = authAction
  .schema(updateTaskStatusSchema)
  .action(async ({ parsedInput, ctx }) => {
    const task = await prisma.task.update({
      where: { id: parsedInput.id },
      data: { status: parsedInput.status },
    })

    revalidateTag(`project-${task.projectId}`)
    return { task }
  })
```

## Step 4: Data Fetching with TanStack Query

```tsx
// hooks/useTasks.ts — Task data hooks
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export function useTasks(projectId: string) {
  return useQuery({
    queryKey: ['tasks', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}/tasks`)
      if (!res.ok) throw new Error('Failed to fetch tasks')
      return res.json()
    },
    staleTime: 30_000,
  })
}

export function useUpdateTaskStatus() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      return res.json()
    },
    onMutate: async ({ id, status }) => {
      // Optimistic: update task status immediately in cache
      await queryClient.cancelQueries({ queryKey: ['tasks'] })

      queryClient.setQueriesData({ queryKey: ['tasks'] }, (old: any) => {
        if (!old) return old
        return old.map(task => task.id === id ? { ...task, status } : task)
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
}
```

## Step 5: Task Creation Form

```tsx
// components/CreateTaskForm.tsx — Form with validation
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useAction } from 'next-safe-action/hooks'
import { createTask } from '@/actions/tasks'

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.string().optional(),
})

export function CreateTaskForm({ projectId, onSuccess }: { projectId: string; onSuccess: () => void }) {
  const form = useForm({
    resolver: zodResolver(taskSchema),
    defaultValues: { priority: 'medium' as const },
  })

  const { execute, isExecuting } = useAction(createTask, {
    onSuccess: () => {
      form.reset()
      onSuccess()
    },
  })

  return (
    <form onSubmit={form.handleSubmit(data => execute({ ...data, projectId }))}>
      <input {...form.register('title')} placeholder="Task title" />
      {form.formState.errors.title && (
        <p className="text-red-500 text-sm">{form.formState.errors.title.message}</p>
      )}

      <textarea {...form.register('description')} placeholder="Description (optional)" />

      <select {...form.register('priority')}>
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
        <option value="urgent">Urgent</option>
      </select>

      <input type="date" {...form.register('dueDate')} />

      <button type="submit" disabled={isExecuting}>
        {isExecuting ? 'Creating...' : 'Create Task'}
      </button>
    </form>
  )
}
```

## Results

Ines ships the MVP in 3 weeks. The type-safe stack catches bugs at compile time — a renamed database column immediately shows errors in actions, hooks, and components. The Zod schemas are shared between forms and server actions, so validation runs client-side for instant feedback and server-side for security. TanStack Query's optimistic updates make task drag-and-drop feel instant, while the actual database update happens in the background. Authentication took 2 hours to set up (not 2 days), and the Prisma adapter handles all session management automatically. The first 50 beta users report zero auth-related bugs, and the team adds new features by defining a Prisma model, a Zod schema, a server action, and a form — each one fully typed and validated end-to-end.
