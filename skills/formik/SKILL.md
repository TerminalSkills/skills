---
name: formik
description: >-
  Build forms in React with Formik. Use when creating complex forms with
  validation, multi-step forms, dynamic form fields, or handling form
  submission with error states.
license: Apache-2.0
compatibility: 'React 16+'
metadata:
  author: terminal-skills
  version: 1.0.0
  category: development
  tags: [formik, forms, react, validation, ui]
---

# Formik

## Overview

Formik manages form state in React — values, errors, touched fields, submission. Integrates with Yup/Zod for schema validation. Handles complex forms (multi-step, dynamic fields, arrays) without Redux or complex state management.

## Instructions

### Step 1: Basic Form

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
      onSubmit={async (values, { setSubmitting, setErrors }) => {
        try {
          await api.signup(values)
        } catch (err) {
          setErrors({ email: 'Email already registered' })
        } finally {
          setSubmitting(false)
        }
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
    <Formik initialValues={{ members: [{ name: '', role: '' }] }} onSubmit={handleSubmit}>
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
        </Form>
      )}
    </Formik>
  )
}
```

## Guidelines

- For new projects, consider react-hook-form (less re-renders). Formik is still solid for existing projects.
- Use schema validation (Yup/Zod) instead of manual validate functions.
- `setErrors` in onSubmit handles server-side validation errors (duplicate email, etc.).
- `<ErrorMessage>` only shows after field is touched — good UX by default.
- For large forms, use `enableReinitialize` when initial values come from API.
