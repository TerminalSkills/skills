---
name: yup
description: >-
  Validate data with Yup schemas. Use when adding form validation, defining
  API request schemas, validating configuration, or building type-safe
  validation pipelines in JavaScript/TypeScript.
license: Apache-2.0
compatibility: 'Yup 1.x (checked against 1.7.1); any JavaScript runtime'
metadata:
  author: terminal-skills
  version: 1.1.0
  repository: https://github.com/jquense/yup
  category: development
  tags: [yup, validation, schema, forms, typescript]
---

# Yup

## Overview

Yup is a schema validation library for JavaScript. Define schemas declaratively, validate data, and get detailed error messages. Works with Formik, react-hook-form, and standalone. Written in TypeScript with type inference (`InferType`).

Install with `npm install yup`. Examples use the 1.x API: `when()` takes `then`/`otherwise` as functions that receive the schema, and the old 0.x forms are gone.

## Instructions

### Step 1: Schemas

```typescript
import * as yup from 'yup'

const userSchema = yup.object({
  name: yup.string().min(2).max(100).required(),
  email: yup.string().email().required(),
  age: yup.number().positive().integer().min(13).max(120),
  role: yup.string().oneOf(['admin', 'member', 'viewer']).default('member'),
  tags: yup.array().of(yup.string()).min(1).max(10),
  address: yup.object({
    street: yup.string().required(),
    city: yup.string().required(),
    zip: yup.string().matches(/^\d{5}$/, 'Must be 5 digits'),
  }),
})

// Validate: returns the cast value (strings coerced, defaults applied) or throws ValidationError
const user = await userSchema.validate(data, { abortEarly: false })

// Non-throwing checks
userSchema.isValidSync(data) // boolean

// Type inference
type User = yup.InferType<typeof userSchema>
```

### Step 2: Custom Validation

```typescript
const passwordSchema = yup.string()
  .min(8)
  .matches(/[A-Z]/, 'Must contain uppercase')
  .matches(/[0-9]/, 'Must contain number')
  .matches(/[^A-Za-z0-9]/, 'Must contain special character')

const signupSchema = yup.object({
  password: passwordSchema.required(),
  confirmPassword: yup.string()
    .oneOf([yup.ref('password')], 'Passwords must match')
    .required(),
})
```

### Step 3: Conditional Validation

```typescript
const schema = yup.object({
  contactMethod: yup.string().oneOf(['email', 'phone']).required(),
  email: yup.string().when('contactMethod', {
    is: 'email',
    then: (s) => s.email().required('Email required when contact method is email'),
  }),
  phone: yup.string().when('contactMethod', {
    is: 'phone',
    then: (s) => s.matches(/^\+\d{10,15}$/).required('Phone required'),
  }),
})
```

### Step 4: Handling errors

```typescript
try {
  await userSchema.validate(body, { abortEarly: false })
} catch (err) {
  if (err instanceof yup.ValidationError) {
    // err.errors: string[]; err.inner[i].path / .message: per field
    return Object.fromEntries(err.inner.map((e) => [e.path, e.message]))
  }
  throw err
}
```

## Examples

### Example 1: "Validate the signup request body in my Express route"

Use `signupSchema` from Step 2 with `validate(req.body, { abortEarly: false, stripUnknown: true })`. Input `{ password: 'Secret1!', confirmPassword: 'Secret2!' }` throws a `ValidationError` whose `errors` is `['Passwords must match']`; valid input returns the object with unknown keys removed. Return the Step 4 map as a 422 body.

### Example 2: "Only require a phone number when the user picks phone contact"

Use the Step 3 schema. `{ contactMethod: 'email', email: 'dana@shopfront.dev' }` passes; `{ contactMethod: 'phone' }` fails with `Phone required`. With react-hook-form, pass it through `yupResolver(schema)` from `@hookform/resolvers/yup`.

## Guidelines

- `abortEarly: false` returns all errors at once — better UX than one-at-a-time.
- Use `InferType` to derive TypeScript types from schemas — single source of truth.
- For new projects, consider Zod instead — better TypeScript inference and ecosystem.
- Yup is still the standard for Formik integration.
- Fields are optional unless you add `.required()`; `InferType` then yields `T | undefined`. `null` is rejected unless `.nullable()`.
- Validation also casts: `'30'` becomes `30` for `number()`. Add `.strict()` to forbid coercion.
- `.when()` for conditional validation — fields required only in certain contexts.
