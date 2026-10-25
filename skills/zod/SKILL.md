---
name: zod
description: >-
  Zod is a TypeScript-first schema library that validates data at runtime and infers static types
  from the same schema. Use when validating API request bodies, form input, environment variables or
  config files, parsing untrusted JSON, or migrating from Zod 3 to Zod 4. Covers z.object, safeParse,
  z.infer, coercion, discriminated unions, refinements, JSON Schema output and the v4 API changes.
license: Apache-2.0
compatibility: "TypeScript 5.5+ with strict mode; zod 4.x (npm install zod)"
metadata:
  author: terminal-skills
  version: "1.1.0"
  category: development
  tags: "validation, schema, typescript, type-inference, parsing"
  repository: "https://github.com/colinhacks/zod"
---

# Zod

## Overview

Zod defines a schema once and gives you both a runtime validator and the TypeScript type (`z.infer`). The current major version is Zod 4 (`zod@4.6.7` checked on 2026-10-12); `import { z } from "zod"` now resolves to v4. Zod 3 remains importable from `"zod/v3"`, and a tree-shakeable functional variant lives at `"zod/mini"`. Zod 4 deprecates several v3 spellings (listed in Guidelines), which is the main source of outdated code in the wild. Zod also produces JSON Schema with `z.toJSONSchema(schema)`, which is how many LLM tool-calling libraries consume it.

## Instructions

1. Install with `npm install zod`. Enable `"strict": true` in tsconfig.
2. Define schemas with `z.object`, `z.string()`, `z.number()`, `z.enum([...])`, `z.array()`, `z.record(keySchema, valueSchema)` (both arguments are required in v4; the one-argument form is a type error) and infer types with `type User = z.infer<typeof User>`.
3. Prefer top-level string formats: `z.email()`, `z.url()`, `z.uuid()`, `z.iso.datetime()`. The method forms (`z.string().email()`) still work but are deprecated.
4. Parse untrusted data with `schema.safeParse(data)` and branch on `result.success`; `schema.parse` throws a `ZodError`. Use `parseAsync` / `safeParseAsync` when a refinement or transform is async.
5. Format errors with `z.flattenError(err)` (`{ formErrors, fieldErrors }`), `z.treeifyError(err)` or `z.prettifyError(err)`. The `err.flatten()` and `err.format()` methods are deprecated. Custom messages: `z.string().min(8, "At least 8 characters")` or `{ error: "..." }`; `.refine(fn, "message")` for custom rules.
6. Coerce strings from query strings and env vars with `z.coerce.number()`, `z.coerce.boolean()` (any non-empty string is true, including `"false"`), `z.coerce.date()`.
7. Combine schemas with `.extend()`, `.pick()`, `.omit()`, `.partial()`; use `.safeExtend()` when the schema carries refinements. `.merge()` is deprecated; spread `A.shape` or use `.extend(B.shape)`.
8. Use `z.discriminatedUnion("type", [...])` for tagged unions and `z.strictObject` / `z.looseObject` instead of `.strict()` / `.passthrough()`.
9. Recursive schemas use getters in v4, no `z.lazy` or manual type annotation needed.
10. Transform and chain with `.transform()` and `.pipe()`; bidirectional conversions use `z.codec(inputSchema, outputSchema, { decode, encode })`.

## Examples

### Example 1: Validate a signup request

**User request:** "Validate the POST /signup body and return field errors."

```typescript
import { z } from "zod";

export const Signup = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.email("Invalid email"),
  website: z.url().optional(),
  role: z.enum(["user", "admin"]).default("user"),
  tags: z.array(z.string()).max(10).default([]),
});
export type Signup = z.infer<typeof Signup>;

app.post("/signup", (req, res) => {
  const parsed = Signup.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: z.flattenError(parsed.error).fieldErrors });
  }
  createUser(parsed.data); // typed as Signup, defaults applied
});
```

**Result:** a body of `{ "email": "x", "website": "nope" }` returns 400 with `{"errors":{"name":["Invalid input: expected string, received undefined"],"email":["Invalid email"],"website":["Invalid URL"]}}`.

### Example 2: Fail fast on bad environment variables

**User request:** "Validate process.env at startup and convert PORT to a number."

```typescript
import { z } from "zod";

const Env = z.object({
  DATABASE_URL: z.url(),
  STRIPE_API_KEY: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}
export const env = parsed.data;
```

**Result:** a missing `DATABASE_URL` prints a `✖ ... → at DATABASE_URL` line and exits; otherwise `env.PORT` is the number 3000.

### Example 3: Recursive schema and JSON Schema output

```typescript
const Category = z.object({
  name: z.string(),
  get children() { return z.array(Category).default([]); },
});
Category.parse({ name: "Tools", children: [{ name: "Drills" }] });
// { name: "Tools", children: [ { name: "Drills", children: [] } ] }

const schema = z.toJSONSchema(z.object({ city: z.string() }));
// { "$schema": ".../draft/2020-12/schema", type: "object", properties: {...}, required: ["city"], additionalProperties: false }
```

## Guidelines

- Check the installed major version first. In v4 `.default()` short-circuits: the default is returned without running the schema, and it must match the output type.
- Deprecated in v4: `z.string().email()/url()/uuid()`, `err.flatten()/format()`, `.merge()`, `.strict()/.passthrough()`, `z.nativeEnum` (use `z.enum` with an enum object), `message:` parameter (use `error:`).
- `z.coerce.*` accepts any input, so the inferred input type is `unknown`; validate strings before coercion when the type matters.
- Validate at boundaries only (requests, env, files, third-party API responses); do not re-parse the same data between internal functions.
- Never echo raw `ZodError` objects to clients if input may contain secrets; return field messages instead.
- Libraries that peer-depend on Zod 3 may break on v4; import from `"zod/v3"` for them until updated.
