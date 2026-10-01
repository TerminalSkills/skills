---
name: conform
description: >-
  Conform is a React form validation library that progressively enhances
  native HTML forms: it validates FormData against a Zod, Valibot or Yup
  schema on the server and, optionally, on the client, so a form works before
  JavaScript loads. Use when a user asks to build a form with Conform,
  validate a Next.js Server Action or a React Router / Remix action, share one
  schema between client and server, add or remove rows in a field list, or
  move to Conform's future API.
license: Apache-2.0
compatibility: 'React 18+. Next.js Server Actions, React Router / Remix, or any server that receives FormData'
metadata:
  author: terminal-skills
  version: 1.1.0
  category: development
  tags: [conform, forms, remix, progressive-enhancement, server-validation]
  repository: https://github.com/edmundhung/conform
---

# Conform

## Overview

Conform is a progressive enhancement form library. The form posts plain `FormData`; the server parses and validates it against a schema and sends the result back; once JavaScript loads, the same schema can validate in the browser. It does not own your markup — any valid HTML form works, and field names, ids and ARIA attributes are derived for you.

Version 1.21 (August 2026) ships two APIs in the same packages. The stable API (`@conform-to/react`, `@conform-to/zod`) is what the guides on conform.guide describe and is covered first below. The future API (`@conform-to/react/future`) is the preview of v2: the official examples already use it, but it is marked experimental and may change in a minor release.

## Instructions

### Install

```bash
npm install @conform-to/react @conform-to/zod zod
npm install @conform-to/react @conform-to/valibot valibot   # Valibot instead of Zod
npm install @conform-to/react @conform-to/yup yup           # Yup instead of Zod
```

The Zod adapter has one entry point per Zod major. `npm install zod` now gives Zod 4, so import from the `v4` subpath; the bare `@conform-to/zod` import is for Zod 3 and fails when Zod 4 is installed with a missing-export error (`The requested module 'zod' does not provide an export named 'ZodBranded'` in Node; bundlers word it differently).

```ts
import { parseWithZod } from '@conform-to/zod/v4'; // Zod 4
import { parseWithZod } from '@conform-to/zod';    // Zod 3
```

### Schema and server action (Next.js)

Keep the schema in its own module: a `'use server'` file may only export async functions, so a schema exported from the action file cannot be imported by the client form.

```ts
// app/contact/schema.ts — shared by the server action and the client form
import { z } from 'zod';

export const inquirySchema = z.object({
  name: z.string({ error: 'Name is required' }).min(2),
  email: z.email('Enter a valid email address'),
  seats: z.number().int().min(1).max(20),
  newsletter: z.boolean().default(false),
  message: z.string({ error: 'Message is required' }).min(10).max(1000),
});
```

```ts
// app/contact/actions.ts
'use server';
import { parseWithZod } from '@conform-to/zod/v4';
import { saveInquiry, seatsLeft } from '@/lib/inquiries';
import { inquirySchema } from './schema';

export async function submitInquiry(prevState: unknown, formData: FormData) {
  const submission = parseWithZod(formData, { schema: inquirySchema });

  if (submission.status !== 'success') {
    return submission.reply(); // field errors + submitted values go back to the form
  }
  if (submission.value.seats > (await seatsLeft())) {
    return submission.reply({ fieldErrors: { seats: ['Not enough seats left'] } });
  }

  await saveInquiry(submission.value); // typed: seats is a number, newsletter a boolean
  return submission.reply({ resetForm: true });
}
```

`parseWithZod` coerces form strings before validating: an empty string becomes `undefined`, `z.number()` and `z.bigint()` fields are cast, `z.boolean()` is `true` when the value is `on`, `z.date()` goes through `new Date()`. Pass `disableAutoCoercion: true` to do this yourself. `reply()` also accepts `formErrors` (errors for the whole form) and `hideFields: ['password']` (do not echo a value back to the browser).

### Client form

```tsx
// app/contact/form.tsx
'use client';
import { useActionState } from 'react';
import { getFormProps, getInputProps, getTextareaProps, useForm } from '@conform-to/react';
import { getZodConstraint, parseWithZod } from '@conform-to/zod/v4';
import { submitInquiry } from './actions';
import { inquirySchema } from './schema';

export function InquiryForm() {
  const [lastResult, action, pending] = useActionState(submitInquiry, undefined);
  const [form, fields] = useForm({
    id: 'inquiry', // prefix for generated ids; omit it to get a random one
    lastResult, // server result: errors and values survive a no-JS round trip
    constraint: getZodConstraint(inquirySchema), // required/min/max attributes (Zod 4.6+: see Guidelines)
    shouldValidate: 'onBlur',
    shouldRevalidate: 'onInput',
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: inquirySchema });
    },
  });

  return (
    <form {...getFormProps(form)} action={action}>
      <div id={form.errorId}>{form.errors}</div>

      <label htmlFor={fields.name.id}>Name</label>
      <input {...getInputProps(fields.name, { type: 'text' })} />
      <div id={fields.name.errorId}>{fields.name.errors}</div>

      <label htmlFor={fields.email.id}>Email</label>
      <input {...getInputProps(fields.email, { type: 'email' })} />
      <div id={fields.email.errorId}>{fields.email.errors}</div>

      <label htmlFor={fields.seats.id}>Seats</label>
      <input {...getInputProps(fields.seats, { type: 'number' })} />
      <div id={fields.seats.errorId}>{fields.seats.errors}</div>

      <label htmlFor={fields.newsletter.id}>Send me the newsletter</label>
      <input {...getInputProps(fields.newsletter, { type: 'checkbox' })} />

      <label htmlFor={fields.message.id}>Message</label>
      <textarea {...getTextareaProps(fields.message)} />
      <div id={fields.message.errorId}>{fields.message.errors}</div>

      <button disabled={pending}>Send</button>
    </form>
  );
}
```

