---
name: react-hook-form
description: >-
  Build performant forms in React with React Hook Form. Use when a user asks
  to handle form validation, build complex multi-step forms, integrate forms
  with Zod schemas, or reduce form re-renders in React.
license: Apache-2.0
compatibility: 'React 18+, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags:
    - react-hook-form
    - forms
    - validation
    - react
    - zod
---

# React Hook Form

## Overview

React Hook Form is a performant form library that minimizes re-renders. Unlike controlled components (which re-render on every keystroke), RHF uses uncontrolled inputs and only re-renders when necessary. Integrates with Zod for schema validation.

## Instructions

### Step 1: Basic Form with Zod

```bash
npm install react-hook-form @hookform/resolvers zod
```

```tsx
// components/SignupForm.tsx — Form with Zod validation
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const signupSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/[0-9]/, 'Must contain a number'),
  confirmPassword: z.string(),
}).refine(data => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
})

type SignupInput = z.infer<typeof signupSchema>

export function SignupForm() {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
  })

  const onSubmit = async (data: SignupInput) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    })
    if (!res.ok) throw new Error('Signup failed')
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <div>
        <label htmlFor="name">Name</label>
        <input {...register('name')} />
        {errors.name && <p className="error">{errors.name.message}</p>}
      </div>

      <div>
        <label htmlFor="email">Email</label>
        <input type="email" {...register('email')} />
        {errors.email && <p className="error">{errors.email.message}</p>}
      </div>

      <div>
        <label htmlFor="password">Password</label>
        <input type="password" {...register('password')} />
        {errors.password && <p className="error">{errors.password.message}</p>}
      </div>

      <div>
        <label htmlFor="confirmPassword">Confirm Password</label>
        <input type="password" {...register('confirmPassword')} />
        {errors.confirmPassword && <p className="error">{errors.confirmPassword.message}</p>}
      </div>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account...' : 'Sign Up'}
      </button>
    </form>
  )
}
```

### Step 2: Dynamic Fields

```tsx
// components/InvoiceForm.tsx — Dynamic line items
import { useForm, useFieldArray } from 'react-hook-form'

interface InvoiceForm {
  clientName: string
  items: Array<{ description: string; quantity: number; price: number }>
}

export function InvoiceForm() {
  const { register, control, handleSubmit, watch } = useForm<InvoiceForm>({
    defaultValues: { items: [{ description: '', quantity: 1, price: 0 }] },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const items = watch('items')
  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0)

  return (
    <form onSubmit={handleSubmit(console.log)}>
      <input {...register('clientName')} placeholder="Client name" />

      {fields.map((field, index) => (
        <div key={field.id} className="flex gap-2">
          <input {...register(`items.${index}.description`)} placeholder="Description" />
          <input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
          <input type="number" {...register(`items.${index}.price`, { valueAsNumber: true })} step="0.01" />
          <button type="button" onClick={() => remove(index)}>×</button>
        </div>
      ))}

      <button type="button" onClick={() => append({ description: '', quantity: 1, price: 0 })}>
        Add Item
      </button>

      <p>Total: ${total.toFixed(2)}</p>
      <button type="submit">Create Invoice</button>
    </form>
  )
}
```

### Step 3: Server Actions (Next.js)

```tsx
// app/settings/page.tsx — Server action with RHF
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { updateProfile } from './actions'

export function ProfileForm({ user }) {
  const form = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, bio: user.bio },
  })

  return (
    <form action={async (formData) => {
      const valid = await form.trigger()
      if (!valid) return
      await updateProfile(formData)
    }}>
      <input {...form.register('name')} />
      <textarea {...form.register('bio')} />
      <button type="submit">Save</button>
    </form>
  )
}
```

## Guidelines

- Always use Zod resolver — share validation between frontend forms and API routes.
- Use `useFieldArray` for dynamic lists (invoice items, team members, addresses).
- `register` uses uncontrolled inputs — fastest performance, minimal re-renders.
- Use `watch` sparingly — it triggers re-renders. Use `useWatch` for isolated subscriptions.
- For complex forms with many sections, use `FormProvider` to pass form context without prop drilling.
