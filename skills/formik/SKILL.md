---
name: formik
description: >-
  Build forms in React with Formik. Use when creating complex forms with
  validation, multi-step forms, dynamic form fields, or handling form
  submission with error states.
license: Apache-2.0
compatibility: 'React 16.8+ (hooks)'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: "formik, forms, react, validation, ui"
  repository: https://github.com/jaredpalmer/formik
---

# Formik

## Overview

Formik manages form state in React — values, errors, touched fields, submission. Formik 2.4.x (latest stable, 2.4.9) ships Yup support through the `validationSchema` prop; Zod works through the `zod-formik-adapter` package. A 3.0 line exists only as `next` pre-releases. Handles complex forms (multi-step, dynamic fields, arrays) without Redux or complex state management.

## Instructions

### Step 1: Install and build a basic form

```bash
npm install formik yup
```

```tsx
import { Formik, Form, Field, ErrorMessage } from 'formik'
import * as Yup from 'yup'

const SignupSchema = Yup.object({
  name: Yup.string().min(2).required('Name is required'),
  email: Yup.string().email('Invalid email').required('Email is required'),
  password: Yup.string().min(8, 'At least 8 characters').required('Password is required'),
})

function SignupForm() {
  return (
    <Formik
      initialValues={{ name: '', email: '', password: '' }}
      validationSchema={SignupSchema}
      onSubmit={async (values, { setErrors }) => {
        const res = await fetch('/api/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(values),
        })
        if (res.status === 409) {
          setErrors({ email: 'Email already registered' })
        }
        // isSubmitting resets itself when an async onSubmit settles
      }}
    >
      {({ isSubmitting }) => (
        <Form>
          <Field name="name" placeholder="Name" />
          <ErrorMessage name="name" component="span" className="error" />

          <Field name="email" type="email" placeholder="Email" />
          <ErrorMessage name="email" component="span" className="error" />

          <Field name="password" type="password" placeholder="Password" />
          <ErrorMessage name="password" component="span" className="error" />

          <button type="submit" disabled={isSubmitting}>Sign Up</button>
        </Form>
      )}
    </Formik>
  )
}
```

### Step 2: Dynamic Field Arrays

```tsx
import { FieldArray } from 'formik'

function TeamForm() {
  return (
    <Formik
      initialValues={{ members: [{ name: '', role: '' }] }}
      onSubmit={(values) => console.log(JSON.stringify(values, null, 2))}
    >
      {({ values }) => (
        <Form>
          <FieldArray name="members">
            {({ push, remove }) => (
              <>
                {values.members.map((_, i) => (
                  <div key={i}>
                    <Field name={`members.${i}.name`} placeholder="Name" />
                    <Field name={`members.${i}.role`} as="select">
                      <option value="">Select role</option>
                      <option value="admin">Admin</option>
                      <option value="member">Member</option>
                    </Field>
                    <button type="button" onClick={() => remove(i)}>Remove</button>
                  </div>
                ))}
                <button type="button" onClick={() => push({ name: '', role: '' })}>
                  Add Member
                </button>
              </>
            )}
          </FieldArray>
          <button type="submit">Save team</button>
        </Form>
      )}
    </Formik>
  )
}
```

### Step 3: Zod and the useFormik hook

```bash
npm install zod zod-formik-adapter
```

```tsx
import { useFormik } from 'formik'
import { z } from 'zod'
import { toFormikValidationSchema } from 'zod-formik-adapter'

const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'At least 8 characters'),
})

function LoginForm() {
  const formik = useFormik({
    initialValues: { email: '', password: '' },
    validationSchema: toFormikValidationSchema(LoginSchema),
    onSubmit: async (values) => {
      await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      })
    },
  })
  return (
    <form onSubmit={formik.handleSubmit}>
      <input name="email" onChange={formik.handleChange} onBlur={formik.handleBlur} value={formik.values.email} />
      {formik.touched.email && formik.errors.email && <span>{formik.errors.email}</span>}
      <input name="password" type="password" onChange={formik.handleChange} onBlur={formik.handleBlur} value={formik.values.password} />
      <button type="submit" disabled={formik.isSubmitting}>Log in</button>
    </form>
  )
}
```

## Examples

### Example 1: "Add a signup form that shows the server's duplicate-email error"

Use the Step 1 form. Submitting `maria@brightloop.io` when the API answers 409 puts `Email already registered` under the email field through `setErrors`, and the submit button re-enables because the async `onSubmit` settled.

### Example 2: "Let users add several team members before saving"

Use the Step 2 `FieldArray`. Clicking Add Member twice and filling the rows logs the values as pretty-printed JSON on submit: a `members` array with `{ "name": "Dana Okafor", "role": "admin" }` and `{ "name": "Lee Chen", "role": "member" }`.

## Guidelines

- For new projects, consider react-hook-form (fewer re-renders); Formik 2.x is stable but receives little active development.
- Formik needs React 16.8+ and works with React 18 and 19 in the 2.4 line; check your React version's peer warnings.
- Use schema validation (Yup, or Zod via the adapter) instead of manual `validate` functions.
- Field-level changes validate on every change and blur by default; set `validateOnChange={false}` on large forms.
- Yup 1.x error messages and `required()` semantics differ slightly from 0.32; test after upgrading.
- `setErrors` in onSubmit handles server-side validation errors (duplicate email, etc.).
- `<ErrorMessage>` only shows after field is touched — good UX by default.
- For large forms, use `enableReinitialize` when initial values come from API.