- `useForm` returns a tuple, `[form, fields]`. Every option is optional: leave out `onValidate` and validation runs only on the server, including on blur and on input, which keeps the schema out of the client bundle at the cost of a request per check.
- `shouldValidate` takes `'onSubmit'` (default), `'onBlur'` or `'onInput'`; `shouldRevalidate` takes the same values and defaults to whatever `shouldValidate` is.
- `getFormProps`, `getInputProps` (the `type` option is required), `getTextareaProps`, `getSelectProps`, `getFieldsetProps` and `getCollectionProps` set `id`, `name`, `form`, `key`, default value, constraint and ARIA attributes. They are optional — the same values are on the metadata (`fields.email.name`, `.initialValue`, `.errors`, `.errorId`, `.valid`).
- With React 18 or Next.js 14, use `useFormState` from `react-dom` instead of `useActionState`.
- React Router and Remix: read the action's return value with `useActionData()` and pass it as `lastResult`, render `<Form method="post" {...getFormProps(form)}>`, and call `parseWithZod(await request.formData(), { schema })` in the `action`. If the action resets a form whose defaults come from a loader, pass `lastResult: navigation.state === 'idle' ? lastResult : null` so the reset waits for revalidation.

### Nested objects, lists and intents

Field names follow `address.city` and `lines[0].amount`. Call `fields.address.getFieldset()` for an object and `fields.lines.getFieldList()` for an array instead of writing names by hand. Lists change through intent buttons — ordinary submit buttons carrying a reserved name, so they work without JavaScript: `form.insert`, `form.remove`, `form.reorder`, `form.update`, `form.reset` and `form.validate`, each with `.getButtonProps({ name, ... })` or callable directly, e.g. `form.validate({ name: fields.email.name })`. See Example 2.

Files: set `method="POST"` and `encType="multipart/form-data"` on the form and validate with `z.instanceof(File)`. For a multi-file input or a checkbox group, errors attach to each index (`files[0]`), so render `Object.values(fields.files.allErrors).flat()`.

Custom inputs (a select or date picker from a UI library that renders no native input): `const control = useInputControl(fields.color)` gives `control.value`, `control.change(value)`, `control.focus()` and `control.blur()` to wire into the component.

### The future API (v2 preview)

```ts
// app/signup/schema.ts
import { coerceFormValue } from '@conform-to/zod/v4/future';
import { z } from 'zod';

// coerceFormValue strips empty strings and casts numbers, booleans and dates
export const signupSchema = coerceFormValue(
  z.object({ email: z.email(), age: z.number().min(18), terms: z.boolean() }),
);
```

```ts
// app/signup/actions.ts
'use server';
import { parseSubmission, report } from '@conform-to/react/future';
import { isEmailTaken } from '@/lib/accounts';
import { signupSchema } from './schema';

export async function register(prevState: unknown, formData: FormData) {
  const submission = parseSubmission(formData);
  const result = signupSchema.safeParse(submission.payload);

  if (!result.success) {
    return report(submission, { error: { issues: result.error.issues } });
  }
  if (await isEmailTaken(result.data.email)) {
    return report(submission, { error: { fieldErrors: { email: ['Email is already registered'] } } });
  }
  return report(submission, { reset: true });
}
```

```tsx
// in the client component
import { useForm } from '@conform-to/react/future';

const [lastResult, action] = useActionState(register, null);
const { form, fields, intent } = useForm(signupSchema, { lastResult, shouldValidate: 'onBlur' });
// <form {...form.props} action={action}>
//   <input name={fields.email.name} defaultValue={fields.email.defaultValue}
//     aria-invalid={!fields.email.valid || undefined} aria-describedby={fields.email.ariaDescribedBy} />
```

What differs from the stable API: `useForm` takes any Standard Schema as its first argument and returns an object, not a tuple; `form.props` replaces `getFormProps`; fields expose `defaultValue` instead of `initialValue`; `parseSubmission` + `report` replace `parseWithZod` + `reply`; list changes are method calls (`intent.insert({ name })`, `intent.remove({ name, index })`); constraints come from `getConstraints(schema)`. Do not mix the two in one form — a `lastResult` produced by `report()` is not the shape the stable `useForm` expects, and the reverse.

## Examples

### Example 1: Contact form that validates on the server and in the browser

**User request:** "Add a contact form to our Next.js app with Conform. It has to work with JavaScript disabled."

