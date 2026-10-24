---
name: react-hook-form
description: >-
  React Hook Form is a React library for building forms with uncontrolled inputs, so typing does not re-render the whole form. Use when the user wants form validation in React or Next.js, a signup or checkout form with Zod, dynamic field lists with useFieldArray, server-side errors mapped onto fields, or fewer re-renders from watch.
license: Apache-2.0
compatibility: 'React 16.8+ (examples checked with React 19, react-hook-form 7.91, @hookform/resolvers 6.0, zod 4.6)'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/react-hook-form/react-hook-form
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

React Hook Form (RHF) keeps input values in refs instead of React state, so a form re-renders only when its validation state or a watched value changes. `register` connects an input, `handleSubmit` runs validation and calls your function with typed data, and a resolver plugs in a schema library such as Zod. These examples use Zod 4 (`z.email()`); with Zod 3 write `z.string().email()`.

## Instructions

### Step 1: Install

```bash
npm install react-hook-form @hookform/resolvers zod
```

If npm stops with an `ERESOLVE` error about optional peer dependencies of `@hookform/resolvers`, rerun with `--legacy-peer-deps`, or use pnpm or yarn.

### Step 2: Form with Zod validation

Give each input an `id` that matches its label, set `defaultValues` for every field (RHF warns about uncontrolled-to-controlled switches otherwise), and use `setError` for failures that only the server can detect. `errors.root` holds form-level errors.

```tsx
// SignupForm.tsx
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'

export const signupSchema = z
  .object({
    name: z.string().min(2, 'Name must be at least 2 characters'),
    email: z.email('Invalid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Must contain an uppercase letter')
      .regex(/[0-9]/, 'Must contain a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  })

type SignupInput = z.infer<typeof signupSchema>

export function SignupForm({ onCreated }: { onCreated: () => void }) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  })

  const onSubmit = async (data: SignupInput) => {
    const res = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    if (res.status === 409) {
      setError('email', { message: 'This email is already registered' })
      return
    }
    if (!res.ok) {
      setError('root', { message: 'Signup failed, try again' })
      return
    }
    onCreated()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <label htmlFor="name">Name</label>
      <input id="name" {...register('name')} />
      {errors.name && <p role="alert">{errors.name.message}</p>}

      <label htmlFor="email">Email</label>
      <input id="email" type="email" autoComplete="email" {...register('email')} />
      {errors.email && <p role="alert">{errors.email.message}</p>}

      <label htmlFor="password">Password</label>
      <input id="password" type="password" autoComplete="new-password" {...register('password')} />
      {errors.password && <p role="alert">{errors.password.message}</p>}

      <label htmlFor="confirmPassword">Confirm password</label>
      <input id="confirmPassword" type="password" autoComplete="new-password" {...register('confirmPassword')} />
      {errors.confirmPassword && <p role="alert">{errors.confirmPassword.message}</p>}

      {errors.root && <p role="alert">{errors.root.message}</p>}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account...' : 'Sign Up'}
      </button>
    </form>
  )
}
```

### Step 3: Dynamic fields

`useFieldArray` manages the list; always use `field.id` as the React key, not the index. Read live values with `useWatch` inside a small child component so only that part re-renders. `valueAsNumber` turns number inputs into numbers.

```tsx
// InvoiceForm.tsx
import { useForm, useFieldArray, useWatch } from 'react-hook-form'

interface InvoiceValues {
  clientName: string
  items: Array<{ description: string; quantity: number; price: number }>
}

function InvoiceTotal({ control }: { control: ReturnType<typeof useForm<InvoiceValues>>['control'] }) {
  const items = useWatch({ control, name: 'items' })   // only this component re-renders
  const total = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0)
  return <p>Total: ${total.toFixed(2)}</p>
}

export function InvoiceForm({ onSave }: { onSave: (values: InvoiceValues) => void }) {
  const { register, control, handleSubmit } = useForm<InvoiceValues>({
    defaultValues: { clientName: '', items: [{ description: '', quantity: 1, price: 0 }] },
  })
  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  return (
    <form onSubmit={handleSubmit(onSave)}>
      <input {...register('clientName')} placeholder="Client name" />

      {fields.map((field, index) => (
        <div key={field.id}>
          <input {...register(`items.${index}.description`)} placeholder="Description" />
          <input type="number" {...register(`items.${index}.quantity`, { valueAsNumber: true })} />
          <input type="number" step="0.01" {...register(`items.${index}.price`, { valueAsNumber: true })} />
          <button type="button" onClick={() => remove(index)}>Remove</button>
        </div>
      ))}

      <button type="button" onClick={() => append({ description: '', quantity: 1, price: 0 })}>
        Add item
      </button>
      <InvoiceTotal control={control} />
      <button type="submit">Create invoice</button>
    </form>
  )
}
```

