---
name: react-hook-form
description: >-
  Build performant forms in React with React Hook Form. Use when a user asks
  to handle form state, validate forms, build multi-step forms, integrate
  with Zod validation, or manage complex form logic in React.
license: Apache-2.0
compatibility: 'React 16.8+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: frontend
  tags:
    - react-hook-form
    - forms
    - validation
    - react
    - zod
---

# React Hook Form

## Overview

React Hook Form manages form state with minimal re-renders. It integrates with Zod, Yup, and Joi for schema validation, supports complex nested forms, field arrays, and works with any UI library.

## Instructions

### Step 1: Basic Form

```tsx
// components/LoginForm.tsx — Form with validation
import { useForm } from 'react-hook-form'

export function LoginForm({ onSubmit }) {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm()

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('email', { required: 'Email is required', pattern: { value: /^\S+@\S+$/, message: 'Invalid email' } })} />
      {errors.email && <span>{errors.email.message}</span>}

      <input type="password" {...register('password', { required: true, minLength: { value: 8, message: 'Min 8 chars' } })} />
      {errors.password && <span>{errors.password.message}</span>}

      <button disabled={isSubmitting}>{isSubmitting ? 'Logging in...' : 'Log In'}</button>
    </form>
  )
}
```

### Step 2: Zod Integration

```tsx
// components/SignupForm.tsx — Schema validation with Zod
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string(),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords must match', path: ['confirmPassword'],
})

export function SignupForm() {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
  })
  return (
    <form onSubmit={handleSubmit(data => console.log(data))}>
      <input {...register('name')} placeholder="Name" />
      {errors.name && <span>{errors.name.message}</span>}
      {/* ... other fields */}
    </form>
  )
}
```

### Step 3: Dynamic Field Arrays

```tsx
import { useFieldArray } from 'react-hook-form'

function InvoiceForm() {
  const { control, register } = useForm({ defaultValues: { items: [{ name: '', price: 0 }] } })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  return (
    <>
      {fields.map((field, i) => (
        <div key={field.id}>
          <input {...register(`items.${i}.name`)} />
          <input type="number" {...register(`items.${i}.price`, { valueAsNumber: true })} />
          <button onClick={() => remove(i)}>Remove</button>
        </div>
      ))}
      <button onClick={() => append({ name: '', price: 0 })}>Add Item</button>
    </>
  )
}
```

## Guidelines

- React Hook Form minimizes re-renders — each field only re-renders when its value changes, not the entire form.
- Use `zodResolver` for type-safe validation that shares types with your API.
- `register` returns ref + onChange handlers — spread it on native inputs. For controlled components, use `Controller`.
- Always use `handleSubmit` — it validates before calling your submit function.