Create the three files from Instructions (`schema.ts`, `actions.ts`, `form.tsx`) and render `<InquiryForm />` on the page. Submitting `email=maya@northwind`, `seats=4`, `newsletter=on` with the other fields empty makes the action return:

```json
{
  "status": "error",
  "initialValue": { "email": "maya@northwind", "newsletter": "on", "seats": "4" },
  "error": { "name": ["Name is required"], "email": ["Enter a valid email address"],
             "message": ["Message is required"] },
  "fields": ["name", "email", "seats", "newsletter", "message"]
}
```

The page re-renders with the values kept and the errors wired to the inputs, whether or not JavaScript ran:

```html
<input required id="inquiry-email" form="inquiry" aria-invalid="true"
  aria-describedby="inquiry-email-error" type="email" name="email" value="maya@northwind"/>
<div id="inquiry-email-error">Enter a valid email address</div>
```

A valid submission reaches `saveInquiry` as `{ name: 'Maya Okafor', email: 'maya@northwind.io', seats: 4, newsletter: true, message: '…' }` — already typed and coerced.

### Example 2: Invoice form with rows the user can add and remove

**User request:** "Build an invoice form with Conform where I can add and remove line items."

```tsx
'use client';
import { getFormProps, getInputProps, useForm } from '@conform-to/react';
import { parseWithZod } from '@conform-to/zod/v4';
import { z } from 'zod';

const invoiceSchema = z.object({
  customer: z.string().min(1),
  lines: z
    .array(z.object({ description: z.string().min(1), amount: z.number().positive() }))
    .min(1, 'Add at least one line'),
});

export function InvoiceForm() {
  const [form, fields] = useForm({
    defaultValue: { customer: 'Halvorsen Marine AS', lines: [{ description: '', amount: '' }] },
    shouldValidate: 'onBlur',
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: invoiceSchema });
    },
  });
  const lines = fields.lines.getFieldList();

  return (
    <form {...getFormProps(form)} method="post">
      <input {...getInputProps(fields.customer, { type: 'text' })} />
      {lines.map((line, index) => {
        const { description, amount } = line.getFieldset();
        return (
          <fieldset key={line.key}>
            <input {...getInputProps(description, { type: 'text' })} />
            <input {...getInputProps(amount, { type: 'number' })} step="0.01" />
            <div>{amount.errors}</div>
            <button {...form.remove.getButtonProps({ name: fields.lines.name, index })}>Remove</button>
          </fieldset>
        );
      })}
      <div>{fields.lines.errors}</div>
      <button {...form.insert.getButtonProps({ name: fields.lines.name })}>Add line</button>
      <button>Save invoice</button>
    </form>
  );
}
```

The browser posts `lines[0].description=Hull inspection`, `lines[0].amount=1450.00`, `lines[1].description=Antifouling paint`, `lines[1].amount=389.50`. On the server, `parseWithZod(formData, { schema: invoiceSchema }).value` is:

```json
{ "customer": "Halvorsen Marine AS",
  "lines": [{ "description": "Hull inspection", "amount": 1450 },
            { "description": "Antifouling paint", "amount": 389.5 }] }
```

An amount of `-5` in the second row comes back as `{ "lines[1].amount": ["Too small: expected number to be >0"] }`; removing every row gives `{ "lines": ["Add at least one line"] }`.

## Guidelines

- The server is the validator of record. Client validation in `onValidate` is a convenience; always parse the `FormData` again in the action.
- Conform renders `noValidate` on the form by default, even before hydration, so the browser's own `required`/`minLength` bubbles never show. Pass `defaultNoValidate: false` to `useForm` if you want native validation until JavaScript takes over. The constraint attributes still help screen readers either way.
- Constraints and Zod 4.6: with Conform 1.21.1, `getZodConstraint` and `getConstraints` return only `required` when Zod 4.6 or later is installed; `minLength`, `maxLength`, `min`, `max` and `pattern` are derived correctly up to Zod 4.5 (issue 1340 in the repository, open in September 2026). Validation is unaffected — only the HTML attributes are missing. Log the constraint object once after a Zod upgrade.
- Client validation is synchronous. For a check that needs the server (unique email), make the schema a function, add an issue with `conformZodMessage.VALIDATION_UNDEFINED` on the client so Conform falls back to the server, and call `parseWithZod(formData, { schema, async: true })` in the action.
- `form.reset` and `form.update` re-mount inputs through `key`. Inputs set up by hand need `key={fields.title.key}`; the `get*Props` helpers add it.
- Never echo secrets: `submission.reply({ hideFields: ['password'] })`, or `report(submission, { hideFields: [...] })` in the future API.
- Limit request size before parsing on the server (Next.js `serverActions.bodySizeLimit`, a multipart parser with file and part limits) — Conform parses whatever `FormData` it is given.
- The future API is experimental: its release notes list breaking changes in minor versions (1.20 renamed and reshaped options, 1.21 removed deprecated ones). Pin the exact version if you use it.
- When not to use Conform: a client-only form with no server round trip and heavy per-keystroke state (a spreadsheet-like editor) is simpler with a controlled-state library such as React Hook Form.