### Step 4: Next.js server actions

Validate in the browser for fast feedback, then validate again on the server with the same schema. Call the action with the object from `handleSubmit`, and map returned errors back to fields.

```ts
// schema.ts
import { z } from 'zod'

export const profileSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  bio: z.string().max(280, 'Bio is limited to 280 characters'),
})
export type ProfileInput = z.infer<typeof profileSchema>
```

```ts
// actions.ts
'use server'
import { z } from 'zod'
import { profileSchema } from './schema'

export async function updateProfile(input: unknown) {
  const parsed = profileSchema.safeParse(input)        // never trust the client-side check
  if (!parsed.success) {
    const flat = z.flattenError(parsed.error).fieldErrors
    return { ok: false as const, errors: Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0] ?? 'Invalid'])) }
  }
  // await db.user.update({ where: { id: session.userId }, data: parsed.data })
  return { ok: true as const, errors: {} as Record<string, string> }
}
```

```tsx
// ProfileForm.tsx
'use client'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { profileSchema, type ProfileInput } from './schema'
import { updateProfile } from './actions'

export function ProfileForm({ user }: { user: ProfileInput }) {
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileInput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name, bio: user.bio },
  })

  const onSubmit = async (values: ProfileInput) => {
    const result = await updateProfile(values)          // server action receives a plain object
    if (!result.ok) {
      for (const [field, message] of Object.entries(result.errors)) {
        setError(field as keyof ProfileInput, { message })
      }
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register('name')} />
      {errors.name && <p role="alert">{errors.name.message}</p>}
      <textarea {...register('bio')} />
      <button type="submit" disabled={!isDirty || isSubmitting}>Save</button>
    </form>
  )
}
```

## Examples

### Example 1: Add validation to a signup form

**User request:** "Add a signup form with name, email, password and confirm password. Passwords need 8+ characters, one capital letter and one digit."

The agent installs the three packages, creates `signupSchema` with a `refine` on `confirmPassword`, and wires `useForm({ resolver: zodResolver(signupSchema) })` as in Step 2. Submitting an empty form shows "Name must be at least 2 characters" and "Invalid email address"; mismatched passwords show "Passwords don't match" under the confirm field; a 409 from the API shows "This email is already registered" under the email field.

### Example 2: Invoice with add/remove line items

**User request:** "Let users add and remove invoice rows and show a running total without lagging."

The agent uses `useFieldArray` and a `useWatch` child component as in Step 3. With 3 units at 19.99 the total reads `Total: $59.97`, and submitting passes `items: [{ description: '', quantity: 3, price: 19.99 }]` with real numbers because of `valueAsNumber`.

## Guidelines

- Share one Zod schema between the form and the API route or server action; client validation is only a convenience.
- `watch('field')` re-renders the whole form component on every change; prefer `useWatch` in a child, or `getValues` inside event handlers.
- For third-party controlled components (selects, date pickers) use `Controller` or `useController`, because they cannot take `register`.
- Use `FormProvider` and `useFormContext` for large forms split across components.
- A schema that coerces or transforms values has different input and output types; give `useForm` the input type, and the output type as its third generic.
- Do not call `reset` with new values on every render; `reset` once when loaded data arrives.
- Never log or store password fields from form state.
- For one or two trivial inputs, plain React state is simpler than adding a form library.
