---
name: shadcn-ui
description: >-
  Build UIs with shadcn/ui components. Use when adding accessible, styled
  React components, building a design system with Tailwind, customizing
  component libraries, or scaffolding UI for Next.js apps.
license: Apache-2.0
compatibility: 'React 18+, Next.js, Vite'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags: [shadcn-ui, components, tailwind, react, design-system]
---

# shadcn/ui

## Overview

shadcn/ui is not a component library — it's a collection of re-usable components you copy into your project. Built on Radix UI primitives + Tailwind CSS. You own the code, customize freely, and don't depend on a package. The most popular React component approach in 2025-2026.

## Instructions

### Step 1: Init

```bash
npx shadcn@latest init
# Prompts: style (default/new-york), base color, CSS variables

# Add components
npx shadcn@latest add button
npx shadcn@latest add dialog
npx shadcn@latest add form
npx shadcn@latest add table
npx shadcn@latest add dropdown-menu
```

### Step 2: Usage

```tsx
// Components are in your codebase at components/ui/
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader,
  DialogTitle, DialogTrigger,
} from '@/components/ui/dialog'

function DeleteConfirmation({ onDelete }: { onDelete: () => void }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">Delete Project</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this project?</DialogTitle>
          <DialogDescription>
            This action cannot be undone. All tasks, files, and comments
            will be permanently deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive" onClick={onDelete}>Delete</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

### Step 3: Customization

```tsx
// Since you own the code, customize anything
// components/ui/button.tsx — Add your own variants
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        // Your custom variant
        premium: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:opacity-90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-11 rounded-md px-8',
        icon: 'h-10 w-10',
      },
    },
  }
)
```

### Step 4: Forms with React Hook Form + Zod

```tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
})

function ProfileForm() {
  const form = useForm({ resolver: zodResolver(schema) })

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField control={form.control} name="name" render={({ field }) => (
          <FormItem>
            <FormLabel>Name</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <FormField control={form.control} name="email" render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl><Input type="email" {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit">Save</Button>
      </form>
    </Form>
  )
}
```

## Guidelines

- shadcn/ui copies components to your project — you own them, no dependency lock-in.
- Built on Radix UI (accessible primitives) + Tailwind (styling) + cva (variants).
- Use `npx shadcn@latest add` to add components — don't install from npm.
- Customize themes via CSS variables in `globals.css` — supports dark mode out of the box.
- Form components integrate with react-hook-form + zod for validation.
