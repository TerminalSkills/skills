---
name: conform
description: >-
  Build progressive forms with Conform. Use when creating forms that work
  without JavaScript, implementing server-validated forms in Remix/Next.js,
  or building accessible forms with progressive enhancement.
license: Apache-2.0
compatibility: 'React 18+, Remix, Next.js'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [conform, forms, remix, progressive-enhancement, server-validation]
---

# Conform

## Overview

Conform is a progressive enhancement form library. Forms work without JavaScript (server-side validation), then enhance with client-side validation when JS loads. Native to Remix and Next.js Server Actions. Uses Zod schemas for shared client/server validation.

## Instructions

### Step 1: Next.js Server Action Form

```typescript
// app/actions.ts — Server action with Conform
'use server'
import { parseWithZod } from '@conform-to/zod'
import { z } from 'zod'

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  message: z.string().min(10).max(1000),
})

export async function submitContact(prevState: unknown, formData: FormData) {
  const submission = parseWithZod(formData, { schema })

  if (submission.status !== 'success') {
    return submission.reply()     // return errors to form
  }

  await db.contacts.create(submission.value)
  return submission.reply({ resetForm: true })
}
```

```tsx
// app/contact/page.tsx — Client form with progressive enhancement
'use client'
import { useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { useActionState } from 'react'
import { submitContact } from '../actions'

export default function ContactPage() {
  const [lastResult, action] = useActionState(submitContact, undefined)
  const [form, fields] = useForm({
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema })    // client-side validation
    },
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
  })

  return (
    <form id={form.id} onSubmit={form.onSubmit} action={action} noValidate>
      <div>
        <label htmlFor={fields.name.id}>Name</label>
        <input {...getInputProps(fields.name, { type: 'text' })} />
        <p>{fields.name.errors}</p>
      </div>
      <div>
        <label htmlFor={fields.email.id}>Email</label>
        <input {...getInputProps(fields.email, { type: 'email' })} />
        <p>{fields.email.errors}</p>
      </div>
      <div>
        <label htmlFor={fields.message.id}>Message</label>
        <textarea {...getTextareaProps(fields.message)} />
        <p>{fields.message.errors}</p>
      </div>
      <button type="submit">Send</button>
    </form>
  )
}
```

## Guidelines

- Conform forms work without JS — server validates and returns errors via form resubmission.
- Share Zod schema between client and server — single source of truth for validation.
- `shouldValidate: 'onBlur'` validates when user leaves field — less aggressive than onChange.
- Native form attributes (required, minLength) work as fallback when JS is disabled.
- Ideal for Remix and Next.js Server Actions — designed for their form patterns.
